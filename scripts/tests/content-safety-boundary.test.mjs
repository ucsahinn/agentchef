import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("content safety excludes private AgentSpace state while retaining product scans", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "validate-content-safety.mjs"), "utf8");
  assert.match(source, /ignoredDirs\s*=\s*new Set\([^)]*\.agentspace/s);
});
