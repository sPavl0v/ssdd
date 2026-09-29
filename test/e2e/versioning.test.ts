import { describe, expect, it } from "vitest";
import { cli, initWithSpec, makeRepo, read, sh, spec, write } from "../helpers.ts";

const BODY = "- Auth\n  - Login\n    - Email field\n  - Logout\n";

describe("ssdd commit", () => {
  it("init in an empty repo prints the first commit message; commit gives v1 and pushes ssdd-v1", async () => {
    const { root, remote } = makeRepo();
    const init = await cli(root, "init");
    expect(init.code).toBe(0);
    expect(init.out).toContain("chore(ssdd): initialize ssdd spec");
    expect(read(root, "ssdd/rootspec.md")).toContain("version: 0");

    const c = await cli(root, "commit", "-m", "chore(ssdd): initialize ssdd spec");
    expect(c.code).toBe(0);
    expect(c.out).toMatch(/ssdd v1 .* main .* tag ssdd-v1/);
    expect(c.out).toContain("pushed to origin/main");
    expect(read(root, "ssdd/rootspec.md")).toContain("version: 1");
    expect(sh(root, "git", ["log", "-1", "--format=%B"])).toContain("Ssdd-Version: 1");
    expect(sh(remote!, "git", ["tag", "-l"]).trim()).toBe("ssdd-v1");
  });

  it("bumps once per commit and reports nothing to commit without a bump", async () => {
    const { root } = await initWithSpec(BODY);
    const again = await cli(root, "commit", "-m", "noop");
    expect(again.out).toBe("Nothing to commit");
    expect(read(root, "ssdd/rootspec.md")).toContain("version: 1");

    write(root, "src/a.ts", "export {};\n");
    const c = await cli(root, "commit", "-m", "feat: a");
    expect(c.out).toContain("ssdd v2");
    expect(sh(root, "git", ["tag", "-l"]).trim().split("\n")).toEqual(["ssdd-v1", "ssdd-v2"]);
  });

  it("formats spec files as part of the commit", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("  - Logout", "  * Logout"));
    await cli(root, "commit", "-m", "style");
    expect(read(root, "ssdd/rootspec.md")).toContain("  - [1.b] Logout");
  });

  it("takes the next number above the highest tag on the remote", async () => {
    const { root, remote } = await initWithSpec(BODY);
    // Another branch already pushed v5.
    sh(root, "git", ["tag", "-a", "ssdd-v5", "-m", "x"]);
    sh(root, "git", ["push", "-q", "origin", "ssdd-v5"]);
    sh(root, "git", ["tag", "-d", "ssdd-v5"]);
    write(root, "x.txt", "x\n");
    const c = await cli(root, "commit", "-m", "feat: x");
    expect(c.out).toContain("ssdd v6");
    expect(sh(remote!, "git", ["tag", "-l"])).toContain("ssdd-v6");
  });

  it("keeps commit and tag local without a remote and warns", async () => {
    const { root } = makeRepo({ remote: false });
    await cli(root, "init");
    const c = await cli(root, "commit", "-m", "init");
    expect(c.code).toBe(0);
    expect(c.out).toContain('warning: no remote "origin"');
  });

  it("respects --no-push", async () => {
    const { root, remote } = makeRepo();
    await cli(root, "init");
    const c = await cli(root, "commit", "-m", "init", "--no-push");
    expect(c.out).toContain("not pushed");
    expect(sh(remote!, "git", ["tag", "-l"]).trim()).toBe("");
  });

  it("refuses on detached HEAD", async () => {
    const { root } = await initWithSpec(BODY);
    sh(root, "git", ["checkout", "-q", "--detach"]);
    write(root, "x.txt", "x\n");
    const c = await cli(root, "commit", "-m", "x");
    expect(c.code).toBe(1);
    expect(c.err).toContain("Detached HEAD");
  });

  it("fails with exit 1 when the push is rejected", async () => {
    const { root, remote } = await initWithSpec(BODY);
    // Someone else pushes to main first.
    const other = sh(remote!, "git", ["rev-parse", "main"]).trim();
    const clone = remote + "-clone";
    sh(root, "git", ["clone", "-q", remote!, clone]);
    sh(clone, "git", ["-c", "user.email=o@o", "-c", "user.name=o", "commit", "-q", "--allow-empty", "-m", "other"]);
    sh(clone, "git", ["push", "-q", "origin", "main"]);
    expect(other).toBeTruthy();
    write(root, "x.txt", "x\n");
    const c = await cli(root, "commit", "-m", "x");
    expect(c.code).toBe(1);
    expect(c.err).toContain("git pull --rebase");
  });

  it("refuses to commit a spec with errors", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", spec(1, "- A ref:missing\n"));
    const c = await cli(root, "commit", "-m", "x");
    expect(c.code).toBe(1);
    expect(c.err).toContain("ref:missing points to missing");
  });
});

describe("change detection", () => {
  it("formatting-only edits give an empty change set", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace(/- \[[^\]]+\] /g, "* ").replace("Email field", "Email field   <!-- todo -->"));
    const d = await cli(root, "diff", "--json");
    expect(JSON.parse(d.out).groups).toEqual([]);
    const ctx = await cli(root, "context", "--for", "implement");
    expect(ctx.out).toContain("No spec changes since v1.");
  });

  it("includes spec edits committed by hand after the baseline", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("  - [1.b] Logout", "  - [1.b] Signup\n  - [1.c] Logout"));
    sh(root, "git", ["commit", "-qam", "hand edit"]);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md") + "- Settings\n");
    const d = JSON.parse((await cli(root, "diff", "--json")).out);
    expect(d.groups.map((g: { root: string; kind: string }) => `${g.kind} ${g.root}`)).toEqual(["added 1.b", "added 2"]);
  });

  it("falls back to the Ssdd-Version trailer when tags are missing", async () => {
    const { root } = await initWithSpec(BODY);
    sh(root, "git", ["tag", "-d", "ssdd-v1"]);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md") + "- Settings\n");
    const ctx = await cli(root, "context", "--for", "implement");
    expect(ctx.out).toMatch(/Baseline: [0-9a-f]{40}/);
    expect(ctx.out).toContain("### Change root [2] — added");
  });

  it("history lists versions newest first with counts", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("Email field", "Email fields") + "- Settings\n");
    await cli(root, "commit", "-m", "feat: settings");
    const h = JSON.parse((await cli(root, "history", "--json")).out);
    expect(h.map((e: { version: number; subject: string }) => [e.version, e.subject])).toEqual([
      [2, "feat: settings"],
      [1, "feat: first spec"],
    ]);
    expect(h[0].counts).toEqual({ added: 1, modified: 1, moved: 0, removed: 0 });
  });

  it("tree --version reads an old tree from git", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("- [1] Auth", "- [1] Authentication"));
    await cli(root, "commit", "-m", "rename");
    expect((await cli(root, "tree", "--version", "1", "--depth", "1")).out).toMatch(/\[1\] Auth$/m);
    expect((await cli(root, "tree", "--depth", "1")).out).toContain("[1] Authentication");
  });
});
