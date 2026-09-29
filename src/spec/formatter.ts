import fs from "node:fs";
import path from "node:path";
import { labelFor, pathDepth } from "./labels.ts";
import { ROOTSPEC, fsSource, loadTree } from "./tree.ts";
import type { Diagnostic, ParsedFile, RawNode, SpecTree } from "./types.ts";

/**
 * Render a parsed file in canonical form: `-` bullets, 2-space indentation, positional labels,
 * checkboxes stripped, the mount comment on line 1 of feature files. Bodies are kept verbatim.
 */
export function renderFile(pf: ParsedFile, opts: { feature: boolean; mountPath?: string | null }): string {
  const out: string[] = [];
  if (pf.frontMatter) out.push("---", ...pf.frontMatter, "---");
  if (opts.feature && opts.mountPath) out.push(`<!-- ssdd: mounted at [${opts.mountPath}] -->`, "");
  if (pf.preamble.length) out.push(...pf.preamble, "");

  const labelled = !opts.feature || !!opts.mountPath;
  const baseLevel = opts.feature && opts.mountPath ? pathDepth(opts.mountPath) + 1 : 1;
  const emit = (nodes: RawNode[], parentPath: string, level: number, indent: number) => {
    nodes.forEach((n, i) => {
      const p = parentPath ? `${parentPath}.${labelFor(level, i)}` : labelFor(level, i);
      const pad = "  ".repeat(indent);
      const parts = [labelled ? `[${p}]` : "", n.title, n.ref ? `ref:${n.ref}` : ""].filter(Boolean);
      out.push(`${pad}- ${parts.join(" ")}`.trimEnd());
      const bodyPad = "  ".repeat(indent + 1);
      for (const b of n.body) out.push(b === "" ? "" : bodyPad + b);
      emit(n.children, p, level + 1, indent + 1);
    });
  };
  emit(pf.nodes, opts.feature ? (opts.mountPath ?? "") : "", baseLevel, 0);
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

export interface FormatResult {
  changed: string[];
  skipped: Diagnostic[];
  tree: SpecTree;
}

/** Format every spec file reachable from rootspec.md. With `check`, nothing is written. */
export function formatAll(repoRoot: string, opts: { check?: boolean } = {}): FormatResult {
  const tree = loadTree(fsSource(repoRoot));
  const changed: string[] = [];
  const skipped: Diagnostic[] = [];
  for (const [file, pf] of tree.files) {
    if (pf.fatal) {
      skipped.push(...pf.diagnostics.filter((d) => d.level === "error"));
      continue;
    }
    const feature = file !== ROOTSPEC;
    const slug = feature ? file.split("/")[2] : null;
    const rendered = renderFile(pf, { feature, mountPath: slug ? tree.mounts.get(slug) : null });
    const abs = path.join(repoRoot, file);
    const current = fs.readFileSync(abs, "utf8");
    if (current !== rendered) {
      changed.push(file);
      if (!opts.check) fs.writeFileSync(abs, rendered);
    }
  }
  return { changed, skipped, tree: changed.length && !opts.check ? loadTree(fsSource(repoRoot)) : tree };
}
