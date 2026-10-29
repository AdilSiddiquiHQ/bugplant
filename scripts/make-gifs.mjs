// Generate the README GIFs from the real demo run.
//
// No screen recorder and no npm packages: macOS Quick Look renders the frames
// (WebKit, so the type is properly hinted) and ffmpeg assembles a palette GIF.
// The numbers in the animation come from scripts/demo.mjs, not from prose.

import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runDemo, runStrictExample, ROOT } from './demo.mjs';

const W = 1200;
const OUT = path.join(ROOT, 'assets');

const C = {
  bg: '#0d1117',
  panel: '#161b22',
  border: '#30363d',
  text: '#c9d1d9',
  dim: '#8b949e',
  green: '#3fb950',
  red: '#f85149',
  yellow: '#d29922',
  blue: '#58a6ff',
  purple: '#bc8cff'
};

function esc(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function windowHtml(title, rows, fixedHeight) {
  const height = fixedHeight || heightFor(rows);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${C.bg};width:${W}px;height:${height}px;overflow:hidden}
    .wrap{padding:26px 30px}
    .win{background:${C.panel};border:1px solid ${C.border};border-radius:12px;overflow:hidden;height:${height - 52}px}
    .bar{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid ${C.border};background:#1c2128}
    .dot{width:12px;height:12px;border-radius:50%}
    .title{margin-left:10px;font:13px -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:${C.dim}}
    pre{margin:0;padding:22px 26px;font:17px/1.62 ui-monospace,SFMono-Regular,Menlo,monospace;color:${C.text};white-space:pre}
    .g{color:${C.green}} .r{color:${C.red}} .y{color:${C.yellow}} .b{color:${C.blue}}
    .d{color:${C.dim}} .p{color:${C.purple}} .bold{font-weight:700}
  </style></head><body><div class="wrap"><div class="win">
    <div class="bar"><i class="dot" style="background:#ff5f57"></i><i class="dot" style="background:#febc2e"></i><i class="dot" style="background:#28c840"></i><span class="title">${esc(title)}</span></div>
    <pre>${rows.join('\n')}</pre>
  </div></div></body></html>`;
}

function row(text) {
  return text;
}

function heightFor(rows) {
  // Measured from the rendered frames: Quick Look lays this markup out at ~33px
  // per line, and the window chrome plus padding adds ~140px.
  return Math.round(140 + rows.length * 33);
}

function pad(text, width) {
  const clean = text.replace(/<[^>]+>/g, '');
  return clean.length >= width ? text : text + ' '.repeat(width - clean.length);
}

function bar(ratio, width = 22, char = '█') {
  const filled = Math.round(ratio * width);
  return char.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

function heroRows(result) {
  const json = result.json;
  const ratio = json.score ?? 0;
  const survivors = json.mutants.filter((m) => m.status === 'survived');
  const rows = [
    row(`<span class="g">$</span> <span class="b">npx bugplant</span> --since origin/main`),
    '',
    row(`  <span class="bold">bugplant</span> <span class="d">0.1.0</span>`),
    '',
    row(`  <span class="d">${pad('base', 9)}</span>${esc(json.base)}`),
    row(`  <span class="d">${pad('changed', 9)}</span>${json.sourceFiles.length} source file, ${json.addedLines} added lines`),
    row(`  <span class="d">${pad('planted', 9)}</span><span class="y">${json.mutants.length} bugs</span>`),
    row(`  <span class="d">${pad('tests', 9)}</span>node --test <span class="d">· ${json.selectedTests} related test file</span>`),
    '',
    row(`  <span class="g">${pad('killed', 9)}  ${bar(ratio)}  ${Math.round(ratio * 100)}%   ${json.killed}</span>`),
    row(`  <span class="r">${pad('survived', 9)}  ${bar(ratio, 22, '■')}  ${json.survived}</span>`),
    '',
    row(`  <span class="bold">SURVIVORS</span> <span class="d">— bugs your tests did not notice</span>`),
    ''
  ];
  for (const mutant of survivors.slice(0, 4)) {
    rows.push(
      row(
        `  <span class="b">${pad(`${mutant.file}:${mutant.line}`, 26)}</span><span class="y">${pad(`${mutant.from} -> ${mutant.to}`, 15)}</span><span class="d">${esc(mutant.snippet)}</span>`
      )
    );
  }
  if (survivors.length > 4) rows.push(row(`  <span class="d">… ${survivors.length - 4} more</span>`));
  rows.push('');
  rows.push(row(`  <span class="bold">score ${Math.round(ratio * 100)}%</span> <span class="d">(${json.killed}/${json.killed + json.survived})</span>`));
  return rows;
}

function compareFrames(weak, strict) {
  const weakRatio = weak.json.score ?? 0;
  const strictRatio = strict.json.score ?? 0;
  const rows = [
    row(`  <span class="bold">same code. two test suites.</span>`),
    '',
    row(`  <span class="d">weak tests</span>`),
    row(`  <span class="r">${bar(weakRatio)}  ${Math.round(weakRatio * 100)}%</span>  <span class="d">${weak.json.killed}/${weak.json.killed + weak.json.survived} bugs caught</span>`),
    '',
    row(`  <span class="d">real assertions</span>`),
    row(`  <span class="g">${bar(strictRatio)}  ${Math.round(strictRatio * 100)}%</span>  <span class="d">${strict.json.killed}/${strict.json.killed + strict.json.survived} bugs caught</span>`),
    '',
    row(`  <span class="d">the survivor both suites missed:</span>`),
    row(`  <span class="b">src/cart.js:4</span>  <span class="y">10 -> 9</span>  <span class="d">const MIN_ORDER = 10;</span>`)
  ];
  return rows;
}

async function renderFrame(html, dir, name, height) {
  const work = path.join(dir, name);
  await mkdir(work, { recursive: true });
  const file = path.join(work, 'f.html');
  await writeFile(file, html, 'utf8');
  execFileSync('qlmanage', ['-t', '-s', String(W), '-o', work, file], { stdio: 'ignore' });
  const png = path.join(work, 'f.html.png');
  const out = path.join(dir, `${name}.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-vf', `crop=${W}:${height}:0:0`, '-frames:v', '1', out]);
  return out;
}

async function assemble(dir, frames, outFile, fps, holdFrames = 10) {
  const seq = path.join(dir, `seq-${path.basename(outFile, '.gif')}`);
  await mkdir(seq, { recursive: true });
  let index = 0;
  for (const frame of frames) {
    for (let i = 0; i < (frame.hold || 1); i += 1) {
      await copyFile(frame.file, path.join(seq, `f_${String(index).padStart(4, '0')}.png`));
      index += 1;
    }
  }
  for (let i = 0; i < holdFrames; i += 1) {
    await copyFile(frames[frames.length - 1].file, path.join(seq, `f_${String(index).padStart(4, '0')}.png`));
    index += 1;
  }
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-framerate', String(fps),
    '-i', path.join(seq, 'f_%04d.png'),
    '-vf', 'scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none',
    '-loop', '0',
    outFile
  ]);
  return outFile;
}

async function main() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bugplant-gifs-'));
  await mkdir(OUT, { recursive: true });
  try {
    process.stdout.write('running demo…\n');
    const weak = await runDemo({ max: 12, seed: 1 });

    process.stdout.write('running strict example…\n');
    const { json: strictJson } = await runStrictExample({ max: 12, seed: 1 });

    const hero = heroRows(weak);
    const title = 'bugplant — plant bugs, see if your tests notice';
    const heroHeight = heightFor(hero);
    const shot = (rows, name) => renderFrame(windowHtml(title, rows, heroHeight), dir, name, heroHeight);

    // Typed command, then one row per frame.
    const frames = [];
    const typed = `<span class="g">$</span> <span class="b">npx bugplant</span> --since origin/main`;
    frames.push({ file: await shot([row('<span class="g">$</span> <span class="p">█</span>')], 'hero-000'), hold: 4 });
    frames.push({ file: await shot([row('<span class="g">$</span> <span class="b">npx bugplant</span> --since origin/main<span class="p">█</span>')], 'hero-001'), hold: 4 });
    for (let i = 1; i <= hero.length; i += 1) {
      const rows = hero.slice(0, i);
      if (i === 1) rows[0] = typed;
      const name = `hero-${String(i + 1).padStart(3, '0')}`;
      frames.push({ file: await shot(rows, name), hold: i === hero.length ? 14 : 2 });
    }

    const demoGif = await assemble(dir, frames, path.join(OUT, 'demo.gif'), 8);
    process.stdout.write(`wrote ${path.relative(ROOT, demoGif)}\n`);

    const cmp = compareFrames(weak, { json: strictJson });
    const cmpTitle = 'weak tests vs real assertions';
    const cmpHeight = heightFor(cmp);
    const cmpShot = (rows, name) => renderFrame(windowHtml(cmpTitle, rows, cmpHeight), dir, name, cmpHeight);
    const cmpFrames = [];
    for (let i = 1; i <= cmp.length; i += 1) {
      const name = `cmp-${String(i).padStart(3, '0')}`;
      cmpFrames.push({ file: await cmpShot(cmp.slice(0, i), name), hold: i === cmp.length ? 16 : 3 });
    }
    const scoreGif = await assemble(dir, cmpFrames, path.join(OUT, 'score.gif'), 8);
    process.stdout.write(`wrote ${path.relative(ROOT, scoreGif)}\n`);

    // Static card for social previews and README fallbacks.
    const cardPng = await shot(hero, 'card');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', cardPng, '-vf', 'scale=1200:-1', '-frames:v', '1', path.join(OUT, 'card.png')]);
    process.stdout.write('wrote assets/card.png\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
