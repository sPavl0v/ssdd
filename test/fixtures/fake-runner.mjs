// A tiny test runner for tests: reads tests/*.fake files with lines
//   PASS <name>   FAIL <name> :: <message>   SKIP <name> :: <reason>
// keeps tests whose name matches the regex in argv[2], and writes JUnit XML to argv[3].
import fs from "node:fs";
import path from "node:path";

const [filter, out] = process.argv.slice(2);
const re = new RegExp(filter);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const cases = [];
for (const f of fs.readdirSync("tests").filter((x) => x.endsWith(".fake"))) {
  for (const line of fs.readFileSync(path.join("tests", f), "utf8").split("\n")) {
    const m = /^(PASS|FAIL|SKIP) (.*?)(?: :: (.*))?$/.exec(line.trim());
    if (!m || !re.test(m[2])) continue;
    const inner = m[1] === "FAIL" ? `<failure message="${esc(m[3] ?? "failed")}">${esc(m[3] ?? "")}</failure>` : m[1] === "SKIP" ? `<skipped message="${esc(m[3] ?? "")}"/>` : "";
    cases.push(`<testcase classname="${f}" name="${esc(m[2])}">${inner}</testcase>`);
  }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `<?xml version="1.0"?>\n<testsuites><testsuite name="fake">${cases.join("")}</testsuite></testsuites>\n`);
process.exit(cases.some((c) => c.includes("<failure")) ? 1 : 0);
