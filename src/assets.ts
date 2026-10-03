import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Templates and package.json ship inside the installed package and are read at runtime.
// This module and the bundle (dist/cli.mjs) both sit one level below the package root.
const ROOT = fileURLToPath(new URL("../", import.meta.url));

const read = (rel: string) => fs.readFileSync(ROOT + rel, "utf8");

export const VERSION: string = JSON.parse(read("package.json")).version;

/** A Markdown template by name, e.g. `skills/ssdd-implement` or `spec/rootspec`. */
export function template(name: string): string {
  return read(`templates/${name}.md`);
}
