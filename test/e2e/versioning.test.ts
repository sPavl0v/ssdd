import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { cli, initWithSpec, makeRepo, read, sh, spec, write } from "../helpers.ts";

const BODY = "- Auth\n  - Login\n    - Email field\n  - Logout\n";

describe("ssdd commit", () => {
  it("init in an empty repo prints the first commit message; commit gives v1 and pushes it, without git tags", async () => {
    const { root, remote } = makeRepo();
    const init = await cli(root, "init");
    expect(init.code).toBe(0);
    expect(init.out).toContain("chore(ssdd): initialize ssdd spec");
    expect(read(root, "ssdd/rootspec.md")).toContain("version: 0");
    expect(read(root, "ssdd/constitution.md")).toBe(fs.readFileSync(new URL("../../templates/spec/constitution.md", import.meta.url), "utf8"));

    const c = await cli(root, "commit", "-m", "chore(ssdd): initialize ssdd spec");
    expect(c.code).toBe(0);
    expect(c.out).toMatch(/^ssdd v1 .* main$/m);
    expect(c.out).toContain("pushed to origin/main");
    expect(read(root, "ssdd/rootspec.md")).toContain("version: 1");
    expect(sh(root, "git", ["log", "-1", "--format=%B"])).toBe("chore(ssdd): initialize ssdd spec\n\n");
    expect(sh(remote!, "git", ["show", "main:ssdd/rootspec.md"])).toContain("version: 1");
    expect(sh(root, "git", ["tag", "-l"])).toBe("");
    expect(sh(remote!, "git", ["tag", "-l"])).toBe("");
  });

  it("bumps once per commit and reports nothing to commit without a bump", async () => {
    const { root } = await initWithSpec(BODY);
    const again = await cli(root, "commit", "-m", "noop");
    expect(again.out).toBe("Nothing to commit");
    expect(read(root, "ssdd/rootspec.md")).toContain("version: 1");

    write(root, "src/a.ts", "export {};\n");
    const c = await cli(root, "commit", "-m", "feat: a");
    expect(c.out).toContain("ssdd v2");
    expect(read(root, "ssdd/rootspec.md")).toContain("version: 2");
  });

  it("formats spec files as part of the commit", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("  - Logout", "  * Logout"));
    await cli(root, "commit", "-m", "style");
    expect(read(root, "ssdd/rootspec.md")).toContain("  - [1.b] Logout");
  });

  it("increments the version in rootspec.md and changes only its number", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("\nversion: 1", "\nowner: team-a\nversion:   7"));
    const c = await cli(root, "commit", "-m", "feat: x");
    expect(c.out).toContain("ssdd v8");
    expect(read(root, "ssdd/rootspec.md")).toMatch(/^---\nssdd version: 1\nowner: team-a\nversion:   8\n---\n/);
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
    expect(sh(remote!, "git", ["for-each-ref"])).toBe("");
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
    const ctx = await cli(root, "context", "--for", "implement");
    expect(ctx.out).toContain("No spec changes since v1.");
  });

  it("includes spec edits committed by hand after the baseline", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("  - [1.b] Logout", "  - [1.b] Signup\n  - [1.c] Logout"));
    sh(root, "git", ["commit", "-qam", "hand edit"]);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md") + "- Settings\n");
    const ctx = (await cli(root, "context", "--for", "implement")).out;
    expect(ctx.match(/^### Change root \[[^\]]+\] — \w+/gm)).toEqual(["### Change root [1.b] — added", "### Change root [2] — added"]);
  });

  it("finds the baseline by the version line after a squash with a new message", async () => {
    const { root } = await initWithSpec(BODY);
    const v1 = sh(root, "git", ["rev-parse", "HEAD"]).trim();
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md") + "- Settings\n");
    await cli(root, "commit", "-m", "feat: settings", "--no-push");
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md") + "- Help\n");
    await cli(root, "commit", "-m", "feat: help", "--no-push");
    sh(root, "git", ["reset", "-q", "--soft", v1]);
    sh(root, "git", ["commit", "-qm", "Squashed PR #12"]);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md") + "- Billing\n");
    const ctx = (await cli(root, "context", "--for", "implement")).out;
    expect(ctx).toMatch(/- Baseline: v3 \([0-9a-f]{7}\)\n/);
    expect(ctx.match(/^### Change root \[[^\]]+\] — \w+/gm)).toEqual(["### Change root [4] — added"]);
  });

  it("after merging parallel branches, only changes made after both are pending", async () => {
    const { root } = await initWithSpec(BODY + "- Dashboard\n  - Greeting\n- Footer\n");
    sh(root, "git", ["checkout", "-qb", "a"]);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("  - [2.a] Greeting\n", "  - [2.a] Greeting\n  - Chart\n"));
    await cli(root, "commit", "-m", "feat: settings", "--no-push");
    sh(root, "git", ["checkout", "-qb", "b", "main"]);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("  - [1.b] Logout\n", "  - [1.b] Logout\n  - Signup\n"));
    await cli(root, "commit", "-m", "feat: signup", "--no-push");
    sh(root, "git", ["checkout", "-q", "a"]);
    sh(root, "git", ["merge", "-q", "--no-edit", "b"]);
    expect(read(root, "ssdd/rootspec.md")).toContain("version: 2\n");

    const merged = (await cli(root, "context", "--for", "implement")).out;
    expect(merged).toMatch(/- Baseline: v2 \([0-9a-f]{7}\) \+ v2 \([0-9a-f]{7}\)\n/);
    expect(merged).toContain("No spec changes since v2.");

    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md") + "- Help\n");
    const after = (await cli(root, "context", "--for", "implement")).out;
    expect(after.match(/^### Change root \[[^\]]+\] — \w+/gm)).toEqual(["### Change root [4] — added"]);
    const c = await cli(root, "commit", "-m", "feat: help", "--no-push");
    expect(c.out).toContain("ssdd v3");
  });
});
