#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.cwd());
const catalogPath = path.join(root, "catalog", "skills.json");
const lockPath = path.join(root, "catalog", "skills-lock.json");
const pinnedInstallerPath = path.join(root, "scripts", "install-pinned-skill.mjs");
const online = process.argv.includes("--online");
const timeoutArg = process.argv.find((arg) => arg.startsWith("--timeout-ms="));
const onlineTimeoutMs = timeoutArg ? Number(timeoutArg.split("=")[1]) : 90000;
const failures = [];

function fail(message) {
  failures.push(message);
}

function runPinnedSkillVerification(entry, cliVersion) {
  const args = [
    pinnedInstallerPath,
    "--package",
    entry.package,
    "--commit",
    entry.commit,
    "--skill",
    entry.skill,
    "--cli-version",
    cliVersion,
    "--verify-only"
  ];
  if (entry.fullDepth) args.push("--full-depth");
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      FORCE_COLOR: "0",
      GIT_CONFIG_COUNT: process.env.GIT_CONFIG_COUNT || "1",
      GIT_CONFIG_KEY_0: process.env.GIT_CONFIG_KEY_0 || "http.sslBackend",
      GIT_CONFIG_VALUE_0: process.env.GIT_CONFIG_VALUE_0 || "openssl",
      GIT_SSL_BACKEND: process.env.GIT_SSL_BACKEND || "openssl",
      NO_COLOR: "1",
      TERM: "dumb",
      npm_config_loglevel: "error"
    },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: onlineTimeoutMs,
    windowsHide: true
  });

  if (result.error) {
    fail(`Pinned skill verification failed for ${entry.name}: ${result.error.message}`);
    return;
  }

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    fail(`Pinned skill verification failed for ${entry.name}: ${output || `exit ${result.status}`}`);
  }
}

function verifySkillsCliIntegrity(version, expectedIntegrity) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd", "view", `skills@${version}`, "dist.integrity", "--json"]
    : ["view", `skills@${version}`, "dist.integrity", "--json"];
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: onlineTimeoutMs,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    fail(`Skills CLI integrity lookup failed: ${result.error?.message || output || `exit ${result.status}`}`);
    return;
  }
  let actual;
  try {
    actual = JSON.parse(result.stdout);
  } catch {
    actual = result.stdout.trim().replace(/^"|"$/g, "");
  }
  if (actual !== expectedIntegrity) {
    fail(`Skills CLI integrity mismatch for skills@${version}.`);
  }
}

if (!fs.existsSync(catalogPath)) {
  fail("Missing catalog/skills.json");
} else {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const lock = fs.existsSync(lockPath)
    ? JSON.parse(fs.readFileSync(lockPath, "utf8"))
    : null;
  const lockEntries = new Map((lock?.entries || []).map((entry) => [entry.name, entry]));
  const names = new Set();
  const installable = [];

  if (catalog.lockSemantics !== "commit-pinned") {
    fail("catalog/skills.json must declare lockSemantics=commit-pinned.");
  }
  if (!String(catalog.immutability || "").includes("full Git commit SHA")) {
    fail("catalog/skills.json must state that installable sources are commit-pinned.");
  }
  if (!/^\d+\.\d+\.\d+$/.test(catalog.skillsCliVersion || "")) {
    fail("catalog/skills.json must pin an exact skillsCliVersion.");
  }
  if (!String(catalog.skillsCliIntegrity || "").startsWith("sha512-")) {
    fail("catalog/skills.json must pin the Skills CLI registry integrity.");
  }

  if (!Array.isArray(catalog.skills)) {
    fail("catalog/skills.json must contain a skills array");
  } else {
    for (const entry of catalog.skills) {
      if (!entry.name || typeof entry.name !== "string") {
        fail("Every skill entry must have a string name");
        continue;
      }

      if (names.has(entry.name)) {
        fail(`Duplicate skill name: ${entry.name}`);
      }
      names.add(entry.name);

      if (!entry.category || typeof entry.category !== "string") {
        fail(`Skill ${entry.name} must declare a category`);
      }
      if (!entry.reason || typeof entry.reason !== "string") {
        fail(`Skill ${entry.name} must declare a reason`);
      }

      if (entry.install === true) {
        if (!entry.package || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(entry.package)) {
          fail(`Installable skill ${entry.name} must declare package as owner/repo`);
        }
        if (!entry.skill || typeof entry.skill !== "string" || !/^[A-Za-z0-9._-]+$/.test(entry.skill)) {
          fail(`Installable skill ${entry.name} must declare a single skill name`);
        }
        if (!/^[a-f0-9]{40}$/.test(entry.commit || "")) {
          fail(`Installable skill ${entry.name} must declare a full commit SHA`);
        }
        if (entry.source !== `${entry.package}@${entry.skill}`) {
          fail(`Installable skill ${entry.name} source must equal package@skill`);
        }
        for (const key of ["sourceUrl", "license", "risk", "lastChecked"]) {
          if (!entry[key]) {
            fail(`Installable skill ${entry.name} must declare ${key}`);
          }
        }
        const locked = lockEntries.get(entry.name);
        if (!locked) {
          fail(`catalog/skills-lock.json missing installable skill ${entry.name}`);
        } else {
          for (const key of ["package", "commit", "skill", "source", "sourceUrl", "license"]) {
            if (locked[key] !== entry[key]) {
              fail(`Skill lock mismatch for ${entry.name}: ${key}`);
            }
          }
          if (Boolean(locked.fullDepth) !== Boolean(entry.fullDepth)) {
            fail(`Skill lock mismatch for ${entry.name}: fullDepth`);
          }
          const expectedInstallCommand = entry.fullDepth
            ? `node scripts/install-pinned-skill.mjs --package ${entry.package} --commit ${entry.commit} --skill ${entry.skill} --cli-version ${catalog.skillsCliVersion} --full-depth`
            : `node scripts/install-pinned-skill.mjs --package ${entry.package} --commit ${entry.commit} --skill ${entry.skill} --cli-version ${catalog.skillsCliVersion}`;
          if (locked.installCommand !== expectedInstallCommand) {
            fail(`Skill lock installCommand mismatch for ${entry.name}`);
          }
        }
        installable.push(entry);
      }
    }
  }

  if (!lock) {
    fail("Missing catalog/skills-lock.json");
  } else {
    if (lock.lockSemantics !== "commit-pinned") {
      fail("catalog/skills-lock.json must declare lockSemantics=commit-pinned.");
    }
    if (!String(lock.immutability || "").includes("full upstream commit SHA")) {
      fail("catalog/skills-lock.json must state that it pins upstream commits.");
    }
    const installableNames = new Set(installable.map((entry) => entry.name));
    for (const name of lockEntries.keys()) {
      if (!installableNames.has(name)) {
        fail(`catalog/skills-lock.json pins ${name}, which is not an installable catalog skill`);
      }
    }
    if (
      lock.skillsCliVersion !== catalog.skillsCliVersion
      || lock.skillsCliIntegrity !== catalog.skillsCliIntegrity
    ) {
      fail("Skill lock must match the catalog Skills CLI version and integrity pins.");
    }
  }

  if (online && failures.length === 0) {
    verifySkillsCliIntegrity(catalog.skillsCliVersion, catalog.skillsCliIntegrity);
    installable.forEach((entry, index) => {
      console.log(`Checking installable skill ${index + 1}/${installable.length}: ${entry.name}`);
      runPinnedSkillVerification(entry, catalog.skillsCliVersion);
    });
  }

  if (failures.length === 0) {
    const mode = online ? "offline schema + online resolution" : "offline schema";
    console.log(`Skill source verification passed (${mode}). Checked ${installable.length} installable skills.`);
  }
}

if (failures.length > 0) {
  console.error("Skill source verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
