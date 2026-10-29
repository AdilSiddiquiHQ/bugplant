import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildGraph, extractImports, isTestPath, testsFor } from '../lib/graph.js';

test('test paths are recognised by convention', () => {
  assert.equal(isTestPath('test/a.js'), true);
  assert.equal(isTestPath('src/__tests__/a.tsx'), true);
  assert.equal(isTestPath('src/a.test.js'), true);
  assert.equal(isTestPath('src/a.spec.ts'), true);
  assert.equal(isTestPath('src/testing.js'), false);
});

test('imports, requires and dynamic imports are all found', () => {
  const src = [
    "import a from './a.js';",
    "export { b } from './b.js';",
    "const c = require('./c.js');",
    "const d = await import('./d.js');",
    "import express from 'express';"
  ].join('\n');
  assert.deepEqual(extractImports(src).sort(), ['./a.js', './b.js', './c.js', './d.js']);
});

test('the graph finds which tests can observe a file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bugplant-graph-'));
  try {
    const files = {
      'src/math.js': 'export const add = (a, b) => a + b;\n',
      'src/use.js': "import { add } from './math.js';\nexport const two = add(1, 1);\n",
      'src/lonely.js': 'export const x = 1;\n',
      'test/math.test.js': "import { add } from '../src/math.js';\n",
      'test/other.test.js': 'export const nothing = true;\n'
    };
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await writeFile(path.join(dir, rel), content, 'utf8');
    }
    const graph = await buildGraph(dir);
    assert.deepEqual(testsFor(graph, path.join(dir, 'src/math.js')), [path.join(dir, 'test/math.test.js')]);
    assert.equal(testsFor(graph, path.join(dir, 'src/lonely.js')), null);
    assert.equal(graph.tests.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('transitive test discovery follows re-exports', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bugplant-graph-'));
  try {
    const files = {
      'src/deep.js': 'export const v = 1;\n',
      'src/index.js': "export * from './deep.js';\n",
      'test/index.test.js': "import { v } from '../src/index.js';\n"
    };
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await writeFile(path.join(dir, rel), content, 'utf8');
    }
    const graph = await buildGraph(dir);
    assert.deepEqual(testsFor(graph, path.join(dir, 'src/deep.js')), [path.join(dir, 'test/index.test.js')]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('node_modules is never walked', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bugplant-graph-'));
  try {
    await mkdir(path.join(dir, 'node_modules/pkg'), { recursive: true });
    await writeFile(path.join(dir, 'node_modules/pkg/index.js'), 'export const x = 1;\n');
    await writeFile(path.join(dir, 'src.js'), 'export const y = 1;\n');
    const graph = await buildGraph(dir);
    assert.equal(graph.files.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
