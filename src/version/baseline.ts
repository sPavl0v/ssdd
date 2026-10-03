import { frontMatterValue, parseSpecFile } from "../spec/parser.ts";
import { ROOTSPEC } from "../spec/tree.ts";
import { gitRaw, hasHead, readAt } from "./git.ts";

// Only `ssdd commit` writes the `version:` line of rootspec.md, so the commits that change it are
// the ssdd commits. They are found by content, which survives squash, rebase and reworded messages.

export interface Baseline {
  version: number;
  commit: string;
}

/** `git log -G` pattern for a `version: <N>` line (N ≥ 1); any N when omitted. Works as BRE and ERE. */
function versionLine(version?: number): string {
  return `^version: *${version ?? "[1-9][0-9]*"}[[:space:]]*$`;
}

/** Commits reachable from `revs` whose diff adds or removes a version line, children before parents. */
function versionCommits(cwd: string, revs: string[], opts: { version?: number; limit?: number } = {}): string[] {
  const args = ["log", "--topo-order", "--full-history", "-G", versionLine(opts.version), "--format=%H"];
  if (opts.limit) args.push(`-${opts.limit}`);
  const r = gitRaw(cwd, [...args, ...revs, "--", ROOTSPEC]);
  return r.ok ? r.stdout.split("\n").filter(Boolean) : [];
}

function versionAt(cwd: string, commit: string): number {
  const text = readAt(cwd, commit, ROOTSPEC);
  return text === null ? 0 : Number(frontMatterValue(parseSpecFile(text, ROOTSPEC).frontMatter, "version") ?? 0);
}

/**
 * The latest ssdd commits in HEAD's history: one on a linear history, one per side after a merge of
 * branches that each committed a version and nothing committed since. Empty before the first.
 */
export function findBaselines(cwd: string): Baseline[] {
  if (!hasHead(cwd)) return [];
  const found: Baseline[] = [];
  for (;;) {
    // Topological order: the first hit has no descendant among the remaining ssdd commits.
    const [c] = versionCommits(cwd, ["HEAD", ...found.map((b) => `^${b.commit}`)], { limit: 1 });
    if (!c) return found;
    found.push({ version: versionAt(cwd, c), commit: c });
  }
}

/** Commits in HEAD's history whose rootspec.md has `version: <version>`; several after parallel branches. */
export function commitsForVersion(cwd: string, version: number): string[] {
  if (!hasHead(cwd)) return [];
  // -G also matches the next commit, which removes the line; keep the ones that set it.
  return versionCommits(cwd, ["HEAD"], { version }).filter((c) => versionAt(cwd, c) === version);
}
