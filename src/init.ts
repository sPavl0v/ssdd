import fs from "node:fs";
import path from "node:path";
import { installAgent } from "./agents/adapters.ts";
import { CONFIG_FILE } from "./config.ts";
import { template, VERSION } from "./assets.ts";
import { SSDD_DIR } from "./spec/tree.ts";

export const FIRST_COMMIT_MESSAGE = "chore(ssdd): initialize ssdd spec";

export interface InitResult {
  written: string[];
  kept: string[];
  agents: string[];
}

export function init(root: string, opts: { agents: string[] }): InitResult {
  const written: string[] = [];
  const kept: string[] = [];
  const put = (rel: string, content: string) => {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) return kept.push(rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    written.push(rel);
  };

  put(`${SSDD_DIR}/rootspec.md`, template("spec/rootspec"));
  put(`${SSDD_DIR}/constitution.md`, template("spec/constitution"));
  put(`${SSDD_DIR}/techstack.md`, template("spec/techstack"));
  put(`${SSDD_DIR}/memory.md`, template("spec/memory"));

  put(CONFIG_FILE, JSON.stringify({ ssddVersion: `>=${VERSION}`, git: { remote: "origin", push: true } }, null, 2) + "\n");

  const agents = opts.agents.flatMap((a) => installAgent(root, a));
  return { written, kept, agents };
}
