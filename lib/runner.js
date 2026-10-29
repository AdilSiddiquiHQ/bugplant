// Run the project's tests, once, and classify what happened.
//
// The classification is the product. "killed" must mean "the suite noticed the
// bug", "survived" must mean "the suite did not", and "invalid" must never be
// counted as either.

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const INVALID_PATTERNS = [
  /SyntaxError/,
  /Unexpected token/,
  /ParseError/,
  /Transform failed/,
  /Invalid or unexpected token/,
  /Cannot use import statement outside a module/,
  /Unterminated (string|template|regular expression)/,
  /error TS\d{4}/,
  /ESBuildError/
];

/**
 * @param {string} command
 * @param {string[]} tests absolute paths
 * @param {string} cwd
 */
export function buildCommand(command, tests, cwd) {
  const quoted = tests
    .map((file) => `"${path.relative(cwd, file).split(path.sep).join('/')}"`)
    .join(' ');
  if (command.includes('{tests}')) return command.replaceAll('{tests}', quoted);
  return quoted ? `${command} ${quoted}` : command;
}

/**
 * @param {{cwd: string, command: string, tests?: string[], timeoutMs?: number}} input
 * @returns {{status: 'pass'|'fail'|'timeout'|'invalid', ms: number, output: string, command: string}}
 */
export function runOnce(input) {
  const { cwd, command, tests = [], timeoutMs = 30000 } = input;
  const full = buildCommand(command, tests, cwd);
  const started = Date.now();
  const env = { ...process.env, CI: process.env.CI ?? '1', FORCE_COLOR: '0', NO_COLOR: '1' };
  // A nested `node --test` must not inherit the outer runner's context, or it
  // reports everything as passing and every mutant looks survived.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(full, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env
  });
  const ms = Date.now() - started;
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();

  const timedOut = result.error?.code === 'ETIMEDOUT' || (result.status === null && result.signal);
  if (timedOut) return { status: 'timeout', ms, output: output.slice(-4000), command: full };

  if (result.error) {
    return { status: 'invalid', ms, output: `${result.error.message}\n${output}`.slice(-4000), command: full };
  }

  if (result.status === 0) return { status: 'pass', ms, output: output.slice(-4000), command: full };

  const invalid = INVALID_PATTERNS.some((re) => re.test(output));
  return {
    status: invalid ? 'invalid' : 'fail',
    ms,
    output: output.slice(-4000),
    command: full
  };
}

/**
 * True when the runner is telling us it could not even load the file.
 * @param {string} output
 */
export function looksLikeSyntaxError(output) {
  return INVALID_PATTERNS.some((re) => re.test(output));
}
