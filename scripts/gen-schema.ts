// Writes schema/ssdd.config.schema.json from the zod config schema (9.4).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ConfigSchema } from "../src/config.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const schema = z.toJSONSchema(ConfigSchema, { io: "input" });
fs.mkdirSync(path.join(root, "schema"), { recursive: true });
fs.writeFileSync(path.join(root, "schema/ssdd.config.schema.json"), JSON.stringify({ title: "ssdd.config.json", ...schema }, null, 2) + "\n");
console.log("wrote schema/ssdd.config.schema.json");
