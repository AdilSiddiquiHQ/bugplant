// Render a run. Text for humans, JSON for machines.
//
// Every number shown here is derived from mutant outcomes; nothing is
// estimated and nothing is rounded up.

import { makeColor } from './color.js';

export const VERSION = '0.1.0';

const BAR_WIDTH = 22;

/**
 * @param {number} killed
 * @param {number} survived
 */
export function score(killed, survived) {
  const total = killed + survived;
  if (total === 0) return null;
  return killed / total;
}

/**
 * @param {number} ratio
 */
function bar(ratio) {
  const filled = Math.round(ratio * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, BAR_WIDTH - filled));
}

function pad(text, width) {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

/**
 * @param {object} result
 * @param {{color?: boolean, timing?: boolean, verbose?: boolean}} options
 */
export function renderText(result, options = {}) {
  const c = makeColor(Boolean(options.color));
  const timing = options.timing !== false && !process.env.BUGPLANT_NO_TIMING;
  const lines = [];
  const ratio = result.score ?? 0;

  lines.push('');
  lines.push(`  ${c.bold('bugplant')} ${c.gray(VERSION)}${' '.repeat(28)}${c.gray(`seed ${result.seed}`)}`);
  lines.push('');
  lines.push(`  ${c.gray(pad('base', 9))}${result.base}`);
  lines.push(
    `  ${c.gray(pad('changed', 9))}${result.sourceFiles.length} source file${result.sourceFiles.length === 1 ? '' : 's'}, ${result.addedLines} added line${result.addedLines === 1 ? '' : 's'}`
  );
  lines.push(`  ${c.gray(pad('planted', 9))}${result.mutants.length} bug${result.mutants.length === 1 ? '' : 's'}`);
  lines.push(
    `  ${c.gray(pad('tests', 9))}${result.testCommand}${result.selectedTests === null ? '' : c.gray(` · ${result.selectedTests} related test file${result.selectedTests === 1 ? '' : 's'}`)}`
  );
  lines.push('');
  lines.push(
    `  ${c.green(pad('killed', 9))}  ${c.green(bar(ratio))}  ${c.green(String(Math.round(ratio * 100) + '%'))}   ${c.green(String(result.killed))}`
  );
  if (result.survived > 0) {
    lines.push(`  ${c.red(pad('survived', 9))}  ${c.red('■'.repeat(Math.round(ratio * BAR_WIDTH)))}${' '.repeat(BAR_WIDTH - Math.round(ratio * BAR_WIDTH))}  ${c.red(String(result.survived))}`);
  }
  if (result.invalid > 0) {
    lines.push(`  ${c.gray(pad('discarded', 9))}  ${c.gray('not a valid bug')}   ${c.gray(String(result.invalid))}`);
  }

  const survivors = result.mutants.filter((m) => m.status === 'survived');
  if (survivors.length) {
    lines.push('');
    lines.push(`  ${c.bold('SURVIVORS')} ${c.gray('— bugs your tests did not notice')}`);
    lines.push('');
    for (const mutant of survivors) {
      const where = `${mutant.file}:${mutant.line}`;
      const change = `${mutant.from} -> ${mutant.to}`;
      lines.push(`  ${c.cyan(pad(where, 34))}${c.yellow(pad(change, 16))}${c.gray(mutant.snippet)}`);
    }
  }

  lines.push('');
  const label = result.score === null ? 'no score' : `${Math.round(result.score * 100)}%`;
  const counts = `${result.killed}/${result.killed + result.survived}`;
  lines.push(`  ${c.bold(`score ${label}`)}  ${c.gray(`(${counts})`)}${timing ? c.gray(`  ${(result.durationMs / 1000).toFixed(1)}s`) : ''}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {object} result
 */
export function renderJson(result) {
  return JSON.stringify(
    {
      version: VERSION,
      base: result.base,
      seed: result.seed,
      testCommand: result.testCommand,
      selectedTests: result.selectedTests,
      sourceFiles: result.sourceFiles,
      addedLines: result.addedLines,
      mutants: result.mutants,
      killed: result.killed,
      survived: result.survived,
      invalid: result.invalid,
      score: result.score,
      durationMs: result.durationMs
    },
    null,
    2
  );
}
