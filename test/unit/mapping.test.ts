import { describe, expect, it } from "vitest";
import { parseSpecFile } from "../../src/spec/parser.ts";
import { loadTree } from "../../src/spec/tree.ts";
import { changePath, computeChanges, testScopes } from "../../src/version/changes.ts";

const tree = (body: string) => loadTree({ read: () => `---\nversion: 1\n---\n${body}`, listFeatures: () => [] });

function kinds(before: string, after: string) {
  const cs = computeChanges(tree(before), tree(after));
  return cs.groups.map((g) => ({
    root: `${g.root.kind} ${changePath(g.root)}`,
    changes: g.changes.map((c) => `${c.kind} ${c.oldNode?.path ?? "-"}→${c.newNode?.path ?? "-"}`),
  }));
}

const BASE = `- Auth
  - Login
    - Email field
    - Password field
  - Logout
- Dashboard
  - Greeting
`;

describe("node mapping", () => {
  it("ignores formatting-only edits", () => {
    const reformatted = "* [1] Auth\n    + [ ] Login\n        - Email field   \n        - [9] Password field\n    - Logout\n- Dashboard\n  - Greeting <!-- hi -->\n";
    expect(kinds(BASE, reformatted)).toEqual([]);
    expect(parseSpecFile(reformatted, "x").diagnostics).toEqual([]);
  });

  it("detects an insert and shifts later paths without changing them", () => {
    const after = BASE.replace("  - Logout", "  - Signup\n  - Logout");
    expect(kinds(BASE, after)).toEqual([{ root: "added 1.b", changes: ["added -→1.b"] }]);
    const cs = computeChanges(tree(BASE), tree(after));
    const logout = [...cs.mapping.oldToNew].find(([o]) => o.title === "Logout")![1];
    expect(logout).toMatchObject({ kind: "same", node: { path: "1.c" } });
  });

  it("detects a delete, grouping children under the removed root", () => {
    const after = BASE.replace("  - Login\n    - Email field\n    - Password field\n", "");
    expect(kinds(BASE, after)).toEqual([{ root: "removed 1.a", changes: ["removed 1.a→-", "removed 1.a.1→-", "removed 1.a.2→-"] }]);
  });

  it("detects a move to another parent", () => {
    const after = BASE.replace("  - Logout\n", "").replace("  - Greeting", "  - Greeting\n  - Logout");
    expect(kinds(BASE, after)).toEqual([{ root: "moved 2.b", changes: ["moved 1.b→2.b"] }]);
  });

  it("detects a reword as modified", () => {
    const after = BASE.replace("Password field", "Password fields");
    expect(kinds(BASE, after)).toEqual([{ root: "modified 1.a.2", changes: ["modified 1.a.2→1.a.2"] }]);
  });

  it("detects a body change with the same title as modified", () => {
    const after = BASE.replace("  - Greeting", "  - Greeting\n    Shows the user's first name.");
    expect(kinds(BASE, after)).toEqual([{ root: "modified 2.a", changes: ["modified 2.a→2.a"] }]);
  });

  it("detects a reorder as a move", () => {
    const after = BASE.replace("    - Email field\n    - Password field", "    - Password field\n    - Email field");
    const k = kinds(BASE, after);
    expect(k).toHaveLength(1);
    expect(k[0].changes).toHaveLength(1);
    expect(k[0].changes[0]).toMatch(/^moved/);
  });

  it("treats an unrelated rename as removed + added", () => {
    const after = BASE.replace("  - Greeting", "  - Weather widget");
    expect(kinds(BASE, after).map((g) => g.root)).toEqual(["added 2.a", "removed 2.a"]);
  });

  it("groups a changed node under a changed parent", () => {
    const after = BASE.replace("  - Login", "  - Log in").replace("Email field", "Email fields");
    expect(kinds(BASE, after)).toEqual([{ root: "modified 1.a", changes: ["modified 1.a→1.a", "modified 1.a.1→1.a.1"] }]);
  });

  it("derives deduplicated test scopes from change roots", () => {
    const after = BASE.replace("Email field", "Email address field").replace("Password field", "Password input field").replace("  - Greeting", "  - Greeting\n  - Clock");
    const cs = computeChanges(tree(BASE), tree(after));
    expect(testScopes(cs)).toEqual(["1.a", "2"]);
    const top = computeChanges(tree(BASE), tree(BASE + "- Settings\n"));
    expect(testScopes(top)).toEqual(["3"]);
  });

  it("marks everything added without a baseline", () => {
    const cs = computeChanges(loadTree({ read: () => null, listFeatures: () => [] }), tree(BASE));
    expect(cs.groups.map((g) => changePath(g.root))).toEqual(["1", "2"]);
  });
});
