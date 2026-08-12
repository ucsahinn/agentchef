#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertManagedTargetPath } from "./lib/managed-path-safety.mjs";
import { activatePinnedSkill } from "./lib/pinned-skill-activation.mjs";
import {
  hashSkillTree,
  inspectPinnedSkillOwnership,
  inspectPinnedSkillTarget,
  inspectSkillTree,
  skillFrontmatterName
} from "./lib/skill-provenance.mjs";
import {
  CliUsageError,
  installCliErrorBoundary,
  requireCliValue
} from "./lib/cli-error-contract.mjs";

const args = process.argv.slice(2);
installCliErrorBoundary({
  tool: "install-pinned-skill",
  argv: args,
  root: process.cwd(),
  prefix: "Pinned skill installation failed"
});
const options = {
  package: "",
  commit: "",
  skill: "",
  cliVersion: "",
  fullDepth: false,
  adoptExisting: false,
  verifyOnly: false,
  json: false
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--full-depth") options.fullDepth = true;
  else if (arg === "--adopt-existing") options.adoptExisting = true;
  else if (arg === "--verify-only") options.verifyOnly = true;
  else if (arg === "--json") options.json = true;
  else if (["--package", "--commit", "--skill", "--cli-version"].includes(arg)) {
    const key = {
      "--package": "package",
      "--commit": "commit",
      "--skill": "skill",
      "--cli-version": "cliVersion"
    }[arg];
    options[key] = requireCliValue(args, index, arg);
    index += 1;
  } else {
    throw new CliUsageError(`Unknown argument: ${arg}`);
  }
}

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.package)) {
  throw new CliUsageError("--package must be a single owner/repo identifier.");
}
if (!/^[a-f0-9]{40}$/.test(options.commit)) {
  throw new CliUsageError("--commit must be a full lowercase Git commit SHA.");
}
if (!/^[A-Za-z0-9._-]+$/.test(options.skill)) {
  throw new CliUsageError("--skill must be a single safe skill name.");
}
if (!/^\d+\.\d+\.\d+$/.test(options.cliVersion)) {
  throw new CliUsageError("--cli-version must be an exact semantic version.");
}

const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-skill-"));
const githubUrl = `https://github.com/${options.package}.git`;

function run(command, args, label, extra = {}) {
  const result = spawnSync(command, args, {
    cwd: extra.cwd || checkout,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: process.env.CI || "1",
      FORCE_COLOR: process.env.FORCE_COLOR || "0",
      GIT_CONFIG_COUNT: process.env.GIT_CONFIG_COUNT || "1",
      GIT_CONFIG_KEY_0: process.env.GIT_CONFIG_KEY_0 || "http.sslBackend",
      GIT_CONFIG_VALUE_0: process.env.GIT_CONFIG_VALUE_0 || "openssl",
      GIT_SSL_BACKEND: process.env.GIT_SSL_BACKEND || "openssl",
      NO_COLOR: process.env.NO_COLOR || "1",
      TERM: process.env.TERM || "dumb"
    },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: extra.timeout || 120000,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed: ${result.error?.message || output || `exit ${result.status}`}`);
  }
  return result.stdout.trim();
}

function findSkillDirectories(root) {
  const matches = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const absolute = path.join(current, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`Pinned skill source contains a symbolic link or junction: ${absolute}`);
      }
      if (stat.isDirectory()) {
        pending.push(absolute);
      } else if (stat.isFile() && entry.name === "SKILL.md") {
        const text = fs.readFileSync(absolute, "utf8");
        if (skillFrontmatterName(text) === options.skill) {
          matches.push(path.dirname(absolute));
        }
      }
    }
  }
  return matches;
}

function inspectInstalledTarget(target, expectedHash, requireProvenance = true) {
  assertManagedTargetPath(target, [path.dirname(path.dirname(target))]);
  if (!requireProvenance) return inspectSkillTree(target, options.skill, expectedHash);
  return inspectPinnedSkillTarget(target, {
    package: options.package,
    commit: options.commit,
    skill: options.skill,
    cliVersion: options.cliVersion,
    sourceTreeSha256: expectedHash
  });
}

function removeCheckout() {
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(checkout);
  const relative = path.relative(tempRoot, resolved);
  if (
    !path.basename(resolved).startsWith("codex-chef-pinned-skill-")
    || relative.startsWith("..")
    || path.isAbsolute(relative)
  ) {
    throw new Error(`Refusing to remove an unexpected temporary checkout: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function emitResult(outcome, message) {
  if (options.json) {
    console.log(JSON.stringify({
      schemaVersion: "codex-chef.pinned-skill-install-result.v1",
      status: "ok",
      outcome,
      skill: options.skill,
      package: options.package,
      commit: options.commit,
      message
    }));
    return;
  }
  console.log(message);
}

let operationError = null;
try {
  run("git", ["init", "--quiet"], "Git initialization");
  run("git", ["remote", "add", "origin", githubUrl], "Git remote configuration");
  const fetchArgs = ["-c", "http.sslBackend=openssl", "fetch", "--quiet"];
  if (!options.fullDepth) fetchArgs.push("--depth", "1");
  fetchArgs.push("origin", options.commit);
  run("git", fetchArgs, `Pinned fetch for ${options.package}@${options.commit}`);
  run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], "Pinned checkout");
  const actualCommit = run("git", ["rev-parse", "HEAD"], "Pinned commit verification").toLowerCase();
  if (actualCommit !== options.commit) {
    throw new Error(`Pinned checkout mismatch: expected ${options.commit}, received ${actualCommit}.`);
  }

  const matches = findSkillDirectories(checkout);
  if (matches.length !== 1) {
    throw new Error(
      `Pinned source must contain exactly one ${options.skill} skill; found ${matches.length} at ${options.package}@${options.commit}.`
    );
  }
  const sourceHash = hashSkillTree(matches[0]);

  if (options.verifyOnly) {
    emitResult(
      "verified",
      `Verified pinned skill ${options.skill} from ${options.package}@${options.commit}.`
    );
  } else {
    const agentsHome = path.resolve(process.env.AGENTS_HOME || path.join(os.homedir(), ".agents"));
    const codexHome = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
    const target = path.join(agentsHome, "skills", options.skill);
    const backupRoot = path.join(
      codexHome,
      "backups",
      `codex-chef-skill-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${options.skill}`
    );
    assertManagedTargetPath(target, [agentsHome]);
    assertManagedTargetPath(backupRoot, [codexHome]);
    const existing = inspectInstalledTarget(target, sourceHash);
    const targetExists = fs.existsSync(target);
    const ownership = targetExists
      ? inspectPinnedSkillOwnership(target, {
        package: options.package,
        skill: options.skill
      })
      : { valid: false };
    if (existing.valid) {
      emitResult("already-current", `Pinned skill already current: ${options.skill}.`);
      process.exitCode = 0;
    } else if (
      targetExists
      && !ownership.valid
      && !options.adoptExisting
    ) {
      emitResult(
        "skipped-user-owned",
        `Skipped existing user-owned skill ${options.skill}; rerun this exact command with --adopt-existing only after reviewing that target.`
      );
      process.exitCode = 0;
    } else {
      activatePinnedSkill({
        source: matches[0],
        target,
        backupRoot,
        managedRoots: [agentsHome, codexHome],
        allowAdopt: options.adoptExisting,
        expected: {
          package: options.package,
          commit: options.commit,
          skill: options.skill,
          cliVersion: options.cliVersion,
          sourceTreeSha256: sourceHash
        }
      });
      const outcome = targetExists
        ? ownership.valid
          ? "upgraded"
          : "adopted"
        : "installed";
      emitResult(
        outcome,
        `Installed pinned skill ${options.skill} by native copy from ${options.package}@${options.commit}.`
      );
    }
  }
} catch (error) {
  operationError = error;
  throw error;
} finally {
  try {
    removeCheckout();
  } catch (cleanupError) {
    if (operationError) {
      console.error(`Pinned skill checkout cleanup also failed: ${cleanupError.message}`);
    } else {
      throw cleanupError;
    }
  }
}
