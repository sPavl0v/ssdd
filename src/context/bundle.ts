import fs from "node:fs";
import path from "node:path";
import { CliError, SpecErrors } from "../config.ts";
import type { Project } from "../project.ts";
import { agentBody, stripComments } from "../spec/hash.ts";
import { SSDD_DIR, emptySource, featureFile, findNode, loadTree, PathError } from "../spec/tree.ts";
import type { SpecNode, SpecTree } from "../spec/types.ts";
import { findBaselines } from "../version/baseline.ts";
import { type Change, type ChangeSet, changePath, computeChanges, filterChanges, intersectChanges, isEmpty, nodeText } from "../version/changes.ts";
import { gitSource, readAt } from "../version/git.ts";
import { sync } from "../version/sync.ts";

export type Mode = "implement" | "test" | "specify";

const CONTEXT_FILES = ["constitution.md", "techstack.md"];
const MEMORY_FILE = "memory.md";

/** Memory without comments and headings; empty when only the template skeleton is left. */
function memoryText(root: string): string {
  let text = "";
  try {
    text = fs.readFileSync(path.join(root, SSDD_DIR, MEMORY_FILE), "utf8");
  } catch {}
  const facts = stripComments(text)
    .split("\n")
    .filter((l) => l.trim() && !/^#{1,6}\s/.test(l.trim()));
  return facts.length ? demoteHeadings(stripComments(text).trim()) : "";
}

function title(n: SpecNode): string {
  return stripComments(n.title).trim();
}

function renderSubtree(n: SpecNode, indent = 0, out: string[] = []): string[] {
  const pad = "  ".repeat(indent);
  const ref = n.ref ? `  (ref:${n.ref} → ${featureFile(n.ref)})` : "";
  out.push(`${pad}- [${n.path}] ${title(n)}${ref}`);
  for (const b of agentBody(n.body)) out.push(b ? `${pad}  ${b}` : "");
  for (const c of n.children) renderSubtree(c, indent + 1, out);
  return out;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function topLevel(n: SpecNode): SpecNode {
  let r = n;
  while (r.parent) r = r.parent;
  return r;
}

export function commitScope(n: SpecNode): string {
  const top = topLevel(n);
  return top.ref ?? slug(title(top));
}

/** Push embedded Markdown headings below the bundle's own sections, leaving code fences alone. */
export function demoteHeadings(text: string, by = 2): string {
  let fence: string | null = null;
  return text
    .split("\n")
    .map((l) => {
      const f = /^\s*(`{3,}|~{3,})/.exec(l);
      if (f) {
        if (!fence) fence = f[1][0];
        else if (f[1][0] === fence) fence = null;
        return l;
      }
      if (fence) return l;
      return /^#{1,6}\s/.test(l) ? "#".repeat(by) + l : l;
    })
    .join("\n");
}

function quote(text: string): string[] {
  return text.split("\n").map((l) => `> ${l}`.trimEnd());
}

function describeChange(c: Change): string[] {
  const out: string[] = [];
  const o = c.oldNode;
  const n = c.newNode;
  if (c.kind === "added") {
    out.push(`- **added** [${n!.path}]`, ...quote(nodeText(n!)).map((l) => `  ${l}`));
  } else if (c.kind === "removed") {
    out.push(`- **removed** [${o!.path}] (path in the baseline)`, ...quote(nodeText(o!)).map((l) => `  ${l}`));
  } else {
    const was = o!.path === n!.path ? "" : ` (was [${o!.path}])`;
    out.push(`- **${c.kind}** [${n!.path}]${was}`);
    if (c.kind === "modified") {
      out.push("  Old:", ...quote(nodeText(o!)).map((l) => `  ${l}`), "  New:", ...quote(nodeText(n!)).map((l) => `  ${l}`));
    } else {
      out.push(...quote(nodeText(n!)).map((l) => `  ${l}`));
    }
  }
  return out;
}

/** Top-level features whose tests must run for these changes, in tree order. */
function featuresOf(tree: SpecTree, changes: ChangeSet, target: SpecNode | null): SpecNode[] {
  const features = new Set<SpecNode>();
  if (target) features.add(topLevel(target));
  for (const g of changes.groups) {
    // A removed change root sits under an unchanged parent (or is itself top level).
    const parent = g.root.oldNode?.parent;
    const n = g.root.newNode ?? (parent ? changes.mapping.oldToNew.get(parent)?.node : undefined);
    if (n) features.add(topLevel(n));
  }
  return tree.roots.filter((r) => features.has(r));
}

export interface ContextOptions {
  path?: string;
  mode: Mode;
}

export function buildContext(p: Project, opts: ContextOptions): string {
  const s = sync(p);
  const tree = s.tree;
  const errors = tree.diagnostics.filter((d) => d.level === "error");
  if (errors.length) throw new SpecErrors(errors);
  const pending = tree.version + 1;
  let target: SpecNode | null = null;
  if (opts.path) {
    try {
      target = findNode(tree, opts.path, pending);
    } catch (e) {
      if (e instanceof PathError) throw new CliError(e.message, 2);
      throw e;
    }
  }

  const baselines = findBaselines(p.root);
  const since = baselines.length ? Math.max(...baselines.map((b) => b.version)) : tree.version;
  const out: string[] = [];
  out.push(`# ssdd context · ${opts.mode}`, "");
  out.push(`- Spec version: v${tree.version}`);
  out.push(`- Pending version: v${pending}`);
  const baselineText = baselines.map((b) => `v${b.version} (${b.commit.slice(0, 7)})`).join(" + ");
  out.push(`- Baseline: ${baselineText || "none (every node counts as added)"}`);
  out.push(`- Target: ${target ? `[${target.path}] ${title(target)}` : "whole tree"}`, "");

  for (const f of CONTEXT_FILES) {
    const heading = f === "constitution.md" ? "Constitution" : "Tech stack";
    let text = "(missing)";
    try {
      text = fs.readFileSync(path.join(p.root, SSDD_DIR, f), "utf8").trim();
    } catch {}
    out.push(`## ${heading}`, "", demoteHeadings(text), "");
  }
  out.push("## Memory", "", `File: ${SSDD_DIR}/${MEMORY_FILE}`, "", memoryText(p.root) || "(empty)", "");
  out.push("## Preamble", "", demoteHeadings(stripComments(tree.preamble.join("\n")).trim()) || "(none)", "");

  const warnings = [...tree.diagnostics, ...s.diagnostics].filter((d) => d.level === "warning");
  if (warnings.length) {
    out.push("## Warnings", "", ...warnings.map((w) => `- ${w.file ?? ""}${w.line ? `:${w.line}` : ""} ${w.message}`), "");
  }

  let changes: ChangeSet | null = null;
  let contextChanged: string[] = [];
  let targets: SpecNode[];
  if (opts.mode !== "specify") {
    const sources = baselines.length ? baselines.map((b) => gitSource(p.root, b.commit)) : [emptySource()];
    const [first, ...rest] = sources.map((src) => computeChanges(loadTree(src), tree));
    changes = intersectChanges(first, rest);
    if (target) changes = filterChanges(changes, target.path);
    if (opts.mode === "implement" && baselines.length) {
      contextChanged = CONTEXT_FILES.filter((f) => {
        const rel = `${SSDD_DIR}/${f}`;
        let now: string | null = null;
        try {
          now = fs.readFileSync(path.join(p.root, rel), "utf8");
        } catch {}
        return baselines.every((b) => readAt(p.root, b.commit, rel) !== now);
      });
    }
    if (opts.mode === "test") targets = featuresOf(tree, changes, target);
    else targets = target ? [target] : changes.groups.map((g) => g.root.newNode).filter((n): n is SpecNode => !!n);
  } else {
    targets = target ? [target] : tree.roots;
  }

  if (changes && !target && isEmpty(changes) && contextChanged.length === 0) {
    const next = opts.mode === "test" ? " Run the whole test suite." : "";
    out.push("## Changes", "", `No spec changes since v${since}.${next}`, "");
    return out.join("\n");
  }

  const wholeTree = opts.mode === "specify" && !target;
  if (opts.mode === "test") {
    out.push("## Features to test", "", "Run every unit and integration test of each feature below.", "");
    if (!targets.length) out.push("(none: only whole features were removed, see Changes)", "");
  } else {
    out.push("## Target", "");
    if (!targets.length) out.push("(only removals: see Changes)", "");
  }
  for (const t of targets) {
    if (opts.mode === "test") {
      out.push(`### [${t.path}] ${title(t)}`, "", ...renderSubtree(t), "");
      continue;
    }
    if (!wholeTree) {
      out.push(`### [${t.path}] ${title(t)}`, "");
      const anc: SpecNode[] = [];
      for (let a = t.parent; a; a = a.parent) anc.unshift(a);
      out.push("Breadcrumb (context, not scope):", "");
      if (!anc.length) out.push("- (top level)");
      for (const a of anc) {
        const body = agentBody(a.body);
        out.push(`- [${a.path}] ${title(a)}${body.length ? ` — ${body.join(" ")}` : ""}`);
      }
      out.push("", "Subtree:", "");
    }
    out.push(...renderSubtree(t), "");
    if (!wholeTree) {
      const sibs = (t.parent ? t.parent.children : tree.roots).filter((x) => x !== t);
      out.push("Boundaries (out of scope):", "");
      out.push(...(sibs.length ? sibs.map((x) => `- [${x.path}] ${title(x)}`) : ["- (none)"]), "");
    }
  }

  if (changes) {
    out.push("## Changes", "");
    if (!changes.groups.length && !changes.preamble) {
      const next = opts.mode === "test" ? "run the tests of its feature" : "audit the target against the code";
      out.push(`No spec changes inside the target since v${since}; ${next}.`, "");
    }
    for (const g of changes.groups) {
      const r = g.root;
      const scope = r.newNode ? commitScope(r.newNode) : r.oldNode ? commitScope(r.oldNode) : "";
      out.push(`### Change root [${changePath(r)}] — ${r.kind} (commit scope: ${scope})`, "");
      for (const c of g.changes) out.push(...describeChange(c));
      out.push("");
    }
    if (changes.preamble) {
      out.push("### Preamble changed", "", "Old:", ...quote(changes.preamble.old.join("\n")), "", "New:", ...quote(changes.preamble.new.join("\n")), "");
    }
    if (contextChanged.length) {
      out.push(
        `Note: ${contextChanged.map((f) => `${SSDD_DIR}/${f}`).join(" and ")} changed since the baseline. No codebase-wide refactor; list affected areas under Suggested follow-ups.`,
        "",
      );
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
