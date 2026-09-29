import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CliError, type Config } from "../config.ts";
import { COMMAND_TEMPLATES } from "../generated/assets.ts";

// Command prompts are written once as neutral templates and rendered per agent (section 8).
// Locations change often; each adapter is covered by a snapshot test.

export const COMMAND_IDS = ["implement", "test", "commit"] as const;
export type CommandId = (typeof COMMAND_IDS)[number];

export interface CommandTemplate {
  id: CommandId;
  /** Installed command name, e.g. "ssdd-implement". */
  name: string;
  description: string;
  argumentHint: string;
  /** Prompt text with {{CLI}} and {{PREFIX}} filled in; {{ARGS}} is left for the adapter. */
  body: string;
}

export interface AgentAdapter {
  id: string;
  displayName: string;
  scope: "project" | "user";
  /** Repo-relative path for project scope, `~/`-prefixed for user scope. */
  commandPath(name: string): string;
  render(t: CommandTemplate): string;
}

const yaml = (v: string) => JSON.stringify(v);
const withArgs = (t: CommandTemplate, placeholder: string) => t.body.split("{{ARGS}}").join(placeholder);

function markdown(frontMatter: Record<string, string>, body: string): string {
  const fm = Object.entries(frontMatter).map(([k, v]) => `${k}: ${yaml(v)}`);
  return `---\n${fm.join("\n")}\n---\n${body}`;
}

export const ADAPTERS: AgentAdapter[] = [
  {
    id: "claude",
    displayName: "Claude Code",
    scope: "project",
    commandPath: (n) => `.claude/commands/${n}.md`,
    render: (t) => markdown({ description: t.description, "argument-hint": t.argumentHint }, withArgs(t, "$ARGUMENTS")),
  },
  {
    id: "cursor",
    displayName: "Cursor",
    scope: "project",
    commandPath: (n) => `.cursor/commands/${n}.md`,
    render: (t) => withArgs(t, "the text typed after the command (may be empty)"),
  },
  {
    id: "copilot",
    displayName: "GitHub Copilot",
    scope: "project",
    commandPath: (n) => `.github/prompts/${n}.prompt.md`,
    render: (t) => markdown({ agent: "agent", description: t.description, "argument-hint": t.argumentHint }, withArgs(t, "${input:args}")),
  },
  {
    id: "gemini",
    displayName: "Gemini CLI",
    scope: "project",
    commandPath: (n) => `.gemini/commands/${n}.toml`,
    render: (t) => {
      const body = withArgs(t, "{{args}}");
      if (body.includes("'''")) throw new Error(`template ${t.id} cannot contain ''' for TOML`);
      return `description = ${JSON.stringify(t.description)}\nprompt = '''\n${body}'''\n`;
    },
  },
  {
    id: "opencode",
    displayName: "opencode",
    scope: "project",
    commandPath: (n) => `.opencode/command/${n}.md`,
    render: (t) => markdown({ description: t.description }, withArgs(t, "$ARGUMENTS")),
  },
  {
    id: "codex",
    displayName: "Codex CLI",
    scope: "user",
    commandPath: (n) => `~/.codex/prompts/${n}.md`,
    render: (t) => markdown({ description: t.description, "argument-hint": t.argumentHint }, withArgs(t, "$ARGUMENTS")),
  },
];

export function adapter(id: string): AgentAdapter {
  const a = ADAPTERS.find((x) => x.id === id);
  if (!a) throw new CliError(`Unknown agent "${id}". Known: ${ADAPTERS.map((x) => x.id).join(", ")}`, 2);
  return a;
}

function parseTemplate(id: CommandId, raw: string, prefix: string, cli: string): CommandTemplate {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`template ${id} has no front matter`);
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].startsWith('"') ? JSON.parse(kv[2]) : kv[2];
  }
  const body = m[2].split("{{CLI}}").join(cli).split("{{PREFIX}}").join(prefix);
  return { id, name: `${prefix}-${id}`, description: fm.description ?? "", argumentHint: fm.argumentHint ?? "", body };
}

export function commandTemplates(config: Pick<Config, "commandPrefix" | "cli">): CommandTemplate[] {
  return COMMAND_IDS.map((id) => parseTemplate(id, COMMAND_TEMPLATES[id], config.commandPrefix, config.cli));
}

function resolveTarget(root: string, rel: string): string {
  return rel.startsWith("~/") ? path.join(os.homedir(), rel.slice(2)) : path.join(root, rel);
}

export interface InstallResult {
  agent: string;
  files: string[];
}

export function installAgent(root: string, config: Config, id: string): InstallResult {
  const a = adapter(id);
  const files: string[] = [];
  for (const t of commandTemplates(config)) {
    const rel = a.commandPath(t.name);
    const abs = resolveTarget(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, a.render(t));
    files.push(rel);
  }
  return { agent: id, files };
}

export function removeAgent(root: string, config: Config, id: string): InstallResult {
  const a = adapter(id);
  const files: string[] = [];
  for (const t of commandTemplates(config)) {
    const rel = a.commandPath(t.name);
    const abs = resolveTarget(root, rel);
    if (fs.existsSync(abs)) {
      fs.rmSync(abs);
      files.push(rel);
    }
  }
  return { agent: id, files };
}
