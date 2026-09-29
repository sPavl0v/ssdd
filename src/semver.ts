// Minimal semver range check for "ssddVersion": supports >=, >, <=, <, =, ^, ~ and space-separated AND.

type V = [number, number, number];

function parse(v: string): V | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

function cmp(a: V, b: V): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function satisfies(version: string, range: string): boolean {
  const v = parse(version);
  if (!v) return false;
  return range
    .trim()
    .split(/\s+/)
    .every((part) => {
      const m = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(part);
      if (!m) return false;
      const target = parse(m[2]);
      if (!target) return false;
      const c = cmp(v, target);
      switch (m[1]) {
        case ">=":
          return c >= 0;
        case ">":
          return c > 0;
        case "<=":
          return c <= 0;
        case "<":
          return c < 0;
        case "^":
          return c >= 0 && (target[0] > 0 ? v[0] === target[0] : v[0] === 0 && v[1] === target[1]);
        case "~":
          return c >= 0 && v[0] === target[0] && v[1] === target[1];
        default:
          return c === 0;
      }
    });
}
