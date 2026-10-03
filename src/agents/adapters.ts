import fs from "node:fs";
import path from "node:path";
import { CLI, CliError, COMMAND_PREFIX } from "../config.ts";
import { template } from "../assets.ts";

// Command prompts are written once as neutral templates and rendered per agent (section 8).
// Locations change often; each adapter is covered by a snapshot test.

export const COMMAND_IDS = ["specify", "implement", "test", "commit"] as const;
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
  /** Repo-relative install path. */
  commandPath(name: string): string;
  render(t: CommandTemplate): string;
}

const yaml = (v: string) => JSON.stringify(v);
const withArgs = (t: CommandTemplate, placeholder: string) => t.body.split("{{ARGS}}").join(placeholder);

function markdown(frontMatter: Record<string, string>, body: string): string {
  const fm = Object.entries(frontMatter).map(([k, v]) => `${k}: ${v === "true" ? v : yaml(v)}`);
  return `---\n${fm.join("\n")}\n---\n${body}`;
}

export const ADAPTERS: AgentAdapter[] = [
  {
    id: "claude",
    // Skills: one folder per skill, invoked as /<name>. Commit has side effects (commit, push),
    // so only the user may trigger it.
    commandPath: (n) => `.claude/skills/${n}/SKILL.md`,
    render: (t) =>
      markdown(
        {
          name: t.name,
          description: t.description,
          "argument-hint": t.argumentHint,
          ...(t.id === "commit" ? { "disable-model-invocation": "true" } : {}),
        },
        withArgs(t, "$ARGUMENTS"),
      ),
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

export function commandTemplates(): CommandTemplate[] {
  return COMMAND_IDS.map((id) => parseTemplate(id, template(`skills/ssdd-${id}`), COMMAND_PREFIX, CLI));
}

/** Write the agent's command files and return their repo-relative paths. */
export function installAgent(root: string, id: string): string[] {
  const a = adapter(id);
  const files: string[] = [];
  for (const t of commandTemplates()) {
    const rel = a.commandPath(t.name);
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, a.render(t));
    files.push(rel);
  }
  return files;
}

