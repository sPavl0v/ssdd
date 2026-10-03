import fs from "node:fs";
import path from "node:path";
import { Command, CommanderError, Option } from "commander";
import pc from "picocolors";
import { adapter } from "../agents/adapters.ts";
import { CLI, CliError, COMMAND_PREFIX, SpecErrors } from "../config.ts";
import { buildContext } from "../context/bundle.ts";
import { VERSION } from "../assets.ts";
import { FIRST_COMMIT_MESSAGE, init } from "../init.ts";
import { type Project, openProject } from "../project.ts";
import { normalizePath } from "../spec/labels.ts";
import type { Diagnostic } from "../spec/types.ts";
import { commit } from "../version/commit.ts";
import { git, repoRoot } from "../version/git.ts";

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

  const project = (): Project => openProject(io.cwd);
  const printDiags = (ds: Diagnostic[]) => ds.forEach((d) => (d.level === "error" ? io.err : io.out)(diagLine(d)));

  program
    .command("init")
    .description("Scaffold ssdd/, write config, install agent commands")
    .option("--agents <list>", "comma-separated agents", "claude")
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
      const r = init(root, { agents });
      for (const f of r.written) io.out(`${pc.green("created")} ${f}`);
      for (const f of r.kept) io.out(`${pc.dim("kept")}    ${f}`);
      for (const f of r.agents) io.out(`${pc.green("created")} ${f}`);
      io.out("");
      io.out("Next: review ssdd/constitution.md, fill in ssdd/techstack.md and ssdd/rootspec.md, then commit version 1:");
      io.out("");
      io.out("```");
      io.out(FIRST_COMMIT_MESSAGE);
      io.out("```");
      io.out("");
      io.out(`Run /${COMMAND_PREFIX}-commit with this message, as is or edited (or: ${CLI} commit -m "${FIRST_COMMIT_MESSAGE}").`);
    });

  program
    .command("context [path]")
    .description("Sync and print the agent context bundle")
    .addOption(new Option("--for <mode>", "command the bundle is for").choices(["specify", "implement", "test"]).makeOptionMandatory())
    .action((pathArg, o) => {
      const p = project();
      io.out(buildContext(p, { path: parsePathArg(pathArg) || undefined, mode: o.for }));
    });

  program
    .command("commit")
    .description("Bump the version, commit all changes and push")
    .option("-m, --message <msg>", "commit message")
    .option("-F, --file <file>", "read the commit message from a file")
    .option("--no-push", "keep the commit local")
    .action((o) => {
      if (!o.message === !o.file) throw new CliError("Pass exactly one of -m <message> or -F <file>", 2);
      const message = o.file ? fs.readFileSync(path.resolve(io.cwd, o.file), "utf8") : String(o.message);
      const r = commit(project(), message, { push: o.push });
      printDiags(r.diagnostics);
      if (!r.committed) return io.out("Nothing to commit");
      io.out(`ssdd v${r.version}  ·  ${r.hash}  ·  ${r.branch}`);
      if (r.push.status === "pushed") io.out(`pushed to ${r.push.detail}`);
      else if (r.push.status === "skipped") io.out(`not pushed (${r.push.detail})`);
      else if (r.push.status === "no-remote") io.out(pc.yellow(`warning: ${r.push.detail}`));
      else {
        io.err(pc.red("push failed:"));
        io.err(r.push.detail);
        io.err("The commit stays local. Retry: git pull --rebase, then git push");
        code = 1;
      }
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

