export type Level = "error" | "warning";

export interface Diagnostic {
  level: Level;
  code: string;
  message: string;
  file?: string;
  line?: number;
  path?: string;
}

/** A node as written in one file, before refs are expanded and labels assigned. */
export interface RawNode {
  title: string;
  /** Body lines relative to the node's content column; blank lines are "". */
  body: string[];
  children: RawNode[];
  /** 1-based line of the bullet. */
  line: number;
  ref?: string;
  /** Indentation (columns) of the bullet in the source, used for nesting checks. */
  indent: number;
}

export interface ParsedFile {
  file: string;
  /** Front matter lines without the `---` fences, or null when absent. */
  frontMatter: string[] | null;
  /** Lines between front matter (or mount comment) and the first bullet, trailing blanks trimmed. */
  preamble: string[];
  nodes: RawNode[];
  diagnostics: Diagnostic[];
  /** True when parsing failed badly enough that the formatter must not rewrite the file. */
  fatal: boolean;
}

/** A node in the expanded spec tree. */
export interface SpecNode {
  path: string;
  depth: number;
  title: string;
  body: string[];
  children: SpecNode[];
  parent: SpecNode | null;
  ref?: string;
  file: string;
  line: number;
  /** Normalized title + body used for comparison and fingerprints. */
  key: string;
}

export interface SpecTree {
  version: number;
  format: number;
  preamble: string[];
  roots: SpecNode[];
  /** Parsed files by repo-relative path (rootspec first). */
  files: Map<string, ParsedFile>;
  /** Which path each feature is mounted at. */
  mounts: Map<string, string>;
  diagnostics: Diagnostic[];
}
