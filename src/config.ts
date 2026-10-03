import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { VERSION } from "./assets.ts";
import { satisfies } from "./semver.ts";
import { SSDD_DIR } from "./spec/tree.ts";
import type { Diagnostic } from "./spec/types.ts";

export const CONFIG_FILE = `${SSDD_DIR}/ssdd.config.json`;
/** How agent commands invoke the CLI. */
export const CLI = "npx ssdd";
/** Agent commands are named `<prefix>-<id>`, e.g. /ssdd-implement. */
export const COMMAND_PREFIX = "ssdd";

export const ConfigSchema = z.object({
  ssddVersion: z.string().optional(),
  git: z
    .object({
      remote: z.string().default("origin"),
      push: z.boolean().default(true),
    })
    .prefault({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export class CliError extends Error {
  constructor(
    message: string,
    public exitCode = 2,
  ) {
    super(message);
  }
}

/** Spec errors: the CLI prints each diagnostic, then the message. */
export class SpecErrors extends CliError {
  constructor(
    public diagnostics: Diagnostic[],
    message = "Spec has errors; fix them first",
  ) {
    super(message, 1);
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
