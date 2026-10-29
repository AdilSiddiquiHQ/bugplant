// Terminal colour, without a dependency.
//
// Rules: respect NO_COLOR, don't emit escapes when stdout is not a TTY, and
// never colour the only thing that carries meaning.

const CODES = {
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  gray: 90,
  bold: 1,
  dim: 2
};

/**
 * @param {boolean} enabled
 */
export function makeColor(enabled) {
  const wrap = (code, text) => (enabled ? `\u001b[${code}m${text}\u001b[0m` : String(text));
  const color = {};
  for (const [name, code] of Object.entries(CODES)) {
    color[name] = (text) => wrap(code, text);
  }
  return color;
}

export function colorEnabled(flag) {
  if (flag === false) return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}
