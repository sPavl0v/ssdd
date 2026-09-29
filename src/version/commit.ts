import fs from "node:fs";
import path from "node:path";
import { CliError } from "../config.ts";
import type { Project } from "../project.ts";
import { parseSpecFile, setFrontMatterValue, splitLines } from "../spec/parser.ts";
import { ROOTSPEC } from "../spec/tree.ts";
import type { Diagnostic } from "../spec/types.ts";
import { TRAILER, localTagVersions, remoteTagVersions, tagName } from "./baseline.ts";
import { currentBranch, git, gitRaw, mergeInProgress, remoteExists, shortHash, upstream } from "./git.ts";
import { sync } from "./sync.ts";

export interface CommitResult {
  committed: boolean;
  version?: number;
  hash?: string;
  branch?: string;
  tag?: string;
  push: { status: "pushed" | "skipped" | "no-remote" | "failed"; detail: string };
  diagnostics: Diagnostic[];
}

export function setRootVersion(root: string, version: number): void {
  const abs = path.join(root, ROOTSPEC);
  const text = fs.readFileSync(abs, "utf8");
  const pf = parseSpecFile(text, ROOTSPEC);
  const lines = splitLines(text);
  if (!pf.frontMatter) {
    fs.writeFileSync(abs, ["---", "ssdd: 1", `version: ${version}`, "---", ...lines].join("\n") + "\n");
    return;
  }
  const fm = setFrontMatterValue(pf.frontMatter, "version", String(version));
  fs.writeFileSync(abs, ["---", ...fm, "---", ...lines.slice(pf.frontMatter.length + 2)].join("\n") + "\n");
}

/** The only writer of versions (4.2). */
export function commit(p: Project, message: string, opts: { push?: boolean } = {}): CommitResult {
  const cwd = p.root;
  if (!message.trim()) throw new CliError("Commit message is empty", 2);
  const branch = currentBranch(cwd);
  if (!branch) throw new CliError("Detached HEAD: check out a branch before ssdd commit", 1);
  if (mergeInProgress(cwd)) throw new CliError("A merge, rebase or cherry-pick is in progress: finish it before ssdd commit", 1);

  const s = sync(p);
  const errors = [...s.tree.diagnostics, ...s.diagnostics].filter((d) => d.level === "error");
  if (errors.length) {
    const err = new CliError("Spec has errors; fix them before committing", 1) as CliError & { diagnostics?: Diagnostic[] };
    err.diagnostics = errors;
    throw err;
  }

  git(cwd, ["add", "-A"]);
  if (gitRaw(cwd, ["diff", "--cached", "--quiet"]).ok) {
    return { committed: false, push: { status: "skipped", detail: "" }, diagnostics: s.diagnostics };
  }

  const remote = p.config.git.remote;
  const prefix = p.config.git.tagPrefix;
  const highest = Math.max(0, ...localTagVersions(cwd, prefix), ...remoteTagVersions(cwd, prefix, remote));
  const version = Math.max(s.tree.version, highest) + 1;
  setRootVersion(cwd, version);
  git(cwd, ["add", ROOTSPEC]);

  const body = message.replace(/\s+$/, "");
  git(cwd, ["commit", "-q", "-F", "-"], `${body}\n\n${TRAILER}: ${version}\n`);
  const tag = tagName(prefix, version);
  git(cwd, ["tag", "-a", tag, "-m", `ssdd v${version}`]);
  const hash = shortHash(cwd);

  let push: CommitResult["push"];
  if (opts.push === false || !p.config.git.push) push = { status: "skipped", detail: "push disabled" };
  else if (upstream(cwd)) {
    const r = gitRaw(cwd, ["push", "--follow-tags"]);
    push = r.ok ? { status: "pushed", detail: upstream(cwd)! } : { status: "failed", detail: r.stderr.trim() };
  } else if (remoteExists(cwd, remote)) {
    const r = gitRaw(cwd, ["push", "--follow-tags", "-u", remote, branch]);
    push = r.ok ? { status: "pushed", detail: `${remote}/${branch}` } : { status: "failed", detail: r.stderr.trim() };
  } else {
    push = { status: "no-remote", detail: `no remote "${remote}"; commit and tag stay local` };
  }
  return { committed: true, version, hash, branch, tag, push, diagnostics: s.diagnostics };
}
