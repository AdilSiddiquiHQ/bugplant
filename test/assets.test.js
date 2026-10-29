import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { ROOT } from '../scripts/demo.mjs';

const asset = (name) => path.join(ROOT, 'assets', name);

test('the demo GIF exists and is a real multi-frame GIF', async () => {
  const file = asset('demo.gif');
  const info = await stat(file);
  assert.ok(info.size > 20_000, 'demo.gif is suspiciously small');
  const header = (await readFile(file)).subarray(0, 6).toString('latin1');
  assert.equal(header, 'GIF89a');
});

test('the score GIF exists and is a real GIF', async () => {
  const file = asset('score.gif');
  const info = await stat(file);
  assert.ok(info.size > 10_000, 'score.gif is suspiciously small');
  const header = (await readFile(file)).subarray(0, 6).toString('latin1');
  assert.equal(header, 'GIF89a');
});

test('the social card exists', async () => {
  const info = await stat(asset('card.png'));
  assert.ok(info.size > 10_000);
});

test('the README shows both animations', async () => {
  const md = await readFile(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(md, /assets\/demo\.gif/);
  assert.match(md, /assets\/score\.gif/);
});
