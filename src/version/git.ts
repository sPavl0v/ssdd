import { spawnSync } from "node:child_process";
import { CliError } from "../config.ts";
import { SSDD_DIR, type SpecSource } from "../spec/tree.ts";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function gitRaw(cwd: string, args: string[], input?: string): GitResult {
  const r = spawnSync("git", args, { cwd, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new CliError(`git not available: ${r.error.message}`, 2);
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

export function git(cwd: string, args: string[], input?: string): string {
  const r = gitRaw(cwd, args, input);
  if (!r.ok) throw new CliError(`git ${args.join(" ")} failed: ${r.stderr.trim()}`, 1);
  return r.stdout;
}

export function repoRoot(cwd: string): string | null {
  const r = gitRaw(cwd, ["rev-parse", "--show-toplevel"]);
  return r.ok ? r.stdout.trim() : null;
}

export function hasHead(cwd: string): boolean {
  return gitRaw(cwd, ["rev-parse", "--verify", "-q", "HEAD"]).ok;
}

/** Current branch name, or null on detached HEAD. Works on an unborn branch. */
export function currentBranch(cwd: string): string | null {
  const r = gitRaw(cwd, ["symbolic-ref", "--short", "-q", "HEAD"]);
  return r.ok ? r.stdout.trim() : null;
}

export function mergeInProgress(cwd: string): boolean {
  for (const ref of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD"]) {
    if (gitRaw(cwd, ["rev-parse", "-q", "--verify", ref]).ok) return true;
  }
  return false;
}

export function shortHash(cwd: string, rev = "HEAD"): string {
  return git(cwd, ["rev-parse", "--short", rev]).trim();
}

export function remoteExists(cwd: string, remote: string): boolean {
  return gitRaw(cwd, ["remote", "get-url", remote]).ok;
}

export function upstream(cwd: string): string | null {
  const r = gitRaw(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  return r.ok ? r.stdout.trim() : null;
}

export function readAt(cwd: string, rev: string, rel: string): string | null {
  const r = gitRaw(cwd, ["show", `${rev}:./${rel}`]);
  return r.ok ? r.stdout : null;
}

/** Spec files as they were at a git revision. */
export function gitSource(cwd: string, rev: string): SpecSource {
  return {
    read: (rel) => readAt(cwd, rev, rel),
    listFeatures() {
      const r = gitRaw(cwd, ["ls-tree", "-r", "--name-only", rev, "--", `${SSDD_DIR}/specs`]);
      if (!r.ok) return [];
      return r.stdout
        .split("\n")
        .map((l) => /^ssdd\/specs\/([^/]+)\/spec\.md$/.exec(l)?.[1])
        .filter((x): x is string => !!x)
        .sort();
    },
  };
}
