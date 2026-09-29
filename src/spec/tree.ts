import fs from "node:fs";
import path from "node:path";
import { nodeKey } from "./hash.ts";
import { labelFor } from "./labels.ts";
import { frontMatterValue, parseSpecFile } from "./parser.ts";
import type { Diagnostic, ParsedFile, RawNode, SpecNode, SpecTree } from "./types.ts";

export const SSDD_DIR = "ssdd";
export const ROOTSPEC = `${SSDD_DIR}/rootspec.md`;
export const MAX_DEPTH = 8;

export function featureFile(feature: string): string {
  return `${SSDD_DIR}/specs/${feature}/spec.md`;
}

/** Where spec files are read from: the working tree or a git revision. Paths are repo-relative. */
export interface SpecSource {
  read(rel: string): string | null;
  /** Feature slugs that have a spec.md under ssdd/specs/. */
  listFeatures(): string[];
}

export function fsSource(repoRoot: string): SpecSource {
  return {
    read(rel) {
      try {
        return fs.readFileSync(path.join(repoRoot, rel), "utf8");
      } catch {
        return null;
      }
    },
    listFeatures() {
      const dir = path.join(repoRoot, SSDD_DIR, "specs");
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "spec.md")))
        .map((d) => d.name)
        .sort();
    },
  };
}

export function emptySource(): SpecSource {
  return { read: () => null, listFeatures: () => [] };
}

export function loadTree(source: SpecSource): SpecTree {
  const diagnostics: Diagnostic[] = [];
  const files = new Map<string, ParsedFile>();
  const mounts = new Map<string, string>();
  const text = source.read(ROOTSPEC);
  if (text === null) {
    diagnostics.push({ level: "error", code: "no-rootspec", message: `${ROOTSPEC} not found; run ssdd init` });
    return { version: 0, format: 1, preamble: [], roots: [], files, mounts, diagnostics };
  }
  const root = parseSpecFile(text, ROOTSPEC);
  files.set(ROOTSPEC, root);
  diagnostics.push(...root.diagnostics);
  const version = Number(frontMatterValue(root.frontMatter, "version") ?? 0);
  const format = Number(frontMatterValue(root.frontMatter, "ssdd") ?? 1);
  if (!Number.isInteger(version) || version < 0) {
    diagnostics.push({ level: "error", code: "bad-version", message: "version in front matter must be a non-negative integer", file: ROOTSPEC });
  }

  const build = (raws: RawNode[], parent: SpecNode | null, level: number, file: string, chain: string[]): SpecNode[] =>
    raws.map((raw, idx) => {
      const label = labelFor(level, idx);
      const p = parent ? `${parent.path}.${label}` : label;
      const node: SpecNode = {
        path: p,
        depth: level,
        title: raw.title,
        body: raw.body,
        children: [],
        parent,
        ref: raw.ref,
        file,
        line: raw.line,
        key: nodeKey(raw.title, raw.body),
      };
      if (level === MAX_DEPTH + 1) {
        diagnostics.push({ level: "warning", code: "too-deep", message: `Depth over ${MAX_DEPTH} levels; consider ssdd split`, file, line: raw.line, path: p });
      }
      if (raw.ref) {
        const f = raw.ref;
        const ff = featureFile(f);
        if (chain.includes(f)) {
          diagnostics.push({ level: "error", code: "ref-cycle", message: `ref cycle: ${[...chain, f].join(" → ")}`, file, line: raw.line, path: p });
        } else if (mounts.has(f)) {
          diagnostics.push({ level: "error", code: "ref-twice", message: `Feature ${f} is mounted twice: at [${mounts.get(f)}] and [${p}]`, file, line: raw.line, path: p });
        } else {
          const ftext = source.read(ff);
          if (ftext === null) {
            diagnostics.push({
              level: "error",
              code: "ref-missing",
              message: `ref:${f} points to missing ${ff}; create it or use ssdd split`,
              file,
              line: raw.line,
              path: p,
            });
          } else {
            mounts.set(f, p);
            const parsed = parseSpecFile(ftext, ff, { feature: true });
            files.set(ff, parsed);
            diagnostics.push(...parsed.diagnostics);
            node.children = build(parsed.nodes, node, level + 1, ff, [...chain, f]);
          }
        }
      } else {
        node.children = build(raw.children, node, level + 1, file, chain);
      }
      return node;
    });

  const roots = build(root.nodes, null, 1, ROOTSPEC, []);
  for (const f of source.listFeatures()) {
    if (!mounts.has(f)) {
      diagnostics.push({ level: "warning", code: "feature-unused", message: `Feature folder specs/${f} is never mounted with ref:${f}`, file: featureFile(f) });
    }
  }
  if (roots.length === 0) diagnostics.push({ level: "warning", code: "empty-spec", message: "spec is empty", file: ROOTSPEC });
  return { version, format, preamble: root.preamble, roots, files, mounts, diagnostics };
}

export function* walk(nodes: SpecNode[]): Generator<SpecNode> {
  for (const n of nodes) {
    yield n;
    yield* walk(n.children);
  }
}

export function indexTree(tree: SpecTree): Map<string, SpecNode> {
  const m = new Map<string, SpecNode>();
  for (const n of walk(tree.roots)) m.set(n.path, n);
  return m;
}

export function isLeaf(n: SpecNode): boolean {
  return n.children.length === 0 && !n.ref;
}

export function leaves(nodes: SpecNode[]): SpecNode[] {
  return [...walk(nodes)].filter(isLeaf);
}

export class PathError extends Error {}

/** Resolve a path in the tree or throw with the nearest valid ancestor and its children (5.1). */
export function findNode(tree: SpecTree, p: string, version: number): SpecNode {
  if (tree.roots.length === 0) throw new PathError("spec is empty");
  const idx = indexTree(tree);
  const hit = idx.get(p);
  if (hit) return hit;
  const range = (kids: SpecNode[]) =>
    kids.length === 1 ? kids[0].path : `${kids[0].path} to ${kids[kids.length - 1].path}`;
  const parts = p.split(".");
  for (let k = parts.length - 1; k >= 1; k--) {
    const anc = idx.get(parts.slice(0, k).join("."));
    if (!anc) continue;
    const hint = anc.children.length ? `${anc.path} has children ${range(anc.children)}.` : `${anc.path} has no children.`;
    throw new PathError(`No node ${p} in v${version}. ${hint}`);
  }
  throw new PathError(`No node ${p} in v${version}. Top-level nodes are ${range(tree.roots)}.`);
}
