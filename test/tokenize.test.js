import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenize, T } from '../lib/tokenize.js';

test('a "<" inside a comment or string is not a token', () => {
  const src = ['// a < b', 'const x = "a < b"; /* c < d */', 'if (a < b) {}'].join('\n');
  const angles = tokenize(src).filter((t) => t.type === T.PUNCT && t.value === '<');
  assert.equal(angles.length, 1);
  assert.equal(angles[0].line, 3);
});

test('a "<" inside a regular expression is not a token', () => {
  const src = 'const re = /a<b/g; if (a < b) {}';
  const angles = tokenize(src).filter((t) => t.type === T.PUNCT && t.value === '<');
  assert.equal(angles.length, 1);
});

test('division is punctuation, not the start of a regex', () => {
  const tokens = tokenize('const x = a / b;');
  const slash = tokens.find((t) => t.value === '/');
  assert.equal(slash.type, T.PUNCT);
});

test('a regex after an operator is a regex', () => {
  const tokens = tokenize('const x = y ? /a/ : /b/;');
  assert.equal(tokens.filter((t) => t.type === T.REGEX).length, 2);
});

test('template literals are one opaque token', () => {
  const tokens = tokenize('const s = `a < b ${x < y}`;');
  assert.equal(tokens.filter((t) => t.type === T.PUNCT && t.value === '<').length, 0);
  assert.equal(tokens.filter((t) => t.type === T.TPL).length, 1);
});

test('line numbers survive block comments', () => {
  const src = '/*\n\n*/\nconst a = 1;\nconst b = 2;';
  const tokens = tokenize(src).filter((t) => t.type === T.IDENT);
  assert.deepEqual(
    tokens.map((t) => [t.value, t.line]),
    [
      ['const', 4],
      ['a', 4],
      ['const', 5],
      ['b', 5]
    ]
  );
});

test('an unterminated string stops at the newline instead of eating the file', () => {
  const tokens = tokenize('const a = "oops\nconst b = 2;');
  assert.ok(tokens.some((t) => t.value === 'b'));
});

test('multi-character operators are a single token', () => {
  const values = tokenize('a === b && c !== d;').filter((t) => t.type === T.PUNCT).map((t) => t.value);
  assert.deepEqual(values, ['===', '&&', '!==', ';']);
});

test('numbers with separators, exponents and bigints stay one token', () => {
  const values = tokenize('1_000 1e3 0xFF 10n').filter((t) => t.type === T.NUM).map((t) => t.value);
  assert.deepEqual(values, ['1_000', '1e3', '0xFF', '10n']);
});
