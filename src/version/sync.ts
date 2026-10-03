import { formatAll } from "../spec/formatter.ts";
import type { Diagnostic, SpecTree } from "../spec/types.ts";
import type { Project } from "../project.ts";

export interface SyncResult {
  diagnostics: Diagnostic[];
  tree: SpecTree;
}

/** Format spec files (4.2). Never changes the version; idempotent. */
export function sync(p: Project): SyncResult {
  const fmt = formatAll(p.root);
  return { diagnostics: [...fmt.skipped], tree: fmt.tree };
}
