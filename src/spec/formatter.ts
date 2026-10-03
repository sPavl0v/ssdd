import fs from "node:fs";
import path from "node:path";
import { labelFor, pathDepth } from "./labels.ts";
import { ROOTSPEC, fsSource, loadTree } from "./tree.ts";
import type { Diagnostic, ParsedFile, RawNode, SpecTree } from "./types.ts";

/**
 * Render a parsed file in canonical form: `-` bullets, 2-space indentation, positional labels,
 * checkboxes stripped, the mount comment on line 1 of feature files. Bodies are kept verbatim.
 * `mountPath` is where a feature file is mounted, or null for rootspec.md.
 */
export function renderFile(pf: ParsedFile, mountPath: string | null): string {
  const out: string[] = [];
  if (pf.frontMatter) out.push("---", ...pf.frontMatter, "---");
  if (mountPath) out.push(`<!-- ssdd: mounted at [${mountPath}] -->`, "");
  if (pf.preamble.length) out.push(...pf.preamble, "");

  const baseLevel = mountPath ? pathDepth(mountPath) + 1 : 1;
  const emit = (nodes: RawNode[], parentPath: string, level: number, indent: number) => {
    nodes.forEach((n, i) => {
      const p = parentPath ? `${parentPath}.${labelFor(level, i)}` : labelFor(level, i);
      const pad = "  ".repeat(indent);
      const parts = [`[${p}]`, n.title, n.ref ? `ref:${n.ref}` : ""].filter(Boolean);
      out.push(`${pad}- ${parts.join(" ")}`.trimEnd());
      const bodyPad = "  ".repeat(indent + 1);
      for (const b of n.body) out.push(b === "" ? "" : bodyPad + b);
      emit(n.children, p, level + 1, indent + 1);
    });
  };
  emit(pf.nodes, mountPath ?? "", baseLevel, 0);
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

interface FormatResult {
  skipped: Diagnostic[];
  tree: SpecTree;
}

/** Format every spec file reachable from rootspec.md and return the (re-read) tree. */
export function formatAll(repoRoot: string): FormatResult {
  const tree = loadTree(fsSource(repoRoot));
  let changed = false;
  const skipped: Diagnostic[] = [];
  for (const [file, pf] of tree.files) {
    if (pf.fatal) {
      skipped.push(...pf.diagnostics.filter((d) => d.level === "error"));
      continue;
    }
    // Feature files only get into tree.files once mounted, so the mount path is always known.
    const mountPath = file === ROOTSPEC ? null : tree.mounts.get(file.split("/")[2])!;
    const rendered = renderFile(pf, mountPath);
    const abs = path.join(repoRoot, file);
    if (fs.readFileSync(abs, "utf8") !== rendered) {
      fs.writeFileSync(abs, rendered);
      changed = true;
    }
  }
  return { skipped, tree: changed ? loadTree(fsSource(repoRoot)) : tree };
}
