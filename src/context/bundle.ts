import fs from "node:fs";
import path from "node:path";
import { CliError } from "../config.ts";
import type { Project } from "../project.ts";
import { agentBody, stripComments } from "../spec/hash.ts";
import { SSDD_DIR, emptySource, featureFile, findNode, isLeaf, leaves, loadTree, PathError } from "../spec/tree.ts";
import type { Diagnostic, SpecNode, SpecTree } from "../spec/types.ts";
import { formatTag, nodeFingerprint, tagState, type TestTag } from "../tests/tags.ts";
import { indexTree } from "../spec/tree.ts";
import { findBaseline } from "../version/baseline.ts";
import { type Change, type ChangeSet, changePath, computeChanges, filterChanges, isEmpty, nodeText, testScopes } from "../version/changes.ts";
import { gitSource, readAt } from "../version/git.ts";
import { sync } from "../version/sync.ts";

export type Mode = "implement" | "test";

export class SpecErrors extends CliError {
  constructor(public diagnostics: Diagnostic[]) {
    super("Spec has errors; fix them first (ssdd check lists them)", 1);
  }
}

const CONTEXT_FILES = ["constitution.md", "techstack.md"];

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

function leafLines(tree: SpecTree, scopeNodes: SpecNode[], tags: TestTag[], pending: number, withTests: boolean): string[] {
  const index = indexTree(tree);
  const out: string[] = [];
  for (const l of leaves(scopeNodes)) {
    const tag = formatTag(l.path, pending, nodeFingerprint(l));
    if (!withTests) {
      out.push(`- [${l.path}] ${title(l)} — tag \`${tag}\``);
      continue;
    }
    const mine = tags.filter((t) => t.path === l.path);
    const state = mine.length ? mine.map((t) => `${t.file}:${t.line} ${tagState(t, index)}`).join("; ") : "missing";
    out.push(`- [${l.path}] ${title(l)} — tag \`${tag}\` — tests: ${state}`);
  }
  return out;
}

export interface ContextOptions {
  path?: string;
  mode: Mode;
  noTest?: boolean;
}

export function buildContext(p: Project, opts: ContextOptions): { text: string; empty: boolean } {
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

  const baseline = findBaseline(p.root, p.config.git.tagPrefix);
  const out: string[] = [];
  out.push(`# ssdd context · ${opts.mode}`, "");
  out.push(`- Spec version: v${tree.version}`);
  out.push(`- Pending version: v${pending} (use it in new test tags)`);
  out.push(`- Baseline: ${baseline ? `${baseline.rev} (${baseline.commit.slice(0, 7)})` : "none (every node counts as added)"}`);
  out.push(`- Target: ${target ? `[${target.path}] ${title(target)}` : "whole tree"}`);
  out.push(`- Command: ${opts.mode}`, "");

  for (const f of CONTEXT_FILES) {
    const heading = f === "constitution.md" ? "Constitution" : "Tech stack";
    let text = "(missing)";
    try {
      text = fs.readFileSync(path.join(p.root, SSDD_DIR, f), "utf8").trim();
    } catch {}
    out.push(`## ${heading}`, "", demoteHeadings(text), "");
  }
  out.push("## Preamble", "", demoteHeadings(stripComments(tree.preamble.join("\n")).trim()) || "(none)", "");

  const warnings = [...tree.diagnostics, ...s.diagnostics].filter((d) => d.level === "warning");
  if (warnings.length) {
    out.push("## Warnings", "", ...warnings.map((w) => `- ${w.file ?? ""}${w.line ? `:${w.line}` : ""} ${w.message}`), "");
  }

  let changes: ChangeSet | null = null;
  let contextChanged: string[] = [];
  let targets: SpecNode[];
  if (opts.mode === "implement") {
    const base = baseline ? loadTree(gitSource(p.root, baseline.rev)) : loadTree(emptySource());
    changes = computeChanges(base, tree);
    if (target) changes = filterChanges(changes, target.path);
    if (baseline) {
      contextChanged = CONTEXT_FILES.filter((f) => {
        const rel = `${SSDD_DIR}/${f}`;
        let now: string | null = null;
        try {
          now = fs.readFileSync(path.join(p.root, rel), "utf8");
        } catch {}
        return (readAt(p.root, baseline.rev, rel) ?? null) !== now;
      });
    }
    targets = target ? [target] : changes.groups.map((g) => g.root.newNode).filter((n): n is SpecNode => !!n);
  } else {
    targets = target ? [target] : tree.roots;
  }

  const empty = opts.mode === "implement" && !target && !!changes && isEmpty(changes) && contextChanged.length === 0;
  if (empty) {
    out.push("## Changes", "", `No spec changes since v${baseline?.version ?? tree.version}.`, "");
    return { text: out.join("\n"), empty: true };
  }

  const wholeTree = opts.mode === "test" && !target;
  out.push("## Target", "");
  if (!targets.length) out.push("(only removals: see Changes)", "");
  for (const t of targets) {
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
    if (!changes.groups.length && !changes.preamble) out.push(`No spec changes inside the target since v${baseline?.version ?? tree.version}; audit the target against the code.`, "");
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
    const runTests = p.config.implement.runTests && !opts.noTest;
    if (runTests) {
      const scopes = target ? [target.path] : testScopes(changes);
      out.push("## Test scopes", "");
      if (!scopes.length) out.push("(none)", "");
      const idx = indexTree(tree);
      for (const sc of scopes) {
        const n = idx.get(sc)!;
        out.push(`### [${sc}] ${title(n)}`, "", ...leafLines(tree, [n], s.tags, pending, true), "");
      }
    }
  } else {
    out.push("## Tests", "");
    const scopeNodes = target ? [target] : tree.roots;
    const lines = leafLines(tree, scopeNodes, s.tags, pending, true);
    out.push(...(lines.length ? lines : ["(no leaves)"]), "");
    const orphaned = s.tags.filter((t) => t.path === "removed");
    if (orphaned.length) {
      out.push("Orphaned tests (delete them):", "", ...orphaned.map((t) => `- ${t.file}:${t.line} ${t.raw}`), "");
    }
    if (target && !isLeaf(target) && target.children.length === 0) out.push("(target has no leaves)", "");
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), empty: false };
}
