import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { acquireOperationLock } from "../lib/operation-lock.mjs";
import { scaledTimeout } from "../lib/test-timeouts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function fixture(label) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `agentchef-repair-${label}-`));
  return {
    root: fixtureRoot,
    codexHome: path.join(fixtureRoot, ".codex"),
    agentsHome: path.join(fixtureRoot, ".agents")
  };
}

function write(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function runRepair(target, flags, extraEnv = {}) {
  return spawnSync(process.execPath, [
    path.join(root, "scripts", "repair-install.mjs"),
    "--json",
    "--platform",
    process.platform === "win32" ? "windows" : "unix",
    "--codex-home",
    target.codexHome,
    "--agents-home",
    target.agentsHome,
    ...flags
  ], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: scaledTimeout(120000),
    env: {
      ...process.env,
      AGENTCHEF_CODEX_COMMAND: "agentchef-missing-fixture-command",
      ...extraEnv
    }
  });
}

function report(result) {
  assert.doesNotThrow(() => JSON.parse(result.stdout), result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("repair derives its mutation preflight from the authoritative install contract", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "repair-install.mjs"), "utf8");
  assert.match(source, /import\s+\{\s*resolveInstallContract\s*\}\s+from\s+"\.\/lib\/install-contract\.mjs"/);
  assert.match(source, /resolveInstallContract\(\{[\s\S]*codexHome:\s*options\.codexHome[\s\S]*agentsHome:\s*options\.agentsHome[\s\S]*\}\)/);
  assert.match(source, /function\s+repairManagedFiles\(contract\)/);
  assert.match(source, /for\s*\(const action of contract\.operations\)/);
  assert.doesNotMatch(source, /function\s+repairMutationTargets\s*\(\)/);
});

test("no-backup repair fails before any write when a managed target already exists", () => {
  const target = fixture("no-backup-existing");
  const configPath = path.join(target.codexHome, "config.toml");
  const original = 'model = "user-model"\n';
  write(configPath, original);

  const result = runRepair(target, ["--apply", "--no-backup"]);
  const payload = report(result);
  assert.equal(result.status, 1);
  assert.equal(payload.status, "fail");
  assert.match(payload.failures.join("\n"), /no-backup.*creation-only/i);
  assert.equal(fs.readFileSync(configPath, "utf8"), original);
  assert.equal(fs.existsSync(path.join(target.codexHome, "AGENTS.md")), false);
});

test("no-backup repair cannot prune an existing managed plugin extra", () => {
  const target = fixture("no-backup-prune");
  const extra = path.join(target.codexHome, "plugins", "agentchef-workflows", "extra.txt");
  write(extra, "must survive\n");

  const result = runRepair(target, [
    "--apply",
    "--no-backup",
    "--prune-managed-plugin-extras"
  ]);
  const payload = report(result);
  assert.equal(result.status, 1);
  assert.match(payload.failures.join("\n"), /no-backup.*creation-only/i);
  assert.equal(fs.readFileSync(extra, "utf8"), "must survive\n");
  assert.equal(fs.existsSync(path.join(target.codexHome, "AGENTS.md")), false);
});

test("no-backup repair remains available for a fully creation-only install", () => {
  const target = fixture("no-backup-create");
  const result = runRepair(target, ["--apply", "--no-backup"]);
  const payload = report(result);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.notEqual(payload.status, "fail");
  assert.equal(payload.backupRoot, null);
  assert.equal(fs.existsSync(path.join(target.codexHome, "AGENTS.md")), true);
  assert.equal(fs.existsSync(path.join(target.codexHome, "serena-pool.mjs")), true);
});

test("repair restores nested support files for a managed direct skill", () => {
  const target = fixture("direct-skill-support-files");

  const result = runRepair(target, ["--apply"]);
  const payload = report(result);
  const source = path.join(root, "plugins", "agentchef-workflows", "skills", "seo", "agents", "openai.yaml");
  const installed = path.join(target.agentsHome, "skills", "seo", "agents", "openai.yaml");

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.notEqual(payload.status, "fail");
  assert.equal(fs.readFileSync(installed, "utf8"), fs.readFileSync(source, "utf8"));
});

test("no-backup repair rejects a stale installed plugin cache before managed writes", () => {
  const target = fixture("no-backup-stale-plugin-cache");
  const fakeCodex = path.join(
    target.root,
    process.platform === "win32" ? "codex-fixture.cmd" : "codex-fixture.sh"
  );
  const payload = JSON.stringify({
    installed: [{
      pluginId: "agentchef-workflows@agentchef",
      name: "agentchef-workflows",
      version: "0.0.0-stale",
      installed: true,
      enabled: true
    }]
  });
  write(
    fakeCodex,
    process.platform === "win32"
      ? `@echo off\r\necho ${payload}\r\n`
      : `#!/bin/sh\nprintf '%s\\n' '${payload}'\n`
  );
  if (process.platform !== "win32") fs.chmodSync(fakeCodex, 0o755);

  const result = runRepair(target, ["--apply", "--no-backup"], {
    AGENTCHEF_CODEX_COMMAND: fakeCodex
  });
  const repair = report(result);
  assert.equal(result.status, 1);
  assert.match(repair.failures.join("\n"), /no-backup.*creation-only.*plugin cache/i);
  assert.equal(fs.existsSync(path.join(target.codexHome, "AGENTS.md")), false);
  assert.equal(fs.existsSync(target.agentsHome), false);
});

test("repair restores a drifted Serena bridge with a backup", () => {
  const target = fixture("serena-drift");
  const serenaPath = path.join(target.codexHome, "serena-pool.mjs");
  write(serenaPath, "// stale bridge\n");

  const result = runRepair(target, ["--apply"]);
  const payload = report(result);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    fs.readFileSync(serenaPath, "utf8"),
    fs.readFileSync(path.join(root, "templates", "codex", "serena-pool.mjs"), "utf8")
  );
  const serenaAction = payload.actions.find((action) => action.id === "codex-serena-pool");
  assert.equal(serenaAction?.status, "applied");
  assert.equal(typeof serenaAction?.backup, "string");
});

test("repair journals every managed write through durable prepared and applied phases", () => {
  const target = fixture("journal-phases");
  const agentsPath = path.join(target.codexHome, "AGENTS.md");
  write(agentsPath, "# drifted\n");

  const result = runRepair(target, ["--apply"]);
  const payload = report(result);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const journalPath = path.join(payload.backupRoot, ".agentchef-operation-journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const agentsMutation = journal.mutations.find((mutation) => mutation.target === agentsPath);
  assert.equal(journal.state, "complete");
  assert.equal(agentsMutation?.phase, "applied");
  assert.equal(agentsMutation?.before.kind, "file");
  assert.ok(journal.mutations.every((mutation) => mutation.phase === "applied"));
});

test("repair apply contends on AGENTS_HOME before it mutates CODEX_HOME", () => {
  const target = fixture("agents-home-lock");
  const lock = acquireOperationLock({ root: target.agentsHome, operation: "another-operation" });
  try {
    const result = runRepair(target, ["--apply"]);
    const payload = report(result);
    assert.equal(result.status, 1);
    assert.match(payload.failures.join("\n"), /already in progress/i);
    assert.equal(fs.existsSync(path.join(target.codexHome, "AGENTS.md")), false);
  } finally {
    lock.release();
  }
});

test("a second repair apply is a persistent no-op after convergence", () => {
  const target = fixture("apply-idempotency");
  const first = runRepair(target, ["--apply"]);
  assert.equal(first.status, 0, first.stderr || first.stdout);

  const backupsPath = path.join(target.codexHome, "backups");
  const backupsBefore = fs.existsSync(backupsPath) ? fs.readdirSync(backupsPath).sort() : [];
  const preview = runRepair(target, ["--preview"]);
  const previewPayload = report(preview);
  assert.equal(preview.status, 0, preview.stderr || preview.stdout);
  assert.equal(previewPayload.managedFiles.planned, 0);
  assert.deepEqual(fs.existsSync(backupsPath) ? fs.readdirSync(backupsPath).sort() : [], backupsBefore);
  const second = runRepair(target, ["--apply"]);
  const payload = report(second);

  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(payload.managedFiles.applied, 0);
  assert.deepEqual(fs.existsSync(backupsPath) ? fs.readdirSync(backupsPath).sort() : [], backupsBefore);
});

test("repair reconciles a failed post-write transaction without overwriting later user changes", () => {
  const target = fixture("transaction-reconcile");
  const agentsPath = path.join(target.codexHome, "AGENTS.md");
  const original = "# user-managed prior content\n";
  write(agentsPath, original);

  const result = runRepair(target, ["--apply"], {
    AGENTCHEF_TEST_MODE: "1",
    AGENTCHEF_TEST_REPAIR_FAIL_AFTER_WRITES: "1"
  });
  const payload = report(result);
  assert.equal(result.status, 1);
  assert.match(payload.failures.join("\n"), /Injected repair post-write failure/);
  assert.equal(fs.readFileSync(agentsPath, "utf8"), original);
  assert.match(payload.notes.join("\n"), /reconciled 1 managed target/i);
});

test("unsafe Serena targets fail before earlier managed files are written", (t) => {
  const target = fixture("serena-link");
  const outsideHome = path.join(target.root, "outside-codex-home");
  const outside = path.join(outsideHome, "serena-pool.mjs");
  const serenaPath = path.join(target.codexHome, "serena-pool.mjs");
  write(outside, "// outside sentinel\n");
  fs.mkdirSync(target.codexHome, { recursive: true });
  try {
    fs.symlinkSync(outside, serenaPath, "file");
  } catch (error) {
    try {
      fs.rmdirSync(target.codexHome);
      fs.symlinkSync(outsideHome, target.codexHome, process.platform === "win32" ? "junction" : "dir");
    } catch (junctionError) {
      t.skip(
        `File and directory link creation are unavailable: ${error.code || error.message}/${junctionError.code || junctionError.message}`
      );
      return;
    }
  }

  const result = runRepair(target, ["--apply"]);
  const payload = report(result);
  assert.equal(result.status, 1);
  assert.match(payload.failures.join("\n"), /unsafe managed path/i);
  assert.equal(fs.readFileSync(outside, "utf8"), "// outside sentinel\n");
  assert.equal(fs.existsSync(path.join(target.codexHome, "AGENTS.md")), false);
});
