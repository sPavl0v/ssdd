import type { Project } from "../project.ts";
import { emptySource, loadTree } from "../spec/tree.ts";
import { localTagVersions } from "./baseline.ts";
import { countKinds, computeChanges } from "./changes.ts";
import { git, gitSource } from "./git.ts";
import type { ChangeKind } from "./mapping.ts";

export interface HistoryEntry {
  version: number;
  tag: string;
  date: string;
  commit: string;
  subject: string;
  counts: Record<ChangeKind, number>;
}

/** ssdd tags newest first, with change counts against the previous tagged version (4.5). */
export function history(p: Project): HistoryEntry[] {
  const prefix = p.config.git.tagPrefix;
  const versions = localTagVersions(p.root, prefix).sort((a, b) => a - b);
  const entries: HistoryEntry[] = [];
  let prev = loadTree(emptySource());
  for (const v of versions) {
    const tag = `${prefix}${v}`;
    const info = git(p.root, ["log", "-1", "--format=%h%x00%cs%x00%s", `${tag}^{commit}`]).trim().split("\0");
    const tree = loadTree(gitSource(p.root, tag));
    entries.push({
      version: v,
      tag,
      commit: info[0],
      date: info[1],
      subject: info[2],
      counts: countKinds(computeChanges(prev, tree)),
    });
    prev = tree;
  }
  return entries.reverse();
}
