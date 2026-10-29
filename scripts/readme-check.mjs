#!/usr/bin/env node
// Fast check that the README demo block matches reality.
import { spawnSync } from 'node:child_process';

const res = spawnSync(process.execPath, ['--test', 'test/readme.test.js'], {
  stdio: 'inherit'
});
process.exit(res.status ?? 1);
