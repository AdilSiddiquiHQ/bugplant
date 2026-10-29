// A small JavaScript/TypeScript tokenizer.
//
// This is not a parser. It only needs to be good enough to find safe mutation
// points: it must know where strings, comments, template literals and regular
// expressions begin and end so we never "mutate" text that is not code.

export const T = {
  IDENT: 'ident',
  NUM: 'num',
  STR: 'str',
  TPL: 'tpl',
  REGEX: 'regex',
  PUNCT: 'punct',
  COMMENT: 'comment'
};

const PUNCT = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=',
  '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&',
  '|', '^', '!', '~', '?', ':', '=', '.', '@', '#'
].sort((a, b) => b.length - a.length);

const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await'
]);

const NO_REGEX_AFTER = new Set([')', ']', '}', '++', '--']);

function isDigit(c) {
  return c >= '0' && c <= '9';
}

function isIdentStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
}

function isIdentPart(c) {
  return isIdentStart(c) || isDigit(c);
}

function regexAllowedAfter(prev) {
  if (!prev) return true;
  if (prev.type === T.IDENT) return REGEX_KEYWORDS.has(prev.value);
  if (prev.type === T.PUNCT) return !NO_REGEX_AFTER.has(prev.value);
  return false;
}

/**
 * Tokenize source text.
 * @param {string} src
 * @returns {{type: string, value: string, start: number, end: number, line: number}[]}
 */
export function tokenize(src) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let prev = null;

  const push = (type, start, end, startLine) => {
    const token = { type, value: src.slice(start, end), start, end, line: startLine };
    tokens.push(token);
    prev = token;
    return token;
  };

  while (i < n) {
    const c = src[i];

    if (c === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i += 1;
      continue;
    }

    // Line comment
    if (c === '/' && src[i + 1] === '/') {
      const start = i;
      const startLine = line;
      while (i < n && src[i] !== '\n') i += 1;
      push(T.COMMENT, start, i, startLine);
      continue;
    }

    // Block comment
    if (c === '/' && src[i + 1] === '*') {
      const start = i;
      const startLine = line;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line += 1;
        i += 1;
      }
      i = Math.min(i + 2, n);
      push(T.COMMENT, start, i, startLine);
      continue;
    }

    // Single and double quoted strings
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      const startLine = line;
      i += 1;
      while (i < n) {
        if (src[i] === '\\') {
          if (src[i + 1] === '\n') line += 1;
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i += 1;
          break;
        }
        if (src[i] === '\n') {
          // Unterminated string: stop at the newline rather than eating the file.
          break;
        }
        i += 1;
      }
      push(T.STR, start, i, startLine);
      continue;
    }

    // Template literals. We treat the whole literal as one token, including
    // any ${...} expressions, which means we do not mutate inside them.
    if (c === '`') {
      const start = i;
      const startLine = line;
      i += 1;
      let depth = 0;
      while (i < n) {
        const ch = src[i];
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === '\n') {
          line += 1;
          i += 1;
          continue;
        }
        if (ch === '$' && src[i + 1] === '{') {
          depth += 1;
          i += 2;
          continue;
        }
        if (ch === '}' && depth > 0) {
          depth -= 1;
          i += 1;
          continue;
        }
        if (ch === '`' && depth === 0) {
          i += 1;
          break;
        }
        i += 1;
      }
      push(T.TPL, start, i, startLine);
      continue;
    }

    // Regular expression literal
    if (c === '/' && regexAllowedAfter(prev)) {
      const start = i;
      const startLine = line;
      i += 1;
      let inClass = false;
      let closed = false;
      while (i < n) {
        const ch = src[i];
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === '\n') break;
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) {
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (closed) {
        while (i < n && isIdentPart(src[i])) i += 1;
      }
      push(T.REGEX, start, i, startLine);
      continue;
    }

    // Numbers
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      const start = i;
      const startLine = line;
      if (c === '0' && /[xXbBoO]/.test(src[i + 1] || '')) {
        i += 2;
        while (i < n && /[0-9a-fA-F_]/.test(src[i])) i += 1;
      } else {
        while (i < n && /[0-9_]/.test(src[i])) i += 1;
        if (src[i] === '.') {
          i += 1;
          while (i < n && /[0-9_]/.test(src[i])) i += 1;
        }
        if (src[i] === 'e' || src[i] === 'E') {
          i += 1;
          if (src[i] === '+' || src[i] === '-') i += 1;
          while (i < n && isDigit(src[i])) i += 1;
        }
      }
      if (src[i] === 'n') i += 1;
      push(T.NUM, start, i, startLine);
      continue;
    }

    // Identifiers and keywords
    if (isIdentStart(c)) {
      const start = i;
      const startLine = line;
      while (i < n && isIdentPart(src[i])) i += 1;
      push(T.IDENT, start, i, startLine);
      continue;
    }

    // Punctuation
    let matched = null;
    for (const p of PUNCT) {
      if (src.startsWith(p, i)) {
        matched = p;
        break;
      }
    }
    if (matched) {
      const start = i;
      const startLine = line;
      i += matched.length;
      push(T.PUNCT, start, i, startLine);
      continue;
    }

    // Unknown character: skip one code unit so we always make progress.
    i += 1;
  }

  return tokens;
}
