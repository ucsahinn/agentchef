import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const indexer = path.join(root, "scripts", "index-agent-results.mjs");

function createFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-agent-results-index-"));
  const results = path.join(fixture, "docs", "agent-results");
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(path.join(results, "TASK-Z-last.md"), "# Z\n", "utf8");
  fs.writeFileSync(path.join(results, "TASK-A-first.md"), "# A\n", "utf8");
  fs.writeFileSync(path.join(results, "ADP-42-qa.md"), "# QA\n", "utf8");
  fs.writeFileSync(path.join(results, "README.md"), "# Results notes\n", "utf8");
  fs.writeFileSync(path.join(results, "notes.txt"), "ignore\n", "utf8");
  return fixture;
}

test("agent result indexing includes task reports only, sorts them, and is idempotent", () => {
  const fixture = createFixture();
  try {
    execFileSync(process.execPath, [indexer, "--root", fixture], { encoding: "utf8" });
    const indexPath = path.join(fixture, "docs", "agent-results", "INDEX.md");
    const expected = [
      "# Agent Results Index",
      "",
      "Bu indeks `docs/agent-results/` altındaki görev sonuçlarını dosya adına göre sıralar.",
      "",
      "- [ADP-42-qa.md](ADP-42-qa.md)",
      "- [TASK-A-first.md](TASK-A-first.md)",
      "- [TASK-Z-last.md](TASK-Z-last.md)",
      ""
    ].join("\n");
    assert.equal(fs.readFileSync(indexPath, "utf8"), expected);

    const firstWrite = fs.statSync(indexPath).mtimeMs;
    execFileSync(process.execPath, [indexer, "--root", fixture], { encoding: "utf8" });
    assert.equal(fs.statSync(indexPath).mtimeMs, firstWrite);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
