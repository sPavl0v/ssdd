import fs from "node:fs";
import path from "node:path";
import { Command, CommanderError, Option } from "commander";
import pc from "picocolors";
import { ADAPTERS, adapter, installAgent, removeAgent } from "../agents/adapters.ts";
import { CONFIG_FILE, CliError, loadConfig } from "../config.ts";
import { SpecErrors, buildContext } from "../context/bundle.ts";
import { VERSION } from "../generated/assets.ts";
import { installHook } from "../hook.ts";
import { FIRST_COMMIT_MESSAGE, init } from "../init.ts";
import { type Project, baselineOf, openProject, treeAtVersion, workingTree } from "../project.ts";
import { formatAll } from "../spec/formatter.ts";
import { agentBody } from "../spec/hash.ts";
import { normalizePath } from "../spec/labels.ts";
import { join, split } from "../spec/restructure.ts";
import { PathError, emptySource, findNode, loadTree } from "../spec/tree.ts";
import type { Diagnostic, SpecNode, SpecTree } from "../spec/types.ts";
import { buildReport, inScope, renderReport, reportJson } from "../tests/report.ts";
import { runTests } from "../tests/runner.ts";
import { lintTags, nodeFingerprint, scanTags } from "../tests/tags.ts";
import { type ChangeSet, changePath, computeChanges, filterChanges, nodeText } from "../version/changes.ts";
import { commit } from "../version/commit.ts";
import { git, repoRoot } from "../version/git.ts";
import { history } from "../version/history.ts";
import { sync, syncNeeded } from "../version/sync.ts";

export interface IO {
  cwd: string;
  out: (s: string) => void;
  err: (s: string) => void;
  /** Ask a yes/no question; returns false when there is no terminal. */
  confirm: (question: string) => Promise<boolean>;
}

function diagLine(d: Diagnostic): string {
  const loc = d.file ? `${d.file}${d.line ? `:${d.line}` : ""}` : "";
  const lvl = d.level === "error" ? pc.red("error") : pc.yellow("warning");
  return `${loc ? loc + " " : ""}${d.path ? `[${d.path}] ` : ""}${lvl}: ${d.message}`;
}

function parsePathArg(p: string | undefined): string {
  if (p === undefined || p === "") return "";
  const n = normalizePath(p);
  if (!n) throw new CliError(`Invalid path "${p}"; expected e.g. 1.a.3`, 2);
  return n;
}

function parseIntArg(v: string, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new CliError(`${name} must be a non-negative integer`, 2);
  return n;
}

function resolve(tree: SpecTree, p: string, version: number): SpecNode {
  try {
    return findNode(tree, p, version);
  } catch (e) {
    if (e instanceof PathError) throw new CliError(e.message, 2);
    throw e;
  }
}

function nodeJson(n: SpecNode): unknown {
  return { path: n.path, title: n.title, body: agentBody(n.body), ref: n.ref ?? null, file: n.file, line: n.line, children: n.children.map(nodeJson) };
}

function changeSetJson(cs: ChangeSet) {
  return {
    preambleChanged: !!cs.preamble,
    groups: cs.groups.map((g) => ({
      root: changePath(g.root),
      kind: g.root.kind,
      changes: g.changes.map((c) => ({
        kind: c.kind,
        oldPath: c.oldNode?.path ?? null,
        newPath: c.newNode?.path ?? null,
        oldText: c.oldNode ? nodeText(c.oldNode) : null,
        newText: c.newNode ? nodeText(c.newNode) : null,
      })),
    })),
  };
}

function updateConfigAgents(root: string, fn: (agents: string[]) => string[]): void {
  const file = path.join(root, CONFIG_FILE);
  const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  raw.agents = fn(Array.isArray(raw.agents) ? raw.agents : []);
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
}

export async function run(argv: string[], io: IO): Promise<number> {
  let code = 0;
  const program = new Command();
  program
    .name("ssdd")
    .description("Simple spec-driven development")
    .version(VERSION, "-v, --version")
    .enablePositionalOptions()
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.out(s.replace(/\n$/, "")), writeErr: (s) => io.err(s.replace(/\n$/, "")) });

  const project = (opts: { allowConfigErrors?: boolean } = {}): Project => openProject(io.cwd, opts);
  const printDiags = (ds: Diagnostic[]) => ds.forEach((d) => (d.level === "error" ? io.err : io.out)(diagLine(d)));

  program
    .command("init")
    .description("Scaffold ssdd/, write config, install agent commands")
    .option("--agents <list>", "comma-separated agents", "claude")
    .option("--prefix <prefix>", "command prefix", "ssdd")
    .option("-y, --yes", "run git init without asking when not in a repo")
    .action(async (o) => {
      let root = repoRoot(io.cwd);
      if (!root) {
        const ok = o.yes || (await io.confirm(`${io.cwd} is not a git repository. Run git init here?`));
        if (!ok) throw new CliError("Not a git repository; run git init first (or ssdd init --yes)", 2);
        git(io.cwd, ["init", "-q"]);
        root = repoRoot(io.cwd)!;
      }
      const agents = String(o.agents).split(",").map((s: string) => s.trim()).filter(Boolean);
      agents.forEach(adapter);
      for (const a of agents) {
        if (adapter(a).scope === "user" && !o.yes && !(await io.confirm(`${adapter(a).displayName} commands install in your home folder. Continue?`))) {
          throw new CliError(`Skipped: ${a} needs confirmation (pass --yes)`, 2);
        }
      }
      const r = init(root, { agents, prefix: o.prefix });
      for (const f of r.written) io.out(`${pc.green("created")} ${f}`);
      for (const f of r.kept) io.out(`${pc.dim("kept")}    ${f}`);
      for (const a of r.agents) for (const f of a.files) io.out(`${pc.green("created")} ${f}`);
      const prefix = r.config.commandPrefix;
      io.out("");
      io.out("Next: fill in ssdd/constitution.md, ssdd/techstack.md and ssdd/rootspec.md, then commit version 1:");
      io.out("");
      io.out("```");
      io.out(FIRST_COMMIT_MESSAGE);
      io.out("```");
      io.out("");
      io.out(`Run /${prefix}-commit with this message, as is or edited (or: ssdd commit -m "${FIRST_COMMIT_MESSAGE}").`);
    });

  program
    .command("sync")
    .description("Format spec files and relink test tags; never changes the version")
    .option("--check", "change nothing; exit 1 if a sync is needed")
    .action((o) => {
      const p = project();
      const r = sync(p, { check: o.check });
      printDiags([...r.tree.diagnostics, ...r.diagnostics]);
      const verb = o.check ? "needs formatting" : "formatted";
      for (const f of r.formatted) io.out(`${verb}: ${f}`);
      for (const w of r.rewrites) io.out(`${o.check ? "needs relink" : "relinked"}: ${w.file}:${w.line} ${w.from} → ${w.to}`);
      if (!syncNeeded(r)) io.out("In sync.");
      if (o.check && syncNeeded(r)) code = 1;
    });

  program
    .command("fmt")
    .description("Format spec files only")
    .option("--check", "change nothing; exit 1 if formatting is needed")
    .action((o) => {
      const p = project({ allowConfigErrors: true });
      const r = formatAll(p.root, { check: o.check });
      printDiags(r.skipped);
      for (const f of r.changed) io.out(`${o.check ? "needs formatting" : "formatted"}: ${f}`);
      if (!r.changed.length) io.out("All spec files formatted.");
      if (o.check && r.changed.length) code = 1;
      if (r.skipped.length) code = 1;
    });

  program
    .command("tree [path]")
    .description("Print the numbered tree or a subtree, refs expanded")
    .option("--depth <n>", "levels to show")
    .option("--version <v>", "read the tree of an older version from git")
    .option("--json", "machine output")
    .action((pathArg, o) => {
      const p = project({ allowConfigErrors: true });
      const tree = o.version !== undefined ? treeAtVersion(p, parseIntArg(o.version, "--version")) : workingTree(p);
      const target = parsePathArg(pathArg);
      const nodes = target ? [resolve(tree, target, o.version !== undefined ? tree.version : tree.version + 1)] : tree.roots;
      if (o.json) return io.out(JSON.stringify({ version: tree.version, nodes: nodes.map(nodeJson) }, null, 2));
      const depth = o.depth !== undefined ? parseIntArg(o.depth, "--depth") : Infinity;
      const base = nodes[0]?.depth ?? 1;
      const lines: string[] = [];
      const visit = (n: SpecNode) => {
        const rel = n.depth - base;
        if (rel >= depth) return;
        lines.push(`${"  ".repeat(rel)}${pc.dim(`[${n.path}]`)} ${n.title}${n.ref ? pc.cyan(` ref:${n.ref}`) : ""}`);
        n.children.forEach(visit);
      };
      nodes.forEach(visit);
      if (!lines.length) lines.push("(spec is empty)");
      io.out(lines.join("\n"));
      printDiags(tree.diagnostics);
    });

  program
    .command("show <path>")
    .description("Print one node")
    .option("--json", "machine output")
    .action((pathArg, o) => {
      const p = project({ allowConfigErrors: true });
      const tree = workingTree(p);
      const n = resolve(tree, parsePathArg(pathArg), tree.version + 1);
      const body = agentBody(n.body);
      if (o.json) {
        return io.out(JSON.stringify({ path: n.path, title: n.title, body, ref: n.ref ?? null, file: n.file, line: n.line, children: n.children.length, fingerprint: nodeFingerprint(n) }, null, 2));
      }
      io.out(`[${n.path}] ${n.title}${n.ref ? ` ref:${n.ref}` : ""}`);
      io.out(`file: ${n.file}:${n.line}`);
      io.out(`children: ${n.children.length}`);
      io.out(`fingerprint: ${nodeFingerprint(n)}`);
      if (body.length) io.out("\n" + body.join("\n"));
    });

  program
    .command("context [path]")
    .description("Sync and print the agent context bundle")
    .addOption(new Option("--for <mode>", "command the bundle is for").choices(["implement", "test"]).makeOptionMandatory())
    .option("--no-test", "omit test scopes (implement)")
    .action((pathArg, o) => {
      const p = project();
      const r = buildContext(p, { path: parsePathArg(pathArg) || undefined, mode: o.for, noTest: o.test === false });
      io.out(r.text);
    });

  program
    .command("diff [path]")
    .description("Change set between two versions (default: baseline → working tree)")
    .option("--from <v>", "older version")
    .option("--to <v>", "newer version")
    .option("--json", "machine output")
    .action((pathArg, o) => {
      const p = project({ allowConfigErrors: true });
      const baseline = baselineOf(p);
      let fromLabel: string;
      let oldTree: SpecTree;
      if (o.from !== undefined) {
        const v = parseIntArg(o.from, "--from");
        oldTree = v === 0 ? loadTree(emptySource()) : treeAtVersion(p, v);
        fromLabel = `v${v}`;
      } else if (baseline) {
        oldTree = treeAtVersion(p, baseline.version);
        fromLabel = `v${baseline.version}`;
      } else {
        oldTree = loadTree(emptySource());
        fromLabel = "(no baseline)";
      }
      const newTree = o.to !== undefined ? treeAtVersion(p, parseIntArg(o.to, "--to")) : workingTree(p);
      const toLabel = o.to !== undefined ? `v${o.to}` : "working tree";
      let cs = computeChanges(oldTree, newTree);
      const scope = parsePathArg(pathArg);
      if (scope) {
        resolve(newTree, scope, o.to !== undefined ? newTree.version : newTree.version + 1);
        cs = filterChanges(cs, scope);
      }
      if (o.json) return io.out(JSON.stringify({ from: fromLabel, to: toLabel, ...changeSetJson(cs) }, null, 2));
      io.out(`ssdd diff ${fromLabel} → ${toLabel}  ·  ${cs.groups.length} change root${cs.groups.length === 1 ? "" : "s"}`);
      if (cs.preamble) io.out("\npreamble changed");
      for (const g of cs.groups) {
        io.out("");
        for (const c of g.changes) {
          const indent = c === g.changes[0] ? "" : "  ";
          const n = c.newNode ?? c.oldNode!;
          const was = c.oldNode && c.newNode && c.oldNode.path !== c.newNode.path ? pc.dim(` (was [${c.oldNode.path}])`) : "";
          const color = c.kind === "added" ? pc.green : c.kind === "removed" ? pc.red : pc.yellow;
          io.out(`${indent}${color(c.kind.padEnd(8))} [${n.path}]${was} ${n.title}`);
        }
      }
      if (!cs.groups.length && !cs.preamble) io.out("\nNo changes.");
    });

  program
    .command("commit")
    .description("Bump the version, commit all changes, tag and push")
    .option("-m, --message <msg>", "commit message")
    .option("-F, --file <file>", "read the commit message from a file")
    .option("--no-push", "keep the commit and tag local")
    .action((o) => {
      if (!o.message === !o.file) throw new CliError("Pass exactly one of -m <message> or -F <file>", 2);
      const message = o.file ? fs.readFileSync(path.resolve(io.cwd, o.file), "utf8") : String(o.message);
      const p = project();
      let r;
      try {
        r = commit(p, message, { push: o.push });
      } catch (e) {
        const ds = (e as { diagnostics?: Diagnostic[] }).diagnostics;
        if (ds) printDiags(ds);
        throw e;
      }
      printDiags(r.diagnostics);
      if (!r.committed) return io.out("Nothing to commit");
      io.out(`ssdd v${r.version}  ·  ${r.hash}  ·  ${r.branch}  ·  tag ${r.tag}`);
      if (r.push.status === "pushed") io.out(`pushed to ${r.push.detail}`);
      else if (r.push.status === "skipped") io.out(`not pushed (${r.push.detail})`);
      else if (r.push.status === "no-remote") io.out(pc.yellow(`warning: ${r.push.detail}`));
      else {
        io.err(pc.red("push failed:"));
        io.err(r.push.detail);
        io.err("Commit and tag stay local. Retry: git pull --rebase, then git push --follow-tags");
        code = 1;
      }
    });

  program
    .command("test [path]")
    .description("Sync, run tagged tests for the subtree, print the report")
    .option("--depth <n>", "collapse deeper levels")
    .option("--failed", "show only failing branches")
    .option("--verbose", "print full failure output")
    .option("--strict", "stale and missing count as failures")
    .option("--json", "machine output")
    .action((pathArg, o) => {
      const p = project();
      const s = sync(p);
      const errors = s.tree.diagnostics.filter((d) => d.level === "error");
      if (errors.length) {
        printDiags(errors);
        throw new CliError("Spec has errors; fix them first", 2);
      }
      const scope = parsePathArg(pathArg);
      if (scope) resolve(s.tree, scope, s.tree.version + 1);
      const tags = inScope(s.tags, scope);
      const { results } = runTests(p, tags, scope, (l) => (o.verbose ? io.err(pc.dim(l)) : undefined));
      const report = buildReport(s.tree, scope, s.tags, results, { strict: o.strict });
      if (o.json) io.out(JSON.stringify(reportJson(report), null, 2));
      else io.out(renderReport(report, { depth: o.depth !== undefined ? parseIntArg(o.depth, "--depth") : undefined, failed: o.failed, verbose: o.verbose, strict: o.strict }));
      code = report.exitCode;
    });

  program
    .command("check")
    .description("Lint spec, config and test tags; exit 1 on errors")
    .option("--json", "machine output")
    .action((o) => {
      const p = project({ allowConfigErrors: true });
      const { errors: configErrors } = loadConfig(p.root);
      const tree = workingTree(p);
      const ds: Diagnostic[] = [...tree.diagnostics];
      for (const m of configErrors) ds.push({ level: "error", code: "config", message: m, file: CONFIG_FILE });
      if (!configErrors.length) ds.push(...lintTags(scanTags(p.root, p.config), tree));
      const fmt = formatAll(p.root, { check: true });
      for (const f of fmt.changed) ds.push({ level: "warning", code: "unformatted", message: "not formatted; run ssdd fmt", file: f });
      const nErr = ds.filter((d) => d.level === "error").length;
      if (o.json) io.out(JSON.stringify({ errors: nErr, diagnostics: ds }, null, 2));
      else {
        printDiags(ds);
        io.out(`${nErr} error${nErr === 1 ? "" : "s"}, ${ds.length - nErr} warning${ds.length - nErr === 1 ? "" : "s"}`);
      }
      code = nErr ? 1 : 0;
    });

  program
    .command("split <path> <feature>")
    .description("Move a subtree into ssdd/specs/<feature>/spec.md and leave a ref: node")
    .action((pathArg, feature) => {
      const p = project({ allowConfigErrors: true });
      const f = split(p.root, parsePathArg(pathArg), feature);
      io.out(`created ${f}; [${parsePathArg(pathArg)}] is now ref:${feature}`);
    });

  program
    .command("join <feature>")
    .description("Inline a feature file back into its parent and delete it")
    .action((feature) => {
      const p = project({ allowConfigErrors: true });
      const r = join(p.root, feature);
      io.out(`inlined and deleted ${r.file}`);
      if (r.preambleMoved) io.out(pc.yellow("note: the feature file's preamble was kept as an HTML comment on the ref node"));
    });

  program
    .command("history")
    .description("List ssdd versions with date, subject and change counts")
    .option("--json", "machine output")
    .action((o) => {
      const p = project({ allowConfigErrors: true });
      const h = history(p);
      if (o.json) return io.out(JSON.stringify(h, null, 2));
      if (!h.length) return io.out("No ssdd versions yet. Run ssdd commit.");
      for (const e of h) {
        const c = e.counts;
        io.out(`v${String(e.version).padEnd(4)} ${e.date}  ${e.commit}  +${c.added} -${c.removed} ~${c.modified} ↷${c.moved}  ${e.subject}`);
      }
    });

  const agents = program.command("agents").description("Install or remove slash commands for an agent");
  agents
    .command("add <agent>")
    .option("-y, --yes", "confirm user-level installs")
    .action(async (id, o) => {
      const p = project({ allowConfigErrors: true });
      const a = adapter(id);
      if (a.scope === "user" && !o.yes && !(await io.confirm(`${a.displayName} commands install in your home folder. Continue?`))) {
        throw new CliError("Cancelled (pass --yes to confirm)", 2);
      }
      const r = installAgent(p.root, p.config, id);
      updateConfigAgents(p.root, (list) => (list.includes(id) ? list : [...list, id]));
      for (const f of r.files) io.out(`${pc.green("wrote")} ${f}`);
    });
  agents
    .command("remove <agent>")
    .action((id) => {
      const p = project({ allowConfigErrors: true });
      const r = removeAgent(p.root, p.config, id);
      updateConfigAgents(p.root, (list) => list.filter((x) => x !== id));
      for (const f of r.files) io.out(`${pc.red("removed")} ${f}`);
      if (!r.files.length) io.out("Nothing to remove.");
    });
  agents
    .command("list")
    .description("List supported agents")
    .action(() => {
      for (const a of ADAPTERS) io.out(`${a.id.padEnd(10)} ${a.displayName.padEnd(16)} ${a.commandPath("<name>")}`);
    });

  program
    .command("hook")
    .description("Git hooks")
    .command("install")
    .description("Add a pre-commit hook running ssdd sync --check")
    .action(() => {
      const p = project({ allowConfigErrors: true });
      io.out(`installed ${installHook(p.root, p.config.cli)}`);
    });

  try {
    await program.parseAsync(argv, { from: "user" });
    return code;
  } catch (e) {
    if (e instanceof CommanderError) {
      if (e.code === "commander.helpDisplayed" || e.code === "commander.version" || e.code === "commander.help") return 0;
      return 2;
    }
    if (e instanceof SpecErrors) {
      printDiags(e.diagnostics);
      io.err(e.message);
      return e.exitCode;
    }
    if (e instanceof CliError) {
      io.err(e.message);
      return e.exitCode;
    }
    io.err(`ssdd: ${(e as Error).stack ?? e}`);
    return 2;
  }
}

