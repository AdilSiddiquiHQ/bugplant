import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { runDemo, runStrictExample, ROOT } from '../scripts/demo.mjs';

const readme = () => readFile(path.join(ROOT, 'README.md'), 'utf8');

test('the README transcript is the real output of the demo', async () => {
  const md = await readme();
  const match = /<!-- demo:start -->\n```text\n([\s\S]*?)```\n<!-- demo:end -->/.exec(md);
  assert.ok(match, 'README must contain the demo markers');
  const documented = match[1].trimEnd();
  const actual = (await runDemo()).text.replace(/^\n/, '').trimEnd();
  assert.equal(documented, actual);
});

test('the README score claim is the score the strict example produces', async () => {
  const md = await readme();
  const strict = await runStrictExample();
  const percent = Math.round(strict.json.score * 100);

  const claim = /\[`examples\/shop-strict`\]\(examples\/shop-strict\)\) scores \*\*(\d+)%\*\*/.exec(md);
  assert.ok(claim, 'README must state the strict example score');
  assert.equal(
    Number(claim[1]),
    percent,
    `README says ${claim[1]}% but the strict example scores ${percent}%`
  );
});

test('the README survivor claim matches the survivor the strict example reports', async () => {
  const md = await readme();
  const strict = await runStrictExample();
  const survivors = strict.json.mutants.filter((m) => m.status === 'survived');

  assert.equal(survivors.length, 1, 'the README says exactly one survivor survives the strict suite');
  const [survivor] = survivors;
  const shown = survivor.snippet.replace(/^\s*(?:const|let|var)\s+/, '').replace(/;$/, '');
  assert.match(
    md,
    new RegExp(`\`${escapeRe(shown)}\` could become \`${escapeRe(survivor.to)}\``),
    `README does not describe the real survivor: ${survivor.file}:${survivor.line} ${survivor.from} -> ${survivor.to}`
  );
});

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
