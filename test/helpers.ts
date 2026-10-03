import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../src/cli/run.ts";

export function tmpDir(prefix = "ssdd-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function sh(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** A throwaway repo with a bare remote named origin. */
export function makeRepo(opts: { remote?: boolean } = {}): { root: string; remote: string | null } {
  const base = tmpDir();
  const root = path.join(base, "app");
  fs.mkdirSync(root);
  sh(root, "git", ["init", "-q", "-b", "main"]);
  sh(root, "git", ["config", "user.email", "test@example.com"]);
  sh(root, "git", ["config", "user.name", "Test"]);
  sh(root, "git", ["config", "commit.gpgsign", "false"]);
  sh(root, "git", ["config", "tag.gpgsign", "false"]);
  let remote: string | null = null;
  if (opts.remote !== false) {
    remote = path.join(base, "remote.git");
    sh(base, "git", ["init", "-q", "--bare", remote]);
    sh(root, "git", ["remote", "add", "origin", remote]);
  }
  return { root, remote };
}

export interface CliResult {
  code: number;
  out: string;
  err: string;
}

export async function cli(cwd: string, ...args: string[]): Promise<CliResult> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, { cwd, out: (s) => out.push(s), err: (s) => err.push(s), confirm: async () => false });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

export function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

export function read(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

export function spec(version: number, body: string, preamble = "# App\n\nTest app.\n"): string {
  return `---\nssdd version: 1\nversion: ${version}\n---\n${preamble}\n${body.replace(/^\n/, "")}`;
}

/** Initialize ssdd, write a spec and commit it as v1 (no push unless a remote exists). */
export async function initWithSpec(body: string, opts: { remote?: boolean } = {}) {
  const repo = makeRepo(opts);
  const r = await cli(repo.root, "init", "--agents", "claude");
  if (r.code !== 0) throw new Error(r.err);
  write(repo.root, "ssdd/rootspec.md", spec(0, body));
  const c = await cli(repo.root, "commit", "-m", "feat: first spec");
  if (c.code !== 0) throw new Error(c.err + c.out);
  return repo;
}
