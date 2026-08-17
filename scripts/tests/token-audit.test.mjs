import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");

test("token audit does not reject its own secret classifier source file", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/analyze-token-surfaces.mjs", "--top=1"],
    { cwd: root, encoding: "utf8", windowsHide: true }
  );

  assert.equal(result.status, 0, result.stdout + "\n" + result.stderr);
  assert.match(result.stdout, /Codex Chef token surface audit/);
});
