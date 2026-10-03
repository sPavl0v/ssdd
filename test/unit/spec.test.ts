import { describe, expect, it } from "vitest";
import { renderFile } from "../../src/spec/formatter.ts";
import { normalizePath, toLetters } from "../../src/spec/labels.ts";
import { parseSpecFile } from "../../src/spec/parser.ts";
import { PathError, findNode, loadTree, type SpecSource } from "../../src/spec/tree.ts";

function fmt(text: string): string {
  return renderFile(parseSpecFile(text, "ssdd/rootspec.md"), null);
}

function source(files: Record<string, string>): SpecSource {
  return {
    read: (rel) => files[rel] ?? null,
    listFeatures: () =>
      Object.keys(files)
        .map((f) => /^ssdd\/specs\/([^/]+)\/spec\.md$/.exec(f)?.[1])
        .filter((x): x is string => !!x),
  };
}

const FM = "---\nssdd version: 1\nversion: 3\n---\n";

describe("labels", () => {
  it("uses spreadsheet letters after z", () => {
    expect([1, 26, 27, 28, 52, 53, 702, 703].map(toLetters)).toEqual(["a", "z", "aa", "ab", "az", "ba", "zz", "aaa"]);
  });
  it("normalizes path arguments", () => {
    expect(normalizePath("[1.A.3]")).toBe("1.a.3");
    expect(normalizePath("1.a.3")).toBe("1.a.3");
    expect(normalizePath("1.1")).toBeNull();
    expect(normalizePath("a")).toBeNull();
    expect(normalizePath("1.a.b")).toBeNull();
    expect(normalizePath("[1.an.4]")).toBe("1.an.4");
    expect(normalizePath("1000.zz.1000")).toBe("1000.zz.1000");
    expect(normalizePath("1001")).toBeNull();
    expect(normalizePath("1.aaa")).toBeNull();
  });
});

describe("formatter", () => {
  it("normalizes bullets, indentation, checkboxes and labels", () => {
    const input = `${FM}# App\n\n* [ ] First\n    + [x] Child\n        - [7.z.9] Grandchild\n- Second\n`;
    expect(fmt(input)).toBe(`${FM}# App\n\n- [1] First\n  - [1.a] Child\n    - [1.a.1] Grandchild\n- [2] Second\n`);
  });

  it("is idempotent and keeps bodies byte for byte", () => {
    const input = [
      FM + "# App",
      "",
      "- Menu",
      "  Opens on click,   closes on Esc.  ",
      "",
      "  | a | b |",
      "  |---|---|",
      "  1. ordered item",
      "  <!-- note for humans -->",
      "  - Item",
      "",
    ].join("\n");
    const once = fmt(input);
    expect(fmt(once)).toBe(once);
    expect(once).toContain("  Opens on click,   closes on Esc.  \n");
    expect(once).toContain("  | a | b |\n  |---|---|\n  1. ordered item\n  <!-- note for humans -->\n  - [1.a] Item");
  });

  it("never parses fenced code as nodes", () => {
    const input = `${FM}- Node\n  \`\`\`md\n  - not a node\n  # not a heading\n  \`\`\`\n- Other\n`;
    const pf = parseSpecFile(input, "x");
    expect(pf.nodes).toHaveLength(2);
    expect(pf.diagnostics).toEqual([]);
    expect(pf.nodes[0].body).toEqual(["```md", "- not a node", "# not a heading", "```"]);
  });

  it("keeps a leading [..] that is not a path as title text", () => {
    const pf = parseSpecFile(`${FM}- [WIP] Draft\n- [1.a] [beta] Flag\n`, "x");
    expect(pf.nodes.map((n) => n.title)).toEqual(["[WIP] Draft", "[beta] Flag"]);
  });

  it("rewrites stale labels by position", () => {
    expect(fmt(`${FM}- [1] A\n- [4] B\n`)).toBe(`${FM}- [1] A\n- [2] B\n`);
  });

  it("converts tabs with a width of 2", () => {
    expect(fmt(`${FM}- A\n\t- B\n\t\t- C\n`)).toBe(`${FM}- [1] A\n  - [1.a] B\n    - [1.a.1] C\n`);
  });

  it("normalizes mixed but unambiguous indentation", () => {
    expect(fmt(`${FM}- A\n    - B\n    - C\n- D\n   - E\n`)).toBe(`${FM}- [1] A\n  - [1.a] B\n  - [1.b] C\n- [2] D\n  - [2.a] E\n`);
  });

  it("errors on ambiguous nesting", () => {
    const pf = parseSpecFile(`${FM}- A\n    - B\n  - C\n`, "x");
    expect(pf.fatal).toBe(true);
    expect(pf.diagnostics[0]).toMatchObject({ code: "ambiguous-indent", line: 7 });
  });

  it("errors on a heading after the first node", () => {
    const pf = parseSpecFile(`${FM}- A\n## Section\n- B\n`, "x");
    expect(pf.diagnostics.map((d) => d.code)).toEqual(["heading-after-node"]);
  });

  it("keeps fenced code in the preamble and multi-line comments in bodies", () => {
    const text = "# App\n\n```\n- not a node\n```\n\n- [1] A\n  <!-- note\n  - not a node either -->\n  - [1.a] B\n";
    expect(fmt(text)).toBe(text);
    expect(parseSpecFile(text, "ssdd/rootspec.md").nodes[0].children).toHaveLength(1);
  });

  it("writes the mount comment on feature files", () => {
    const pf = parseSpecFile("<!-- ssdd: mounted at [9] -->\n\n- Login\n  - Form\n", "ssdd/specs/auth/spec.md", { feature: true });
    expect(renderFile(pf, "1")).toBe("<!-- ssdd: mounted at [1] -->\n\n- [1.a] Login\n  - [1.a.1] Form\n");
  });
});

describe("tree", () => {
  it("expands refs and continues the global path", () => {
    const t = loadTree(
      source({
        "ssdd/rootspec.md": `${FM}- Auth ref:auth\n- Dashboard\n`,
        "ssdd/specs/auth/spec.md": "- Login\n  - Form ref:login-form\n",
        "ssdd/specs/login-form/spec.md": "- Email field\n",
      }),
    );
    expect(t.diagnostics).toEqual([]);
    expect(findNode(t, "1.a.1.a", 4).title).toBe("Email field");
    expect(findNode(t, "1.a.1.a", 4).file).toBe("ssdd/specs/login-form/spec.md");
    expect(t.mounts.get("login-form")).toBe("1.a.1");
  });

  it.each([
    ["missing feature file", { "ssdd/rootspec.md": `${FM}- Auth ref:auth\n` }, "ref-missing", "error"],
    ["unused feature folder", { "ssdd/rootspec.md": `${FM}- A\n`, "ssdd/specs/x/spec.md": "- X\n" }, "feature-unused", "warning"],
    ["mounted twice", { "ssdd/rootspec.md": `${FM}- A ref:x\n- B ref:x\n`, "ssdd/specs/x/spec.md": "- X\n" }, "ref-twice", "error"],
    ["ref cycle", { "ssdd/rootspec.md": `${FM}- A ref:x\n`, "ssdd/specs/x/spec.md": "- X ref:y\n", "ssdd/specs/y/spec.md": "- Y ref:x\n" }, "ref-cycle", "error"],
    ["ref with inline children", { "ssdd/rootspec.md": `${FM}- A ref:x\n  - Child\n`, "ssdd/specs/x/spec.md": "- X\n" }, "ref-children", "error"],
    ["empty spec", { "ssdd/rootspec.md": `${FM}# App\n` }, "empty-spec", "warning"],
    ["ref that is not a slug", { "ssdd/rootspec.md": `${FM}- A ref:Not_A_Slug\n` }, "bad-ref", "error"],
    ["unclosed front matter", { "ssdd/rootspec.md": "---\nversion: 1\n- A\n" }, "front-matter", "error"],
    ["non-integer version", { "ssdd/rootspec.md": "---\nversion: 1.5\n---\n- A\n" }, "bad-version", "error"],
    ["depth over 8", { "ssdd/rootspec.md": FM + Array.from({ length: 9 }, (_, i) => `${"  ".repeat(i)}- L${i + 1}`).join("\n") + "\n" }, "too-deep", "warning"],
  ])("reports %s", (_name, files, code, level) => {
    const t = loadTree(source(files as Record<string, string>));
    expect(t.diagnostics.find((d) => d.code === code)).toMatchObject({ level });
  });

  it("labels letters up to zz and numbers up to 1000, then reports too many siblings", () => {
    const kids = (n: number, indent: string) => Array.from({ length: n }, (_, i) => `${indent}- N${i}\n`).join("");
    const ok = loadTree(source({ "ssdd/rootspec.md": `${FM}- A\n${kids(702, "  ")}` }));
    expect(ok.diagnostics.filter((d) => d.level === "error")).toEqual([]);
    expect(ok.roots[0].children[39].path).toBe("1.an");
    expect(ok.roots[0].children[701].path).toBe("1.zz");
    const over = loadTree(source({ "ssdd/rootspec.md": `${FM}- A\n${kids(703, "  ")}` }));
    expect(over.diagnostics.find((d) => d.code === "too-many-siblings")?.message).toBe(
      "[1] has 703 children; the most is 702 (a to zz). Group them under new parent nodes",
    );
    const top = loadTree(source({ "ssdd/rootspec.md": `${FM}${kids(1001, "")}` }));
    expect(top.roots[999].path).toBe("1000");
    expect(top.diagnostics.find((d) => d.code === "too-many-siblings")?.message).toBe(
      "The spec has 1001 children; the most is 1000 (1 to 1000). Group them under new parent nodes",
    );
  });
  it("explains a missing path with the nearest ancestor", () => {
    const t = loadTree(source({ "ssdd/rootspec.md": `${FM}- A\n  - B\n  - C\n` }));
    expect(() => findNode(t, "1.c", 4)).toThrow(new PathError("No node 1.c in v4. 1 has children 1.a to 1.b."));
    expect(() => findNode(t, "3", 4)).toThrow("Top-level nodes are 1.");
  });

  it("treats a path to a ref node as the whole feature", () => {
    const t = loadTree(source({ "ssdd/rootspec.md": `${FM}- Auth ref:auth\n`, "ssdd/specs/auth/spec.md": "- A\n- B\n" }));
    expect(findNode(t, "1", 4).children.map((c) => c.path)).toEqual(["1.a", "1.b"]);
  });
});
