import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { VERSION } from "./generated/assets.ts";
import { satisfies } from "./semver.ts";
import { SSDD_DIR } from "./spec/tree.ts";

export const CONFIG_FILE = `${SSDD_DIR}/ssdd.config.json`;

export const RunnerSchema = z.object({
  name: z.string().min(1),
  globs: z.array(z.string()).min(1),
  tagStyle: z.enum(["name", "comment"]).default("name"),
  command: z.string().min(1).describe("Shell command; {filter} is replaced with the test filter"),
  junit: z.string().min(1).describe("JUnit XML file the command writes, relative to the repo root"),
  env: z.record(z.string(), z.string()).optional(),
});

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  cli: z.string().min(1).default("ssdd"),
  ssddVersion: z.string().optional(),
  agents: z.array(z.string()).default(["claude"]),
  commandPrefix: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).default("ssdd"),
  implement: z.object({ runTests: z.boolean().default(true) }).prefault({}),
  git: z
    .object({
      remote: z.string().default("origin"),
      push: z.boolean().default(true),
      tagPrefix: z.string().min(1).default("ssdd-v"),
    })
    .prefault({}),
  test: z.object({ runners: z.array(RunnerSchema).default([]) }).prefault({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Runner = z.infer<typeof RunnerSchema>;

export class CliError extends Error {
  constructor(
    message: string,
    public exitCode = 2,
  ) {
    super(message);
  }
}

export function defaultConfig(): Config {
  return ConfigSchema.parse({});
}

export interface LoadedConfig {
  config: Config;
  errors: string[];
}

export function loadConfig(root: string): LoadedConfig {
  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) return { config: defaultConfig(), errors: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return { config: defaultConfig(), errors: [`${CONFIG_FILE}: invalid JSON: ${(e as Error).message}`] };
  }
  const r = ConfigSchema.safeParse(raw);
  if (!r.success) {
    return {
      config: defaultConfig(),
      errors: r.error.issues.map((i) => `${CONFIG_FILE}: ${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const errors: string[] = [];
  if (r.data.ssddVersion && !satisfies(VERSION, r.data.ssddVersion)) {
    errors.push(`ssdd ${VERSION} does not match "ssddVersion": "${r.data.ssddVersion}" in ${CONFIG_FILE}; upgrade ssdd`);
  }
  return { config: r.data, errors };
}
