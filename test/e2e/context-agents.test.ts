import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADAPTERS, commandTemplates } from "../../src/agents/adapters.ts";
import { defaultConfig } from "../../src/config.ts";
import { cli, initWithSpec, read, write } from "../helpers.ts";

const BODY = `- Auth
  - Login form
    Shown at /login.
    - Email field
    - Password field
  - Logout
- Dashboard
  - Greeting
`;

function sections(text: string): string[] {
  return text.split("\n").filter((l) => /^## /.test(l));
}

describe("ssdd context", () => {
  it("implement without a path: change roots, changes and test scopes", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("Password field\n", "Password field\n      Masked, with a show/hide toggle.\n"));
    const r = await cli(root, "context", "--for", "implement");
    expect(r.code).toBe(0);
    expect(sections(r.out)).toEqual(["## Constitution", "## Tech stack", "## Preamble", "## Target", "## Changes", "## Test scopes"]);
    expect(r.out).toContain("- Pending version: v2");
    expect(r.out).toContain("### [1.a.2] Password field\n");
    expect(r.out).toContain("  New:\n  > Password field\n  > Masked, with a show/hide toggle.");
    expect(r.out).toContain("- [1] Auth\n- [1.a] Login form — Shown at /login.");
    expect(r.out).toContain("Boundaries (out of scope):\n\n- [1.a.1] Email field");
    expect(r.out).toContain("### Change root [1.a.2] — modified (commit scope: auth)");
    expect(r.out).toMatch(/### \[1\.a\] Login form\n\n- \[1\.a\.1\] Email field — tag `\[ssdd:1\.a\.1@v2#[0-9a-f]{6}\]` — tests: missing/);
  });

  it("implement with a path and --no-test", async () => {
    const { root } = await initWithSpec(BODY);
    const r = await cli(root, "context", "2", "--for", "implement", "--no-test");
    expect(sections(r.out)).toEqual(["## Constitution", "## Tech stack", "## Preamble", "## Target", "## Changes"]);
    expect(r.out).toContain("- Target: [2] Dashboard");
    expect(r.out).toContain("No spec changes inside the target since v1; audit the target against the code.");
  });

  it("test mode lists every leaf with its tag", async () => {
    const { root } = await initWithSpec(BODY);
    const whole = await cli(root, "context", "--for", "test");
    expect(sections(whole.out)).toEqual(["## Constitution", "## Tech stack", "## Preamble", "## Target", "## Tests"]);
    expect(whole.out.match(/tests: missing/g)).toHaveLength(4);
    const sub = await cli(root, "context", "1.a", "--for", "test");
    expect(sub.out.match(/tests: missing/g)).toHaveLength(2);
  });

  it("fails on an invalid path with the nearest ancestor", async () => {
    const { root } = await initWithSpec(BODY);
    const r = await cli(root, "context", "1.a.7", "--for", "test");
    expect(r.code).toBe(2);
    expect(r.err).toBe("No node 1.a.7 in v2. 1.a has children 1.a.1 to 1.a.2.");
  });

  it("notes constitution changes", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/constitution.md", "# Constitution\n\nNew rule.\n");
    const r = await cli(root, "context", "--for", "implement");
    expect(r.out).toContain("ssdd/constitution.md changed since the baseline");
  });
});

describe("agents", () => {
  const config = defaultConfig();
  for (const a of ADAPTERS) {
    it(`renders ${a.id} commands`, () => {
      const rendered = Object.fromEntries(commandTemplates(config).map((t) => [a.commandPath(t.name), a.render(t)]));
      expect(Object.keys(rendered)).toHaveLength(3);
      for (const text of Object.values(rendered)) {
        expect(text).not.toMatch(/\{\{(ARGS|CLI|PREFIX)\}\}/);
        expect(text).toContain("ssdd ");
      }
      expect(rendered).toMatchSnapshot();
    });
  }

  it("honours the command prefix and cli setting", () => {
    const t = commandTemplates({ ...config, commandPrefix: "spec", cli: "npx ssdd" });
    expect(t.map((x) => x.name)).toEqual(["spec-implement", "spec-test", "spec-commit"]);
    expect(t[0].body).toContain("`npx ssdd context");
    expect(t[0].body).toContain("/spec-commit");
  });

  it("agents add and remove update files and config", async () => {
    const { root } = await initWithSpec(BODY);
    expect((await cli(root, "agents", "add", "gemini")).code).toBe(0);
    expect(fs.existsSync(path.join(root, ".gemini/commands/ssdd-implement.toml"))).toBe(true);
    expect(JSON.parse(read(root, "ssdd/ssdd.config.json")).agents).toEqual(["claude", "gemini"]);
    await cli(root, "agents", "remove", "gemini");
    expect(fs.existsSync(path.join(root, ".gemini/commands/ssdd-implement.toml"))).toBe(false);
    expect(JSON.parse(read(root, "ssdd/ssdd.config.json")).agents).toEqual(["claude"]);
  });

  it("asks before a user-level install", async () => {
    const { root } = await initWithSpec(BODY);
    const r = await cli(root, "agents", "add", "codex");
    expect(r.code).toBe(2);
    expect(r.err).toContain("pass --yes");
  });
});

describe("split and join", () => {
  it("round-trips without a spec change", async () => {
    const { root } = await initWithSpec(BODY);
    expect((await cli(root, "split", "1", "auth")).code).toBe(0);
    expect(read(root, "ssdd/rootspec.md")).toContain("- [1] Auth ref:auth");
    expect(read(root, "ssdd/specs/auth/spec.md")).toBe(
      "<!-- ssdd: mounted at [1] -->\n\n- [1.a] Login form\n  Shown at /login.\n  - [1.a.1] Email field\n  - [1.a.2] Password field\n- [1.b] Logout\n",
    );
    expect(JSON.parse((await cli(root, "diff", "--json")).out).groups).toEqual([]);

    expect((await cli(root, "join", "auth")).code).toBe(0);
    expect(fs.existsSync(path.join(root, "ssdd/specs/auth"))).toBe(false);
    expect(JSON.parse((await cli(root, "diff", "--json")).out).groups).toEqual([]);
  });

  it("check reports errors and exits 1", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md") + "## Oops\n");
    const r = await cli(root, "check");
    expect(r.code).toBe(1);
    expect(r.err).toContain("Heading after the first node");
  });

  it("hook install writes a pre-commit hook", async () => {
    const { root } = await initWithSpec(BODY);
    const r = await cli(root, "hook", "install");
    expect(r.code).toBe(0);
    expect(read(root, ".git/hooks/pre-commit")).toContain("ssdd sync --check");
  });
});
