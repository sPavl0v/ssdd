import { agentBody, stripComments } from "../spec/hash.ts";
import { isInside } from "../spec/labels.ts";
import type { SpecNode, SpecTree } from "../spec/types.ts";
import { type ChangeKind, type Mapping, kindOfNew, kindOfOld, mapTrees } from "./mapping.ts";

export interface Change {
  kind: ChangeKind;
  oldNode?: SpecNode;
  newNode?: SpecNode;
}

export interface ChangeGroup {
  root: Change;
  /** Every changed node in the group, root first, in tree order. */
  changes: Change[];
}

export interface ChangeSet {
  groups: ChangeGroup[];
  preamble: { old: string[]; new: string[] } | null;
  mapping: Mapping;
}

export function changePath(c: Change): string {
  return (c.newNode ?? c.oldNode)!.path;
}

function comparePaths(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue;
    const na = /^\d+$/.test(pa[i]);
    if (na) return Number(pa[i]) - Number(pb[i]);
    return pa[i].length - pb[i].length || (pa[i] < pb[i] ? -1 : 1);
  }
  return pa.length - pb.length;
}

function normPreamble(lines: string[]): string {
  return stripComments(lines.join("\n"))
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
}

/** Change set between two trees, grouped by change root (4.3). */
export function computeChanges(oldTree: SpecTree, newTree: SpecTree): ChangeSet {
  const m = mapTrees(oldTree.roots, newTree.roots);
  const changedNew = (n: SpecNode) => kindOfNew(m, n) !== "same";

  // Group key: the new node of a new-side root, or the old node of a removed root.
  const groups = new Map<SpecNode, ChangeGroup>();
  const rootOfNew = (n: SpecNode): SpecNode => {
    let r = n;
    while (r.parent && changedNew(r.parent)) r = r.parent;
    return r;
  };
  const groupFor = (key: SpecNode, root: Change) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { root, changes: [] }));
    return g;
  };
  const newChange = (n: SpecNode): Change => {
    const kind = kindOfNew(m, n);
    return { kind: kind as ChangeKind, newNode: n, oldNode: m.newToOld.get(n) };
  };

  for (const n of m.newNodes) {
    if (!changedNew(n)) continue;
    const r = rootOfNew(n);
    groupFor(r, newChange(r)).changes.push(newChange(n));
  }
  for (const o of m.oldNodes) {
    if (kindOfOld(m, o) !== "removed") continue;
    let top = o;
    while (top.parent && kindOfOld(m, top.parent) === "removed") top = top.parent;
    const anc = top.parent;
    const change: Change = { kind: "removed", oldNode: o };
    if (anc && kindOfOld(m, anc) !== "same") {
      const r = rootOfNew(m.oldToNew.get(anc)!.node);
      groupFor(r, newChange(r)).changes.push(change);
    } else {
      groupFor(top, { kind: "removed", oldNode: top }).changes.push(change);
    }
  }

  const sorted = [...groups.values()].sort((a, b) => comparePaths(changePath(a.root), changePath(b.root)));
  for (const g of sorted) {
    g.changes.sort((a, b) => comparePaths(changePath(a), changePath(b)));
    // Root first even when a removed sibling path sorts earlier.
    const i = g.changes.findIndex((c) => c.newNode === g.root.newNode && c.oldNode === g.root.oldNode);
    if (i > 0) g.changes.unshift(...g.changes.splice(i, 1));
  }

  const preamble = normPreamble(oldTree.preamble) === normPreamble(newTree.preamble) ? null : { old: oldTree.preamble, new: newTree.preamble };
  return { groups: sorted, preamble, mapping: m };
}

export function isEmpty(cs: ChangeSet): boolean {
  return cs.groups.length === 0 && !cs.preamble;
}

/** Keep the changes that pass `keep`; a group whose root is dropped is led by its first kept change. */
function keepChanges(cs: ChangeSet, keep: (c: Change) => boolean, preamble: ChangeSet["preamble"]): ChangeSet {
  const groups: ChangeGroup[] = [];
  for (const g of cs.groups) {
    const changes = g.changes.filter(keep);
    if (changes.length) groups.push({ root: keep(g.root) ? g.root : changes[0], changes });
  }
  return { groups, preamble, mapping: cs.mapping };
}

/** Restrict a change set to changes inside `scope` (new paths, or old paths for removed nodes). */
export function filterChanges(cs: ChangeSet, scope: string): ChangeSet {
  if (!scope) return cs;
  return keepChanges(
    cs,
    (c) => {
      if (c.newNode) return isInside(c.newNode.path, scope);
      // Removed: inside when its former parent now lives inside the scope.
      const p = c.oldNode!.parent;
      const np = p ? cs.mapping.oldToNew.get(p)?.node : undefined;
      return np ? isInside(np.path, scope) : false;
    },
    null,
  );
}

/**
 * Changes pending against every baseline. After a merge of branches that each committed a version,
 * a node one side already built is unchanged against that side's spec, so it is not pending.
 * All change sets must be computed against the same new tree.
 */
export function intersectChanges(cs: ChangeSet, others: ChangeSet[]): ChangeSet {
  if (!others.length) return cs;
  const pendingIn = (o: ChangeSet, c: Change) =>
    c.newNode
      ? kindOfNew(o.mapping, c.newNode) !== "same"
      : o.mapping.oldNodes.some((n) => n.key === c.oldNode!.key && kindOfOld(o.mapping, n) === "removed");
  const preamble = others.every((o) => o.preamble) ? cs.preamble : null;
  return keepChanges(cs, (c) => others.every((o) => pendingIn(o, c)), preamble);
}

/** Title and body as shown to agents, comments removed. */
export function nodeText(n: SpecNode): string {
  const body = agentBody(n.body);
  const title = stripComments(n.title).trim();
  return body.length ? `${title}\n${body.join("\n")}` : title;
}
