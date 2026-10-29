import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { BaselineError, run } from '../lib/engine.js';
import { makeRepo } from '../scripts/test-repo.mjs';

const BASE = `export const LIMIT = 10;

export function clamp(n) {
  if (n > LIMIT) return LIMIT;
  return n;
}
`;

const CHANGED = `export const LIMIT = 10;

export function clamp(n) {
  if (n > LIMIT) return LIMIT + 1;
  return n;
}
`;

const TEST = `import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp } from '../src/math.js';

test('clamps above the limit', () => {
  assert.equal(clamp(20), 11);
  assert.equal(clamp(5), 5);
});
`;

async function fixture() {
  const repo = await makeRepo({
    'package.json': '{"type":"module"}\n',
    'src/math.js': BASE,
    'test/math.test.js': TEST
  });
  await repo.write('src/math.js', CHANGED);
  return repo;
}

const OPTIONS = { base: 'HEAD', testCommand: 'node --test', maxMutants: 6, seed: 1, timeoutMs: 20000 };

test('a run scores the mutated lines and restores the file', async () => {
  const repo = await fixture();
  try {
    const result = await run({ cwd: repo.dir, ...OPTIONS });
    assert.equal(result.mutants.length, 3);
    assert.equal(result.killed, 2);
    assert.equal(result.survived, 1);
    assert.equal(result.invalid, 0);
    assert.equal(result.score, 2 / 3);
    assert.equal(result.selectedTests, 1);
    assert.match(await readFile(`${repo.dir}/src/math.js`, 'utf8'), /return LIMIT \+ 1;/);
  } finally {
    await repo.cleanup();
  }
});

test('the same seed produces the same mutants', async () => {
  const repo = await fixture();
  try {
    const first = await run({ cwd: repo.dir, ...OPTIONS });
    const second = await run({ cwd: repo.dir, ...OPTIONS });
    const shape = (r) => r.mutants.map((m) => `${m.line}:${m.from}:${m.to}:${m.status}`).join('|');
    assert.equal(shape(first), shape(second));
  } finally {
    await repo.cleanup();
  }
});

test('a red baseline refuses to produce a score', async () => {
  const repo = await fixture();
  try {
    await repo.write(
      'test/math.test.js',
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('red', () => assert.equal(1, 2));\n"
    );
    await assert.rejects(() => run({ cwd: repo.dir, ...OPTIONS }), BaselineError);
  } finally {
    await repo.cleanup();
  }
});

test('a dry run plans mutants without touching the file', async () => {
  const repo = await fixture();
  try {
    const result = await run({ cwd: repo.dir, ...OPTIONS, dryRun: true });
    assert.equal(result.mutants.length, 3);
    assert.ok(result.mutants.every((m) => m.status === 'planned'));
    assert.equal(result.score, null);
    assert.equal(await readFile(`${repo.dir}/src/math.js`, 'utf8'), CHANGED);
  } finally {
    await repo.cleanup();
  }
});

test('an empty diff is not an error', async () => {
  const repo = await makeRepo({ 'src/a.js': 'export const a = 1;\n' });
  try {
    const result = await run({ cwd: repo.dir, ...OPTIONS });
    assert.equal(result.mutants.length, 0);
    assert.equal(result.score, null);
  } finally {
    await repo.cleanup();
  }
});

test('--all mutates the whole tree', async () => {
  const repo = await fixture();
  try {
    const result = await run({ cwd: repo.dir, ...OPTIONS, all: true, maxMutants: 3 });
    assert.ok(result.mutants.length > 0);
    assert.ok(result.mutants.every((m) => m.status !== 'planned'));
  } finally {
    await repo.cleanup();
  }
});
