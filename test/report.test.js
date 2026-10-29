import test from 'node:test';
import assert from 'node:assert/strict';

import { renderJson, renderText, score, VERSION } from '../lib/report.js';

const RESULT = {
  base: 'origin/main',
  seed: 1,
  testCommand: 'node --test',
  selectedTests: 1,
  sourceFiles: ['src/a.js'],
  addedLines: 4,
  mutants: [
    { file: 'src/a.js', line: 1, from: '<', to: '<=', snippet: 'if (a < b)', status: 'killed', ms: 10 },
    { file: 'src/a.js', line: 2, from: '10', to: '9', snippet: 'const x = 10;', status: 'survived', ms: 12 }
  ],
  killed: 1,
  survived: 1,
  invalid: 0,
  score: 0.5,
  durationMs: 2000
};

test('score is killed over killed plus survived', () => {
  assert.equal(score(1, 1), 0.5);
  assert.equal(score(0, 0), null);
  assert.equal(score(5, 0), 1);
});

test('text output names the survivors', () => {
  const text = renderText(RESULT, { color: false });
  assert.match(text, /SURVIVORS/);
  assert.match(text, /src\/a\.js:2/);
  assert.match(text, /50%/);
  assert.match(text, /\(1\/2\)/);
});

test('discarded mutants are reported without inflating the score', () => {
  const text = renderText({ ...RESULT, invalid: 3 }, { color: false });
  assert.match(text, /discarded/);
  assert.match(text, /50%/);
});

test('timing is omitted when asked', () => {
  process.env.BUGPLANT_NO_TIMING = '1';
  const text = renderText(RESULT, { color: false });
  assert.doesNotMatch(text, /2\.0s/);
  delete process.env.BUGPLANT_NO_TIMING;
});

test('json includes the seed and the raw score', () => {
  const parsed = JSON.parse(renderJson(RESULT));
  assert.equal(parsed.seed, 1);
  assert.equal(parsed.score, 0.5);
  assert.equal(parsed.version, VERSION);
  assert.equal(parsed.mutants.length, 2);
});

test('colour is opt-in and off means no escapes', () => {
  const plain = renderText(RESULT, { color: false });
  assert.doesNotMatch(plain, /\u001b\[/);
  const coloured = renderText(RESULT, { color: true });
  assert.match(coloured, /\u001b\[/);
});
