#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// `codex --strict-config --version` exits 0 without reading config.toml, so it
// cannot detect anything. `codex exec --strict-config` does load it; pointing
// the run at a provider that does not exist makes it stop right after a
// successful load, before any auth or network. The expected outcome is
// therefore exactly the "provider not found" error, and a canary with an
// unknown field must be rejected, or the probe itself has stopped working.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "codex";
const configSource = path.join(root, "templates", "codex", process.platform === "win32" ? "config.windows.toml" : "config.unix.toml");
const probeProvider = "agentchef-compat-probe";
const loadedSignal = `Model provider \`${probeProvider}\` not found`;
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-config-compat-"));

function prepareHome(name, extraConfig = "") {
  const codexHome = path.join(fixtureRoot, name, ".codex");
  fs.mkdirSync(codexHome, { recursive: true });
  const configPath = path.join(codexHome, "config.toml");
  fs.writeFileSync(configPath, `${fs.readFileSync(configSource, "utf8").trimEnd()}\n${extraConfig}`);
  // Installed profiles are rendered from the installed config, not copied.
  for (const profile of ["full", "multi-session", "offline"]) {
    const rendered = spawnSync(process.execPath, [
      path.join(root, "scripts", "merge-codex-config.mjs"),
      "--render-mcp-profile",
      "--source", configPath,
      "--template", path.join(root, "templates", "codex", "profiles", `${profile}.config.toml`),
      "--output", path.join(codexHome, `${profile}.config.toml`)
    ], { encoding: "utf8" });
    if (rendered.status !== 0) {
      throw new Error(`Could not render the ${profile} profile: ${String(rendered.stderr || rendered.stdout).trim()}`);
    }
  }
  return codexHome;
}

function probe(codexHome, profile) {
  const probeArgs = [
    "exec", "--strict-config", "--ephemeral", "--skip-git-repo-check",
    ...(profile ? ["--profile", profile] : []),
    "-c", `model_provider=${probeProvider}`, "noop"
  ];
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `codex.cmd ${probeArgs.join(" ")}`]
    : probeArgs;
  const result = spawnSync(command, args, {
    cwd: fixtureRoot,
    encoding: "utf8",
    timeout: 60000,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CODEX_HOME: codexHome }
  });
  return { result, output: `${result.stdout || ""}${result.stderr || ""}` };
}

function isMissingCli({ result, output }) {
  if (result.error?.code === "ENOENT") return true;
  return process.platform === "win32" && /'codex\.cmd' is not recognized/i.test(output);
}

let exitCode = 0;
try {
  const codexHome = prepareHome("candidate");
  for (const profile of [null, "full", "multi-session", "offline"]) {
    const label = profile ? `profile ${profile}` : "base config";
    const attempt = probe(codexHome, profile);
    if (isMissingCli(attempt)) {
      console.log("Codex config compatibility skipped: Codex CLI is not installed.");
      process.exit(0);
    }
    if (attempt.result.error?.code === "ETIMEDOUT") {
      console.error(`Codex strict config compatibility timed out for the ${label} after 60 seconds.`);
      exitCode = 1;
      break;
    }
    if (!attempt.output.includes(loadedSignal)) {
      console.error(`Codex strict config compatibility failed for the ${label}.`);
      console.error(attempt.output.trim() || "No output");
      exitCode = 1;
      break;
    }
  }

  if (exitCode === 0) {
    const canary = probe(prepareHome("canary", "\n[agentchef_compat_canary]\nunknown_field = 1\n"), null);
    if (canary.output.includes(loadedSignal) || !/unknown configuration field/i.test(canary.output)) {
      console.error("Codex strict config probe no longer rejects an unknown field, so it cannot vouch for the templates. Update scripts/validate-codex-config-compat.mjs for this Codex version.");
      console.error(canary.output.trim() || "No output");
      exitCode = 1;
    }
  }

  if (exitCode === 0) {
    console.log("Codex config compatibility passed: base plus full, multi-session, and offline profiles load under --strict-config, and an unknown-field canary is rejected.");
  }
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
process.exit(exitCode);
