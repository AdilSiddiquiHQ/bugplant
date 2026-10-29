// Build a throwaway git repository for end-to-end tests.

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export async function makeRepo(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bugplant-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync(
    'git',
    ['-c', 'user.email=test@bugplant.dev', '-c', 'user.name=test', 'commit', '-qm', 'base'],
    { cwd: dir }
  );

  return {
    dir,
    async write(rel, content) {
      const full = path.join(dir, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content, 'utf8');
    },
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    }
  };
}
