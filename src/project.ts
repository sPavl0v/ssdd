import fs from "node:fs";
import path from "node:path";
import { CliError, type Config, loadConfig } from "./config.ts";
import { ROOTSPEC, SSDD_DIR } from "./spec/tree.ts";
import { repoRoot } from "./version/git.ts";

export interface Project {
  root: string;
  config: Config;
}

/** Locate the repo that holds ssdd/ (searching upward from cwd) and load its config. */
export function openProject(cwd: string): Project {
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
  if (!gitRoot) throw new CliError("Not a git repository", 2);
  if (!found) throw new CliError(`No ${SSDD_DIR}/ folder found`, 2);
  const { config, errors } = loadConfig(found);
  if (errors.length) throw new CliError(errors.join("\n"), 2);
  return { root: found, config };
}

