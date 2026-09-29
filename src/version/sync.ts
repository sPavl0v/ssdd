import { formatAll } from "../spec/formatter.ts";
import type { Diagnostic, SpecTree } from "../spec/types.ts";
import type { Project } from "../project.ts";
import { type Rewrite, type TestTag, applyRewrites, relinkTags, scanTags } from "../tests/tags.ts";

export interface SyncResult {
  formatted: string[];
  rewrites: Rewrite[];
  diagnostics: Diagnostic[];
  tree: SpecTree;
  tags: TestTag[];
}

/** Format spec files and relink test tags (4.2). Never changes the version; idempotent. */
export function sync(p: Project, opts: { check?: boolean } = {}): SyncResult {
  const fmt = formatAll(p.root, { check: opts.check });
  const tree = fmt.tree;
  const diagnostics: Diagnostic[] = [...fmt.skipped];
  let tags = scanTags(p.root, p.config);
  let rewrites: Rewrite[] = [];
  // Relinking needs a sound tree; with spec errors the paths cannot be trusted.
  if (!tree.diagnostics.some((d) => d.level === "error")) {
    const r = relinkTags(p.root, p.config, tree, tags);
    rewrites = r.rewrites;
    diagnostics.push(...r.diagnostics);
    if (rewrites.length && !opts.check) {
      applyRewrites(p.root, rewrites);
      tags = scanTags(p.root, p.config);
    }
  }
  return { formatted: fmt.changed, rewrites, diagnostics, tree, tags };
}

export function syncNeeded(r: SyncResult): boolean {
  return r.formatted.length > 0 || r.rewrites.length > 0;
}
