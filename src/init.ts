import fs from "node:fs";
import path from "node:path";
import { installAgent } from "./agents/adapters.ts";
import { CONFIG_FILE, ConfigSchema, type Config, type Runner } from "./config.ts";
import { SPEC_TEMPLATES, VERSION } from "./generated/assets.ts";
import { SSDD_DIR } from "./spec/tree.ts";

export const SCHEMA_URL = `https://unpkg.com/ssdd@${VERSION}/schema/ssdd.config.schema.json`;
export const FIRST_COMMIT_MESSAGE = "chore(ssdd): initialize ssdd spec";

/** Guess test runners from the project so `ssdd test` works out of the box. */
export function detectRunners(root: string): Runner[] {
  const runners: Runner[] = [];
  let deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {}
  if (deps.vitest) {
    runners.push({
      name: "unit",
      globs: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      tagStyle: "name",
      command: 'npx vitest run -t "{filter}" --reporter=junit --outputFile=.ssdd-out/unit.xml',
      junit: ".ssdd-out/unit.xml",
    });
  } else if (deps.jest) {
    runners.push({
      name: "unit",
      globs: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.test.js"],
      tagStyle: "name",
      command: 'npx jest -t "{filter}" --reporters=default --reporters=jest-junit',
      env: { JEST_JUNIT_OUTPUT_DIR: ".ssdd-out", JEST_JUNIT_OUTPUT_NAME: "unit.xml" },
      junit: ".ssdd-out/unit.xml",
    });
  }
  if (deps["@playwright/test"]) {
    runners.push({
      name: "e2e",
      globs: ["e2e/**/*.spec.ts"],
      tagStyle: "name",
      command: 'npx playwright test --grep "{filter}" --reporter=junit',
      env: { PLAYWRIGHT_JUNIT_OUTPUT_NAME: ".ssdd-out/e2e.xml" },
      junit: ".ssdd-out/e2e.xml",
    });
  }
  const py = ["pyproject.toml", "pytest.ini", "setup.cfg"].some((f) => fs.existsSync(path.join(root, f)));
  if (py) {
    runners.push({
      name: "pytest",
      globs: ["tests/**/test_*.py"],
      tagStyle: "comment",
      command: 'python -m pytest -k "{filter}" --junitxml=.ssdd-out/pytest.xml',
      junit: ".ssdd-out/pytest.xml",
    });
  }
  return runners;
}

export interface InitResult {
  written: string[];
  kept: string[];
  agents: { agent: string; files: string[] }[];
  config: Config;
}

export function init(root: string, opts: { agents: string[]; prefix?: string }): InitResult {
  const written: string[] = [];
  const kept: string[] = [];
  const put = (rel: string, content: string) => {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) return kept.push(rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    written.push(rel);
  };

  put(`${SSDD_DIR}/rootspec.md`, SPEC_TEMPLATES.rootspec);
  put(`${SSDD_DIR}/constitution.md`, SPEC_TEMPLATES.constitution);
  put(`${SSDD_DIR}/techstack.md`, SPEC_TEMPLATES.techstack);
  put(`${SSDD_DIR}/.gitignore`, ".state/\n");

  let config: Config;
  const cfgPath = path.join(root, CONFIG_FILE);
  if (fs.existsSync(cfgPath)) {
    config = ConfigSchema.parse(JSON.parse(fs.readFileSync(cfgPath, "utf8")));
    kept.push(CONFIG_FILE);
  } else {
    const raw = {
      $schema: SCHEMA_URL,
      cli: "ssdd",
      ssddVersion: `>=${VERSION}`,
      agents: opts.agents,
      commandPrefix: opts.prefix ?? "ssdd",
      implement: { runTests: true },
      git: { remote: "origin", push: true, tagPrefix: "ssdd-v" },
      test: { runners: detectRunners(root) },
    };
    config = ConfigSchema.parse(raw);
    put(CONFIG_FILE, JSON.stringify(raw, null, 2) + "\n");
  }

  // Runner output never belongs in git.
  const gi = path.join(root, ".gitignore");
  const existing = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  if (!existing.split("\n").some((l) => l.trim() === ".ssdd-out/")) {
    fs.writeFileSync(gi, existing + (existing && !existing.endsWith("\n") ? "\n" : "") + ".ssdd-out/\n");
    written.push(".gitignore");
  }

  const agents = opts.agents.map((a) => installAgent(root, config, a));
  return { written, kept, agents, config };
}
