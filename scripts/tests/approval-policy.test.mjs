import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const rulesPath = path.join(root, "templates", "codex", "rules", "default.rules");

function codexCommand() {
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

function runCodex(args) {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", codexCommand(), ...args], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true
    });
  }
  return spawnSync(codexCommand(), args, { cwd: root, encoding: "utf8" });
}

function execPolicyDecision(commandTokens) {
  const result = runCodex(["execpolicy", "check", "--rules", rulesPath, ...commandTokens]);
  if (result.error?.code === "ENOENT" || result.status === 9009) return null;
  assert.equal(
    result.status,
    0,
    `execpolicy failed for ${commandTokens.join(" ")}: ${result.stderr || result.stdout}`
  );
  return JSON.parse(result.stdout || "{}").decision || "no-match";
}

test("approval policy prompts before report-identified Git and npm mutations", async (t) => {
  if (!fs.existsSync(rulesPath)) t.skip("approval rules template is unavailable");

  const cases = [
    ["delete a branch", ["git", "branch", "-D", "obsolete"]],
    ["add a remote", ["git", "remote", "add", "backup", "https://example.invalid/repo.git"]],
    ["delete a tag", ["git", "tag", "-d", "v0.0.0"]],
    ["fetch and update remote-tracking state", ["git", "fetch"]],
    ["apply npm audit fixes", ["npm.cmd", "audit", "fix"]],
    ["run a repository-controlled build script", ["npm.cmd", "run", "build"]],
    ["run an arbitrary repository script", ["npm.cmd", "run", "postinstall"]],
    ["run the npm test lifecycle script", ["npm.cmd", "test"]]
  ];

  const availabilityProbe = execPolicyDecision(["git", "status"]);
  if (availabilityProbe === null) {
    t.skip(`${codexCommand()} is unavailable`);
    return;
  }

  for (const [label, tokens] of cases) {
    await t.test(label, () => {
      assert.equal(execPolicyDecision(tokens), "prompt", tokens.join(" "));
    });
  }
});

test("approval policy retains narrow read-only Git and npm inspections", async (t) => {
  const cases = [
    [["git", "status", "--short"], "allow"],
    [["git", "branch", "--show-current"], "allow"],
    [["git", "branch", "--list"], "allow"],
    [["git", "remote", "get-url", "origin"], "allow"],
    [["git", "tag", "--list"], "allow"],
    [["git", "rev-parse", "HEAD"], "allow"],
    [["npm.cmd", "ls"], "allow"],
    [["npm.cmd", "outdated"], "allow"]
  ];

  const availabilityProbe = execPolicyDecision(["git", "status"]);
  if (availabilityProbe === null) {
    t.skip(`${codexCommand()} is unavailable`);
    return;
  }

  for (const [tokens, expected] of cases) {
    await t.test(tokens.join(" "), () => {
      assert.equal(execPolicyDecision(tokens), expected, tokens.join(" "));
    });
  }
});

test("approval validator executes the full decision matrix", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-approval-"));
  const logPath = path.join(tempDir, "execpolicy.log");
  const fakeCodexPath = path.join(tempDir, process.platform === "win32" ? "codex.cmd" : "codex");
  const fakeCodex = process.platform === "win32"
    ? '@echo off\r\necho %*\u003e\u003e"%CODEX_CHEF_EXEC_LOG%"\r\necho {"decision":"allow"}\r\n'
    : '#!/bin/sh\nprintf "%s\\n" "$*" \u003e\u003e "$CODEX_CHEF_EXEC_LOG"\nprintf \'{"decision":"allow"}\\n\'\n';
  fs.writeFileSync(fakeCodexPath, fakeCodex, "utf8");
  if (process.platform !== "win32") fs.chmodSync(fakeCodexPath, 0o755);
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const env = { ...process.env, CODEX_CHEF_EXEC_LOG: logPath };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  env[pathKey] = `${tempDir}${path.delimiter}${env[pathKey] || ""}`;

  const result = spawnSync(process.execPath, ["scripts/validate-approval-harmony.mjs"], {
    cwd: root,
    encoding: "utf8",
    env,
    windowsHide: true
  });
  const executionLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";

  assert.notEqual(result.status, 0, "the fake allow-only policy must violate prompt expectations");
  assert.match(executionLog, /git branch -D obsolete/, "later Git mutation case was not executed");
  assert.match(executionLog, /npm\.cmd audit fix/, "later npm mutation case was not executed");
});
