#!/usr/bin/env node
// npm launcher: runs the binary from the optional platform package (ssdd-<os>-<cpu>).
const { spawnSync } = require("node:child_process");

const name = `ssdd-${process.platform}-${process.arch}`;
let bin;
try {
  bin = require.resolve(`${name}/bin/ssdd${process.platform === "win32" ? ".exe" : ""}`);
} catch {
  console.error(`ssdd: no prebuilt binary for ${process.platform}-${process.arch} (package ${name} is missing).`);
  console.error("Reinstall without --no-optional, or use the install script: https://github.com/<org>/ssdd#install");
  process.exit(2);
}
const r = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" });
if (r.error) {
  console.error(`ssdd: ${r.error.message}`);
  process.exit(2);
}
process.exit(r.status ?? 1);
