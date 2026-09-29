import { describe, expect, it } from "vitest";
import { cli, FAKE_RUNNER, initWithSpec, read, sh, write } from "../helpers.ts";

const BODY = `- Header
  - Shows user avatar and display name
  - Avatar menu
    - Item "Profile" opens /profile
    - Item "Sign out" ends session
    - Menu closes on Esc
    - Keyboard navigation
  - Notification bell
`;

function configure(root: string) {
  const cfg = JSON.parse(read(root, "ssdd/ssdd.config.json"));
  cfg.test.runners = [
    {
      name: "unit",
      globs: ["tests/**/*.fake"],
      tagStyle: "name",
      command: `node ${JSON.stringify(FAKE_RUNNER)} "{filter}" .ssdd-out/unit.xml`,
      junit: ".ssdd-out/unit.xml",
    },
  ];
  write(root, "ssdd/ssdd.config.json", JSON.stringify(cfg, null, 2));
}

async function tagFor(root: string, p: string): Promise<string> {
  const show = JSON.parse((await cli(root, "show", p, "--json")).out);
  const version = Number(/version: (\d+)/.exec(read(root, "ssdd/rootspec.md"))![1]) + 1;
  return `[ssdd:${p}@v${version}#${show.fingerprint}]`;
}

describe("ssdd test", () => {
  it("runs tagged tests and prints the tree report", async () => {
    const { root } = await initWithSpec(BODY);
    configure(root);
    const lines = [
      `PASS ${await tagFor(root, "1.a")} avatar`,
      `PASS ${await tagFor(root, "1.b.1")} profile`,
      `FAIL ${await tagFor(root, "1.b.2")} sign out :: expected URL /login, got /`,
      `PASS ${await tagFor(root, "1.b.2")} sign out clears cookie`,
      `PASS ${await tagFor(root, "1.b.3")} esc`,
      `SKIP ${await tagFor(root, "1.c")} bell :: needs push service`,
    ];
    write(root, "tests/header.fake", lines.join("\n") + "\n");
    const r = await cli(root, "test", "1");
    expect(r.code).toBe(1);
    const out = r.out.replace(/\s+$/gm, "");
    expect(out).toContain("ssdd test 1  ·  spec v1  ·  6 leaves  ·  6 tests");
    expect(out).toMatch(/\[1\]\s+Header\s+✗  3\/6/);
    expect(out).toMatch(/\[1\.b\]\s+Avatar menu\s+✗  2\/4/);
    expect(out).toMatch(/\[1\.b\.2\]\s+Item "Sign out" ends session\s+✗  expected URL \/login, got \//);
    expect(out).toMatch(/\[1\.b\.4\]\s+Keyboard navigation\s+\?  no test/);
    expect(out).toMatch(/\[1\.c\]\s+Notification bell\s+-  skipped: needs push service/);
    expect(out).toContain("3 passed · 1 failed · 1 skipped · 1 missing · 0 stale · 0 orphaned        exit 1");

    const json = JSON.parse((await cli(root, "test", "1.b.1", "--json")).out);
    expect(json).toMatchObject({ exitCode: 0, counts: { passed: 1, tests: 1 } });
    expect((await cli(root, "test", "1.b.3", "--strict")).code).toBe(0);
    expect((await cli(root, "test", "1.b.4", "--strict")).code).toBe(1);
  });

  it("exits 2 when a runner produces no JUnit output", async () => {
    const { root } = await initWithSpec(BODY);
    const cfg = JSON.parse(read(root, "ssdd/ssdd.config.json"));
    cfg.test.runners = [{ name: "broken", globs: ["tests/**/*.fake"], command: "echo boom; exit 3", junit: ".ssdd-out/none.xml" }];
    write(root, "ssdd/ssdd.config.json", JSON.stringify(cfg));
    write(root, "tests/a.fake", `PASS ${await tagFor(root, "1.a")} a\n`);
    const r = await cli(root, "test");
    expect(r.code).toBe(2);
    expect(r.err).toContain('Runner "broken" exited 3 without JUnit output');
    expect(r.err).toContain("boom");
  });

  it("relinks tags after an insert above a tested leaf, then marks it stale after a reword", async () => {
    const { root } = await initWithSpec(BODY);
    configure(root);
    write(root, "tests/esc.fake", `PASS ${await tagFor(root, "1.b.3")} esc\n`);
    await cli(root, "commit", "-m", "test: esc");
    expect(read(root, "tests/esc.fake")).toMatch(/\[ssdd:1\.b\.3@v2#/);

    // Insert a node above the tested leaf: its path shifts to 1.b.4.
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace('    - [1.b.3] Menu closes', '    - Item "Settings" opens /settings\n    - [1.b.3] Menu closes'));
    const s = await cli(root, "sync");
    expect(s.out).toContain("relinked: tests/esc.fake:1 [ssdd:1.b.3@v2#");
    expect(read(root, "tests/esc.fake")).toMatch(/\[ssdd:1\.b\.4@v3#[0-9a-f]{6}\] esc/);
    const ok = await cli(root, "test", "1.b.4");
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/\[1\.b\.4\]\s+Menu closes on Esc\s+✓\s*$/m);

    // Reword the leaf: the tag stays, the test shows as stale.
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("Menu closes on Esc", "Menu closes on Esc and outside click"));
    const stale = await cli(root, "test", "1.b.4");
    expect(stale.out).toMatch(/✓  ~ stale since v3/);
    expect(stale.code).toBe(0);
    expect((await cli(root, "test", "1.b.4", "--strict")).code).toBe(1);
  });

  it("marks tags of removed nodes as orphaned", async () => {
    const { root } = await initWithSpec(BODY);
    configure(root);
    write(root, "tests/kbd.fake", `PASS ${await tagFor(root, "1.b.4")} kbd\n`);
    await cli(root, "commit", "-m", "test: kbd");
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("    - [1.b.4] Keyboard navigation\n", ""));
    await cli(root, "sync");
    expect(read(root, "tests/kbd.fake")).toMatch(/\[ssdd:removed@v3#[0-9a-f]{6}\]/);
    const r = await cli(root, "test");
    expect(r.out).toContain("1 orphaned");
    const ctx = await cli(root, "context", "--for", "test");
    expect(ctx.out).toContain("Orphaned tests (delete them)");
  });

  it("sync --check reports pending work without writing", async () => {
    const { root } = await initWithSpec(BODY);
    const before = read(root, "ssdd/rootspec.md");
    write(root, "ssdd/rootspec.md", before.replace("  - [1.c] Notification bell", "  * Notification bell"));
    const r = await cli(root, "sync", "--check");
    expect(r.code).toBe(1);
    expect(r.out).toContain("needs formatting: ssdd/rootspec.md");
    expect(read(root, "ssdd/rootspec.md")).toContain("  * Notification bell");
    expect(sh(root, "git", ["status", "--porcelain"])).toContain("ssdd/rootspec.md");
  });
});
