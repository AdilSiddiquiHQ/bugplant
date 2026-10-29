// A tiny dependency graph, built from relative import specifiers.
//
// The only job here is test selection: if a source file changed, which test
// files can possibly observe it? Getting this wrong in the name of speed would
// produce fake survivors, so anything unresolved falls back to "run every
// test file" rather than to "run nothing".

import { promises as fs } from 'node:fs';
import path from 'node:path';

const SOURCE_EXT = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'];
const RESOLVE_EXT = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.json'];

export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  '.svelte-kit', 'vendor', 'tmp', '.cache', '.bugplant-cache', 'assets'
]);

const IMPORT_RE = /(?:^|[^.\w$])(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * @param {string} file
 */
export function isTestPath(file) {
  const normalized = file.split(path.sep).join('/');
  if (/(^|\/)(__tests__|test|tests|spec|specs)\//.test(normalized)) return true;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)) return true;
  return false;
}

/**
 * @param {string} file
 */
export function isSourcePath(file) {
  return SOURCE_EXT.includes(path.extname(file));
}

/**
 * Extract relative import specifiers from source text.
 * @param {string} src
 */
export function extractImports(src) {
  const specs = new Set();
  for (const re of [IMPORT_RE, REQUIRE_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(src)) !== null) {
      const spec = match[1];
      if (spec.startsWith('.')) specs.add(spec);
    }
  }
  return [...specs];
}

/**
 * Resolve a relative specifier to a real file on disk, if possible.
 * @param {string} fromFile absolute
 * @param {string} spec
 */
async function resolveSpecifier(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, ...RESOLVE_EXT.map((ext) => base + ext)];
  for (const ext of RESOLVE_EXT) {
    candidates.push(path.join(base, `index${ext}`));
  }
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // keep trying
    }
  }
  return null;
}

/**
 * Walk a directory and build the graph.
 * @param {string} root absolute path
 * @param {{ignore?: string[]}} [options]
 * @returns {Promise<{files: string[], deps: Map<string, Set<string>>, rdeps: Map<string, Set<string>>, tests: string[]}>}
 */
export async function buildGraph(root, options = {}) {
  const ignore = new Set(options.ignore || []);
  const files = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (ignore.has(rel) || ignore.has(entry.name)) continue;
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && isSourcePath(full)) {
        files.push(full);
      }
    }
  }

  await walk(root);

  const deps = new Map();
  const rdeps = new Map();
  for (const file of files) {
    deps.set(file, new Set());
    if (!rdeps.has(file)) rdeps.set(file, new Set());
  }

  for (const file of files) {
    let src = '';
    try {
      src = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    for (const spec of extractImports(src)) {
      const resolved = await resolveSpecifier(file, spec);
      if (!resolved || !deps.has(resolved)) continue;
      deps.get(file).add(resolved);
      if (!rdeps.has(resolved)) rdeps.set(resolved, new Set());
      rdeps.get(resolved).add(file);
    }
  }

  const tests = files.filter(isTestPath);
  return { files, deps, rdeps, tests };
}

/**
 * Which test files can observe `target`? Walks reverse edges transitively.
 * Returns null when the answer is "we could not tell", so callers can fall back
 * to running everything.
 * @param {{rdeps: Map<string, Set<string>>, tests: string[]}} graph
 * @param {string} target
 */
export function testsFor(graph, target) {
  if (!graph.rdeps.has(target)) return null;
  const seen = new Set([target]);
  const queue = [target];
  const found = new Set();
  while (queue.length) {
    const current = queue.shift();
    for (const parent of graph.rdeps.get(current) || []) {
      if (seen.has(parent)) continue;
      seen.add(parent);
      queue.push(parent);
      if (isTestPath(parent)) found.add(parent);
    }
  }
  if (found.size === 0) return null;
  return [...found].sort();
}
