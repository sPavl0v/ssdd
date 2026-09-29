import fs from "node:fs";
import path from "node:path";
import { CliError } from "../config.ts";
import { formatAll, renderFile } from "./formatter.ts";
import { ROOTSPEC, featureFile, findNode, fsSource, loadTree, PathError } from "./tree.ts";
import type { ParsedFile, RawNode } from "./types.ts";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function findRaw(nodes: RawNode[], line: number): RawNode | undefined {
  for (const n of nodes) {
    if (n.line === line) return n;
    const hit = findRaw(n.children, line);
    if (hit) return hit;
  }
  return undefined;
}

function write(root: string, pf: ParsedFile): void {
  const feature = pf.file !== ROOTSPEC;
  fs.mkdirSync(path.dirname(path.join(root, pf.file)), { recursive: true });
  fs.writeFileSync(path.join(root, pf.file), renderFile(pf, { feature, mountPath: null }));
}

function loadSound(root: string) {
  const tree = loadTree(fsSource(root));
  const errors = tree.diagnostics.filter((d) => d.level === "error");
  if (errors.length) throw new CliError(`Spec has errors; fix them first:\n${errors.map((e) => `  ${e.file}:${e.line ?? ""} ${e.message}`).join("\n")}`, 1);
  return tree;
}

/** Move a subtree into ssdd/specs/<feature>/spec.md and leave a ref: node (3.3). */
export function split(root: string, nodePath: string, feature: string): string {
  if (!SLUG.test(feature)) throw new CliError(`Feature name "${feature}" must be a kebab-case slug`, 2);
  const ff = featureFile(feature);
  if (fs.existsSync(path.join(root, ff))) throw new CliError(`${ff} already exists`, 2);
  const tree = loadSound(root);
  let node;
  try {
    node = findNode(tree, nodePath, tree.version + 1);
  } catch (e) {
    if (e instanceof PathError) throw new CliError(e.message, 2);
    throw e;
  }
  if (node.ref) throw new CliError(`[${node.path}] is already a ref to ${node.ref}`, 2);
  if (!node.children.length) throw new CliError(`[${node.path}] has no children to split out`, 2);
  const pf = tree.files.get(node.file)!;
  const raw = findRaw(pf.nodes, node.line)!;
  const featurePf: ParsedFile = { file: ff, frontMatter: null, preamble: [], nodes: raw.children, diagnostics: [], fatal: false };
  raw.children = [];
  raw.ref = feature;
  write(root, featurePf);
  write(root, pf);
  formatAll(root);
  return ff;
}

/** Inline a feature file back into its parent and delete it. */
export function join(root: string, feature: string): { file: string; preambleMoved: boolean } {
  const tree = loadSound(root);
  const mount = tree.mounts.get(feature);
  if (!mount) throw new CliError(`Feature ${feature} is not mounted by any ref: node`, 2);
  const refNode = findNode(tree, mount, tree.version + 1);
  const pf = tree.files.get(refNode.file)!;
  const raw = findRaw(pf.nodes, refNode.line)!;
  const ff = featureFile(feature);
  const featurePf = tree.files.get(ff)!;
  let preambleMoved = false;
  if (featurePf.preamble.length) {
    // Keep the feature's preamble as a comment so the join changes no node text.
    raw.body = [...raw.body, `<!-- from ${ff}:`, ...featurePf.preamble.map((l) => l.replace(/-->/g, "-- >")), "-->"];
    preambleMoved = true;
  }
  raw.ref = undefined;
  raw.children = featurePf.nodes;
  write(root, pf);
  fs.rmSync(path.join(root, ff));
  const dir = path.dirname(path.join(root, ff));
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  formatAll(root);
  return { file: ff, preambleMoved };
}
