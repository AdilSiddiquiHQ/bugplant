import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { buildCommand, runOnce } from '../lib/runner.js';

const cwd = process.cwd();

test('buildCommand appends test paths when there is no placeholder', () => {
  const command = buildCommand('node --test', [path.join(cwd, 'test/a.test.js')], cwd);
  assert.equal(command, 'node --test "test/a.test.js"');
});

test('buildCommand fills {tests}', () => {
  const command = buildCommand('npx vitest run {tests}', [path.join(cwd, 'test/a.test.js')], cwd);
  assert.equal(command, 'npx vitest run "test/a.test.js"');
});

test('buildCommand leaves the command alone with no tests', () => {
  assert.equal(buildCommand('node --test', [], cwd), 'node --test');
});

test('a passing run is reported as pass', () => {
  const result = runOnce({ cwd, command: 'node -e "process.exit(0)"' });
  assert.equal(result.status, 'pass');
});

test('a failing run is reported as fail', () => {
  const result = runOnce({ cwd, command: 'node -e "process.exit(1)"' });
  assert.equal(result.status, 'fail');
});

test('a syntax error is reported as invalid, not killed', () => {
  const result = runOnce({
    cwd,
    command: 'node -e "console.error(\'SyntaxError: Unexpected token\'); process.exit(1)"'
  });
  assert.equal(result.status, 'invalid');
});

test('a hanging run is reported as timeout', () => {
  const result = runOnce({ cwd, command: 'node -e "setTimeout(() => {}, 5000)"', timeoutMs: 250 });
  assert.equal(result.status, 'timeout');
});

test('output is captured for the baseline error message', () => {
  const result = runOnce({ cwd, command: 'node -e "console.error(\'boom\'); process.exit(1)"' });
  assert.match(result.output, /boom/);
});
