import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAddedLines } from '../lib/gitdiff.js';

const DIFF = `diff --git a/src/a.js b/src/a.js
index 111..222 100644
--- a/src/a.js
+++ b/src/a.js
@@ -1,0 +2,2 @@
+x
+y
@@ -10 +12 @@
-z
+w
diff --git a/src/b.js b/src/b.js
--- /dev/null
+++ b/src/b.js
@@ -0,0 +1,1 @@
+new file
diff --git a/src/gone.js b/src/gone.js
--- a/src/gone.js
+++ /dev/null
@@ -1,0 +0,0 @@
`;

test('added lines are collected per file', () => {
  const added = parseAddedLines(DIFF);
  assert.deepEqual([...added.get('src/a.js')].sort((a, b) => a - b), [2, 3, 12]);
});

test('new files are included', () => {
  assert.deepEqual([...parseAddedLines(DIFF).get('src/b.js')], [1]);
});

test('deleted files are not', () => {
  assert.equal(parseAddedLines(DIFF).has('src/gone.js'), false);
});

test('an empty diff is an empty map', () => {
  assert.equal(parseAddedLines('').size, 0);
});

test('multi-line hunks expand to every added line', () => {
  const diff = ['+++ b/x.js', '@@ -0,0 +7,3 @@', '+a', '+b', '+c'].join('\n');
  assert.deepEqual([...parseAddedLines(diff).get('x.js')], [7, 8, 9]);
});
