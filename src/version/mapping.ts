import { distance } from "fastest-levenshtein";
import type { SpecNode } from "../spec/types.ts";
import { walk } from "../spec/tree.ts";

export type MapKind = "same" | "moved" | "modified" | "removed";
export type ChangeKind = "added" | "modified" | "moved" | "removed";

export interface Mapping {
  /** Old node → counterpart in the new tree and kind. Removed nodes are absent. */
  oldToNew: Map<SpecNode, { node: SpecNode; kind: Exclude<MapKind, "removed"> }>;
  /** New node → old counterpart. Added nodes are absent. */
  newToOld: Map<SpecNode, SpecNode>;
  oldNodes: SpecNode[];
  newNodes: SpecNode[];
}

const SIMILARITY = 0.8;

function titleOf(n: SpecNode): string {
  return n.key.split("\n")[0];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - distance(a, b) / max;
}

/** Longest common subsequence of two sibling lists by key, so reordered siblings count as moved. */
function lcsPairs(a: SpecNode[], b: SpecNode[]): [SpecNode, SpecNode][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].key === b[j].key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [SpecNode, SpecNode][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].key === b[j].key) {
      pairs.push([a[i], b[j]]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** Map every node of the old tree to its counterpart in the new tree (4.4). */
export function mapTrees(oldRoots: SpecNode[], newRoots: SpecNode[]): Mapping {
  const oldToNew: Mapping["oldToNew"] = new Map();
  const newToOld: Mapping["newToOld"] = new Map();
  const oldNodes = [...walk(oldRoots)];
  const newNodes = [...walk(newRoots)];

  const assign = (o: SpecNode, n: SpecNode, kind: Exclude<MapKind, "removed">) => {
    oldToNew.set(o, { node: n, kind });
    newToOld.set(n, o);
    matchSame(o.children, n.children);
  };
  function matchSame(oldKids: SpecNode[], newKids: SpecNode[]) {
    const os = oldKids.filter((o) => !oldToNew.has(o));
    const ns = newKids.filter((n) => !newToOld.has(n));
    for (const [o, n] of lcsPairs(os, ns)) assign(o, n, "same");
  }

  // 1. Same: identical text under a mapped parent, in order.
  matchSame(oldRoots, newRoots);

  let progress = true;
  while (progress) {
    progress = false;
    // 2. Moved: identical text anywhere, if unique on both sides.
    const oldByKey = new Map<string, SpecNode[]>();
    const newByKey = new Map<string, SpecNode[]>();
    for (const o of oldNodes) if (!oldToNew.has(o)) (oldByKey.get(o.key) ?? oldByKey.set(o.key, []).get(o.key)!).push(o);
    for (const n of newNodes) if (!newToOld.has(n)) (newByKey.get(n.key) ?? newByKey.set(n.key, []).get(n.key)!).push(n);
    for (const [key, os] of oldByKey) {
      const ns = newByKey.get(key);
      if (os.length === 1 && ns?.length === 1 && !oldToNew.has(os[0]) && !newToOld.has(ns[0])) {
        assign(os[0], ns[0], "moved");
        progress = true;
      }
    }
    // 3. Modified: same parent and a similar title, or the same title with a different body.
    for (const o of oldNodes) {
      if (oldToNew.has(o)) continue;
      const siblings = o.parent ? oldToNew.get(o.parent)?.node.children : newRoots;
      if (!siblings) continue;
      const free = siblings.filter((n) => !newToOld.has(n));
      if (!free.length) continue;
      const identical = free.find((n) => n.key === o.key);
      if (identical) {
        assign(o, identical, "moved");
        progress = true;
        continue;
      }
      const t = titleOf(o);
      let best: SpecNode | undefined = free.find((n) => titleOf(n) === t);
      if (!best) {
        let score = SIMILARITY;
        for (const n of free) {
          const s = similarity(t, titleOf(n));
          if (s >= score) {
            if (!best || s > score) best = n;
            score = s;
          }
        }
      }
      if (best) {
        assign(o, best, "modified");
        progress = true;
      }
    }
  }

  // A "moved" node that ended up under its own parent's counterpart, in the same order relative
  // to its mapped siblings, did not move: it was matched early because its parent was reworded.
  for (const [o, m] of oldToNew) {
    if (m.kind !== "moved") continue;
    const sameParent = o.parent ? oldToNew.get(o.parent)?.node === m.node.parent : m.node.parent === null;
    if (!sameParent) continue;
    const oldSibs = o.parent ? o.parent.children : oldRoots;
    const newSibs = m.node.parent ? m.node.parent.children : newRoots;
    const oi = oldSibs.indexOf(o);
    const ni = newSibs.indexOf(m.node);
    const inOrder = oldSibs.every((s, si) => {
      const t = oldToNew.get(s)?.node;
      if (s === o || !t || t.parent !== m.node.parent) return true;
      return si < oi === newSibs.indexOf(t) < ni;
    });
    if (inOrder) m.kind = "same";
  }
  return { oldToNew, newToOld, oldNodes, newNodes };
}

export function kindOfOld(m: Mapping, o: SpecNode): MapKind {
  return m.oldToNew.get(o)?.kind ?? "removed";
}

/** Kind of a new-tree node from the new side: added when it has no old counterpart. */
export function kindOfNew(m: Mapping, n: SpecNode): MapKind | "added" {
  const o = m.newToOld.get(n);
  return o ? m.oldToNew.get(o)!.kind : "added";
}
