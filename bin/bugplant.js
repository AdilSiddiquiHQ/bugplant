#!/usr/bin/env node
// bugplant — plant bugs in the code your agent just wrote.
//
// The CLI is deliberately boring: parse flags, call the engine, render, exit.

import { renderJson, renderText, VERSION } from '../lib/report.js';
import { BaselineError, run } from '../lib/engine.js';
import { CONFIG_NAME, writeConfig } from '../lib/config.js';
import { colorEnabled, makeColor } from '../lib/color.js';

const HELP = `
bugplant ${VERSION} — plant bugs in the code your agent just wrote.

  Your tests should kill them. This prints the score: killed / planted.

Usage
  bugplant                       mutate lines added since the default base
  bugplant --since origin/main   mutate lines added since a specific ref
  bugplant --all                 mutate every source file (first run / audit)
  bugplant --json                machine-readable result

Options
  --since <ref>         base to diff against (default: first of origin/main, main, HEAD~1)
  --base <ref>          alias for --since
  --max <n>             plant at most n bugs (default 12)
  --seed <n>            sample deterministically (default 1; printed every run)
  --test-command <cmd>  command to run; {tests} is replaced with related test files
  --timeout <ms>        per-run timeout (default 30000)
  --min-score <pct>     exit 1 when the score is below this percentage
  --files <a,b>         restrict to these files
  --no-select-tests     always run the full suite
  --dry-run             show what would be planted, run nothing
  --json                print JSON instead of text
  --no-color            disable ANSI colour
  --init                write a starter ${CONFIG_NAME}
  --version             print the version
  --help                print this help

Exit codes
  0  score is at or above --min-score
  1  score is below --min-score
  2  could not run (no base ref, failing baseline, bad config)

Examples
  bugplant --since origin/main --max 20
  bugplant --all --test-command "node --test {tests}"
  bugplant --json | jq .score
`;

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const options = {};
  const take = (index, flag) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} needs a value`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--since':
      case '--base':
        options.base = take(i, arg);
        i += 1;
        break;
      case '--max':
        options.maxMutants = Number(take(i, arg));
        i += 1;
        break;
      case '--seed':
        options.seed = Number(take(i, arg));
        i += 1;
        break;
      case '--test-command':
        options.testCommand = take(i, arg);
        i += 1;
        break;
      case '--timeout':
        options.timeoutMs = Number(take(i, arg));
        i += 1;
        break;
      case '--min-score':
        options.minScore = Number(take(i, arg));
        i += 1;
        break;
      case '--files':
        options.files = take(i, arg).split(',').map((f) => f.trim()).filter(Boolean);
        i += 1;
        break;
      case '--json':
        options.json = true;
        break;
      case '--all':
        options.all = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--no-select-tests':
        options.selectTests = false;
        break;
      case '--no-color':
        options.color = false;
        break;
      case '--init':
        options.init = true;
        break;
      case '--version':
        options.version = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('--')) throw new Error(`unknown flag: ${arg}`);
        throw new Error(`unexpected argument: ${arg}`);
    }
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`bugplant: ${error.message}\n\n${HELP}`);
    process.exit(2);
  }

  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (options.init) {
    const result = await writeConfig(process.cwd(), options.testCommand);
    process.stdout.write(
      result.created
        ? `wrote ${CONFIG_NAME}\n`
        : `${CONFIG_NAME} already exists, left untouched\n`
    );
    return;
  }

  const color = colorEnabled(options.color);
  const c = makeColor(color);
  const showProgress = !options.json && Boolean(process.stderr.isTTY) && !process.env.CI;

  let lastWidth = 0;
  const onProgress = (event) => {
    if (!showProgress) return;
    let line = '';
    if (event.type === 'baseline') {
      line = c.gray(`  baseline: ${event.command}`);
    } else if (event.type === 'mutant') {
      const done = event.index;
      const total = event.total;
      line = c.gray(`  planting ${done + 1}/${total}  ${event.mutant.file}:${event.mutant.line}`);
    }
    if (!line) return;
    const padding = ' '.repeat(Math.max(0, lastWidth - line.replace(/\u001b\[[0-9;]*m/g, '').length));
    process.stderr.write(`\r${line}${padding}`);
    lastWidth = line.replace(/\u001b\[[0-9;]*m/g, '').length;
  };

  let result;
  try {
    result = await run({ ...options, onProgress });
  } catch (error) {
    if (showProgress) process.stderr.write('\r' + ' '.repeat(lastWidth) + '\r');
    if (error instanceof BaselineError) {
      process.stderr.write(`\n  ${c.red('baseline failed')} — ${error.message}\n`);
      if (error.output) {
        const tail = error.output.split('\n').slice(-12).join('\n');
        process.stderr.write(`${c.gray(tail)}\n`);
      }
      process.stderr.write(`\n  Fix the suite first. A red baseline cannot score anything.\n\n`);
      process.exit(2);
    }
    process.stderr.write(`bugplant: ${error.message}\n`);
    process.exit(2);
  }

  if (showProgress) process.stderr.write('\r' + ' '.repeat(lastWidth) + '\r');

  if (options.json) {
    process.stdout.write(`${renderJson(result)}\n`);
  } else {
    process.stdout.write(`${renderText(result, { color, verbose: options.verbose })}\n`);
    if (result.mutants.length === 0) {
      process.stdout.write(
        c.gray('  No mutation points found in the diff. Try --all, or change a line with a comparison, boolean or number.\n\n')
      );
    }
  }

  const minScore = typeof options.minScore === 'number' ? options.minScore : 0;
  const percent = result.score === null ? 100 : result.score * 100;
  if (result.mutants.length > 0 && minScore > 0 && percent < minScore) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`bugplant: ${error.stack || error.message}\n`);
  process.exit(2);
});
