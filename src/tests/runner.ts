import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CliError, type Runner } from "../config.ts";
import type { Project } from "../project.ts";
import { type CaseResult, parseJUnit } from "./junit.ts";
import type { TestTag } from "./tags.ts";

export interface TestResult {
  status: "pass" | "fail" | "skip";
  message?: string;
  output?: string;
}

/** Regex matching tags inside `scope`, e.g. `\[ssdd:2\.a(\.[^@]+)?@` (6.4). */
export function nameFilter(scope: string): string {
  if (!scope) return "\\[ssdd:[0-9][^@]*@";
  return `\\[ssdd:${scope.replace(/\./g, "\\.")}(\\.[^@]+)?@`;
}

function aggregate(cases: CaseResult[]): TestResult {
  const fail = cases.find((c) => c.status === "fail");
  if (fail) return { status: "fail", message: fail.message, output: fail.output };
  if (cases.every((c) => c.status === "skip")) return { status: "skip", message: cases[0].message };
  return { status: "pass" };
}

function matchCases(tag: TestTag, cases: CaseResult[]): CaseResult[] {
  if (tag.tagStyle === "name") return cases.filter((c) => c.name.includes(tag.raw) || c.classname.includes(tag.raw));
  if (!tag.testId) return [];
  const id = tag.testId;
  const byName = cases.filter((c) => c.name === id || c.name.startsWith(`${id}[`));
  if (byName.length <= 1) return byName;
  // Same identifier in several files: narrow by file or classname.
  const stem = path.basename(tag.file).replace(/\.[^.]+$/, "");
  const narrowed = byName.filter((c) => (c.file && tag.file.endsWith(c.file)) || c.classname.split(".").includes(stem));
  return narrowed.length ? narrowed : byName;
}

export interface RunOutput {
  results: Map<TestTag, TestResult>;
  runners: { name: string; command: string; exitCode: number }[];
}

/** Run each configured runner over the tagged tests in scope and map JUnit cases back to tags. */
export function runTests(p: Project, tags: TestTag[], scope: string, log: (s: string) => void = () => {}): RunOutput {
  const results = new Map<TestTag, TestResult>();
  const runners: RunOutput["runners"] = [];
  for (const runner of p.config.test.runners) {
    const mine = tags.filter((t) => t.runner === runner.name);
    if (!mine.length) continue;
    const filter = runner.tagStyle === "name" ? nameFilter(scope) : [...new Set(mine.map((t) => t.testId).filter(Boolean))].join(" or ");
    const exec = execRunner(p.root, runner, filter);
    runners.push({ name: runner.name, command: exec.command, exitCode: exec.exitCode });
    log(`ran ${runner.name}: ${exec.command} (exit ${exec.exitCode})`);
    for (const t of mine) {
      const cases = matchCases(t, exec.cases);
      const hint = exec.cases.length ? "" : " (it reported no tests at all; check its command and globs)";
      results.set(t, cases.length ? aggregate(cases) : { status: "fail", message: `not found in ${runner.name} runner output${hint}` });
    }
  }
  return { results, runners };
}

function execRunner(root: string, runner: Runner, filter: string): { command: string; exitCode: number; cases: CaseResult[] } {
  const command = runner.command.split("{filter}").join(filter);
  const junit = path.join(root, runner.junit);
  fs.rmSync(junit, { force: true });
  fs.mkdirSync(path.dirname(junit), { recursive: true });
  const r = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, ...runner.env },
    maxBuffer: 256 * 1024 * 1024,
  });
  const exitCode = r.status ?? 1;
  if (!fs.existsSync(junit)) {
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    throw new CliError(`Runner "${runner.name}" exited ${exitCode} without JUnit output at ${runner.junit}\n$ ${command}\n${out}`, 2);
  }
  return { command, exitCode, cases: parseJUnit(fs.readFileSync(junit, "utf8")) };
}
