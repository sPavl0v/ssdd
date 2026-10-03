import { describe, expect, it } from "vitest";
import { cli, initWithSpec, read, write } from "../helpers.ts";

const BODY = `- Header
  - Avatar menu
    - Item "Profile" opens /profile
    - Menu closes on Esc
  - Notification bell
- Footer
  - Links
- Settings
  - Theme
`;

function features(ctx: string): string[] {
  const part = ctx.split("## Features to test")[1]?.split("\n## ")[0] ?? "";
  return [...part.matchAll(/^### \[(\d+)\] /gm)].map((m) => m[1]);
}

describe("test context", () => {
  it("runs the whole suite when nothing changed", async () => {
    const { root } = await initWithSpec(BODY);
    const r = await cli(root, "context", "--for", "test");
    expect(r.code).toBe(0);
    expect(r.out).toContain("No spec changes since v1. Run the whole test suite.");
    expect(r.out).not.toContain("tests:");
  });

  it("lists the top-level features of the changes with their whole subtrees", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("Menu closes on Esc", "Menu closes on Esc and outside click").replace("  - [3.a] Theme\n", ""));
    const r = (await cli(root, "context", "--for", "test")).out;
    expect(features(r)).toEqual(["1", "3"]);
    expect(r).toContain("Run every unit and integration test of each feature below.");
    expect(r).toContain("- [1] Header\n  - [1.a] Avatar menu\n    - [1.a.1] Item \"Profile\" opens /profile");
    expect(r).toContain("Menu closes on Esc and outside click");
    expect(r).not.toContain("Breadcrumb");
    expect(r).toContain("- **removed** [3.a] (path in the baseline)");
    expect(r).not.toMatch(/\[ssdd:/);
  });

  it("with a path, runs the feature of that path", async () => {
    const { root } = await initWithSpec(BODY);
    const r = (await cli(root, "context", "1.a", "--for", "test")).out;
    expect(r).toContain("- Target: [1.a] Avatar menu");
    expect(features(r)).toEqual(["1"]);
    expect(r).toContain("No spec changes inside the target since v1; run the tests of its feature.");
  });

  it("has nothing to run when a whole feature was removed", async () => {
    const { root } = await initWithSpec(BODY);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("- [2] Footer\n  - [2.a] Links\n", ""));
    const r = (await cli(root, "context", "--for", "test")).out;
    expect(features(r)).toEqual([]);
    expect(r).toContain("(none: only whole features were removed, see Changes)");
    expect(r).toContain("- **removed** [2] (path in the baseline)");
  });

  it("never rewrites test files", async () => {
    const { root } = await initWithSpec(BODY);
    const test = 'it("[ssdd:1.a@v1#abcdef] x", () => {});\n';
    write(root, "tests/x.test.ts", test);
    write(root, "ssdd/rootspec.md", read(root, "ssdd/rootspec.md").replace("- [1] Header\n", "- Banner\n- [1] Header\n"));
    await cli(root, "context", "--for", "test");
    await cli(root, "commit", "-m", "feat: banner");
    expect(read(root, "tests/x.test.ts")).toBe(test);
  });
});
