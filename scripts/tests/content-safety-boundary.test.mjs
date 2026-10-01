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

test("content safety rejects a raw control character and accepts its escape", async () => {
  const { spawnSync } = await import("node:child_process");
  const os = await import("node:os");
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-content-safety-"));
  const validator = path.join(root, "scripts", "validate-content-safety.mjs");
  const check = () => spawnSync(process.execPath, [validator], { cwd: probe, encoding: "utf8", windowsHide: true });
  fs.writeFileSync(path.join(probe, "probe.mjs"), `const word = /${String.fromCharCode(8)}word${String.fromCharCode(8)}/;\n`);
  const raw = check();
  assert.equal(raw.status, 1);
  assert.match(raw.stderr, /probe\.mjs:1:\d+ contains control character U\+0008/);
  fs.writeFileSync(path.join(probe, "probe.mjs"), "const word = /\\bword\\b/;\n\tindented();\r\n");
  assert.equal(check().status, 0, "escapes, tabs, and CRLF are ordinary text");
  fs.rmSync(probe, { recursive: true, force: true });
});
