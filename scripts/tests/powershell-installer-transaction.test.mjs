import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scaledTimeout } from "../lib/test-timeouts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const powershell = process.platform === "win32" ? "powershell.exe" : null;

function output(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`.trim();
}

test("PowerShell installer refuses an existing AGENTS_HOME operation lock before writes", (context) => {
  if (!powershell) {
    context.skip("PowerShell installer integration requires Windows");
    return;
  }

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-powershell-lock-"));
  const codexHome = path.join(fixtureRoot, "codex");
  const agentsHome = path.join(fixtureRoot, "agents");
  const agentsLock = path.join(agentsHome, ".codex-chef-operation.lock");
  fs.mkdirSync(agentsLock, { recursive: true });
  fs.writeFileSync(path.join(agentsLock, "owner.json"), `${JSON.stringify({
    pid: 12345,
    operation: "install",
    startedAt: "2026-01-01T00:00:00.000Z",
    id: "another-operation"
  })}\n`);

  try {
    const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/install.ps1", "-PlainOutput", "-NoBackup"], {
      cwd: root,
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
        AGENTS_HOME: agentsHome,
        HOME: path.join(fixtureRoot, "home"),
        CODEX_CHEF_CODEX_COMMAND: "codex-chef-test-missing-command",
        CODEX_CHEF_TEST_MODE: "1",
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: scaledTimeout(300000),
      windowsHide: true
    });
    assert.notEqual(result.status, 0, `installer unexpectedly ignored AGENTS_HOME lock:\n${output(result)}`);
    assert.match(output(result), /Another AgentChef operation is already in progress/i);
    assert.equal(fs.existsSync(path.join(codexHome, ".codex-chef-operation.lock")), false, "failed acquisition must release any earlier CODEX_HOME lock");
    assert.equal(fs.existsSync(path.join(codexHome, "AGENTS.md")), false, "lock rejection must occur before managed writes");
  } finally {
    fs.rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("PowerShell installer completes its journal with applied mutations and releases both managed-home locks", (context) => {
  if (!powershell) {
    context.skip("PowerShell installer integration requires Windows");
    return;
  }

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-powershell-journal-"));
  const codexHome = path.join(fixtureRoot, "codex");
  const agentsHome = path.join(fixtureRoot, "agents");
  try {
    const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/install.ps1", "-PlainOutput"], {
      cwd: root,
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
        AGENTS_HOME: agentsHome,
        HOME: path.join(fixtureRoot, "home"),
        CODEX_CHEF_CODEX_COMMAND: "codex-chef-test-missing-command",
        CODEX_CHEF_TEST_MODE: "1",
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: scaledTimeout(300000),
      windowsHide: true
    });
    assert.equal(result.status, 0, `installer failed:\n${output(result)}`);
    const backupRoot = fs.readdirSync(path.join(codexHome, "backups"), { withFileTypes: true })
      .find((entry) => entry.isDirectory() && entry.name.startsWith("codex-chef-"));
    assert.ok(backupRoot, "installer did not create a transaction backup root");
    const journal = JSON.parse(fs.readFileSync(path.join(codexHome, "backups", backupRoot.name, ".codex-chef-operation-journal.json"), "utf8"));
    assert.equal(journal.state, "complete");
    assert.ok(journal.mutations.length > 0, "installer did not journal managed mutations");
    assert.ok(journal.mutations.every((mutation) => mutation.phase === "applied"), "every completed mutation must be marked applied after its write");
    assert.equal(fs.existsSync(path.join(codexHome, ".codex-chef-operation.lock")), false);
    assert.equal(fs.existsSync(path.join(agentsHome, ".codex-chef-operation.lock")), false);
  } finally {
    fs.rmSync(fixtureRoot, { force: true, recursive: true });
  }
});
