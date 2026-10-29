// Read a unified diff and report which lines were *added*.
//
// Mutation testing is only interesting when it is scoped to the change you are
// reviewing. That is why this module exists: everything downstream is anchored
// to added lines, not to the whole repository.

import { spawnSync } from 'node:child_process';

/**
 * Parse `git diff -U0` output into a map of file -> added line numbers.
 * @param {string} text
 * @returns {Map<string, Set<number>>}
 */
export function parseAddedLines(text) {
  const result = new Map();
  let current = null;
  for (const raw of text.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const target = raw.slice(4).trim();
      if (target === '/dev/null') {
        current = null;
        continue;
      }
      const path = target.replace(/^b\//, '');
      current = path;
      if (!result.has(path)) result.set(path, new Set());
      continue;
    }
    if (!current) continue;
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let line = start; line < start + count; line += 1) {
      result.get(current).add(line);
    }
  }
  return result;
}

/**
 * Return the working-tree diff against `base`.
 * @param {string} cwd
 * @param {string} base
 */
export function diffAgainst(cwd, base) {
  const run = spawnSync('git', ['diff', '-U0', base, '--'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (run.error) throw new Error(`git diff failed: ${run.error.message}`);
  if (run.status !== 0) {
    throw new Error(`git diff ${base} failed: ${(run.stderr || '').trim() || `exit ${run.status}`}`);
  }
  return run.stdout;
}

/**
 * Guess a sensible base ref. Prefers origin/main, then main, then master.
 * @param {string} cwd
 */
export function defaultBase(cwd) {
  const candidates = ['origin/main', 'origin/master', 'main', 'master', 'HEAD~1'];
  for (const ref of candidates) {
    const run = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd, encoding: 'utf8' });
    if (run.status === 0) return ref;
  }
  return null;
}

/**
 * List tracked files matching an extension list.
 * @param {string} cwd
 */
export function trackedFiles(cwd) {
  const run = spawnSync('git', ['ls-files'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) return [];
  return run.stdout.split('\n').filter(Boolean);
}
