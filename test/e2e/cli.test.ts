import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cli, initWithSpec, makeRepo, read, sh, tmpDir, write } from "../helpers.ts";

const BODY = "- Auth\n  - Login\n";

describe("ssdd init", () => {
  it("refuses outside a git repo unless --yes, then runs git init", async () => {
    const dir = tmpDir();
    const no = await cli(dir, "init");
    expect(no.code).toBe(2);
    expect(no.err).toContain("Not a git repository");
    expect(fs.existsSync(path.join(dir, "ssdd"))).toBe(false);

    const yes = await cli(dir, "init", "--yes");
    expect(yes.code).toBe(0);
    expect(fs.existsSync(path.join(dir, ".git"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "ssdd/rootspec.md"))).toBe(true);
  });

  it("keeps existing files on a second run and refreshes the skills", async () => {
    const { root } = makeRepo();
    await cli(root, "init");
    write(root, "ssdd/ssdd.config.json", '{ "git": { "push": false } }\n');
    write(root, ".claude/skills/ssdd-test/SKILL.md", "old\n");
    const r = await cli(root, "init");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/kept\s+ssdd\/rootspec\.md/);
    expect(r.out).toMatch(/kept\s+ssdd\/ssdd\.config\.json/);
    expect(read(root, "ssdd/ssdd.config.json")).toBe('{ "git": { "push": false } }\n');
    expect(read(root, ".claude/skills/ssdd-test/SKILL.md")).toContain("name: \"ssdd-test\"");
  });
});

describe("project and config", () => {
  it("finds ssdd/ from a subdirectory", async () => {
    const { root } = await initWithSpec(BODY);
    fs.mkdirSync(path.join(root, "src/deep"), { recursive: true });
    const r = await cli(path.join(root, "src/deep"), "context", "--for", "specify");
    expect(r.code).toBe(0);
    expect(r.out).toContain("- [1] Auth");
  });

  it("asks for init when there is no ssdd/ folder", async () => {
    const { root } = makeRepo();
    const r = await cli(root, "context", "--for", "test");
    expect(r.code).toBe(2);
    expect(r.err).toBe("No ssdd/ folder found; run ssdd init");
  });

  it.each([
    ["invalid JSON", "{ nope", "ssdd/ssdd.config.json: invalid JSON"],
    ["a schema error", '{ "git": { "push": "yes" } }', "ssdd/ssdd.config.json: git.push:"],
    ["a version mismatch", '{ "ssddVersion": ">=99.0.0" }', 'does not match "ssddVersion": ">=99.0.0"'],
  ])("fails with exit 2 on %s", async (_, config, message) => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/ssdd.config.json", config);
    const r = await cli(root, "context", "--for", "test");
    expect(r.code).toBe(2);
    expect(r.err).toContain(message);
  });

  it("honours git.push: false", async () => {
    const { root, remote } = makeRepo();
    await cli(root, "init");
    write(root, "ssdd/ssdd.config.json", '{ "git": { "push": false } }\n');
    const c = await cli(root, "commit", "-m", "init");
    expect(c.out).toContain("not pushed (push disabled)");
    expect(sh(remote!, "git", ["for-each-ref"])).toBe("");
  });
});

describe("cli usage", () => {
  it("exits 0 for help and version, 2 for unknown commands and bad options", async () => {
    const { root } = makeRepo();
    expect((await cli(root, "--help")).code).toBe(0);
    expect((await cli(root, "--version")).code).toBe(0);
    expect((await cli(root, "frobnicate")).code).toBe(2);
    expect((await cli(root, "context")).code).toBe(2);
    expect((await cli(root, "context", "--for", "deploy")).code).toBe(2);
  });

  it("rejects a malformed path", async () => {
    const { root } = await initWithSpec(BODY);
    const r = await cli(root, "context", "1.1", "--for", "test");
    expect(r.code).toBe(2);
    expect(r.err).toBe('Invalid path "1.1"; expected e.g. 1.a.3');
  });

  it("needs exactly one of -m or -F", async () => {
    const { root } = await initWithSpec(BODY);
    expect((await cli(root, "commit")).code).toBe(2);
    expect((await cli(root, "commit", "-m", "a", "-F", "f")).code).toBe(2);
    expect((await cli(root, "commit", "-m", "  ")).err).toBe("Commit message is empty");
  });
});

describe("ssdd commit edge cases", () => {
  it("reads a multi-line message from a file", async () => {
    const { root } = await initWithSpec(BODY);
    const msg = path.join(tmpDir(), "msg.txt");
    fs.writeFileSync(msg, "feat(auth): logout\n\n- 1.b Logout: added\n");
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md") + "  - Logout\n");
    const c = await cli(root, "commit", "-F", msg);
    expect(c.code).toBe(0);
    expect(sh(root, "git", ["log", "-1", "--format=%B"])).toBe("feat(auth): logout\n\n- 1.b Logout: added\n\n");
  });

  it("adds front matter with the version when rootspec.md has none", async () => {
    const { root } = makeRepo();
    await cli(root, "init");
    write(root, "ssdd/rootspec.md", "# App\n\n- Auth\n");
    const c = await cli(root, "commit", "-m", "init");
    expect(c.code).toBe(0);
    expect(read(root, "ssdd/rootspec.md")).toBe("---\nssdd: 1\nversion: 1\n---\n# App\n\n- [1] Auth\n");
  });

  it("restores the version when git rejects the commit, so the retry does not skip a number", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, ".git/hooks/pre-commit", "#!/bin/sh\necho hook says no >&2\nexit 1\n");
    fs.chmodSync(path.join(root, ".git/hooks/pre-commit"), 0o755);
    write(root, "x.txt", "x\n");
    const bad = await cli(root, "commit", "-m", "feat: x");
    expect(bad.code).toBe(1);
    expect(bad.err).toContain("hook says no");
    expect(bad.err).not.toContain("    at ");
    expect(read(root, "ssdd/rootspec.md")).toContain("version: 1");

    fs.rmSync(path.join(root, ".git/hooks/pre-commit"));
    const ok = await cli(root, "commit", "-m", "feat: x");
    expect(ok.out).toContain("ssdd v2");
  });

  it("refuses during a merge", async () => {
    const { root } = await initWithSpec(BODY);
    const head = sh(root, "git", ["rev-parse", "HEAD"]).trim();
    write(root, ".git/MERGE_HEAD", head + "\n");
    const c = await cli(root, "commit", "-m", "x");
    expect(c.code).toBe(1);
    expect(c.err).toContain("merge, rebase or cherry-pick is in progress");
  });
});
