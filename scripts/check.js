#!/usr/bin/env node
// Invariants that must never regress: package structure, README claims, assets.
import { spawnSync } from 'node:child_process';

const tests = ['test/package.test.js', 'test/readme.test.js', 'test/assets.test.js'];
const res = spawnSync(process.execPath, ['--test', ...tests], {
  stdio: 'inherit'
});
process.exit(res.status ?? 1);
