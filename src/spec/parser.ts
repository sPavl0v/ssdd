import { PATH_GRAMMAR } from "./labels.ts";
import type { Diagnostic, ParsedFile, RawNode } from "./types.ts";

// Line-based parser (section 3). It never builds a Markdown AST, so bodies survive formatting byte for byte.

const BULLET = /^[-*+](?:[ \t]+(.*))?$/;
const HEADING = /^#{1,6}(\s|$)/;
const FENCE = /^(`{3,}|~{3,})/;
const CHECKBOX = /^\[[ xX]\](?:\s+|$)/;
const LABEL = /^\[([^\]\s]*)\](?:\s+|$)/;
const REF = /(?:^|\s)ref:(\S+)\s*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MOUNT_COMMENT = /^<!--\s*ssdd: mounted at .*-->\s*$/;

interface Frame {
  node: RawNode;
  indent: number;
  contentCol: number;
}

function expandTabs(line: string): string {
  const m = /^[ \t]*/.exec(line)![0];
  if (!m.includes("\t")) return line;
  return m.replace(/\t/g, "  ") + line.slice(m.length);
}

function leading(line: string): number {
  return /^ */.exec(line)![0].length;
}

function dedent(line: string, col: number): string {
  return line.slice(Math.min(leading(line), col));
}

export function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Parse a bullet's content into title, ref. Checkbox and label prefixes are dropped. */
export function parseTitle(content: string): { title: string; ref?: string; badRef?: string } {
  let t = content.trim();
  for (let i = 0; i < 2; i++) {
    const cb = CHECKBOX.exec(t);
    if (cb) t = t.slice(cb[0].length);
    const lb = LABEL.exec(t);
    if (lb && PATH_GRAMMAR.test(lb[1].toLowerCase())) t = t.slice(lb[0].length);
  }
  const r = REF.exec(t);
  if (r) {
    const title = t.slice(0, r.index).trimEnd();
    if (SLUG.test(r[1])) return { title, ref: r[1] };
    return { title: t, badRef: r[1] };
  }
  return { title: t.trimEnd() };
}

export function parseSpecFile(text: string, file: string, opts: { feature?: boolean } = {}): ParsedFile {
  const lines = splitLines(text);
  const diagnostics: Diagnostic[] = [];
  let fatal = false;
  let i = 0;

  let frontMatter: string[] | null = null;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end < 0) {
      diagnostics.push({ level: "error", code: "front-matter", message: "Front matter is not closed with ---", file, line: 1 });
    } else {
      frontMatter = lines.slice(1, end);
      i = end + 1;
    }
  }
  if (opts.feature && i < lines.length && MOUNT_COMMENT.test(lines[i])) i++;

  // Preamble: everything before the first bullet (fenced code is skipped).
  const preamble: string[] = [];
  let fence: { char: string; len: number } | null = null;
  for (; i < lines.length; i++) {
    const line = expandTabs(lines[i]);
    const stripped = line.trimStart();
    if (fence) {
      preamble.push(lines[i]);
      if (isFenceClose(stripped, fence)) fence = null;
      continue;
    }
    const f = FENCE.exec(stripped);
    if (f) fence = { char: f[1][0], len: f[1].length };
    else if (BULLET.test(stripped)) break;
    preamble.push(lines[i]);
  }
  trimBlankEdges(preamble);

  const roots: RawNode[] = [];
  const stack: Frame[] = [];
  let bodyFence: { owner: Frame; char: string; len: number } | null = null;
  let bodyComment: Frame | null = null;

  for (; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = expandTabs(lines[i]);
    const indent = leading(line);
    const stripped = line.slice(indent);

    if (bodyFence) {
      bodyFence.owner.node.body.push(dedent(line, bodyFence.owner.contentCol));
      if (isFenceClose(stripped.trimEnd(), bodyFence)) bodyFence = null;
      continue;
    }
    if (bodyComment) {
      bodyComment.node.body.push(dedent(line, bodyComment.contentCol));
      if (stripped.includes("-->")) bodyComment = null;
      continue;
    }
    if (stripped.trim() === "") {
      if (stack.length) stack[stack.length - 1].node.body.push("");
      continue;
    }

    const bullet = BULLET.exec(stripped);
    if (bullet) {
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1];
      const siblings = parent ? parent.node.children : roots;
      const prev = siblings[siblings.length - 1];
      if (prev && prev.indent !== indent) {
        fatal = true;
        diagnostics.push({
          level: "error",
          code: "ambiguous-indent",
          message: `Ambiguous nesting: bullet indented ${indent} spaces, its previous sibling ${prev.indent}`,
          file,
          line: lineNo,
        });
      }
      const content = bullet[1] ?? "";
      const parsed = parseTitle(content);
      if (parsed.badRef) {
        diagnostics.push({ level: "error", code: "bad-ref", message: `ref:${parsed.badRef} is not a kebab-case feature slug`, file, line: lineNo });
      }
      const node: RawNode = { title: parsed.title, body: [], children: [], line: lineNo, indent, ref: parsed.ref };
      const contentCol = content ? indent + (stripped.length - content.length) : indent + 2;
      siblings.push(node);
      stack.push({ node, indent, contentCol });
      continue;
    }

    if (HEADING.test(stripped) && indent < 4) {
      diagnostics.push({
        level: "error",
        code: "heading-after-node",
        message: "Heading after the first node; turn it into a top-level node",
        file,
        line: lineNo,
      });
    }

    // Body line: owned by the deepest open node whose content column it reaches.
    let owner = stack[stack.length - 1];
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].contentCol <= indent) {
        owner = stack[k];
        break;
      }
    }
    owner.node.body.push(dedent(line, owner.contentCol));
    const f = FENCE.exec(stripped);
    if (f) bodyFence = { owner, char: f[1][0], len: f[1].length };
    else if (opensComment(stripped)) bodyComment = owner;
  }

  const walk = (nodes: RawNode[]) => {
    for (const n of nodes) {
      trimBlankEdges(n.body);
      if (n.ref && n.children.length) {
        diagnostics.push({
          level: "error",
          code: "ref-children",
          message: `ref:${n.ref} node has inline children; move them into ssdd/specs/${n.ref}/spec.md`,
          file,
          line: n.line,
        });
      }
      walk(n.children);
    }
  };
  walk(roots);

  return { file, frontMatter, preamble, nodes: roots, diagnostics, fatal };
}

/** True when the line leaves an HTML comment open. */
function opensComment(line: string): boolean {
  const open = line.lastIndexOf("<!--");
  return open >= 0 && line.indexOf("-->", open + 4) < 0;
}

function isFenceClose(stripped: string, fence: { char: string; len: number }): boolean {
  const m = /^(`+|~+)\s*$/.exec(stripped);
  return !!m && m[1][0] === fence.char && m[1].length >= fence.len;
}

function trimBlankEdges(lines: string[]): void {
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  while (lines.length && lines[0].trim() === "") lines.shift();
}

export function frontMatterValue(fm: string[] | null, key: string): string | undefined {
  if (!fm) return undefined;
  const re = new RegExp(`^${key}:\\s*(.*?)\\s*$`);
  for (const l of fm) {
    const m = re.exec(l);
    if (m) return m[1];
  }
  return undefined;
}

export function setFrontMatterValue(fm: string[], key: string, value: string): string[] {
  const re = new RegExp(`^${key}:`);
  const idx = fm.findIndex((l) => re.test(l));
  const out = fm.slice();
  if (idx >= 0) out[idx] = `${key}: ${value}`;
  else out.push(`${key}: ${value}`);
  return out;
}
