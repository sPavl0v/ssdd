export function stripComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Normalized node text (4.1): HTML comments, trailing whitespace and blank-line runs are ignored,
 * so formatting never changes it.
 */
export function nodeKey(title: string, body: string[]): string {
  const t = stripComments(title).trim().replace(/\s+/g, " ");
  const lines = stripComments(body.join("\n"))
    .split("\n")
    .map((l) => l.trimEnd());
  const out: string[] = [];
  for (const l of lines) {
    if (l === "" && (out.length === 0 || out[out.length - 1] === "")) continue;
    out.push(l);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.length ? `${t}\n${out.join("\n")}` : t;
}

/** Body text as sent to agents: comments removed, edges trimmed. */
export function agentBody(body: string[]): string[] {
  const text = stripComments(body.join("\n"));
  const lines = text.split("\n").map((l) => l.trimEnd());
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
