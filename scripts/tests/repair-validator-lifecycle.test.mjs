import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("repair validator isolates fixture repair children from the ambient Codex CLI", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "validate-repair-install.mjs"), "utf8");

  assert.match(source, /function\s+fixtureChildEnv\s*\(/);
  assert.match(source, /env:\s*fixtureChildEnv\(\)/);
  assert.match(source, /path\.dirname\(process\.execPath\)/);
});
