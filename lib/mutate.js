// Mutation operators.
//
// Every operator is a *deliberate, named* defect. The point is not to be
// exhaustive; the point is that a survivor is a concrete bug the test suite
// demonstrably failed to notice. Anything we plant must be a bug a human would
// call a bug.

import { T } from './tokenize.js';

/** @typedef {'relational'|'arithmetic'|'logical'|'boolean'|'literal'|'increment'} Family */

const PUNCT_RULES = new Map([
  ['<', { to: '<=', family: 'relational' }],
  ['<=', { to: '<', family: 'relational' }],
  ['>', { to: '>=', family: 'relational' }],
  ['>=', { to: '>', family: 'relational' }],
  ['===', { to: '!==', family: 'relational' }],
  ['!==', { to: '===', family: 'relational' }],
  ['==', { to: '!=', family: 'relational' }],
  ['!=', { to: '==', family: 'relational' }],
  ['+', { to: '-', family: 'arithmetic' }],
  ['-', { to: '+', family: 'arithmetic' }],
  ['*', { to: '/', family: 'arithmetic' }],
  ['/', { to: '*', family: 'arithmetic' }],
  ['%', { to: '*', family: 'arithmetic' }],
  ['&&', { to: '||', family: 'logical' }],
  ['||', { to: '&&', family: 'logical' }],
  ['++', { to: '--', family: 'increment' }],
  ['--', { to: '++', family: 'increment' }]
]);

const BOOLEANS = new Map([
  ['true', 'false'],
  ['false', 'true']
]);

/**
 * A short human description of what the mutant does.
 * @param {string} from
 * @param {string} to
 */
export function describe(from, to) {
  return `${from} -> ${to}`;
}

/**
 * Find every mutation point in the given lines.
 * @param {import('./tokenize.js').*} _ unused
 * @param {{type:string,value:string,start:number,end:number,line:number}[]} tokens
 * @param {Set<number>|null} lines 1-based line numbers, or null for every line
 */
export function findCandidates(tokens, lines) {
  const out = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (lines && !lines.has(token.line)) continue;

    if (token.type === T.PUNCT) {
      const rule = PUNCT_RULES.get(token.value);
      if (rule) {
        out.push({
          tokenIndex: index,
          line: token.line,
          family: rule.family,
          from: token.value,
          to: rule.to,
          replace: rule.to
        });
      }
      continue;
    }

    if (token.type === T.IDENT && BOOLEANS.has(token.value)) {
      const to = BOOLEANS.get(token.value);
      out.push({
        tokenIndex: index,
        line: token.line,
        family: 'boolean',
        from: token.value,
        to,
        replace: to
      });
      continue;
    }

    if (token.type === T.NUM) {
      const raw = token.value;
      if (raw.endsWith('n') || raw.includes('.')) continue;
      const value = Number(raw.replaceAll('_', ''));
      if (!Number.isSafeInteger(value)) continue;
      const next = value === 0 ? 1 : value - 1;
      out.push({
        tokenIndex: index,
        line: token.line,
        family: 'literal',
        from: raw,
        to: String(next),
        replace: String(next)
      });
      continue;
    }

    if (token.type === T.STR) {
      const quote = token.value[0];
      if (token.value.length < 2 || token.value[token.value.length - 1] !== quote) continue;
      if (token.value.length === 2) continue; // already empty
      out.push({
        tokenIndex: index,
        line: token.line,
        family: 'literal',
        from: token.value,
        to: `${quote}${quote}`,
        replace: `${quote}${quote}`
      });
    }
  }
  return out;
}

/**
 * Apply one candidate to a source string.
 * @param {string} src
 * @param {{start:number,end:number}} token
 * @param {{replace:string}} candidate
 */
export function applyMutation(src, token, candidate) {
  return src.slice(0, token.start) + candidate.replace + src.slice(token.end);
}

/**
 * Deterministic 32-bit PRNG (mulberry32).
 * @param {number} seed
 */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample candidates deterministically.
 * @param {Array} candidates
 * @param {number} max
 * @param {number} seed
 */
export function sample(candidates, max, seed) {
  if (max <= 0 || candidates.length <= max) return candidates.slice();
  const next = rng(seed);
  const pool = candidates.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, max);
  // Report in source order so the output reads like a file walk.
  picked.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return picked;
}
