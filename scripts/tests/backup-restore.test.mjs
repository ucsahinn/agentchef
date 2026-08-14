import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const chef = path.join(root, "scripts", "chef-cli.mjs");

test("restore staging interruption leaves every live target unchanged", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-backup-restore-"));
  const codexHome = path.join(fixture, "codex");
  const agentsHome = path.join(fixture, "agents");
  const archiveId = "codex-chef-test-staging";
  const archive = path.join(codexHome, "backups", archiveId);
  const originalAgents = "# current agents\n";
  const originalConfig = "current = true\n";
  try {
    write(path.join(codexHome, "AGENTS.md"), originalAgents);
    write(path.join(codexHome, "config.toml"), originalConfig);
    write(path.join(archive, "codex", "AGENTS.md"), "# restored agents\n");
    write(path.join(archive, "codex", "config.toml"), "restored = true\n");
    writeManifest(archive, ["codex/AGENTS.md", "codex/config.toml"]);

    const result = spawnSync(process.execPath, [
      chef, "--backups", "--backup", archiveId, "--restore", "--apply", "--json", "--no-log"
    ], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
        AGENTS_HOME: agentsHome,
        CODEX_CHEF_TEST_MODE: "1",
        CODEX_CHEF_TEST_RESTORE_FAIL_AFTER_STAGING: "1"
      }
    });

    assert.equal(result.status, 1, result.error?.message || result.stderr || result.stdout);
    assert.equal(fs.readFileSync(path.join(codexHome, "AGENTS.md"), "utf8"), originalAgents);
    assert.equal(fs.readFileSync(path.join(codexHome, "config.toml"), "utf8"), originalConfig);
    assert.deepEqual(findRestoreStaging(codexHome), []);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("restore removes a stale regular staging file before publishing", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-backup-recovery-"));
  const codexHome = path.join(fixture, "codex");
  const agentsHome = path.join(fixture, "agents");
  const archiveId = "codex-chef-test-recovery";
  const archive = path.join(codexHome, "backups", archiveId);
  const staleStage = path.join(codexHome, ".codex-chef-restore-stage-AGENTS.md-interrupted.tmp");
  try {
    write(path.join(codexHome, "AGENTS.md"), "# current agents\n");
    write(staleStage, "incomplete restored content\n");
    write(path.join(archive, "codex", "AGENTS.md"), "# restored agents\n");
    writeManifest(archive, ["codex/AGENTS.md"]);

    const result = spawnSync(process.execPath, [
      chef, "--backups", "--backup", archiveId, "--restore", "--apply", "--json", "--no-log"
    ], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CODEX_HOME: codexHome, AGENTS_HOME: agentsHome }
    });

    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    assert.equal(fs.readFileSync(path.join(codexHome, "AGENTS.md"), "utf8"), "# restored agents\n");
    assert.equal(fs.existsSync(staleStage), false);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

function write(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function writeManifest(archive, relativePaths) {
  const entries = relativePaths.map((relative) => {
    const filePath = path.join(archive, ...relative.split("/"));
    const data = fs.readFileSync(filePath);
    return {
      backupRelativePath: relative,
      size: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex")
    };
  });
  write(path.join(archive, ".codex-chef-backup.json"), `${JSON.stringify({
    schemaVersion: "codex-chef.backup.v1",
    entries
  })}\n`);
}

function findRestoreStaging(rootPath) {
  const results = [];
  const pending = [rootPath];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.name.startsWith(".codex-chef-restore-stage-")) results.push(fullPath);
    }
  }
  return results;
}
