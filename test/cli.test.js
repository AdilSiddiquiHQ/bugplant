import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { makeRepo } from '../scripts/test-repo.mjs';

const BIN = path.resolve('bin/bugplant.js');

const BASE = `export function add(a, b) {
  return 0;
}
`;
const CHANGED = `export function add(a, b) {
  return a + b;
}
`;
const TEST = `import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../src/add.js';
test('adds', () => assert.equal(add(1, 2), 3));
`;

async function fixture() {
  const repo = await makeRepo({
    'package.json': '{"type":"module"}\n',
    'src/add.js': BASE,
    'test/add.test.js': TEST
  });
  await repo.write('src/add.js', CHANGED);
  return repo;
}

function cli(args, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CI: '1' } });
}

test('--json prints a parseable result', async () => {
  const repo = await fixture();
  try {
    const run = cli(['--since', 'HEAD', '--json', '--test-command', 'node --test'], repo.dir);
    assert.equal(run.status, 0, run.stderr);
    const json = JSON.parse(run.stdout);
    assert.equal(json.score, 1);
    assert.equal(json.mutants[0].from, '+');
  } finally {
    await repo.cleanup();
  }
});

test('--min-score turns the score into an exit code', async () => {
  const repo = await fixture();
  try {
    const run = cli(['--since', 'HEAD', '--min-score', '101', '--test-command', 'node --test'], repo.dir);
    assert.equal(run.status, 1);
    assert.match(run.stdout, /score 100%/);
  } finally {
    await repo.cleanup();
  }
});

test('--version and --help are honest about the version', () => {
  const version = cli(['--version']);
  assert.equal(version.status, 0);
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);
  const help = cli(['--help']);
  assert.match(help.stdout, /plant bugs/i);
});

test('an unknown flag is a usage error', () => {
  const run = cli(['--nope']);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /unknown flag/);
});

test('a missing base ref is a clean failure, not a stack trace', async () => {
  const repo = await fixture();
  try {
    const run = cli(['--since', 'does-not-exist'], repo.dir);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /git diff/);
    assert.doesNotMatch(run.stderr, /at Object\./);
  } finally {
    await repo.cleanup();
  }
});

test('--dry-run writes nothing and reports planned mutants', async () => {
  const repo = await fixture();
  try {
    const run = cli(['--since', 'HEAD', '--json', '--dry-run'], repo.dir);
    assert.equal(run.status, 0, run.stderr);
    const json = JSON.parse(run.stdout);
    assert.ok(json.mutants.every((m) => m.status === 'planned'));
  } finally {
    await repo.cleanup();
  }
});
