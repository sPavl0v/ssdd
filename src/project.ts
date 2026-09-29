import fs from "node:fs";
import path from "node:path";
import { CliError, type Config, loadConfig } from "./config.ts";
import { ROOTSPEC, SSDD_DIR, fsSource, loadTree } from "./spec/tree.ts";
import type { SpecTree } from "./spec/types.ts";
import { type Baseline, findBaseline } from "./version/baseline.ts";
import { gitSource, repoRoot } from "./version/git.ts";

export interface Project {
  root: string;
  config: Config;
}

/** Locate the repo that holds ssdd/ (searching upward from cwd) and load its config. */
export function openProject(cwd: string, opts: { allowConfigErrors?: boolean } = {}): Project {
  let dir = path.resolve(cwd);
  let found: string | null = null;
  for (;;) {
    if (fs.existsSync(path.join(dir, ROOTSPEC))) {
      found = dir;
      break;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const gitRoot = repoRoot(found ?? cwd);
  if (!gitRoot) throw new CliError("Not a git repository; run ssdd init to set one up", 2);
  if (!found) throw new CliError(`No ${SSDD_DIR}/ folder found; run ssdd init`, 2);
  const { config, errors } = loadConfig(found);
  if (errors.length && !opts.allowConfigErrors) throw new CliError(errors.join("\n"), 2);
  return { root: found, config };
}

export function workingTree(p: Project): SpecTree {
  return loadTree(fsSource(p.root));
}

export function treeAtVersion(p: Project, version: number): SpecTree {
  const tag = `${p.config.git.tagPrefix}${version}`;
  const t = loadTree(gitSource(p.root, tag));
  if (t.diagnostics.some((d) => d.code === "no-rootspec")) throw new CliError(`No spec found at tag ${tag}`, 2);
  return t;
}

export function baselineOf(p: Project): Baseline | null {
  return findBaseline(p.root, p.config.git.tagPrefix);
}
