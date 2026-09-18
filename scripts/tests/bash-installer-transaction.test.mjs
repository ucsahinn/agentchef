import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scaledTimeout } from "../lib/test-timeouts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bash = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";

function runInstaller(env) {
  return spawnSync(bash, ["scripts/install.sh", "--plain-output"], {
    cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: scaledTimeout(300000), windowsHide: true
  });
}

function fixture(context) {
  if (process.platform === "win32" && !fs.existsSync(bash)) {
    context.skip("Git Bash is not installed");
    return null;
  }
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-bash-transaction-"));
  const relative = path.relative(root, fixtureRoot).replaceAll(path.sep, "/");
  const codexHome = path.join(fixtureRoot, "codex");
  const agentsHome = path.join(fixtureRoot, "agents");
  fs.mkdirSync(path.join(fixtureRoot, "home"), { recursive: true });
  return {
    fixtureRoot,
    codexHome,
    agentsHome,
    env: {
      ...process.env,
      HOME: process.platform === "win32" ? path.join(fixtureRoot, "home") : `${relative}/home`,
      CODEX_HOME: process.platform === "win32" ? codexHome : `${relative}/codex`,
      AGENTS_HOME: process.platform === "win32" ? agentsHome : `${relative}/agents`,
      CODEX_CHEF_CODEX_COMMAND: "codex-chef-test-missing-command",
      PATH: process.platform === "win32" ? `${path.dirname(process.execPath)};${process.env.PATH || process.env.Path || ""}` : process.env.PATH,
      FORCE_COLOR: "0", NO_COLOR: "1"
    }
  };
}

test("Unix installer refuses a live operation lock in AGENTS_HOME before managed writes", (context) => {
  const state = fixture(context);
  if (!state) return;
  const lockPath = path.join(state.agentsHome, ".codex-chef-operation.lock");
  fs.mkdirSync(lockPath, { recursive: true });
  fs.writeFileSync(path.join(lockPath, "owner.json"), `${JSON.stringify({ pid: 7, operation: "repair", startedAt: "2026-01-01T00:00:00.000Z", id: "held-by-test" })}\n`);
  try {
    const result = runInstaller(state.env);
    assert.notEqual(result.status, 0, "installer must not bypass the AGENTS_HOME operation lock");
    assert.match(`${result.stdout}\n${result.stderr}`, /already in progress|concurrent install/i);
    assert.equal(fs.existsSync(path.join(state.codexHome, "AGENTS.md")), false, "blocked install must not write Codex files");
  } finally {
    fs.rmSync(state.fixtureRoot, { force: true, recursive: true });
  }
});

test("Unix installer journals applied file and tree mutations across both managed homes", (context) => {
  const state = fixture(context);
  if (!state) return;
  try {
    const result = runInstaller(state.env);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const backups = fs.readdirSync(path.join(state.codexHome, "backups"));
    const journalPath = path.join(state.codexHome, "backups", backups[0], ".codex-chef-operation-journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    assert.equal(journal.state, "complete");
    assert.ok(journal.mutations.length > 0, "install must journal managed mutations");
    assert.ok(journal.mutations.every((mutation) => mutation.phase === "applied"), "every completed mutation must be prepared then marked applied");
    assert.ok(journal.mutations.some((mutation) => mutation.target.startsWith(state.codexHome)), "Codex writes must be journaled");
    assert.ok(journal.mutations.some((mutation) => mutation.target.startsWith(state.agentsHome)), "Agents writes must be journaled");
  } finally {
    fs.rmSync(state.fixtureRoot, { force: true, recursive: true });
  }
});
