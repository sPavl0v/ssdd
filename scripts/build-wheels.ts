// Wrap each compiled binary in a platform wheel with no Python code (7.3), like ruff and ziglang.
// Run after scripts/build-all.ts. Output: dist/wheels/ssdd-<version>-py3-none-<tag>.whl
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { TARGETS } from "./targets.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version: string = pkg.version;
const outDir = path.join(root, "dist", "wheels");
fs.mkdirSync(outDir, { recursive: true });

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry { name: string; data: Buffer; mode: number }

function zip(entries: Entry[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const comp = zlib.deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(e.data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32);
    c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36); c.writeUInt32LE(((0o100000 | e.mode) << 16) >>> 0, 38); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

const b64 = (d: Buffer) => createHash("sha256").update(d).digest("base64url");
const readme = fs.existsSync(path.join(root, "README.md")) ? fs.readFileSync(path.join(root, "README.md"), "utf8") : "";

for (const t of TARGETS) {
  const bin = path.join(root, "dist", t.file);
  if (!fs.existsSync(bin)) {
    console.warn(`skip ${t.wheel}: ${t.file} not built`);
    continue;
  }
  const dataDir = `ssdd-${version}.data/scripts`;
  const info = `ssdd-${version}.dist-info`;
  const entries: Entry[] = [
    { name: `${dataDir}/${t.os === "win32" ? "ssdd.exe" : "ssdd"}`, data: fs.readFileSync(bin), mode: 0o755 },
    {
      name: `${info}/METADATA`,
      data: Buffer.from(
        `Metadata-Version: 2.1\nName: ssdd\nVersion: ${version}\nSummary: ${pkg.description}\nLicense: ${pkg.license}\nRequires-Python: >=3.7\nDescription-Content-Type: text/markdown\n\n${readme}`,
      ),
      mode: 0o644,
    },
    { name: `${info}/WHEEL`, data: Buffer.from(`Wheel-Version: 1.0\nGenerator: ssdd build-wheels\nRoot-Is-Purelib: false\nTag: py3-none-${t.wheel}\n`), mode: 0o644 },
  ];
  const record = entries.map((e) => `${e.name},sha256=${b64(e.data)},${e.data.length}`).concat(`${info}/RECORD,,`).join("\n") + "\n";
  entries.push({ name: `${info}/RECORD`, data: Buffer.from(record), mode: 0o644 });
  const file = path.join(outDir, `ssdd-${version}-py3-none-${t.wheel}.whl`);
  fs.writeFileSync(file, zip(entries));
  console.log(`wrote ${path.relative(root, file)}`);
}
