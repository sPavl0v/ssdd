import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADAPTERS, commandTemplates } from "../../src/agents/adapters.ts";
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
    expect(sections(r.out)).toEqual(["## Constitution", "## Tech stack", "## Memory", "## Preamble", "## Target", "## Changes"]);
    expect(r.out).toContain("- Pending version: v2");
    expect(r.out).toContain("### [1.a.2] Password field\n");
    expect(r.out).toContain("  New:\n  > Password field\n  > Masked, with a show/hide toggle.");
    expect(r.out).toContain("- [1] Auth\n- [1.a] Login form — Shown at /login.");
    expect(r.out).toContain("Boundaries (out of scope):\n\n- [1.a.1] Email field");
    expect(r.out).toContain("### Change root [1.a.2] — modified (commit scope: auth)");
    expect(r.out).not.toContain("tests: missing");
  });

  it("implement with a path", async () => {
    const { root } = await initWithSpec(BODY);
    const r = await cli(root, "context", "2", "--for", "implement");
    expect(sections(r.out)).toEqual(["## Constitution", "## Tech stack", "## Memory", "## Preamble", "## Target", "## Changes"]);
    expect(r.out).toContain("- Target: [2] Dashboard");
    expect(r.out).toContain("No spec changes inside the target since v1; audit the target against the code.");
  });

  it("test mode: features to test and changes", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("Greeting\n", "Greeting\n    Shows the user name.\n"));
    const r = await cli(root, "context", "--for", "test");
    expect(sections(r.out)).toEqual(["## Constitution", "## Tech stack", "## Memory", "## Preamble", "## Features to test", "## Changes"]);
    expect(r.out).toContain("### [2] Dashboard\n");
    expect(r.out).not.toContain("### [1] Auth");
  });

  it("fails on an invalid path with the nearest ancestor", async () => {
    const { root } = await initWithSpec(BODY);
    const r = await cli(root, "context", "1.a.7", "--for", "test");
    expect(r.code).toBe(2);
    expect(r.err).toBe("No node 1.a.7 in v2. 1.a has children 1.a.1 to 1.a.2.");
  });

  it("prints memory, or (empty) for the bare template", async () => {
    const { root } = await initWithSpec(BODY);
    expect(read(root, "ssdd/memory.md")).toContain("## Tests");
    const empty = await cli(root, "context", "--for", "test");
    expect(empty.out).toContain("## Memory\n\nFile: ssdd/memory.md\n\n(empty)\n");
    write(root, "ssdd/memory.md", read(root, "ssdd/memory.md") + "- Unit: Vitest; run: npx vitest run\n");
    const full = await cli(root, "context", "--for", "test");
    expect(full.out).toContain("#### Tests\n- Unit: Vitest; run: npx vitest run");
    expect(full.out).not.toContain("ssdd/memory.md changed");
  });

  it("specify mode prints the whole labelled tree without tests or changes", async () => {
    const { root } = await initWithSpec(BODY);
    const r = await cli(root, "context", "--for", "specify");
    expect(r.code).toBe(0);
    expect(sections(r.out)).toEqual(["## Constitution", "## Tech stack", "## Memory", "## Preamble", "## Target"]);
    expect(r.out).toContain("- [1.a.2] Password field");
    expect(r.out).toContain("- [2] Dashboard");
    expect(r.out).not.toContain("tests:");
  });

  it("scopes removals to the path by their former parent", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("    - [1.a.1] Email field\n", "").replace("  - [2.a] Greeting\n", ""));
    const scoped = (await cli(root, "context", "1", "--for", "implement")).out;
    expect(scoped).toContain("- **removed** [1.a.1] (path in the baseline)\n  > Email field");
    expect(scoped).not.toContain("Greeting");
    const all = (await cli(root, "context", "--for", "implement")).out;
    expect(all).toContain("- **removed** [2.a] (path in the baseline)");
  });

  it("shows preamble changes and spec warnings", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("Test app.", "Test app for staff."));
    write(root, "ssdd/specs/billing/spec.md", "- Invoices\n");
    const r = (await cli(root, "context", "--for", "implement")).out;
    expect(r).toContain("### Preamble changed\n\nOld:\n> # App\n>\n> Test app.\n\nNew:\n> # App\n>\n> Test app for staff.");
    expect(r).toContain("## Warnings\n\n- ssdd/specs/billing/spec.md Feature folder specs/billing is never mounted with ref:billing");
  });

  it("fails with exit 1 on spec errors and leaves the broken file alone", async () => {
    const { root } = await initWithSpec(BODY);
    const broken = read(root, "ssdd/rootspec.md").replace("  - [2.a] Greeting", "   * [2.a] Greeting\n  * Farewell");
    write(root, "ssdd/rootspec.md", broken);
    const r = await cli(root, "context", "--for", "test");
    expect(r.code).toBe(1);
    expect(r.err).toContain("Ambiguous nesting");
    expect(r.err).toContain("Spec has errors; fix them first");
    expect(read(root, "ssdd/rootspec.md")).toBe(broken);
  });

  it("notes constitution changes", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/constitution.md", "# Constitution\n\nNew rule.\n");
    const r = await cli(root, "context", "--for", "implement");
    expect(r.out).toContain("ssdd/constitution.md changed since the baseline");
  });
});

describe("agents", () => {
  for (const a of ADAPTERS) {
    it(`renders ${a.id} commands`, () => {
      const rendered = Object.fromEntries(commandTemplates().map((t) => [a.commandPath(t.name), a.render(t)]));
      expect(Object.keys(rendered)).toHaveLength(4);
      for (const text of Object.values(rendered)) {
        expect(text).not.toMatch(/\{\{(ARGS|CLI|PREFIX)\}\}/);
        expect(text).toContain("ssdd ");
      }
      expect(rendered).toMatchSnapshot();
    });
  }

  it("uses the fixed command prefix and cli", () => {
    const t = commandTemplates();
    expect(t.map((x) => x.name)).toEqual(["ssdd-specify", "ssdd-implement", "ssdd-test", "ssdd-commit"]);
    const implement = t.find((x) => x.id === "implement")!;
    expect(implement.body).toContain("`npx ssdd context");
    expect(implement.body).toContain("/ssdd-commit");
  });

  it("installs claude skills", async () => {
    const { root } = await initWithSpec(BODY);
    expect(fs.existsSync(path.join(root, ".claude/skills/ssdd-implement/SKILL.md"))).toBe(true);
  });

  it("rejects unknown agents", async () => {
    const { root } = await initWithSpec(BODY);
    const r = await cli(root, "init", "--agents", "cursor");
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown agent "cursor". Known: claude');
  });
});
