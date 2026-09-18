#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "codex";
const configSource = path.join(root, "templates", "codex", process.platform === "win32" ? "config.windows.toml" : "config.unix.toml");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-config-compat-"));
const codexHome = path.join(fixtureRoot, ".codex");
fs.mkdirSync(codexHome);
fs.copyFileSync(configSource, path.join(codexHome, "config.toml"));
for (const name of ["full", "multi-session", "offline"]) {
  fs.copyFileSync(path.join(root, "templates", "codex", "profiles", `${name}.config.toml`), path.join(codexHome, `${name}.config.toml`));
}
try {
  for (const profile of [null, "full", "multi-session", "offline"]) {
    const strictArgs = [...(profile ? ["--profile", profile] : []), "--strict-config", "--version"];
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", `codex.cmd ${strictArgs.join(" ")}`]
      : strictArgs;
    const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 20000, env: { ...process.env, CODEX_HOME: codexHome } });
    if (result.error?.code === "ENOENT") {
      console.log("Codex config compatibility skipped: Codex CLI is not installed.");
      process.exit(0);
    }
    if (result.error?.code === "ETIMEDOUT") {
      console.error(`Codex strict config compatibility timed out${profile ? ` for profile ${profile}` : ""} after 20 seconds.`);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(`Codex strict config compatibility failed${profile ? ` for profile ${profile}` : ""}.`);
      console.error(String(result.stderr || result.stdout || "No output").trim());
      process.exit(1);
    }
  }
  console.log("Codex config compatibility passed: base plus full, multi-session, and offline profiles.");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
