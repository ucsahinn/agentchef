import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bash = process.platform === "win32"
  ? "C:\\Program Files\\Git\\bin\\bash.exe"
  : "bash";

function output(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`.trim();
}

test("Unix installer releases its lock so a fresh home can be installed twice", (context) => {
  if (process.platform === "win32" && !fs.existsSync(bash)) {
    context.skip("Git Bash is not installed");
    return;
  }

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-unix-lock-"));
  const relativeFixture = path.relative(root, fixtureRoot).replaceAll(path.sep, "/");
  const codexHome = path.join(fixtureRoot, "codex");
  const lockPath = path.join(codexHome, ".codex-chef-operation.lock");
  const env = {
    ...process.env,
    HOME: `${relativeFixture}/home`,
    CODEX_HOME: `${relativeFixture}/codex`,
    AGENTS_HOME: `${relativeFixture}/agents`,
    CODEX_CHEF_CODEX_COMMAND: "codex-chef-test-missing-command",
    PATH: process.platform === "win32"
      ? `${path.dirname(process.execPath)};${process.env.PATH || process.env.Path || ""}`
      : process.env.PATH,
    FORCE_COLOR: "0",
    NO_COLOR: "1"
  };

  fs.mkdirSync(path.join(fixtureRoot, "home"), { recursive: true });
  try {
    const first = spawnSync(bash, ["scripts/install.sh", "--plain-output"], {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300000,
      windowsHide: true
    });
    assert.equal(first.status, 0, `first install failed:\n${output(first)}`);
    assert.equal(fs.existsSync(lockPath), false, "first install left its operation lock behind");

    const second = spawnSync(bash, ["scripts/install.sh", "--plain-output"], {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300000,
      windowsHide: true
    });
    assert.equal(second.status, 0, `second install failed:\n${output(second)}`);
    assert.equal(fs.existsSync(lockPath), false, "second install left its operation lock behind");
  } finally {
    fs.rmSync(fixtureRoot, { force: true, recursive: true });
  }
});
