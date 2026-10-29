import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenize } from '../lib/tokenize.js';
import { applyMutation, findCandidates, sample } from '../lib/mutate.js';

function candidatesFor(src, lines = null) {
  return findCandidates(tokenize(src), lines);
}

test('every operator family produces a candidate', () => {
  const families = new Set(
    candidatesFor('if (a < b && c === true) { n = 10 + 1; s = "x"; n++; }').map((c) => c.family)
  );
  assert.deepEqual([...families].sort(), [
    'arithmetic',
    'boolean',
    'increment',
    'literal',
    'logical',
    'relational'
  ]);
});

test('relational operators flip in the direction a reviewer would call a bug', () => {
  const changes = candidatesFor('a < b').map((c) => `${c.from}>${c.to}`);
  assert.deepEqual(changes, ['<><=']);
});

test('comparison and equality both count as relational', () => {
  const changes = candidatesFor('a === b; c !== d;').map((c) => `${c.from}>${c.to}`);
  assert.deepEqual(changes, ['===>!==', '!==>===']);
});

test('numbers move by one, and zero becomes one', () => {
  const changes = candidatesFor('const a = 10; const b = 0;').map((c) => `${c.from}>${c.to}`);
  assert.deepEqual(changes, ['10>9', '0>1']);
});

test('floats and bigints are skipped rather than guessed at', () => {
  const changes = candidatesFor('const a = 0.5; const b = 10n;');
  assert.equal(changes.length, 0);
});

test('strings are emptied but keep their quote style', () => {
  const [candidate] = candidatesFor("const s = 'SAVE20';");
  assert.equal(candidate.to, "''");
});

test('an already-empty string is not a mutation point', () => {
  assert.equal(candidatesFor("const s = '';").length, 0);
});

test('line filtering is exact', () => {
  const src = 'const a = 1;\nconst b = 2;\nconst c = 3;';
  const onlyMiddle = findCandidates(tokenize(src), new Set([2]));
  assert.deepEqual(onlyMiddle.map((c) => c.line), [2]);
});

test('tokens inside strings, comments and templates are never candidates', () => {
  const src = [
    '// a < b',
    "const s = 'x < y';",
    'const t = `a < b`;',
    'if (a < b) {}'
  ].join('\n');
  const found = findCandidates(tokenize(src), null).filter((c) => c.family === 'relational');
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 4);
});

test('applyMutation replaces exactly one span', () => {
  const src = 'if (a < b) {}';
  const [candidate] = findCandidates(tokenize(src), null);
  const token = tokenize(src)[candidate.tokenIndex];
  assert.equal(applyMutation(src, token, candidate), 'if (a <= b) {}');
});

test('sampling is deterministic for a seed and varies across seeds', () => {
  const candidates = Array.from({ length: 40 }, (_, i) => ({ file: 'a.js', line: i + 1 }));
  const a = sample(candidates, 5, 7);
  const b = sample(candidates, 5, 7);
  assert.deepEqual(a, b);
  const different = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    different.add(sample(candidates, 5, seed).map((c) => c.line).join(','));
  }
  assert.ok(different.size > 1, 'different seeds should produce different samples');
});

test('sampling never returns more than the pool', () => {
  const candidates = [{ file: 'a.js', line: 1 }];
  assert.equal(sample(candidates, 12, 1).length, 1);
});
