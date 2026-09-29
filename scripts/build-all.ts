// Compile the CLI for every target, write SHA256SUMS and the per-platform npm packages.
// Usage: bun scripts/build-all.ts [--only bun-darwin-arm64,...]
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TARGETS, npmPackageName } from "./targets.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });

const sums: string[] = [];
for (const t of TARGETS) {
  if (only && !only.includes(t.bun)) continue;
  const out = path.join(dist, t.file);
  console.log(`building ${t.file}`);
  const r = spawnSync("bun", ["build", "src/cli/main.ts", "--compile", "--minify", `--target=${t.bun}`, "--outfile", out], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
  const hash = createHash("sha256").update(fs.readFileSync(out)).digest("hex");
  sums.push(`${hash}  ${t.file}`);

  // npm: one package per platform carrying the binary (the esbuild pattern).
  const name = npmPackageName(t);
  const pdir = path.join(dist, "npm", name);
  fs.mkdirSync(path.join(pdir, "bin"), { recursive: true });
  const bin = t.os === "win32" ? "ssdd.exe" : "ssdd";
  fs.copyFileSync(out, path.join(pdir, "bin", bin));
  fs.chmodSync(path.join(pdir, "bin", bin), 0o755);
  fs.writeFileSync(
    path.join(pdir, "package.json"),
    JSON.stringify(
      { name, version: pkg.version, description: `ssdd binary for ${t.os}-${t.cpu}`, license: pkg.license, os: [t.os], cpu: [t.cpu], files: ["bin"], preferUnplugged: true },
      null,
      2,
    ) + "\n",
  );
}
fs.writeFileSync(path.join(dist, "SHA256SUMS"), sums.join("\n") + "\n");
console.log(sums.join("\n"));
