import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { ROOT } from '../scripts/demo.mjs';
import { VERSION } from '../lib/report.js';

const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');

test('version is the same in package.json, report.js and the CLI output', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.version, VERSION);
  const cli = await read('bin/bugplant.js');
  assert.match(cli, /report\.js/);
});

test('there are no runtime or development dependencies', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.devDependencies ?? {}, {});
});

test('the README makes the zero-dependency claim the test enforces', async () => {
  const md = await read('README.md');
  assert.match(md, /Zero runtime dependencies/);
  assert.match(md, /A test fails the build if either/);
});

test('exactly eight badges, because a wall of badges is noise', async () => {
  const md = await read('README.md');
  const badges = md.match(/\[!\[/g) || [];
  assert.equal(badges.length, 8);
});

test('the Action has no logic in YAML', async () => {
  const action = await read('action.yml');
  assert.match(action, /using: composite/);
  assert.equal((action.match(/\n\s+run:/g) || []).length, 1);
  assert.match(action, /scripts\/bugplant\.sh/);
  assert.doesNotMatch(action, /run: \|/);
});

test('the shell entry point is strict', async () => {
  const script = await read('scripts/bugplant.sh');
  assert.match(script, /set -euo pipefail/);
});

test('every mutation family is documented', async () => {
  const md = await read('README.md');
  const source = await read('lib/mutate.js');
  const families = new Set([...source.matchAll(/family: '([a-z]+)'/g)].map((m) => m[1]));
  for (const family of families) {
    assert.match(md, new RegExp(`\\| ${family} \\|`), `README is missing the ${family} family`);
  }
});

test('the package ships what the README tells people to run', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.ok(pkg.files.includes('bin'));
  assert.ok(pkg.files.includes('lib'));
  assert.equal(pkg.bin.bugplant, 'bin/bugplant.js');
  await stat(path.join(ROOT, 'bin/bugplant.js'));
});
