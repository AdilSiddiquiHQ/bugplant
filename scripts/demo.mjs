// Build a throwaway git repository from the example and run bugplant in it.
//
// This is shared by `npm run demo` and by the README test, so the transcript in
// the README is produced by the same code path a user runs.

import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
const BASE = path.join(ROOT, 'examples/.base/shop');
const CURRENT = path.join(ROOT, 'examples/shop');
const BIN = path.join(ROOT, 'bin/bugplant.js');

/**
 * @param {{max?: number, seed?: number}} [options]
 */
export async function runDemo(options = {}) {
  const max = options.max ?? 12;
  const seed = options.seed ?? 1;
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'bugplant-demo-'));
  const repo = path.join(tmp, 'shop');
  try {
    await cp(BASE, repo, { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
    execFileSync('git', ['add', '-A'], { cwd: repo });
    execFileSync(
      'git',
      ['-c', 'user.email=demo@bugplant.dev', '-c', 'user.name=demo', 'commit', '-qm', 'base'],
      { cwd: repo }
    );

    // Overlay the current version so the diff exists in the working tree.
    for (const entry of await readdir(CURRENT)) {
      await cp(path.join(CURRENT, entry), path.join(repo, entry), { recursive: true, force: true });
    }

    const common = ['--since', 'main', '--max', String(max), '--seed', String(seed), '--test-command', 'node --test'];
    const env = { ...process.env, CI: '1', BUGPLANT_NO_TIMING: '1', NO_COLOR: '1' };
    const text = spawnSync(process.execPath, [BIN, ...common, '--no-color'], {
      cwd: repo,
      encoding: 'utf8',
      env
    });
    const json = spawnSync(process.execPath, [BIN, ...common, '--json'], {
      cwd: repo,
      encoding: 'utf8',
      env
    });

    if (text.status !== 0 && text.status !== 1) {
      throw new Error(`demo failed (${text.status}): ${text.stderr}`);
    }
    return {
      text: text.stdout.replace(/\n+$/, '\n'),
      stderr: text.stderr,
      status: text.status,
      json: JSON.parse(json.stdout)
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Run the strict example. The README quotes its score, so the quote is produced
 * by the same code that the test asserts against.
 * @param {{max?: number, seed?: number}} [options]
 */
export async function runStrictExample(options = {}) {
  const max = options.max ?? 12;
  const seed = options.seed ?? 1;
  const cwd = path.join(ROOT, 'examples/shop-strict');
  const env = { ...process.env, CI: '1', NO_COLOR: '1', BUGPLANT_NO_TIMING: '1' };
  const common = ['--all', '--test-command', 'node --test', '--max', String(max), '--seed', String(seed)];

  const text = spawnSync(process.execPath, [BIN, ...common, '--no-color'], { cwd, encoding: 'utf8', env });
  const json = spawnSync(process.execPath, [BIN, ...common, '--json'], { cwd, encoding: 'utf8', env });
  if (text.status !== 0 && text.status !== 1) {
    throw new Error(`strict example failed (${text.status}): ${text.stderr}`);
  }
  return {
    text: text.stdout.replace(/\n+$/, '\n'),
    stderr: text.stderr,
    status: text.status,
    json: JSON.parse(json.stdout)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runDemo();
  process.stdout.write(result.text);
  if (process.env.BUGPLANT_DEMO_JSON) process.stdout.write(`${JSON.stringify(result.json, null, 2)}\n`);
}
