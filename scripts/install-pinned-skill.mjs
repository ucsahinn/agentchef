#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertManagedTargetPath } from "./lib/managed-path-safety.mjs";
import {
  activatePinnedSkill,
  compensatePinnedSkillInstall
} from "./lib/pinned-skill-activation.mjs";
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
  json: false,
  rollbackReceipt: ""
};

const PINNED_SOURCE_RECEIPT = ".agentchef-pinned-source.json";
const PINNED_SOURCE_RECEIPT_SCHEMA = "agentchef.pinned-skill-source.v1";

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--full-depth") options.fullDepth = true;
  else if (arg === "--adopt-existing") options.adoptExisting = true;
  else if (arg === "--verify-only") options.verifyOnly = true;
  else if (arg === "--json") options.json = true;
  else if (["--package", "--commit", "--skill", "--cli-version", "--rollback-receipt"].includes(arg)) {
    const key = {
      "--package": "package",
      "--commit": "commit",
      "--skill": "skill",
      "--cli-version": "cliVersion",
      "--rollback-receipt": "rollbackReceipt"
    }[arg];
    options[key] = requireCliValue(args, index, arg);
    index += 1;
  } else {
    throw new CliUsageError(`Unknown argument: ${arg}`);
  }
}

if (options.rollbackReceipt && (options.package || options.commit || options.skill || options.cliVersion || options.fullDepth || options.adoptExisting || options.verifyOnly)) {
  throw new CliUsageError("--rollback-receipt cannot be combined with installation arguments.");
}
if (!options.rollbackReceipt && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.package)) {
  throw new CliUsageError("--package must be a single owner/repo identifier.");
}
if (!options.rollbackReceipt && !/^[a-f0-9]{40}$/.test(options.commit)) {
  throw new CliUsageError("--commit must be a full lowercase Git commit SHA.");
}
if (!options.rollbackReceipt && !/^[A-Za-z0-9._-]+$/.test(options.skill)) {
  throw new CliUsageError("--skill must be a single safe skill name.");
}
if (!options.rollbackReceipt && !/^\d+\.\d+\.\d+$/.test(options.cliVersion)) {
  throw new CliUsageError("--cli-version must be an exact semantic version.");
}

const codexHome = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
if (options.rollbackReceipt) {
  const agentsHome = path.resolve(process.env.AGENTS_HOME || path.join(os.homedir(), ".agents"));
  const result = compensatePinnedSkillInstall({
    receiptPath: options.rollbackReceipt,
    managedRoots: [agentsHome, codexHome]
  });
  if (options.json) {
    console.log(JSON.stringify({
      schemaVersion: "agentchef.pinned-skill-install-compensation.v1",
      status: "ok",
      outcome: "compensated",
      ...result
    }));
  } else {
    console.log("Pinned skill installation compensated.");
  }
} else {
const githubUrl = `https://github.com/${options.package}.git`;
const sourceCacheKey = crypto
  .createHash("sha256")
  .update(`${options.package}@${options.commit}:${options.fullDepth ? "full" : "shallow"}`)
  .digest("hex");
const sourceCacheRoot = path.join(codexHome, "cache", "pinned-skill-sources");
const sourceCachePath = path.join(sourceCacheRoot, sourceCacheKey);
let checkout = null;
let temporaryCheckout = false;

function sourceReceiptMatches(checkoutPath) {
  try {
    const receipt = JSON.parse(
      fs.readFileSync(path.join(checkoutPath, PINNED_SOURCE_RECEIPT), "utf8")
    );
    if (
      receipt.schemaVersion !== PINNED_SOURCE_RECEIPT_SCHEMA
      || receipt.package !== options.package
      || receipt.commit !== options.commit
      || receipt.fullDepth !== options.fullDepth
    ) {
      return false;
    }
    return run("git", ["rev-parse", "HEAD"], "Cached pinned commit verification", {
      cwd: checkoutPath
    }).toLowerCase() === options.commit;
  } catch {
    return false;
  }
}

function run(command, args, label, extra = {}) {
  const result = spawnSync(command, args, {
    cwd: extra.cwd || checkout || process.cwd(),
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
  if (!temporaryCheckout || !checkout) return;
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(checkout);
  const relative = path.relative(tempRoot, resolved);
  if (
    !path.basename(resolved).startsWith("agentchef-pinned-skill-")
    || relative.startsWith("..")
    || path.isAbsolute(relative)
  ) {
    throw new Error(`Refusing to remove an unexpected temporary checkout: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function checkoutPinnedSource() {
  assertManagedTargetPath(sourceCacheRoot, [codexHome]);
  assertManagedTargetPath(sourceCachePath, [codexHome]);
  if (fs.existsSync(sourceCachePath) && sourceReceiptMatches(sourceCachePath)) {
    checkout = sourceCachePath;
    return { cacheHit: true };
  }

  checkout = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-pinned-skill-"));
  temporaryCheckout = true;
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
  return { cacheHit: false };
}

function publishPinnedSourceCache() {
  if (!temporaryCheckout || fs.existsSync(sourceCachePath)) return;
  fs.mkdirSync(sourceCacheRoot, { recursive: true });
  assertManagedTargetPath(sourceCacheRoot, [codexHome]);
  fs.writeFileSync(
    path.join(checkout, PINNED_SOURCE_RECEIPT),
    `${JSON.stringify({
      schemaVersion: PINNED_SOURCE_RECEIPT_SCHEMA,
      package: options.package,
      commit: options.commit,
      fullDepth: options.fullDepth
    })}\n`,
    "utf8"
  );
  try {
    fs.renameSync(checkout, sourceCachePath);
    checkout = sourceCachePath;
    temporaryCheckout = false;
  } catch (error) {
    if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
  }
}

function emitResult(outcome, message, compensation = null) {
  if (options.json) {
    console.log(JSON.stringify({
      schemaVersion: "agentchef.pinned-skill-install-result.v1",
      status: "ok",
      outcome,
      skill: options.skill,
      package: options.package,
      commit: options.commit,
      message,
      compensation
    }));
    return;
  }
  console.log(message);
}

let operationError = null;
try {
  checkoutPinnedSource();
  const matches = findSkillDirectories(checkout);
  if (matches.length !== 1) {
    throw new Error(
      `Pinned source must contain exactly one ${options.skill} skill; found ${matches.length} at ${options.package}@${options.commit}.`
    );
  }
  const sourceHash = hashSkillTree(matches[0]);
  const sourceRelativePath = path.relative(checkout, matches[0]);
  publishPinnedSourceCache();
  const source = path.join(checkout, sourceRelativePath);

  if (options.verifyOnly) {
    emitResult(
      "verified",
      `Verified pinned skill ${options.skill} from ${options.package}@${options.commit}.`
    );
  } else {
    const agentsHome = path.resolve(process.env.AGENTS_HOME || path.join(os.homedir(), ".agents"));
    const target = path.join(agentsHome, "skills", options.skill);
    const backupRoot = path.join(
      codexHome,
      "backups",
      `agentchef-skill-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${options.skill}`
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
      const activation = activatePinnedSkill({
        source,
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
        `Installed pinned skill ${options.skill} by native copy from ${options.package}@${options.commit}.`,
        activation.compensation
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
}
