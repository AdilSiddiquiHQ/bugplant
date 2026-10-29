// Orchestration: diff -> candidates -> sample -> baseline -> mutate -> run.
//
// The whole design follows from one rule: a number may only be printed if it
// came from an actual test run. Nothing here estimates.

import { promises as fs, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { loadConfig } from './config.js';
import { diffAgainst, defaultBase, parseAddedLines } from './gitdiff.js';
import { buildGraph, isSourcePath, isTestPath, testsFor } from './graph.js';
import { applyMutation, findCandidates, sample } from './mutate.js';
import { runOnce } from './runner.js';
import { score } from './report.js';
import { tokenize } from './tokenize.js';

export class BaselineError extends Error {
  constructor(message, output) {
    super(message);
    this.name = 'BaselineError';
    this.output = output;
  }
}

/**
 * Pick a test command that exists in this repository.
 * @param {string} cwd
 */
export async function detectTestCommand(cwd) {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8'));
    const script = pkg.scripts?.test;
    if (script && !/no test specified/i.test(script)) return 'npm test --silent';
  } catch {
    // no package.json: fall through to node's runner
  }
  return 'node --test';
}

/**
 * @param {object} options
 * @param {string} [options.cwd]
 * @param {string} [options.base]
 * @param {number} [options.maxMutants]
 * @param {number} [options.timeoutMs]
 * @param {string} [options.testCommand]
 * @param {number} [options.seed]
 * @param {boolean} [options.all] mutate every source file instead of the diff
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.selectTests]
 * @param {string[]} [options.files]
 * @param {(event: object) => void} [options.onProgress]
 */
export async function run(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const config = await loadConfig(cwd);
  const started = Date.now();

  const testCommand = options.testCommand || config.testCommand || (await detectTestCommand(cwd));
  const seed = Number.isInteger(options.seed) ? options.seed : Number(config.seed) || 1;
  const maxMutants = Number.isInteger(options.maxMutants) ? options.maxMutants : config.maxMutants;
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : config.timeoutMs;
  const selectTests = options.selectTests === false ? false : config.selectTests !== false;
  const ignore = [...(config.ignore || []), ...(options.ignore || [])];
  const progress = options.onProgress || (() => {});

  const base = options.base || defaultBase(cwd);
  if (!options.all && !base) {
    throw new Error('No git base found. Pass --base <ref>, or use --all to mutate the whole tree.');
  }

  const graph = await buildGraph(cwd, { ignore });

  // 1. Which lines are under review?
  /** @type {Map<string, Set<number>>} absolute path -> lines */
  const targets = new Map();
  if (options.all) {
    for (const file of graph.files) {
      if (isTestPath(file)) continue;
      const src = await fs.readFile(file, 'utf8');
      const lines = new Set();
      const count = src.split('\n').length;
      for (let line = 1; line <= count; line += 1) lines.add(line);
      targets.set(file, lines);
    }
  } else {
    const added = parseAddedLines(diffAgainst(cwd, base));
    for (const [rel, lines] of added) {
      const abs = path.resolve(cwd, rel);
      if (!isSourcePath(abs) || isTestPath(abs)) continue;
      try {
        await fs.access(abs);
      } catch {
        continue; // deleted file
      }
      targets.set(abs, lines);
    }
  }

  if (options.files && options.files.length) {
    const wanted = new Set(options.files.map((f) => path.resolve(cwd, f)));
    for (const file of [...targets.keys()]) {
      if (!wanted.has(file)) targets.delete(file);
    }
  }

  // 2. Where could we plant a bug?
  const candidates = [];
  const sources = new Map();
  let addedLines = 0;
  for (const [file, lines] of targets) {
    const src = await fs.readFile(file, 'utf8');
    sources.set(file, src);
    addedLines += lines.size;
    const tokens = tokenize(src);
    const sourceLines = src.split('\n');
    for (const candidate of findCandidates(tokens, lines)) {
      const token = tokens[candidate.tokenIndex];
      candidates.push({
        ...candidate,
        file: path.relative(cwd, file).split(path.sep).join('/'),
        absPath: file,
        start: token.start,
        end: token.end,
        snippet: (sourceLines[candidate.line - 1] || '').trim().slice(0, 56)
      });
    }
  }

  const picked = options.dryRun ? sample(candidates, maxMutants, seed) : sample(candidates, maxMutants, seed);
  const sourceFiles = [...targets.keys()].map((f) => path.relative(cwd, f).split(path.sep).join('/')).sort();

  const empty = {
    base: base || '(all files)',
    seed,
    testCommand,
    selectedTests: null,
    sourceFiles,
    addedLines,
    mutants: [],
    killed: 0,
    survived: 0,
    invalid: 0,
    score: null,
    durationMs: Date.now() - started
  };

  if (picked.length === 0) return empty;

  // 3. The baseline must be green, or "killed" means nothing.
  if (!options.dryRun) {
    progress({ type: 'baseline', command: testCommand });
    const baseline = runOnce({ cwd, command: testCommand, timeoutMs: Math.max(timeoutMs, 60000) });
    if (baseline.status !== 'pass') {
      throw new BaselineError(
        baseline.status === 'timeout'
          ? 'The test suite did not finish before the baseline timeout.'
          : 'The test suite is already failing, so mutations cannot be scored.',
        baseline.output
      );
    }
  }

  // 4. Mutate, run, restore. Always restore.
  const dirty = new Set();
  const restore = () => {
    for (const file of dirty) {
      try {
        writeFileSync(file, sources.get(file));
      } catch {
        // last resort: nothing sensible to do while unwinding
      }
    }
    dirty.clear();
  };
  const onSignal = () => {
    restore();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const mutants = [];
  const usedTestFiles = new Set();
  let usedFallback = false;

  try {
    for (let index = 0; index < picked.length; index += 1) {
      const candidate = picked[index];
      const original = sources.get(candidate.absPath);
      const mutated = applyMutation(original, candidate, candidate);
      if (mutated === original) continue;

      let tests = [];
      if (selectTests) {
        const related = testsFor(graph, candidate.absPath);
        if (related === null) usedFallback = true;
        else tests = related;
      }
      for (const test of tests) usedTestFiles.add(test);

      const entry = {
        file: candidate.file,
        line: candidate.line,
        family: candidate.family,
        from: candidate.from,
        to: candidate.to,
        snippet: candidate.snippet,
        status: 'unknown',
        ms: 0
      };

      if (options.dryRun) {
        entry.status = 'planned';
        mutants.push(entry);
        continue;
      }

      progress({ type: 'mutant', index, total: picked.length, mutant: entry });
      writeFileSync(candidate.absPath, mutated);
      dirty.add(candidate.absPath);
      try {
        const result = runOnce({ cwd, command: testCommand, tests, timeoutMs });
        entry.ms = result.ms;
        entry.status = result.status === 'pass' ? 'survived' : result.status === 'fail' ? 'killed' : result.status;
        if (entry.status === 'invalid') entry.detail = firstLine(result.output);
        if (entry.status === 'timeout') entry.detail = 'tests did not finish before the timeout';
      } finally {
        writeFileSync(candidate.absPath, original);
        dirty.delete(candidate.absPath);
      }
      mutants.push(entry);
    }
  } finally {
    restore();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }

  const killed = mutants.filter((m) => m.status === 'killed').length;
  const survived = mutants.filter((m) => m.status === 'survived').length;
  const invalid = mutants.filter((m) => m.status === 'invalid' || m.status === 'timeout').length;

  return {
    base: base || '(all files)',
    seed,
    testCommand,
    selectedTests: usedFallback || !selectTests ? null : usedTestFiles.size,
    sourceFiles,
    addedLines,
    mutants,
    killed,
    survived,
    invalid,
    score: score(killed, survived),
    durationMs: Date.now() - started
  };
}

function firstLine(text) {
  return (text || '').split('\n').find((line) => line.trim())?.trim().slice(0, 120) || '';
}

/**
 * Detect a test command without running anything.
 * @param {string} cwd
 */
export function probeTestCommand(cwd) {
  const run = spawnSync('node', ['--version'], { encoding: 'utf8' });
  return run.status === 0;
}
