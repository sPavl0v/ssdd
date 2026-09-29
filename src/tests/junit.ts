import { XMLParser } from "fast-xml-parser";

export interface CaseResult {
  name: string;
  classname: string;
  file?: string;
  status: "pass" | "fail" | "skip";
  message?: string;
  output?: string;
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["#text"]);
  return "";
}

function first(v: unknown): Record<string, unknown> | undefined {
  if (v === undefined) return undefined;
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === "object" && x !== null ? (x as Record<string, unknown>) : { "#text": String(x ?? "") };
}

export function parseJUnit(xml: string): CaseResult[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", allowBooleanAttributes: true });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const out: CaseResult[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (k === "testcase") {
        for (const tc of Array.isArray(v) ? v : [v]) out.push(toCase(tc as Record<string, unknown>));
      } else if (!k.startsWith("@") && k !== "#text") visit(v);
    }
  };
  visit(doc);
  return out;
}

function toCase(tc: Record<string, unknown>): CaseResult {
  const base = {
    name: String(tc["@name"] ?? ""),
    classname: String(tc["@classname"] ?? ""),
    file: tc["@file"] ? String(tc["@file"]) : undefined,
  };
  const failure = first(tc.failure) ?? first(tc.error);
  if (failure) {
    const body = text(failure).trim();
    const msg = String(failure["@message"] ?? "").trim() || body.split("\n")[0] || "failed";
    return { ...base, status: "fail", message: msg, output: body || msg };
  }
  if ("skipped" in tc) {
    const s = first(tc.skipped);
    const msg = String(s?.["@message"] ?? "").trim() || text(s).trim();
    return { ...base, status: "skip", message: msg || undefined };
  }
  return { ...base, status: "pass" };
}
