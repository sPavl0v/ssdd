// Positional labels (3.2): odd levels are numbers, even levels are letters (spreadsheet style).

export const PATH_GRAMMAR = /^\d+(\.([a-z]+|\d+))*$/;

/** Spreadsheet-style letters: 1 → a, 26 → z, 27 → aa. */
export function toLetters(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(97 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Label for the child at `index` (0-based) on `level` (1-based). */
export function labelFor(level: number, index: number): string {
  return level % 2 === 1 ? String(index + 1) : toLetters(index + 1);
}

/** Normalize a user-supplied path: `[1.A.3]` → `1.a.3`. Returns null when it is not a valid path. */
export function normalizePath(input: string): string | null {
  let p = input.trim();
  if (p.startsWith("[") && p.endsWith("]")) p = p.slice(1, -1);
  p = p.toLowerCase();
  if (!PATH_GRAMMAR.test(p)) return null;
  // Levels must alternate number / letters.
  const parts = p.split(".");
  for (let i = 0; i < parts.length; i++) {
    const isNum = /^\d+$/.test(parts[i]);
    if (isNum !== (i % 2 === 0)) return null;
    if (isNum && Number(parts[i]) === 0) return null;
  }
  return p;
}

export function isInside(path: string, scope: string): boolean {
  return scope === "" || path === scope || path.startsWith(scope + ".");
}

export function pathDepth(path: string): number {
  return path.split(".").length;
}
