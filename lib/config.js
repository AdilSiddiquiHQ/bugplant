// Config file handling.
//
// A config file exists so a repository can pin the test command once and let
// the CLI stay short in CI. Flags always win.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const CONFIG_NAME = '.bugplant.json';

export const DEFAULTS = {
  testCommand: null,
  maxMutants: 12,
  timeoutMs: 30000,
  minScore: 0,
  ignore: [],
  selectTests: true,
  seed: 1
};

/**
 * @param {string} cwd
 */
export async function loadConfig(cwd) {
  const file = path.join(cwd, CONFIG_NAME);
  try {
    const text = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(text);
    return { ...DEFAULTS, ...parsed, path: file };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULTS, path: null };
    throw new Error(`Could not read ${CONFIG_NAME}: ${error.message}`);
  }
}

/**
 * Write a starter config without overwriting anything.
 * @param {string} cwd
 */
export async function writeConfig(cwd, testCommand) {
  const file = path.join(cwd, CONFIG_NAME);
  try {
    await fs.access(file);
    return { file, created: false };
  } catch {
    const body = {
      testCommand: testCommand || 'node --test',
      maxMutants: 12,
      timeoutMs: 30000,
      minScore: 0,
      ignore: []
    };
    await fs.writeFile(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    return { file, created: true };
  }
}
