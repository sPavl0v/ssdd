import fs from "node:fs";
import path from "node:path";
import { CliError } from "./config.ts";
import { git } from "./version/git.ts";

const MARKER = "# ssdd pre-commit hook";

/** Add a git pre-commit hook running `ssdd sync --check` (4.2). */
export function installHook(root: string, cli: string): string {
  const hooksDir = path.resolve(root, git(root, ["rev-parse", "--git-path", "hooks"]).trim());
  const file = path.join(hooksDir, "pre-commit");
  const script = `${MARKER}\n${cli} sync --check || { echo "ssdd: spec files or test tags need a sync; run: ${cli} sync" >&2; exit 1; }\n`;
  fs.mkdirSync(hooksDir, { recursive: true });
  if (fs.existsSync(file)) {
    const cur = fs.readFileSync(file, "utf8");
    if (cur.includes(MARKER)) return file;
    if (!cur.startsWith("#!")) throw new CliError(`${file} exists and is not a shell script; add "${cli} sync --check" to it by hand`, 2);
    fs.writeFileSync(file, `${cur.trimEnd()}\n\n${script}`);
  } else {
    fs.writeFileSync(file, `#!/bin/sh\n${script}`);
  }
  fs.chmodSync(file, 0o755);
  return file;
}
