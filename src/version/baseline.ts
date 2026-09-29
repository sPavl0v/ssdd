import { git, gitRaw, hasHead, remoteExists } from "./git.ts";

export const TRAILER = "Ssdd-Version";

export interface Baseline {
  version: number;
  /** Revision to read the spec from (tag name or commit hash). */
  rev: string;
  commit: string;
  source: "tag" | "trailer";
}

export function tagName(prefix: string, version: number): string {
  return `${prefix}${version}`;
}

function parseTagVersion(prefix: string, tag: string): number | null {
  if (!tag.startsWith(prefix)) return null;
  const n = Number(tag.slice(prefix.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Nearest ssdd tag reachable from HEAD; falls back to the newest commit with an Ssdd-Version trailer (4.3). */
export function findBaseline(cwd: string, prefix: string): Baseline | null {
  if (!hasHead(cwd)) return null;
  const d = gitRaw(cwd, ["describe", "--tags", "--match", `${prefix}*`, "--abbrev=0", "HEAD"]);
  if (d.ok) {
    const tag = d.stdout.trim();
    const v = parseTagVersion(prefix, tag);
    if (v !== null) {
      const commit = git(cwd, ["rev-list", "-n", "1", tag]).trim();
      return { version: v, rev: tag, commit, source: "tag" };
    }
  }
  const log = gitRaw(cwd, ["log", `--format=%H%x00%(trailers:key=${TRAILER},valueonly,separator=%x2C)`, "HEAD"]);
  if (!log.ok) return null;
  for (const line of log.stdout.split("\n")) {
    const [hash, val] = line.split("\0");
    const v = Number((val ?? "").trim());
    if (hash && val && Number.isInteger(v) && v > 0) return { version: v, rev: hash, commit: hash, source: "trailer" };
  }
  return null;
}

export function localTagVersions(cwd: string, prefix: string): number[] {
  const out = gitRaw(cwd, ["tag", "-l", `${prefix}*`]).stdout;
  return out
    .split("\n")
    .map((t) => parseTagVersion(prefix, t.trim()))
    .filter((v): v is number => v !== null);
}

export function remoteTagVersions(cwd: string, prefix: string, remote: string): number[] {
  if (!remoteExists(cwd, remote)) return [];
  const r = gitRaw(cwd, ["ls-remote", "--tags", remote, `refs/tags/${prefix}*`]);
  if (!r.ok) return [];
  return r.stdout
    .split("\n")
    .map((l) => l.split("\t")[1]?.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""))
    .map((t) => (t ? parseTagVersion(prefix, t) : null))
    .filter((v): v is number => v !== null);
}

export function tagExists(cwd: string, tag: string): boolean {
  return gitRaw(cwd, ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]).ok;
}
