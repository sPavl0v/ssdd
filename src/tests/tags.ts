import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { Config, Runner } from "../config.ts";
import { fingerprint } from "../spec/hash.ts";
import { SSDD_DIR, indexTree, isLeaf, leaves } from "../spec/tree.ts";
import type { Diagnostic, SpecNode, SpecTree } from "../spec/types.ts";
import { gitSource } from "../version/git.ts";
import { loadTree } from "../spec/tree.ts";
import { type Mapping, mapTrees } from "../version/mapping.ts";
import { tagExists } from "../version/baseline.ts";
import { walk } from "../spec/tree.ts";

// Test tags (6.1): [ssdd:<path>@v<version>#<fp>]

export const TAG_RE = /\[ssdd:(removed|\d+(?:\.(?:[a-z]+|\d+))*)@v(\d+)#([0-9a-f]{6})\]/g;

export interface TestTag {
  file: string;
  line: number;
  raw: string;
  path: string;
  version: number;
  fp: string;
  runner: string;
  tagStyle: "name" | "comment";
  /** Comment style: the test identifier on the line below the tag. */
  testId?: string;
}

export function formatTag(p: string, version: number, fp: string): string {
  return `[ssdd:${p}@v${version}#${fp}]`;
}

export function nodeFingerprint(n: SpecNode): string {
  return fingerprint(n.key);
}

const IDENT = /(?:def|func|fn|function|sub|test|it)\s+([A-Za-z_]\w*)/;

export function scanTags(root: string, config: Config): TestTag[] {
  const tags: TestTag[] = [];
  const seen = new Set<string>();
  for (const runner of config.test.runners) {
    const files = fg.sync(runner.globs, { cwd: root, ignore: ["**/node_modules/**", "**/.git/**"], dot: false });
    for (const file of files.sort()) {
      const key = `${runner.name}:${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
      lines.forEach((text, i) => {
        for (const m of text.matchAll(TAG_RE)) {
          const tag: TestTag = {
            file,
            line: i + 1,
            raw: m[0],
            path: m[1],
            version: Number(m[2]),
            fp: m[3],
            runner: runner.name,
            tagStyle: runner.tagStyle,
          };
          if (runner.tagStyle === "comment") {
            const next = lines.slice(i + 1).find((l) => l.trim() !== "" && !l.trim().startsWith("@"));
            tag.testId = next ? IDENT.exec(next)?.[1] : undefined;
          }
          tags.push(tag);
        }
      });
    }
  }
  writeCache(root, tags);
  return tags;
}

function writeCache(root: string, tags: TestTag[]): void {
  try {
    const dir = path.join(root, SSDD_DIR, ".state");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "tests.json"), JSON.stringify({ scannedAt: new Date().toISOString(), tags }, null, 2) + "\n");
  } catch {
    // The cache is optional.
  }
}

export type TagState = "current" | "stale" | "orphaned" | "invalid";

export function tagState(tag: TestTag, index: Map<string, SpecNode>): TagState {
  if (tag.path === "removed") return "orphaned";
  const node = index.get(tag.path);
  if (!node) return "invalid";
  return nodeFingerprint(node) === tag.fp ? "current" : "stale";
}

export interface Rewrite {
  file: string;
  line: number;
  from: string;
  to: string;
}

export interface RelinkResult {
  rewrites: Rewrite[];
  diagnostics: Diagnostic[];
}

/**
 * Relink tags whose path may have shifted since the version they name (6.2). The spec tree at
 * `<tagPrefix><version>` is mapped straight to the working tree. Tags whose path did not change
 * are left untouched so a commit does not rewrite every test file.
 */
export function relinkTags(root: string, config: Config, tree: SpecTree, tags: TestTag[]): RelinkResult {
  const pending = tree.version + 1;
  const index = indexTree(tree);
  const byFp = new Map<string, SpecNode[]>();
  for (const l of leaves(tree.roots)) {
    const fp = nodeFingerprint(l);
    (byFp.get(fp) ?? byFp.set(fp, []).get(fp)!).push(l);
  }
  const mappings = new Map<number, { mapping: Mapping; oldIndex: Map<string, SpecNode> } | null>();
  const mappingFor = (v: number) => {
    if (!mappings.has(v)) {
      const tag = `${config.git.tagPrefix}${v}`;
      if (!tagExists(root, tag)) mappings.set(v, null);
      else {
        const old = loadTree(gitSource(root, tag));
        const oldIndex = new Map<string, SpecNode>();
        for (const n of walk(old.roots)) oldIndex.set(n.path, n);
        mappings.set(v, { mapping: mapTrees(old.roots, tree.roots), oldIndex });
      }
    }
    return mappings.get(v)!;
  };
  const byFingerprint = (tag: TestTag): string | null => {
    const c = byFp.get(tag.fp);
    return c && c.length === 1 ? c[0].path : null;
  };

  const rewrites: Rewrite[] = [];
  const diagnostics: Diagnostic[] = [];
  const set = (tag: TestTag, p: string) => {
    const to = formatTag(p, pending, tag.fp);
    if (to !== tag.raw) rewrites.push({ file: tag.file, line: tag.line, from: tag.raw, to });
  };

  for (const tag of tags) {
    if (tag.path === "removed") continue;
    if (tag.version > pending) {
      diagnostics.push({
        level: "warning",
        code: "tag-future",
        message: `Tag ${tag.raw} names v${tag.version}, newer than the pending v${pending} (merge in progress?)`,
        file: tag.file,
        line: tag.line,
      });
      continue;
    }
    if (tag.version < pending) {
      const m = mappingFor(tag.version);
      const oldNode = m?.oldIndex.get(tag.path);
      if (!m || !oldNode) {
        set(tag, byFingerprint(tag) ?? "removed");
        continue;
      }
      const mapped = m.mapping.oldToNew.get(oldNode);
      if (!mapped) set(tag, "removed");
      else if (mapped.node.path !== tag.path) set(tag, mapped.node.path);
      continue;
    }
    // Written against the pending version: only the fingerprint can find a shifted leaf.
    const node = index.get(tag.path);
    if (node && isLeaf(node) && nodeFingerprint(node) === tag.fp) continue;
    const p = byFingerprint(tag);
    if (p && p !== tag.path) set(tag, p);
  }
  return { rewrites, diagnostics };
}

export function applyRewrites(root: string, rewrites: Rewrite[]): void {
  const byFile = new Map<string, Rewrite[]>();
  for (const r of rewrites) (byFile.get(r.file) ?? byFile.set(r.file, []).get(r.file)!).push(r);
  for (const [file, rs] of byFile) {
    const abs = path.join(root, file);
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    for (const r of rs) lines[r.line - 1] = lines[r.line - 1].replace(r.from, r.to);
    fs.writeFileSync(abs, lines.join("\n"));
  }
}

export function lintTags(tags: TestTag[], tree: SpecTree): Diagnostic[] {
  const index = indexTree(tree);
  const out: Diagnostic[] = [];
  for (const t of tags) {
    if (t.path === "removed") continue;
    const n = index.get(t.path);
    if (!n) {
      out.push({ level: "error", code: "tag-path", message: `Tag ${t.raw} names a path that does not exist; run ssdd sync or delete the test`, file: t.file, line: t.line });
    } else if (!isLeaf(n)) {
      out.push({ level: "warning", code: "tag-not-leaf", message: `Tag ${t.raw} names ${t.path}, which is not a leaf`, file: t.file, line: t.line });
    }
    if (t.tagStyle === "comment" && !t.testId) {
      out.push({ level: "warning", code: "tag-no-test", message: `Comment tag ${t.raw} is not followed by a test definition`, file: t.file, line: t.line });
    }
  }
  return out;
}

export function runnerByName(config: Config, name: string): Runner | undefined {
  return config.test.runners.find((r) => r.name === name);
}
