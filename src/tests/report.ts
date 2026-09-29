import pc from "picocolors";
import { isInside } from "../spec/labels.ts";
import { indexTree, isLeaf, walk } from "../spec/tree.ts";
import type { SpecNode, SpecTree } from "../spec/types.ts";
import type { TestResult } from "./runner.ts";
import { type TagState, type TestTag, tagState } from "./tags.ts";

export type LeafStatus = "pass" | "fail" | "skip" | "missing";

export interface LeafTest {
  tag: TestTag;
  state: TagState;
  result?: TestResult;
}

export interface LeafReport {
  path: string;
  title: string;
  status: LeafStatus;
  message?: string;
  output?: string;
  stale: boolean;
  staleSince?: number;
  tests: LeafTest[];
}

export interface Report {
  target: string;
  version: number;
  nodes: SpecNode[];
  leaves: Map<string, LeafReport>;
  orphaned: TestTag[];
  counts: { passed: number; failed: number; skipped: number; missing: number; stale: number; orphaned: number; tests: number };
  exitCode: number;
}

const RANK: Record<LeafStatus, number> = { pass: 0, skip: 1, missing: 2, fail: 3 };

/** Group tags per leaf in scope and derive each leaf's status. Without results, status reflects tag presence only. */
export function buildReport(
  tree: SpecTree,
  scope: string,
  tags: TestTag[],
  results: Map<TestTag, TestResult> | null,
  opts: { strict?: boolean } = {},
): Report {
  const index = indexTree(tree);
  const nodes = scope ? [index.get(scope)!] : tree.roots;
  const leafMap = new Map<string, LeafReport>();
  const counts = { passed: 0, failed: 0, skipped: 0, missing: 0, stale: 0, orphaned: 0, tests: 0 };
  for (const n of walk(nodes)) {
    if (!isLeaf(n)) continue;
    const tests = tags
      .filter((t) => t.path === n.path)
      .map((tag) => ({ tag, state: tagState(tag, index), result: results?.get(tag) }));
    counts.tests += tests.length;
    const stale = tests.filter((t) => t.state === "stale");
    const r: LeafReport = { path: n.path, title: n.title, status: "missing", stale: stale.length > 0, tests };
    if (stale.length) r.staleSince = Math.min(...stale.map((t) => t.tag.version));
    if (tests.length) {
      const ran = tests.map((t) => t.result).filter((x): x is TestResult => !!x);
      const fail = ran.find((x) => x.status === "fail");
      if (fail) Object.assign(r, { status: "fail", message: fail.message, output: fail.output });
      else if (ran.length && ran.every((x) => x.status === "skip")) Object.assign(r, { status: "skip", message: ran[0].message });
      else r.status = "pass";
    }
    leafMap.set(n.path, r);
    if (r.status === "pass") counts.passed++;
    else if (r.status === "fail") counts.failed++;
    else if (r.status === "skip") counts.skipped++;
    else counts.missing++;
    if (r.stale) counts.stale++;
  }
  const orphaned = scope ? [] : tags.filter((t) => t.path === "removed");
  counts.orphaned = orphaned.length;
  const failing = counts.failed > 0 || (!!opts.strict && counts.stale + counts.missing > 0);
  return { target: scope, version: tree.version, nodes, leaves: leafMap, orphaned, counts, exitCode: failing ? 1 : 0 };
}

interface Summary {
  status: LeafStatus;
  passed: number;
  total: number;
}

function summarize(n: SpecNode, report: Report, strict: boolean): Summary {
  const leaf = report.leaves.get(n.path);
  if (leaf) {
    const failing = leaf.status === "fail" || (strict && (leaf.stale || leaf.status === "missing"));
    return { status: failing ? "fail" : leaf.status, passed: leaf.status === "pass" && !failing ? 1 : 0, total: 1 };
  }
  const s: Summary = { status: "pass", passed: 0, total: 0 };
  for (const c of n.children) {
    const cs = summarize(c, report, strict);
    s.passed += cs.passed;
    s.total += cs.total;
    if (RANK[cs.status] > RANK[s.status]) s.status = cs.status;
  }
  if (s.total === 0) s.status = "missing";
  return s;
}

const MARK: Record<LeafStatus, string> = { pass: "✓", fail: "✗", skip: "-", missing: "?" };

function colorMark(status: LeafStatus): string {
  const m = MARK[status];
  return status === "pass" ? pc.green(m) : status === "fail" ? pc.red(m) : status === "skip" ? pc.dim(m) : pc.yellow(m);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export interface RenderOptions {
  depth?: number;
  failed?: boolean;
  verbose?: boolean;
  strict?: boolean;
}

export function renderReport(report: Report, opts: RenderOptions = {}): string {
  const strict = !!opts.strict;
  const rows: { label: string; title: string; detail: string; indent: number }[] = [];
  const baseDepth = report.nodes[0]?.depth ?? 1;
  const extra: string[] = [];

  const visit = (n: SpecNode) => {
    const s = summarize(n, report, strict);
    if (opts.failed && s.status !== "fail") return;
    const indent = n.depth - baseDepth;
    const leaf = report.leaves.get(n.path);
    let detail: string;
    if (leaf) {
      const parts = [colorMark(s.status)];
      if (leaf.status === "fail") parts.push(truncate((leaf.message ?? "failed").split("\n")[0], 80));
      if (leaf.status === "skip") parts.push(`skipped${leaf.message ? `: ${truncate(leaf.message.split("\n")[0], 70)}` : ""}`);
      if (leaf.status === "missing") parts.push("no test");
      if (leaf.stale) parts.push(pc.yellow(`~ stale since v${leaf.staleSince}`));
      detail = parts.join("  ");
      if (opts.verbose && leaf.output && leaf.status === "fail") extra.push(`--- [${leaf.path}] ${leaf.title}\n${leaf.output}`);
    } else {
      detail = `${colorMark(s.status)}  ${s.passed}/${s.total}`;
    }
    rows.push({ label: `[${n.path}]`, title: n.title, detail, indent });
    if (opts.depth !== undefined && indent + 1 >= opts.depth) return;
    n.children.forEach(visit);
  };
  report.nodes.forEach(visit);

  const labelW = Math.max(0, ...rows.map((r) => r.indent * 2 + r.label.length)) + 2;
  const titleW = Math.min(44, Math.max(0, ...rows.map((r) => r.title.length))) + 3;
  const leafCount = report.leaves.size;
  const c = report.counts;
  const out: string[] = [];
  out.push(`ssdd test ${report.target || "(whole tree)"}  ·  spec v${report.version}  ·  ${leafCount} leaves  ·  ${c.tests} tests`, "");
  for (const r of rows) {
    const label = ("  ".repeat(r.indent) + r.label).padEnd(labelW);
    out.push(`${label}${truncate(r.title, 44).padEnd(titleW)}${r.detail}`.trimEnd());
  }
  if (report.orphaned.length) {
    out.push("", "Orphaned tests (node removed):");
    for (const t of report.orphaned) out.push(`  ${t.file}:${t.line}  ${t.raw}`);
  }
  if (extra.length) out.push("", ...extra);
  out.push(
    "",
    `${c.passed} passed · ${c.failed} failed · ${c.skipped} skipped · ${c.missing} missing · ${c.stale} stale · ${c.orphaned} orphaned        exit ${report.exitCode}`,
  );
  return out.join("\n");
}

export function reportJson(report: Report) {
  return {
    target: report.target,
    version: report.version,
    exitCode: report.exitCode,
    counts: report.counts,
    leaves: [...report.leaves.values()].map((l) => ({
      path: l.path,
      title: l.title,
      status: l.status,
      message: l.message,
      stale: l.stale,
      tests: l.tests.map((t) => ({ file: t.tag.file, line: t.tag.line, tag: t.tag.raw, state: t.state, result: t.result?.status ?? null })),
    })),
    orphaned: report.orphaned.map((t) => ({ file: t.file, line: t.line, tag: t.raw })),
  };
}

export function inScope(tags: TestTag[], scope: string): TestTag[] {
  return tags.filter((t) => t.path !== "removed" && isInside(t.path, scope));
}
