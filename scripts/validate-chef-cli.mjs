#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  hashSkillTree,
  pinnedSkillProvenanceFileName,
  pinnedSkillSchemaVersion
} from "./lib/skill-provenance.mjs";
import { activatePinnedSkill } from "./lib/pinned-skill-activation.mjs";
import { acquireOperationLock } from "./lib/operation-lock.mjs";
import { writeDirectSkillMarker } from "./manage-direct-skill-target.mjs";
import { scaledTimeout } from "./lib/test-timeouts.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const failures = [];
const skillCatalog = JSON.parse(read("catalog/skills.json"));
const skillCounts = {
  upstream: skillCatalog.skills.filter((skill) => skill.install === true).length,
  direct: skillCatalog.skills.filter((skill) => skill.directInstall === true).length
};
skillCounts.total = skillCounts.upstream + skillCounts.direct;

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function runNodeCheck(relativePath) {
  const result = spawnSync(process.execPath, ["--check", relativePath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  if (result.error) {
    fail(`node --check failed for ${relativePath}: ${result.error.message}`);
  } else if (result.status !== 0) {
    fail(`node --check failed for ${relativePath}: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
}

function runCliSmoke(name, cliArgs, expectedSnippets, extra = {}) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/chef-cli.mjs"), ...cliArgs], {
    cwd: extra.cwd || root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(extra.env || {})
    },
    windowsHide: true,
    timeout: extra.timeout || 180000
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.error) {
    fail(`chef-cli smoke ${name} failed: ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    fail(`chef-cli smoke ${name} exited ${result.status}: ${output.trim()}`);
    return;
  }
  for (const snippet of expectedSnippets) {
    if (!output.includes(snippet)) fail(`chef-cli smoke ${name} missing output snippet: ${snippet}`);
  }
  if (extra.forbiddenSnippets) {
    for (const snippet of extra.forbiddenSnippets) {
      if (output.includes(snippet)) fail(`chef-cli smoke ${name} must not include output snippet: ${snippet}`);
    }
  }
  if (extra.maxLines) {
    const lineCount = output.split(/\r?\n/).filter((line) => line.trim()).length;
    if (lineCount > extra.maxLines) fail(`chef-cli smoke ${name} should be <= ${extra.maxLines} non-empty lines, got ${lineCount}`);
  }
  if (extra.maxVisualWidth) {
    const ansiPattern = /\x1b\[[0-9;]*m/g;
    for (const [index, line] of output.split(/\r?\n/).entries()) {
      const width = line.replace(ansiPattern, "").length;
      if (width > extra.maxVisualWidth) {
        fail(`chef-cli smoke ${name} line ${index + 1} exceeds ${extra.maxVisualWidth} columns (${width})`);
        break;
      }
    }
  }
  if (output.includes("Log: tmp/chef-cli/logs")) {
    fail(`chef-cli smoke ${name} should not create logs when --no-log is used`);
  }
  const hasAnsi = /\x1b\[[0-9;]*m/.test(output);
  if (extra.expectAnsi && !hasAnsi) {
    fail(`chef-cli smoke ${name} should include ANSI color when color is forced`);
  }
  if (extra.forbidAnsi && hasAnsi) {
    fail(`chef-cli smoke ${name} should not include ANSI color`);
  }
}

function runCliSmokeRaw(name, cliArgs, extra = {}) {
  const expectedStatus = extra.expectedStatus ?? 0;
  const requestedEnv = extra.env || {};
  const childEnv = {
    ...process.env,
    ...requestedEnv
  };
  const forceColor = String(childEnv.FORCE_COLOR || "").toLowerCase();
  if (
    forceColor !== "" &&
    forceColor !== "0" &&
    forceColor !== "false" &&
    Object.hasOwn(requestedEnv, "NO_COLOR")
  ) {
    fail(`chef-cli smoke ${name} must not export NO_COLOR while FORCE_COLOR is enabled`);
    return { ok: false, output: "", stdout: "", stderr: "" };
  }
  if (forceColor !== "" && forceColor !== "0" && forceColor !== "false") {
    delete childEnv.NO_COLOR;
  }
  const result = spawnSync(process.execPath, [path.join(root, "scripts/chef-cli.mjs"), ...cliArgs], {
    cwd: extra.cwd || root,
    encoding: "utf8",
    input: extra.input,
    stdio: [extra.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    env: childEnv,
    windowsHide: true,
    timeout: extra.timeout || 180000
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.error) {
    fail(`chef-cli smoke ${name} failed: ${result.error.message}`);
    return { ok: false, output, stdout: result.stdout || "", stderr: result.stderr || "" };
  }
  if (result.status !== expectedStatus) {
    fail(`chef-cli smoke ${name} exited ${result.status}, expected ${expectedStatus}: ${output.trim()}`);
    return { ok: false, output, stdout: result.stdout || "", stderr: result.stderr || "" };
  }
  return { ok: true, output, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function countOccurrences(value, needle) {
  return String(value || "").split(needle).length - 1;
}

function createCuratedSkillFixture(rootPath, { invalid = [] } = {}) {
  const catalog = JSON.parse(read("catalog/skills.json"));
  const installable = catalog.skills.filter((skill) => skill.install === true);
  const bundled = catalog.skills.filter((skill) => skill.directInstall === true);
  const upstreamRoot = path.join(rootPath, ".codex", "skills");
  for (const skill of installable) {
    const skillRoot = path.join(upstreamRoot, skill.name);
    fs.mkdirSync(skillRoot, { recursive: true });
    if (!invalid.includes(skill.name)) {
      fs.writeFileSync(
        path.join(skillRoot, "SKILL.md"),
        `---\nname: ${skill.name}\ndescription: Test fixture for ${skill.name}.\n---\n`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(skillRoot, pinnedSkillProvenanceFileName),
        `${JSON.stringify({
          schemaVersion: pinnedSkillSchemaVersion,
          package: skill.package,
          commit: skill.commit,
          skill: skill.skill,
          cliVersion: catalog.skillsCliVersion,
          sourceTreeSha256: hashSkillTree(skillRoot)
        }, null, 2)}\n`,
        "utf8"
      );
    }
  }
  const directRoot = path.join(rootPath, ".agents", "skills");
  for (const skill of bundled) {
    const source = path.join(root, "plugins", "agentchef-workflows", "skills", skill.name);
    const target = path.join(directRoot, skill.name);
    if (invalid.includes(skill.name)) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.cpSync(source, target, { recursive: true });
    writeDirectSkillMarker(source, target);
  }
  return {
    CODEX_HOME: path.join(rootPath, ".codex"),
    AGENTS_HOME: path.join(rootPath, ".agents")
  };
}

function runMenuTranscriptSmoke() {
  const baseEnv = {
    AGENTCHEF_TEST_MENU: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    COLUMNS: "72"
  };
  const invalid = runCliSmokeRaw("menu-invalid-input-transcript", ["--plain", "--no-log"], {
    env: baseEnv,
    input: "\nabc\n999\nq\n",
    timeout: scaledTimeout(30000)
  });
  if (invalid.ok) {
    if (!invalid.output.includes("Operator menu")) fail("chef-cli menu transcript must render the operator menu");
    if (!invalid.output.includes("OPERATOR BOARD")) fail("chef-cli menu transcript must render the enterprise operator board title");
    if (!invalid.output.includes("Mode: Local operator")) fail("chef-cli menu transcript must show the local operator status strip");
    if (!invalid.output.includes("Legend: SAFE")) fail("chef-cli menu transcript must show the write-boundary legend");
    if (!invalid.output.includes("Check")) fail("chef-cli menu transcript must group actions by operator intent");
    if (!invalid.output.includes("██╗   ██╗   ██████╗   ███████╗")) fail("chef-cli menu must render the large U.C.Ş signature before the operator board");
    if (invalid.output.includes("U . C . Ş")) fail("chef-cli menu signature must not repeat U.C.Ş as a small caption");
    if (!invalid.output.includes("System status")) fail("chef-cli menu transcript must use natural-language action labels");
    if (!invalid.output.includes("Impact")) fail("chef-cli menu transcript must use natural-language impact wording instead of raw write jargon");
    if (!invalid.output.includes("Shortcuts: l = language, q = quit")) fail("chef-cli menu transcript must show language and quit shortcuts");
    for (const line of invalid.output.split(/\r?\n/).filter((entry) => entry.includes("Shortcuts:"))) {
      if (line.length > 72) fail(`chef-cli menu shortcut line must fit 72 columns, got ${line.length}`);
    }
    if (countOccurrences(invalid.output, "Operator menu") !== 1) {
      fail("chef-cli menu transcript must not repaint the full menu for empty or invalid input");
    }
    if (countOccurrences(invalid.output, "Choose 1-") < 3) {
      fail("chef-cli menu transcript must give compact validation for empty and invalid input");
    }
  }

  const language = runCliSmokeRaw("menu-language-toggle-transcript", ["--plain", "--no-log"], {
    env: baseEnv,
    input: "l\nq\n",
    timeout: scaledTimeout(30000)
  });
  if (language.ok) {
    for (const snippet of ["Opening: Language", "Dil Türkçe olarak ayarlandı", "Dil: hazır", "Operatör menüsü"]) {
      if (!language.output.includes(snippet)) fail(`chef-cli menu language transcript missing output snippet: ${snippet}`);
    }
  }

  const action = runCliSmokeRaw("menu-action-return-transcript", ["--plain", "--no-log"], {
    env: baseEnv,
    input: "2\n\nq\n",
    timeout: scaledTimeout(180000)
  });
  if (action.ok) {
    for (const snippet of ["Opening: Repo health", "Press Enter to return to the operator board.", "Repo health: ready"]) {
      if (!action.output.includes(snippet)) fail(`chef-cli menu action transcript missing output snippet: ${snippet}`);
    }
    if (countOccurrences(action.output, "Operator menu") !== 2) {
      fail("chef-cli menu action transcript must render one menu before action and one menu after explicit return");
    }
  }

  const interactiveWriteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-menu-write-"));
  const interactiveRepair = runCliSmokeRaw("menu-repair-typed-apply-transcript", ["--plain", "--no-log"], {
    env: {
      ...baseEnv,
      CODEX_HOME: path.join(interactiveWriteRoot, ".codex"),
      AGENTS_HOME: path.join(interactiveWriteRoot, ".agents")
    },
    input: "8\nAPPLY\n\nq\n",
    timeout: scaledTimeout(120000)
  });
  if (interactiveRepair.ok) {
    for (const snippet of ["Opening: Repair setup", "Type APPLY to continue", "Mode: apply"]) {
      if (!interactiveRepair.output.includes(snippet)) {
        fail(`chef-cli menu repair must apply after typed confirmation without requiring a restart flag: ${snippet}`);
      }
    }
    if (interactiveRepair.output.includes("Rerun with --apply")) {
      fail("chef-cli menu repair must not tell interactive users to rerun with --apply.");
    }
  }

  const menuApplyStillConfirms = runCliSmokeRaw("menu-apply-is-not-session-latch", ["--plain", "--no-log", "--apply"], {
    env: {
      ...baseEnv,
      CODEX_HOME: path.join(interactiveWriteRoot, ".codex-latch-test"),
      AGENTS_HOME: path.join(interactiveWriteRoot, ".agents-latch-test")
    },
    input: "8\n\n\nq\n",
    timeout: scaledTimeout(120000)
  });
  if (menuApplyStillConfirms.ok && !menuApplyStillConfirms.output.includes("Type APPLY to continue")) {
    fail("chef-cli menu must request per-action typed confirmation even when the process starts with --apply.");
  }

  const interactiveResetCancel = runCliSmokeRaw("menu-reset-typed-apply-transcript", ["--plain", "--no-log"], {
    env: baseEnv,
    input: "7\n\n\nq\n",
    timeout: scaledTimeout(120000)
  });
  if (interactiveResetCancel.ok) {
    for (const snippet of ["Opening: Refresh setup", "Type APPLY to continue"]) {
      if (!interactiveResetCancel.output.includes(snippet)) {
        fail(`chef-cli menu reset must request typed confirmation in the current session: ${snippet}`);
      }
    }
    if (interactiveResetCancel.output.includes("Add --apply")) {
      fail("chef-cli menu reset must not tell interactive users to add --apply.");
    }
  }

  const installedSkillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-menu-skills-ready-"));
  const installedSkillsEnv = createCuratedSkillFixture(installedSkillsRoot);
  const skillSelection = runCliSmokeRaw("menu-skills-selection-transcript", ["--plain", "--no-log"], {
    env: {
      ...baseEnv,
      ...installedSkillsEnv
    },
    input: "10\n\nq\n",
    timeout: scaledTimeout(30000)
  });
  if (skillSelection.ok) {
    for (const snippet of [
      "Opening: Skill status & catalog",
      "Installed (ready)",
      "All AgentChef-managed skills are installed and ready.",
      "Press Enter to return to the operator board."
    ]) {
      if (!skillSelection.output.includes(snippet)) {
        fail(`chef-cli menu skills transcript missing output snippet: ${snippet}`);
      }
    }
    if (skillSelection.output.includes("Choose a skill to install")) {
      fail("chef-cli menu skills transcript must not offer installation when every curated skill is ready.");
    }
    if (/unsettled top-level await|AbortError|ABORT_ERR/i.test(skillSelection.output)) {
      fail("chef-cli menu skills transcript must not leak readline lifecycle warnings");
    }
  }

  const missingSkillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-menu-skills-missing-"));
  const skillInstallCancel = runCliSmokeRaw("menu-skills-typed-apply-transcript", ["--plain", "--no-log"], {
    env: {
      ...baseEnv,
      CODEX_HOME: path.join(missingSkillsRoot, ".codex"),
      AGENTS_HOME: path.join(missingSkillsRoot, ".agents")
    },
    input: "10\n1\n\n\nq\n",
    timeout: scaledTimeout(30000)
  });
  if (skillInstallCancel.ok) {
    if (!skillInstallCancel.output.includes("Type APPLY to continue")) {
      fail("chef-cli menu skill install must request typed confirmation in the current session.");
    }
    if (/Re-run .*--skills --apply/.test(skillInstallCancel.output)) {
      fail("chef-cli menu skill install must not tell interactive users to rerun with --apply.");
    }
  }

  const backupMenuRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-menu-backup-"));
  const backupMenuCodexHome = path.join(backupMenuRoot, ".codex");
  const backupMenuArchive = path.join(backupMenuCodexHome, "backups", "agentchef-menu-test", "codex");
  fs.mkdirSync(backupMenuArchive, { recursive: true });
  fs.writeFileSync(path.join(backupMenuArchive, "AGENTS.md"), "menu backup fixture\n", "utf8");
  spawnSync(process.execPath, [
    path.join(root, "scripts", "write-backup-manifest.mjs"),
    "--backup-root",
    path.dirname(backupMenuArchive),
    "--operation",
    "menu-fixture"
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const backupInspect = runCliSmokeRaw("menu-backup-inspect-transcript", ["--plain", "--no-log"], {
    env: {
      ...baseEnv,
      CODEX_HOME: backupMenuCodexHome,
      AGENTS_HOME: path.join(backupMenuRoot, ".agents")
    },
    input: "9\n1\n1\n\nq\n",
    timeout: scaledTimeout(30000)
  });
  if (backupInspect.ok) {
    for (const snippet of ["Choose a backup number", "Backup action", "Backup details", "agentchef-menu-test"]) {
      if (!backupInspect.output.includes(snippet)) {
        fail(`chef-cli backup menu must support same-session selection and inspection: ${snippet}`);
      }
    }
    if (backupInspect.output.includes("npm run chef -- --backups")) {
      fail("chef-cli backup menu must not send interactive users back to parameterized backup commands.");
    }
  }

  const backupRestoreCancel = runCliSmokeRaw("menu-backup-restore-confirmation-transcript", ["--plain", "--no-log"], {
    env: {
      ...baseEnv,
      CODEX_HOME: backupMenuCodexHome,
      AGENTS_HOME: path.join(backupMenuRoot, ".agents")
    },
    input: "9\n1\n2\n\n\nq\n",
    timeout: scaledTimeout(30000)
  });
  if (backupRestoreCancel.ok && !backupRestoreCancel.output.includes("Type APPLY to continue")) {
    fail("chef-cli backup restore menu must request typed APPLY confirmation in the current session.");
  }

  const backupDeleteWrong = runCliSmokeRaw("menu-backup-delete-wrong-confirmation", ["--plain", "--no-log"], {
    env: {
      ...baseEnv,
      CODEX_HOME: backupMenuCodexHome,
      AGENTS_HOME: path.join(backupMenuRoot, ".agents")
    },
    input: "9\n1\n3\nDELETE wrong-backup\n\nq\n",
    timeout: scaledTimeout(30000)
  });
  if (backupDeleteWrong.ok) {
    if (!backupDeleteWrong.output.includes("Type DELETE agentchef-menu-test")) {
      fail("chef-cli backup delete menu must bind confirmation to the selected archive id.");
    }
    if (!fs.existsSync(path.dirname(backupMenuArchive))) {
      fail("chef-cli backup delete menu must preserve the archive after a wrong confirmation phrase.");
    }
  }

  const backupDeleteExact = runCliSmokeRaw("menu-backup-delete-exact-confirmation", ["--plain", "--no-log"], {
    env: {
      ...baseEnv,
      CODEX_HOME: backupMenuCodexHome,
      AGENTS_HOME: path.join(backupMenuRoot, ".agents")
    },
    input: "9\n1\n3\nDELETE agentchef-menu-test\n\nq\n",
    timeout: scaledTimeout(30000)
  });
  if (backupDeleteExact.ok) {
    if (!backupDeleteExact.output.includes("Backup archive deleted: agentchef-menu-test")) {
      fail("chef-cli backup delete menu must report the exact archive deleted after scoped confirmation.");
    }
    if (fs.existsSync(path.dirname(backupMenuArchive))) {
      fail("chef-cli backup delete menu must delete the selected temp archive after the exact confirmation phrase.");
    }
  }

  const interrupt = runCliSmokeRaw("menu-interrupt-transcript", ["--plain", "--no-log"], {
    env: baseEnv,
    input: "__ABORT__\n",
    expectedStatus: 130,
    timeout: scaledTimeout(30000)
  });
  if (interrupt.ok) {
    if (!interrupt.output.includes("Interrupted by user.")) {
      fail("chef-cli menu interrupt transcript must show a controlled interruption message");
    }
    if (/node:internal|unsettled top-level await|AbortError|ABORT_ERR/i.test(interrupt.output)) {
      fail("chef-cli menu interrupt transcript must not leak readline lifecycle stack traces");
    }
  }

  const rich = runCliSmokeRaw("menu-rich-transcript", ["--no-log"], {
    env: {
      AGENTCHEF_TEST_MENU: "1",
      FORCE_COLOR: "1"
    },
    input: "q\n",
    timeout: scaledTimeout(30000)
  });
  if (rich.ok) {
    for (const snippet of ["🍳", "📊", "OPERATOR BOARD", "SAFE", "APPLY-GATED", "ACCOUNT-GUIDED"]) {
      if (!rich.output.includes(snippet)) fail(`chef-cli rich menu transcript missing output snippet: ${snippet}`);
    }
    if (!/\x1b\[[0-9;]*m/.test(rich.output)) {
      fail("chef-cli rich menu transcript must include ANSI color when color is forced");
    }
  }
}

function runCommandCenterSmoke() {
  const result = runCliSmokeRaw("command-center-v2", ["--plain", "--no-log"], {
    input: "1\n1\nb\n2\n1\n2\n3\n4\n5\nb\n3\n1\n2\n3\n4\nb\n4\n1\n2\n3\n4\nb\n5\n1\n2\nb\n6\n1\n2\nb\nq\n",
    env: {
      AGENTCHEF_TEST_MENU: "1",
      AGENTCHEF_TEST_MENU_V2: "1",
      AGENTCHEF_TEST_MENU_NAV_ONLY: "1",
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    }
  });
  if (!result.ok) return;
  for (const snippet of [
    "AgentChef command center",
    "System dashboard",
    "Setup & update",
    "Capabilities",
    "Recovery & evidence",
    "Repository checks",
    "Account & preferences",
    "Runtime, repository, login, skills, MCP, and health evidence.",
    "1 approval-gated / 1 account-guided",
    "Impact",
    "b = back",
    "U.C.S. AgentChef session closed."
  ]) {
    if (!result.output.includes(snippet)) {
      fail(`chef-cli command center smoke must include ${JSON.stringify(snippet)}`);
    }
  }
  const signature = "██╗   ██╗   ██████╗   ███████╗";
  if (countOccurrences(result.output, signature) !== 2) {
    fail("chef-cli command center must render the exact U.C.S. signature once at entry and once at exit");
  }
  if (result.output.includes("•") || /[\u{1F300}-\u{1FAFF}]/u.test(result.output)) {
    fail("chef-cli command center must use ASCII-safe operational markers");
  }
  for (const actionId of [
    "status",
    "preview",
    "update",
    "install",
    "reset",
    "repair",
    "skills",
    "mcp",
    "routing",
    "backups",
    "diagnostics",
    "processes",
    "logs",
    "status:repo-only",
    "doctor",
    "auth",
    "language"
  ]) {
    const routedCount = result.output
      .split(/\r?\n/)
      .filter((line) => line.trim() === `[route] ${actionId}`)
      .length;
    if (routedCount !== 1) {
      fail(`chef-cli command center must route menu action exactly once: ${actionId}`);
    }
  }

  const commandCenterRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-command-center-actions-"));
  const readySkillsEnv = createCuratedSkillFixture(commandCenterRoot);
  const readySkills = runCliSmokeRaw("command-center-v2-ready-skills", ["--plain", "--no-log"], {
    input: "3\n1\n\nb\nq\n",
    env: {
      AGENTCHEF_TEST_MENU: "1",
      AGENTCHEF_TEST_MENU_V2: "1",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      ...readySkillsEnv
    },
    timeout: scaledTimeout(30000)
  });
  if (readySkills.ok) {
    if (!readySkills.output.includes("All AgentChef-managed skills are installed and ready.")) {
      fail("chef-cli command center must show an all-ready skill state without an install chooser.");
    }
    if (readySkills.output.includes("Choose a skill to install")) {
      fail("chef-cli command center must not offer skill installation when all curated skills are ready.");
    }
  }

  const freshInstallRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-command-center-install-"));
  const installPreview = runCliSmokeRaw("command-center-v2-install-preview", ["--plain", "--no-log"], {
    input: "2\n3\n\n\nb\nq\n",
    env: {
      AGENTCHEF_TEST_MENU: "1",
      AGENTCHEF_TEST_MENU_V2: "1",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      CODEX_HOME: path.join(freshInstallRoot, ".codex"),
      AGENTS_HOME: path.join(freshInstallRoot, ".agents")
    },
    timeout: scaledTimeout(120000)
  });
  if (installPreview.ok) {
    for (const snippet of ["Installation state", "Fresh setup", "Install preview", "Type APPLY to continue"]) {
      if (!installPreview.output.includes(snippet)) {
        fail(`chef-cli command center install must inspect state and preview before confirmation: ${snippet}`);
      }
    }
  }
}

function runCliJsonSmoke(name, cliArgs, extra = {}) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/chef-cli.mjs"), ...cliArgs], {
    cwd: extra.cwd || root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(extra.env || {})
    },
    windowsHide: true,
    timeout: extra.timeout || 180000
  });
  if (result.error) {
    fail(`chef-cli JSON smoke ${name} failed: ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    fail(`chef-cli JSON smoke ${name} exited ${result.status}: ${(result.stdout || "")}${(result.stderr || "")}`.trim());
    return;
  }
  const stdout = String(result.stdout || "").trim();
  if (stdout.includes("[run]") || stdout.includes("[ok]")) {
    fail(`chef-cli JSON smoke ${name} must not wrap JSON with CLI status lines`);
  }
  try {
    JSON.parse(stdout);
  } catch (error) {
    fail(`chef-cli JSON smoke ${name} did not emit parseable JSON: ${error.message}`);
  }
}

function runCliJsonEnvelopeSmoke(name, cliArgs, expectedSchema) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/chef-cli.mjs"), ...cliArgs], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: scaledTimeout(240000)
  });
  if (result.error) {
    fail(`chef-cli JSON envelope smoke ${name} failed: ${result.error.message}`);
    return;
  }
  const stdout = String(result.stdout || "").trim();
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    fail(`chef-cli JSON envelope smoke ${name} did not emit one parseable JSON document: ${error.message}`);
    return;
  }
  if (parsed.schemaVersion !== expectedSchema) {
    fail(`chef-cli JSON envelope smoke ${name} schema drifted: ${parsed.schemaVersion}`);
  }
  if (!["ok", "attention", "fail"].includes(parsed.status)) {
    fail(`chef-cli JSON envelope smoke ${name} status must be ok, attention, or fail.`);
  }
  if (result.status !== 0 && parsed.status !== "fail") {
    fail(`chef-cli JSON envelope smoke ${name} exited non-zero without fail status.`);
  }
  const stderr = String(result.stderr || "");
  if (/(?:^|\n)\s*at\s+file:|(?:^|\n)Error:\s|node:internal/i.test(stderr)) {
    fail(`chef-cli JSON envelope smoke ${name} must not print a Node stack trace.`);
  }
}

function runNpmSilentJsonSmoke(name, npmArgs, expectedPath = []) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd", "run", "--silent", ...npmArgs]
    : ["run", "--silent", ...npmArgs];
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: scaledTimeout(180000)
  });
  if (result.error) {
    fail(`npm silent JSON smoke ${name} failed: ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    fail(`npm silent JSON smoke ${name} exited ${result.status}: ${(result.stdout || "")}${(result.stderr || "")}`.trim());
    return;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(String(result.stdout || "").trim());
  } catch (error) {
    fail(`npm silent JSON smoke ${name} did not emit parseable JSON: ${error.message}`);
    return;
  }
  let cursor = parsed;
  for (const key of expectedPath) {
    cursor = cursor?.[key];
    if (cursor === undefined) {
      fail(`npm silent JSON smoke ${name} missing JSON path: ${expectedPath.join(".")}`);
      return;
    }
  }
}

function runBackupsFixtureSmokes() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chef-cli-backups-smoke-"));
  const codexHome = path.join(fixtureRoot, "codex-home");
  const agentsHome = path.join(fixtureRoot, "agents-home");
  const backupId = "codex-chef-20990101-000000";
  const backupRoot = path.join(codexHome, "backups", backupId);

  fs.mkdirSync(path.join(backupRoot, "rules"), { recursive: true });
  fs.mkdirSync(path.join(backupRoot, "agents"), { recursive: true });
  fs.writeFileSync(path.join(backupRoot, "AGENTS.md"), "# restored agents\n", "utf8");
  fs.writeFileSync(path.join(backupRoot, "codex-profile.mjs"), "// restored profile launcher\n", "utf8");
  fs.writeFileSync(path.join(backupRoot, "config.toml"), "sandbox_mode = \"workspace-write\"\n", "utf8");
  fs.writeFileSync(path.join(backupRoot, "rules", "default.rules"), "allow [\"rg\"]\n", "utf8");
  fs.writeFileSync(path.join(backupRoot, "marketplace.json"), "{\"name\":\"codex-chef\"}\n", "utf8");
  const manifestResult = spawnSync(process.execPath, [
    path.join(root, "scripts", "write-backup-manifest.mjs"),
    "--backup-root",
    backupRoot,
    "--operation",
    "cli-test-fixture"
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  if (manifestResult.status !== 0) {
    fail(`chef-cli backup fixture manifest failed: ${manifestResult.stderr || manifestResult.stdout}`);
  }

  const journalBackupId = "codex-chef-20990101-000001-journal";
  const journalBackupRoot = path.join(codexHome, "backups", journalBackupId);
  const journalFile = path.join(journalBackupRoot, "codex", "AGENTS.md");
  fs.mkdirSync(path.dirname(journalFile), { recursive: true });
  fs.writeFileSync(journalFile, "# recovered from interrupted operation\n", "utf8");
  fs.writeFileSync(path.join(journalBackupRoot, ".agentchef-operation-journal.json"), `${JSON.stringify({
    schemaVersion: "agentchef.operation-journal.v1",
    operation: "install",
    createdAt: new Date().toISOString(),
    state: "failed",
    backups: [{
      path: "codex/AGENTS.md",
      size: fs.statSync(journalFile).size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(journalFile)).digest("hex")
    }]
  }, null, 2)}\n`, "utf8");

  fs.mkdirSync(path.join(codexHome, "rules"), { recursive: true });
  fs.mkdirSync(path.join(agentsHome, "plugins"), { recursive: true });
  fs.writeFileSync(path.join(codexHome, "AGENTS.md"), "# current agents\n", "utf8");
  fs.writeFileSync(path.join(codexHome, "codex-profile.mjs"), "// current profile launcher\n", "utf8");
  fs.writeFileSync(path.join(codexHome, "rules", "default.rules"), "allow [\"git\", \"status\"]\n", "utf8");
  fs.writeFileSync(path.join(agentsHome, "plugins", "marketplace.json"), "{\"name\":\"current\"}\n", "utf8");

  const env = { CODEX_HOME: codexHome, AGENTS_HOME: agentsHome };
  const journalPreview = runCliSmokeRaw("backups-journal-recovery-preview", ["--backups", "--backup", journalBackupId, "--restore", "--plain", "--no-log"], { env });
  if (journalPreview.ok && !journalPreview.output.includes("Backup restore preview")) {
    fail("chef-cli must allow a hash-validated interrupted-operation journal to drive restore preview.");
  }
  const list = runCliSmokeRaw("backups-list-fixture", ["--backups", "--plain", "--no-log"], { env });
  if (list.ok) {
    for (const snippet of ["Backup library", backupId, "Backup root"]) {
      if (!list.output.includes(snippet)) fail(`chef-cli smoke backups-list-fixture missing output snippet: ${snippet}`);
    }
  }
  const listTr = runCliSmokeRaw("backups-list-tr-fixture", ["--backups", "--tr", "--plain", "--no-log"], { env });
  if (listTr.ok) {
    for (const snippet of ["Yedek kütüphanesi", backupId, "Yedek kök dizini", "Bu liste ekranında dosya değişmez"]) {
      if (!listTr.output.includes(snippet)) fail(`chef-cli smoke backups-list-tr-fixture missing output snippet: ${snippet}`);
    }
  }

  const inspect = runCliSmokeRaw("backups-inspect-fixture", ["--backups", "--backup", backupId, "--plain", "--no-log"], { env });
  if (inspect.ok) {
    for (const snippet of ["Backup details", "AGENTS.md", "rules/default.rules", "marketplace.json"]) {
      if (!inspect.output.includes(snippet)) fail(`chef-cli smoke backups-inspect-fixture missing output snippet: ${snippet}`);
    }
  }

  const preview = runCliSmokeRaw("backups-restore-preview-fixture", ["--backups", "--backup", backupId, "--restore", "--plain", "--no-log"], { env });
  if (preview.ok) {
    for (const snippet of ["Backup restore preview", "No files restored", "Rerun with --apply"]) {
      if (!preview.output.includes(snippet)) fail(`chef-cli smoke backups-restore-preview-fixture missing output snippet: ${snippet}`);
    }
  }
  const previewTr = runCliSmokeRaw("backups-restore-preview-tr-fixture", ["--backups", "--backup", backupId, "--restore", "--tr", "--plain", "--no-log"], { env });
  if (previewTr.ok) {
    for (const snippet of ["Yedek geri yükleme ön izlemesi", "Dosya geri yüklenmedi", "--apply"]) {
      if (!previewTr.output.includes(snippet)) fail(`chef-cli smoke backups-restore-preview-tr-fixture missing output snippet: ${snippet}`);
    }
  }
  const currentAfterPreview = fs.readFileSync(path.join(codexHome, "AGENTS.md"), "utf8");
  if (!currentAfterPreview.includes("current agents")) {
    fail("chef-cli backup restore preview must not modify CODEX_HOME files");
  }

  const apply = runCliSmokeRaw("backups-restore-apply-fixture", ["--backups", "--backup", backupId, "--restore", "--apply", "--plain", "--no-log"], { env });
  if (apply.ok) {
    for (const snippet of ["Restore applied", "Rollback backup"]) {
      if (!apply.output.includes(snippet)) fail(`chef-cli smoke backups-restore-apply-fixture missing output snippet: ${snippet}`);
    }
  }
  const restoredAgents = fs.readFileSync(path.join(codexHome, "AGENTS.md"), "utf8");
  const restoredProfile = fs.readFileSync(path.join(codexHome, "codex-profile.mjs"), "utf8");
  const restoredMarketplace = fs.readFileSync(path.join(agentsHome, "plugins", "marketplace.json"), "utf8");
  if (!restoredAgents.includes("restored agents")) {
    fail("chef-cli backup restore apply did not restore CODEX_HOME/AGENTS.md from the archive");
  }
  if (!restoredProfile.includes("restored profile launcher")) {
    fail("chef-cli backup restore apply did not restore CODEX_HOME/codex-profile.mjs from the canonical archive path");
  }
  // The fixture is a pre-1.0.0 archive: restore must return its bytes unchanged.
  if (!restoredMarketplace.includes("\"name\":\"codex-chef\"")) {
    fail("chef-cli backup restore apply did not restore AGENTS_HOME/plugins/marketplace.json from legacy marketplace backup");
  }
  const rollbackArchives = fs.readdirSync(path.join(codexHome, "backups"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("agentchef-restore-"));
  if (rollbackArchives.length === 0) {
    fail("chef-cli backup restore apply must create a rollback backup before overwriting current targets");
  }

  fs.writeFileSync(path.join(codexHome, "AGENTS.md"), "# current before JSON restore\n", "utf8");
  const jsonRestoreApply = runCliSmokeRaw(
    "backups-restore-json-apply-fixture",
    ["--backups", "--backup", backupId, "--restore", "--apply", "--json", "--no-log"],
    { env }
  );
  if (jsonRestoreApply.ok) {
    try {
      const parsed = JSON.parse(jsonRestoreApply.stdout);
      if (parsed.outcome !== "restored" || parsed.applied !== true || parsed.applyRequested !== true) {
        fail("chef-cli JSON restore apply must report a truthful restored/applied result.");
      }
    } catch (error) {
      fail(`chef-cli JSON restore apply did not emit parseable JSON: ${error.message}`);
    }
  }
  if (!fs.readFileSync(path.join(codexHome, "AGENTS.md"), "utf8").includes("restored agents")) {
    fail("chef-cli JSON restore apply must perform the requested restore.");
  }

  fs.writeFileSync(path.join(codexHome, "AGENTS.md"), "# transaction-current\n", "utf8");
  fs.writeFileSync(path.join(codexHome, "config.toml"), "model = \"transaction-current\"\n", "utf8");
  const injectedFailure = runCliSmokeRaw(
    "backups-restore-transaction-rollback-fixture",
    ["--backups", "--backup", backupId, "--restore", "--apply", "--plain", "--no-log"],
    {
      env: {
        ...env,
        AGENTCHEF_TEST_MODE: "1",
        AGENTCHEF_TEST_RESTORE_FAIL_AFTER_WRITES: "1"
      },
      expectedStatus: 1
    }
  );
  if (!injectedFailure.ok || !injectedFailure.output.includes("Injected restore write failure")) {
    fail("chef-cli backup restore transaction test must exercise an injected post-write failure.");
  }
  if (fs.readFileSync(path.join(codexHome, "AGENTS.md"), "utf8") !== "# transaction-current\n") {
    fail("chef-cli backup restore must roll back files already overwritten when a later write fails.");
  }
  if (fs.readFileSync(path.join(codexHome, "config.toml"), "utf8") !== "model = \"transaction-current\"\n") {
    fail("chef-cli backup restore failure must leave untouched targets unchanged.");
  }

  const inWriteFailure = runCliSmokeRaw(
    "backups-restore-in-write-json-failure-fixture",
    ["--backups", "--backup", backupId, "--restore", "--apply", "--json", "--no-log"],
    {
      env: {
        ...env,
        AGENTCHEF_TEST_MODE: "1",
        AGENTCHEF_TEST_RESTORE_FAIL_DURING_WRITE: "1"
      },
      expectedStatus: 1
    }
  );
  if (inWriteFailure.ok) {
    try {
      const parsed = JSON.parse(inWriteFailure.stdout);
      if (
        parsed.outcome !== "failed"
        || parsed.applied !== false
        || parsed.applyRequested !== true
        || !String(parsed.error || "").includes("Injected restore in-write failure")
      ) {
        fail("chef-cli JSON restore failure must emit a truthful structured failure result.");
      }
    } catch (error) {
      fail(`chef-cli JSON restore failure did not emit parseable JSON: ${error.message}`);
    }
  }
  if (fs.readFileSync(path.join(codexHome, "AGENTS.md"), "utf8") !== "# transaction-current\n") {
    fail("chef-cli backup restore must roll back a target truncated during the write call.");
  }

  const pinnedSkillId = "agentchef-skill-20990101-accessibility";
  const pinnedSkillBackup = path.join(codexHome, "backups", pinnedSkillId);
  const pinnedSkillSource = path.join(fixtureRoot, "source", "accessibility");
  const pinnedSkillTarget = path.join(agentsHome, "skills", "accessibility");
  fs.mkdirSync(pinnedSkillSource, { recursive: true });
  fs.mkdirSync(pinnedSkillTarget, { recursive: true });
  fs.writeFileSync(
    path.join(pinnedSkillSource, "SKILL.md"),
    "---\nname: accessibility\ndescription: New accessibility workflow.\n---\n",
    "utf8"
  );
  fs.writeFileSync(path.join(pinnedSkillSource, "new-only.txt"), "new\n", "utf8");
  fs.writeFileSync(path.join(pinnedSkillTarget, "SKILL.md"), "previous accessibility skill\n", "utf8");
  fs.writeFileSync(path.join(pinnedSkillTarget, "legacy-only.txt"), "legacy\n", "utf8");
  const pinnedExpected = {
    package: "test/accessibility",
    commit: "d".repeat(40),
    skill: "accessibility",
    cliVersion: "1.5.20",
    sourceTreeSha256: hashSkillTree(pinnedSkillSource)
  };
  activatePinnedSkill({
    source: pinnedSkillSource,
    target: pinnedSkillTarget,
    backupRoot: pinnedSkillBackup,
    managedRoots: [agentsHome, codexHome],
    expected: pinnedExpected,
    allowAdopt: true
  });
  const pinnedPreview = runCliSmokeRaw(
    "backups-pinned-skill-control-receipt-preview",
    ["--backups", "--backup", pinnedSkillId, "--restore", "--json", "--no-log"],
    { env }
  );
  if (!pinnedPreview.ok) {
    fail(`chef-cli pinned skill backup control receipt must not block restore preview: ${pinnedPreview.output.trim()}`);
  } else {
    try {
      const parsed = JSON.parse(pinnedPreview.stdout);
      if (parsed.outcome !== "preview" || parsed.manifestVerified !== true || parsed.unsupported.length !== 0) {
        fail("chef-cli pinned skill backup control receipt must remain outside the restorable archive payload.");
      }
    } catch (error) {
      fail(`chef-cli pinned skill backup control receipt preview did not emit parseable JSON: ${error.message}`);
    }
  }
  const pinnedInjectedFailure = runCliSmokeRaw(
    "backups-pinned-skill-rollback-fixture",
    ["--backups", "--backup", pinnedSkillId, "--restore", "--apply", "--json", "--no-log"],
    {
      env: {
        ...env,
        AGENTCHEF_TEST_MODE: "1",
        AGENTCHEF_TEST_PINNED_RESTORE_FAIL_AFTER_WRITES: "1"
      },
      expectedStatus: 1
    }
  );
  if (pinnedInjectedFailure.ok) {
    try {
      const parsed = JSON.parse(pinnedInjectedFailure.stdout);
      if (parsed.outcome !== "failed" || parsed.applied !== false) {
        fail("chef-cli pinned restore failure must emit a truthful structured failure result.");
      }
    } catch (error) {
      fail(`chef-cli pinned restore failure did not emit parseable JSON: ${error.message}`);
    }
  }
  if (!fs.existsSync(pinnedSkillTarget)) {
    fail("chef-cli pinned skill restore failure must restore the displaced current target instead of removing it.");
  } else if (
    !fs.existsSync(path.join(pinnedSkillTarget, "new-only.txt"))
    || fs.readFileSync(path.join(pinnedSkillTarget, "new-only.txt"), "utf8") !== "new\n"
    || fs.existsSync(path.join(pinnedSkillTarget, "legacy-only.txt"))
    || !fs.existsSync(path.join(pinnedSkillTarget, pinnedSkillProvenanceFileName))
  ) {
    fail("chef-cli pinned skill restore must put the complete displaced current tree back after failure.");
  }
  const pinnedRestore = runCliSmokeRaw(
    "backups-pinned-skill-round-trip-fixture",
    ["--backups", "--backup", pinnedSkillId, "--restore", "--apply", "--json", "--no-log"],
    { env }
  );
  if (!pinnedRestore.ok) {
    fail(`chef-cli pinned skill backup round-trip restore failed: ${pinnedRestore.output.trim()}`);
  } else {
    try {
      const parsed = JSON.parse(pinnedRestore.stdout);
      if (parsed.outcome !== "restored" || parsed.applied !== true) {
        fail("chef-cli pinned skill backup must report a restored JSON outcome.");
      }
    } catch (error) {
      fail(`chef-cli pinned skill restore did not emit parseable JSON: ${error.message}`);
    }
    const restoredPinnedFiles = fs.readdirSync(pinnedSkillTarget).sort();
    const expectedPinnedFiles = ["SKILL.md", "legacy-only.txt"].sort();
    if (JSON.stringify(restoredPinnedFiles) !== JSON.stringify(expectedPinnedFiles)) {
      fail(
        `chef-cli pinned skill restore must replace the active tree exactly; got ${restoredPinnedFiles.join(", ")}`
      );
    }
    if (fs.readFileSync(path.join(pinnedSkillTarget, "legacy-only.txt"), "utf8") !== "legacy\n") {
      fail("chef-cli pinned skill restore did not recover the prior tree bytes.");
    }
  }

  fs.writeFileSync(path.join(pinnedSkillBackup, "unexpected-root-file.txt"), "unexpected\n", "utf8");
  const pinnedUnexpectedRoot = runCliSmokeRaw(
    "backups-pinned-skill-unexpected-root-file",
    ["--backups", "--backup", pinnedSkillId, "--restore", "--json", "--no-log"],
    { env, expectedStatus: 1 }
  );
  if (!pinnedUnexpectedRoot.ok) {
    fail(`chef-cli pinned skill backup must reject arbitrary root files: ${pinnedUnexpectedRoot.output.trim()}`);
  } else {
    try {
      const parsed = JSON.parse(pinnedUnexpectedRoot.stdout);
      if (parsed.outcome !== "blocked" || !parsed.unsupported.includes("unexpected-root-file.txt")) {
        fail("chef-cli pinned skill backup must report arbitrary root files as unsupported.");
      }
    } catch (error) {
      fail(`chef-cli pinned skill arbitrary-root preview did not emit parseable JSON: ${error.message}`);
    }
  }

  const unsupportedId = "codex-chef-20990101-000001";
  const unsupportedRoot = path.join(codexHome, "backups", unsupportedId);
  fs.mkdirSync(path.join(unsupportedRoot, "codex"), { recursive: true });
  fs.writeFileSync(path.join(unsupportedRoot, "codex", "auth.json"), "{\"token\":\"fixture\"}\n", "utf8");
  fs.writeFileSync(path.join(unsupportedRoot, "codex", "hooks.json"), "{\"hooks\":[]}\n", "utf8");
  spawnSync(process.execPath, [
    path.join(root, "scripts", "write-backup-manifest.mjs"),
    "--backup-root",
    unsupportedRoot,
    "--operation",
    "unsupported-fixture"
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const unsupportedRestore = runCliSmokeRaw(
    "backups-restore-unsupported-fixture",
    ["--backups", "--backup", unsupportedId, "--restore", "--apply", "--plain", "--no-log"],
    { env, expectedStatus: 1 }
  );
  if (!unsupportedRestore.ok || !unsupportedRestore.output.includes("unsupported entries")) {
    fail("chef-cli backup restore must reject manifest-listed auth, hooks, and other non-managed files.");
  }
  if (fs.existsSync(path.join(codexHome, "auth.json")) || fs.existsSync(path.join(codexHome, "hooks.json"))) {
    fail("chef-cli backup restore must never create unsupported Codex control-plane files.");
  }

  const tamperedId = "codex-chef-20990101-000002";
  const tamperedRoot = path.join(codexHome, "backups", tamperedId);
  fs.mkdirSync(tamperedRoot, { recursive: true });
  fs.writeFileSync(path.join(tamperedRoot, "AGENTS.md"), "# manifest version\n", "utf8");
  spawnSync(process.execPath, [
    path.join(root, "scripts", "write-backup-manifest.mjs"),
    "--backup-root",
    tamperedRoot,
    "--operation",
    "tamper-fixture"
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  fs.writeFileSync(path.join(tamperedRoot, "AGENTS.md"), "# changed after manifest\n", "utf8");
  const tamperedRestore = runCliSmokeRaw(
    "backups-restore-tampered-fixture",
    ["--backups", "--backup", tamperedId, "--restore", "--apply", "--plain", "--no-log"],
    { env, expectedStatus: 1 }
  );
  if (!tamperedRestore.ok || !tamperedRestore.output.includes("manifest hash or size")) {
    fail("chef-cli backup restore must reject archive bytes changed after manifest creation.");
  }

  const emptyId = "codex-chef-20990101-000003";
  const emptyRoot = path.join(codexHome, "backups", emptyId);
  fs.mkdirSync(emptyRoot, { recursive: true });
  spawnSync(process.execPath, [
    path.join(root, "scripts", "write-backup-manifest.mjs"),
    "--backup-root",
    emptyRoot,
    "--operation",
    "empty-fixture"
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

  const json = runCliSmokeRaw("backups-json-fixture", ["--backups", "--json", "--no-log"], { env });
  if (json.ok) {
    try {
      const parsed = JSON.parse(json.stdout);
      if (parsed.schemaVersion !== 1) fail("chef-cli backups JSON must include schemaVersion 1");
      if (!Array.isArray(parsed.backups) || !parsed.backups.some((backup) => backup.id === backupId)) {
        fail("chef-cli backups JSON must include fixture backup id");
      }
      for (const invalidId of [unsupportedId, tamperedId]) {
        const invalidBackup = parsed.backups.find((backup) => backup.id === invalidId);
        if (!invalidBackup || invalidBackup.restorableCount !== 0 || invalidBackup.verifiedRestorable !== false) {
          fail(`chef-cli backup inventory must not label unverified archive ${invalidId} as restorable.`);
        }
      }
      const emptyBackup = parsed.backups.find((backup) => backup.id === emptyId);
      if (!emptyBackup || emptyBackup.restorableCount !== 0 || emptyBackup.verifiedRestorable !== false) {
        fail("chef-cli backup inventory must not label an empty manifest as restorable.");
      }
    } catch (error) {
      fail(`chef-cli backups JSON fixture did not emit parseable JSON: ${error.message}`);
    }
  }

  const deletePreview = runCliSmokeRaw("backups-delete-preview-fixture", ["--backups", "--backup", backupId, "--delete", "--plain", "--no-log"], { env });
  if (deletePreview.ok) {
    for (const snippet of ["Backup delete preview", "No backup archive deleted", "Rerun with --apply"]) {
      if (!deletePreview.output.includes(snippet)) fail(`chef-cli smoke backups-delete-preview-fixture missing output snippet: ${snippet}`);
    }
  }
  if (!fs.existsSync(backupRoot)) {
    fail("chef-cli backup delete preview must not remove the archive");
  }

  const competingLock = acquireOperationLock({ root: codexHome, operation: "install" });
  try {
    const lockedDelete = runCliSmokeRaw(
      "backups-delete-locked-fixture",
      ["--backups", "--backup", backupId, "--delete", "--apply", "--json", "--no-log"],
      { env, expectedStatus: 1 }
    );
    if (!lockedDelete.ok || !lockedDelete.output.includes("already in progress")) {
      fail("chef-cli backup delete apply must fail closed while the Codex home operation lock is held");
    }
    if (!fs.existsSync(backupRoot)) {
      fail("chef-cli backup delete apply must preserve the archive while the Codex home operation lock is held");
    }
  } finally {
    competingLock.release();
  }

  const deleteApply = runCliSmokeRaw("backups-delete-json-apply-fixture", ["--backups", "--backup", backupId, "--delete", "--apply", "--json", "--no-log"], { env });
  if (deleteApply.ok) {
    try {
      const parsed = JSON.parse(deleteApply.stdout);
      if (parsed.outcome !== "deleted" || parsed.applied !== true || parsed.applyRequested !== true) {
        fail("chef-cli JSON delete apply must report a truthful deleted/applied result.");
      }
    } catch (error) {
      fail(`chef-cli JSON delete apply did not emit parseable JSON: ${error.message}`);
    }
  }
  if (fs.existsSync(backupRoot)) {
    fail("chef-cli backup delete apply must remove only the selected backup archive");
  }
}

function runCliErrorSmoke(name, cliArgs, expectedSnippets) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/chef-cli.mjs"), ...cliArgs], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: scaledTimeout(30000)
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.error) {
    fail(`chef-cli error smoke ${name} failed: ${result.error.message}`);
    return;
  }
  if (result.status === 0) {
    fail(`chef-cli error smoke ${name} should exit non-zero`);
  }
  if (/(?:^|\n)\s*at\s+file:|(?:^|\n)Error:\s|node:internal/i.test(output)) {
    fail(`chef-cli error smoke ${name} must not print a Node stack trace`);
  }
  const normalizedOutput = output.replace(/\s+/g, " ").trim();
  for (const snippet of expectedSnippets) {
    const normalizedSnippet = snippet.replace(/\s+/g, " ").trim();
    if (!output.includes(snippet) && !normalizedOutput.includes(normalizedSnippet)) {
      fail(`chef-cli error smoke ${name} missing output snippet: ${snippet}`);
    }
  }
}

const cliPath = "scripts/chef-cli.mjs";
if (!exists(cliPath)) {
  fail(`Missing ${cliPath}`);
} else {
  const cli = read(cliPath);
  runNodeCheck(cliPath);

  for (const required of [
    "--help",
    "--json",
    "--lang",
    "--tr",
    "--verbose-plan",
    "--details",
    "--summary",
    "--plain",
    "--no-log",
    "--repo-only",
    "--profile",
    "--status",
    "--doctor",
    "--preview",
    "--reset",
    "--repair",
    "--backups",
    "--backup",
    "--restore",
    "--delete",
    "--install",
    "--update",
    "--skills",
    "--mcp",
    "--routing",
    "--diagnostics",
    "--diagnose",
    "--processes",
    "--cleanup-stale",
    "--auth",
    "--logs",
    "--apply",
    "tmp/chef-cli/logs",
    "CODEX_HOME/plugins/agentchef-workflows",
    "codex-status.mjs",
    "codex-doctor.mjs",
    "plan-install.mjs",
    "repair-install.mjs",
    "verify-install-runtime.mjs",
    "verify-skill-sources.mjs",
    "codex-routing-board.mjs",
    "runDiagnostics",
    "runProcesses",
    "processAuditPayload",
    "recentCliLogs",
    "Diagnostic evidence commands",
    "Tanılama kanıt komutları",
    "install.ps1",
    "install.sh",
    "Authentication notes",
    "Kimlik doğrulama notları",
    "AGENTCHEF_LANG",
    "languageFromEnvironment",
    "localText",
    "printManagedRefreshSummary",
    "does not print account-scoped re-auth",
    "organization policy",
    "git ls-remote origin HEAD",
    "MENU_ITEMS",
    "supportsColor",
    "colorize",
    "styleHeading",
    "styleLabel",
    "styleMuted",
    "runLoggedCommand",
    "confirmWriteAction",
    "runUpdate",
    "runBackups",
    "listBackupArchives",
    "resolveBackupArchive",
    "restoreBackupArchive",
    "deleteBackupArchive",
    "createRollbackBackup",
    "runUpdateValidation",
    "update-check",
    "runPackageScript(\"update-check\", \"validate:update\"",
    "gitHead",
    "Repository updated from",
    "compareReleaseVersions",
    "gitPackageVersion",
    "Already current",
    "Continuing with validation and managed refresh",
    "selectSkill",
    "installSelectedSkill",
    "explainMcpServer",
    "mcpTarget",
    "redactLocalPaths",
    "redactSensitiveOutput",
    "sanitizeCliError",
    "[REDACTED_GITHUB_TOKEN]",
    "[REDACTED_CONNECTION_STRING]",
    "fileURLToPath",
    "const ICONS = makeIcons()"
  ]) {
    if (!cli.includes(required)) fail(`${cliPath} missing required CLI surface: ${required}`);
  }

  for (const requiredMenuUx of [
    "printMenu",
    "printDivider",
    "printActionStart",
    "printActionEnd",
    "pauseBeforeMenu",
    "toggleLanguage",
    "OPERATOR BOARD",
    "Legend: SAFE",
    "menuIcon",
    "printSurfaceHeader",
    "operatorPrompt",
    "Operator menu",
    "Operatör menüsü",
    "Press Enter to return to the operator board",
    "Operatör paneline dönmek için Enter'a basın",
    "Shortcuts: l = language, q = quit",
    "Kısayollar: l = dil, q = çıkış",
    "AGENTCHEF_TEST_MENU",
    "Language switched to English",
    "Dil Türkçe olarak ayarlandı"
  ]) {
    if (!cli.includes(requiredMenuUx)) fail(`${cliPath} missing interactive menu UX surface: ${requiredMenuUx}`);
  }

  if (/update-install",\s*"\\.\\scripts\\install\.ps1",\s*\[[^\]]*"-All"/s.test(cli)) {
    fail(`${cliPath} update-install must not use -All because update is scoped to managed files, not curated skills`);
  }
  if (/update-install",\s*"scripts\/install\.sh",\s*\[[^\]]*"--all"/s.test(cli)) {
    fail(`${cliPath} update-install must not use --all because update is scoped to managed files, not curated skills`);
  }
  if (cli.includes('runPowerShell("install", ".\\\\scripts\\\\install.ps1", ["-All", "-Interactive"')) {
    fail(`${cliPath} Full install must not open a second nested Windows confirmation flow after CLI APPLY`);
  }
  if (cli.includes('runBash("install", "scripts/install.sh", ["--all", "--interactive"')) {
    fail(`${cliPath} Full install must not open a second nested Bash confirmation flow after CLI APPLY`);
  }
  if (cli.includes('runPowerShell("reset-apply", ".\\\\scripts\\\\install.ps1", ["-All", "-Force", "-Interactive"')) {
    fail(`${cliPath} Refresh setup must not open a second nested Windows confirmation flow after CLI APPLY`);
  }
  if (cli.includes('runBash("reset-apply", "scripts/install.sh", ["--all", "--force", "--interactive"')) {
    fail(`${cliPath} Refresh setup must not open a second nested Bash confirmation flow after CLI APPLY`);
  }
  if (!cli.includes('runPowerShell("update-install", ".\\\\scripts\\\\install.ps1", ["-Update", "-PlainOutput"]')) {
    fail(`${cliPath} Windows update-install must use -Update so user-owned config survives managed refresh`);
  }
  if (!cli.includes('runBash("update-install", "scripts/install.sh", ["--update", "--plain-output"]')) {
    fail(`${cliPath} Bash update-install must use --update so user-owned config survives managed refresh`);
  }
  if (cli.includes('runPowerShell("update-install", ".\\\\scripts\\\\install.ps1", ["-Force"')) {
    fail(`${cliPath} Windows update-install must not use broad -Force config replacement`);
  }
  if (cli.includes('runBash("update-install", "scripts/install.sh", ["--force"')) {
    fail(`${cliPath} Bash update-install must not use broad --force config replacement`);
  }
  if (cli.includes("AGENTS_HOME/plugins/agentchef-workflows")) {
    fail(`${cliPath} must describe the AgentChef plugin target under CODEX_HOME, not AGENTS_HOME`);
  }

  if (/TERM:\s*"dumb"/.test(cli)) {
    fail(`${cliPath} must not force TERM=dumb because codex doctor treats that as a terminal health issue.`);
  }

  const planInstall = read("scripts/plan-install.mjs");
  for (const requiredPlanSurface of ["--summary", "printPlanSummary", "AgentChef install plan summary"]) {
    if (!planInstall.includes(requiredPlanSurface)) fail(`scripts/plan-install.mjs missing concise preview surface: ${requiredPlanSurface}`);
  }

  for (const requiredLabel of [
    "System status",
    "Repo health",
    "Full checkup",
    "Install preview",
    "Full install",
    "Refresh setup",
    "Repair setup",
    "Backups",
    "Skill status & catalog",
    "MCP connectors",
    "Routing guide",
    "Diagnostics hub",
    "Process audit",
    "Auth notes",
    "Recent logs",
    "Language",
    "Update AgentChef"
  ]) {
    if (!new RegExp(`\\b${requiredLabel}\\b`).test(cli)) fail(`${cliPath} missing menu label: ${requiredLabel}`);
  }

  for (const forbidden of [
    /\bRemove-Item\b/i,
    /\bdel\s+/i,
    /\brm\s+-rf\b/i,
    /\bgit\s+reset\b/i,
    /\bgit\s+clean\b/i,
    /\bgit\s+push\b/i,
    /\bgh\s+auth\s+token\b/i,
    /\bgit\s+credential-manager\s+get\b/i,
    /\bgh\s+release\s+create\b/i,
    /\bnpm\s+publish\b/i,
    /\bSet-Content\b/i,
    /\bOut-File\b/i
  ]) {
    if (forbidden.test(cli)) fail(`${cliPath} must not contain destructive or publishing command pattern: ${forbidden}`);
  }
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts || {};
const requiredScripts = {
  chef: "node scripts/chef-cli.mjs",
  chefg: "node scripts/chef-cli.mjs",
  "chef:status": "node scripts/chef-cli.mjs --status",
  "chef:backups": "node scripts/chef-cli.mjs --backups",
  "chef:diagnostics": "node scripts/chef-cli.mjs --diagnostics",
  "chef:processes": "node scripts/chef-cli.mjs --processes",
  "chef:update": "node scripts/chef-cli.mjs --update",
  "validate:chef-cli": "node scripts/validate-chef-cli.mjs"
};
for (const [name, command] of Object.entries(requiredScripts)) {
  if (scripts[name] !== command) fail(`package.json script ${name} must be exactly: ${command}`);
}
if (!String(scripts.check || "").includes("node scripts/validate-chef-cli.mjs")) {
  fail("package.json check script must include validate-chef-cli.mjs");
}

runCliSmoke("help", ["--help", "--plain", "--no-log"], [
  "AgentChef CLI",
  "--no-log",
  "--update [--apply]",
  "--backups [--backup ID] [--restore|--delete --apply]",
  "--diagnostics",
  "--processes",
  "--cleanup-stale",
  "--lang tr",
  "--tr",
  "--verbose-plan",
  "--details",
  "Allow write actions for update",
  "--reset [--apply]",
  "tmp/chef-cli/logs"
], { forbidAnsi: true });
runCliSmoke("help-tr", ["--help", "--lang", "tr", "--plain", "--no-log"], [
  "AgentChef CLI",
  "Kullanım:",
  "Seçenekler:",
  "--diagnostics",
  "--processes",
  "--cleanup-stale",
  "--lang tr",
  "--verbose-plan",
  "--details",
  "tmp/chef-cli/logs"
], { forbidAnsi: true });
runCliSmoke("help-tr-alias", ["--help", "--tr", "--plain", "--no-log"], [
  "Kullanım:",
  "Seçenekler:",
  "güncelle"
], { forbidAnsi: true });
runCliSmoke("help-tr-env", ["--help", "--plain", "--no-log"], [
  "Kullanım:",
  "Seçenekler:"
], {
  env: {
    AGENTCHEF_LANG: "tr"
  },
  forbidAnsi: true
});
runMenuTranscriptSmoke();
runCommandCenterSmoke();
runBackupsFixtureSmokes();
runCliErrorSmoke("unknown-option", ["--bad-flag", "--plain", "--no-log"], [
  "AgentChef CLI error: Unknown option --bad-flag",
  "npm run chef -- --help"
]);
runCliErrorSmoke("unknown-option-tr", ["--bad-flag", "--tr", "--plain", "--no-log"], [
  "AgentChef CLI hatasi: Bilinmeyen seçenek --bad-flag",
  "npm run chef -- --help"
]);
runCliErrorSmoke("missing-lang-value", ["--lang", "--plain", "--no-log"], [
  "AgentChef CLI error:",
  "--lang requires"
]);
runCliErrorSmoke("unsupported-lang", ["--lang", "de", "--plain", "--no-log"], [
  "AgentChef CLI error:",
  "Supported languages"
]);
runCliErrorSmoke("conflicting-actions", ["--install", "--repair", "--plain", "--no-log"], [
  "AgentChef CLI error:",
  "Choose exactly one action",
  "--install, --repair"
]);
runCliErrorSmoke("missing-profile-value", ["--routing", "--profile", "--plain", "--no-log"], [
  "AgentChef CLI error:",
  "--profile requires"
]);
runCliErrorSmoke("repo-only-doctor", ["--doctor", "--repo-only", "--plain", "--no-log"], [
  "AgentChef CLI error:",
  "--repo-only can only be used with --status"
]);
runCliJsonEnvelopeSmoke(
  "doctor",
  ["--doctor", "--json", "--no-log"],
  "agentchef.doctor-bundle.v1"
);
runCliSmoke("forced-color", ["--help", "--no-log"], [
  "AgentChef CLI"
], {
  env: {
    FORCE_COLOR: "1"
  },
  expectAnsi: true
});
runCliSmoke("mcp", ["--mcp", "--details", "--plain", "--no-log"], [
  "MCP connectors",
  "16 connectors",
  "Credential need",
  "Disabled by default",
  "Timeouts and per-tool exposure live in templates/codex/config.windows.toml",
  "Authenticated account, database, production, broad filesystem, and graph-indexing MCP connectors stay disabled by default."
], { forbidAnsi: true });
runCliSmoke("mcp-tr", ["--mcp", "--details", "--tr", "--plain", "--no-log"], [
  "MCP bağlayıcıları",
  "16 bağlayıcı",
  "Kimlik bilgisi veya ek girdi gerekmez.",
  "İlk çalışmada npm/npx ağ erişimi gerekir",
  "GitHub/Copilot hesap yetkilendirmesi gerekir",
  "Auth isteyen hesap, database, production, geniş filesystem ve graph-indexing MCP connector'ları varsayılan olarak kapalı kalır."
], {
  forbidAnsi: true,
  forbiddenSnippets: [
    "No credential or extra input is required.",
    "Requires npm/npx network access on first startup",
    "Requires GitHub/Copilot account authorization"
  ]
});
runCliSmoke("mcp-forced-color", ["--mcp", "--details", "--no-log"], [
  "MCP connectors",
  "Authenticated account, database, production, broad filesystem, and graph-indexing MCP connectors stay disabled by default."
], {
  env: {
    FORCE_COLOR: "1"
  },
  expectAnsi: true
});
const skillStatusRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-skills-status-"));
try {
  runCliSmoke("skills-status-empty", ["--skills", "--details", "--plain", "--no-log"], [
    "Installation status",
    `${0} of ${skillCounts.total} Chef-managed skills ready`,
    `${skillCounts.total} missing`,
    `Upstream: 0/${skillCounts.upstream} ready. Bundled/direct: 0/${skillCounts.direct} ready.`,
    "0 invalid"
  ], {
    env: {
      CODEX_HOME: path.join(skillStatusRoot, ".codex"),
      AGENTS_HOME: path.join(skillStatusRoot, ".agents")
    }
  });
} finally {
  fs.rmSync(skillStatusRoot, { recursive: true, force: true });
}

const invalidSkillStatusRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-skills-invalid-"));
try {
  const invalidEnv = createCuratedSkillFixture(invalidSkillStatusRoot, {
    invalid: ["dependency-upgrade"]
  });
  fs.rmSync(path.join(invalidEnv.CODEX_HOME, "skills", "systematic-debugging"), { recursive: true, force: true });
  runCliSmoke("skills-status-invalid", ["--skills", "--details", "--plain", "--no-log"], [
    `${skillCounts.total - 2} of ${skillCounts.total} Chef-managed skills ready`,
    "1 missing",
    "1 invalid",
    `Upstream: ${skillCounts.upstream - 2}/${skillCounts.upstream} ready. Bundled/direct: ${skillCounts.direct}/${skillCounts.direct} ready.`,
    "Invalid installation"
  ], {
    env: invalidEnv
  });
} finally {
  fs.rmSync(invalidSkillStatusRoot, { recursive: true, force: true });
}

const mcpStatusRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-mcp-status-"));
try {
  const mcpCodexHome = path.join(mcpStatusRoot, ".codex");
  fs.mkdirSync(mcpCodexHome, { recursive: true });
  fs.writeFileSync(path.join(mcpCodexHome, "config.toml"), [
    "[mcp_servers.context7]",
    "enabled = true",
    "",
    "[mcp_servers.github]",
    "enabled = false",
    "",
    "[mcp_servers.custom-local]",
    "command = \"node\"",
    ""
  ].join("\n"), "utf8");
  runCliSmoke("mcp-installed-status", ["--mcp", "--details", "--plain", "--no-log"], [
    "Configured and enabled: 1",
    "Configured but disabled: 1",
    "Cataloged but not configured: 14",
    "User-added: 1",
    "custom-local",
    "User-added (enabled)",
    "Live status was not probed"
  ], {
    env: {
      CODEX_HOME: mcpCodexHome,
      AGENTS_HOME: path.join(mcpStatusRoot, ".agents")
    }
  });
} finally {
  fs.rmSync(mcpStatusRoot, { recursive: true, force: true });
}

const skillsWorkspaceMenu = runCliSmokeRaw("menu-skills-workspace", ["--plain", "--no-log"], {
  env: {
    AGENTCHEF_TEST_MENU: "1",
    AGENTCHEF_TEST_MENU_V2: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1"
  },
  input: "3\nb\nq\n",
  timeout: scaledTimeout(30000)
});
if (skillsWorkspaceMenu.ok && !skillsWorkspaceMenu.output.includes("Skill status & catalog")) {
  fail("chef-cli skills workspace must advertise installed/missing status alongside the catalog.");
}

const readySkillStatusRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-skills-ready-"));
try {
  const readySkillStatusEnv = createCuratedSkillFixture(readySkillStatusRoot);
  runCliSmoke("skills", ["--skills", "--details", "--plain", "--no-log"], [
    "Skill status & catalog",
    `${skillCounts.total} AgentChef-managed skills:`,
    `${skillCounts.upstream} commit-pinned upstream`,
    "bundled/direct.",
    "How skill activation works",
    "Installed skills do not run by themselves",
    "A skill enters context when the user names it",
    "Codex reads the selected skill's SKILL.md before acting",
    "routing profiles map task shapes to recommended skills",
    "Skill source verification passed",
    "Log disabled by --no-log"
  ], {
    env: { ...readySkillStatusEnv, COLUMNS: "72" },
    maxVisualWidth: 72
  });
  runCliSmoke("skills-narrow", ["--skills", "--plain", "--no-log"], [
    `${skillCounts.total} AgentChef-managed skills`,
    `${skillCounts.total} of ${skillCounts.total} Chef-managed skills ready`
  ], {
    env: { ...readySkillStatusEnv, COLUMNS: "72" },
    maxVisualWidth: 72
  });
  runCliJsonSmoke("skills-json", ["--skills", "--json", "--no-log"], { env: readySkillStatusEnv });
  runCliJsonSmoke("skills-json-tr", ["--skills", "--json", "--tr", "--no-log"], { env: readySkillStatusEnv });
} finally {
  fs.rmSync(readySkillStatusRoot, { recursive: true, force: true });
}

runCliSmoke("routing-rich-narrow", ["--routing", "--details", "--no-log"], [
  "AgentChef enterprise routing board",
  "Routing visibility contract",
  "Lifecycle hygiene",
  "Routing plan",
  "Routing result",
  "Use /agent in Codex CLI"
], {
  env: {
    COLUMNS: "72",
    FORCE_COLOR: "1"
  },
  maxVisualWidth: 72,
  expectAnsi: true
});
runCliSmoke("diagnostics", ["--diagnostics", "--details", "--plain", "--no-log"], [
  "Diagnostics hub",
  "Current health",
  "Next safe actions",
  "Diagnostic evidence commands",
  "npm run chef -- --status --repo-only --no-log",
  "npm run chef -- --update --no-log",
  "npm run chef -- --repair --no-log",
  "npm run chef -- --logs --no-log",
  "npm run chef -- --processes --no-log",
  "npm run verify:install:runtime -- --expect-skills --redact-paths",
  "Serena/MCP process audit",
  "Historical log signal scan",
  "These counts are historical log evidence",
  "Recent historical log signals",
  "Recent CLI logs",
  "Log root"
], { forbidAnsi: true });
runCliSmoke("diagnostics-tr", ["--diagnostics", "--details", "--tr", "--plain", "--no-log"], [
  "Tanılama merkezi",
  "Canlı sağlık",
  "Sonraki güvenli adımlar",
  "Tanılama kanıt komutları",
  "npm run chef -- --status --repo-only --no-log",
  "npm run chef -- --update --no-log",
  "npm run chef -- --repair --no-log",
  "npm run chef -- --logs --no-log",
  "npm run chef -- --processes --no-log",
  "npm run verify:install:runtime -- --expect-skills --redact-paths",
  "Serena/MCP süreç denetimi",
  "Geçmiş log sinyal taraması",
  "Bu sayılar geçmiş log kanıtıdır",
  "Son geçmiş log sinyalleri",
  "Son CLI logları",
  "Log kök dizini"
], { forbidAnsi: true });
runCliJsonSmoke("diagnostics-json", ["--diagnostics", "--json", "--no-log"]);
runNpmSilentJsonSmoke("diagnostics-npm-silent-json", ["chef", "--", "--diagnostics", "--json", "--no-log"], ["status", "overall"]);
runCliSmoke("processes", ["--processes", "--plain", "--no-log"], [
  "Process audit",
  "Parent/child audit",
  "Codex sessions",
  "Local MCP instances",
  "MCP helper processes",
  "Unrelated runtimes"
], { forbidAnsi: true });
runCliSmoke("processes-tr", ["--processes", "--tr", "--plain", "--no-log"], [
  "Süreç denetimi",
  "Parent/child denetimi",
  "Codex oturumları",
  "Yerel MCP instance",
  "MCP yardımcı süreçleri",
  "İlgisiz runtime"
], { forbidAnsi: true });
runCliJsonSmoke("processes-json", ["--processes", "--json", "--no-log"]);
runNpmSilentJsonSmoke("status-npm-silent-json", ["chef", "--", "--status", "--repo-only", "--json", "--no-log"], ["cliQuickStart", "readOnlyCommands"]);
runCliSmoke("routing-profile-wrong-cwd", ["--routing", "--profile", "starter-health", "--plain", "--no-log"], [
  "AgentChef enterprise routing board",
  "Profiles: 1",
  "starter-health",
  "Owner:",
  "Validation:"
], { cwd: path.dirname(root) });
const managedPreviewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-managed-preview-"));
const managedPreviewEnv = {
  CODEX_HOME: path.join(managedPreviewRoot, ".codex"),
  AGENTS_HOME: path.join(managedPreviewRoot, ".agents")
};
runCliSmoke("update-preview", ["--update", "--plain", "--no-log"], [
  "Update preview",
  "No managed or global files changed",
  "npm run chef -- --update --apply",
  "Managed targets",
  "Full evidence"
], {
  env: managedPreviewEnv,
  forbiddenSnippets: ["What if:"],
  maxLines: 80
});
runCliSmoke("update-preview-tr", ["--update", "--tr", "--plain", "--no-log"], [
  "Güncelleme ön izlemesi",
  "Managed veya global dosya değişmedi",
  "npm run chef -- --update --apply",
  "Yönetilen hedefler",
  "Tam kanıt"
], {
  env: managedPreviewEnv,
  forbiddenSnippets: ["What if:"],
  maxLines: 80
});
runCliSmoke("update-preview-verbose", ["--update", "--verbose-plan", "--plain", "--no-log"], [
  "Update preview",
  "npm run chef -- --update --apply",
  "--force"
], { env: managedPreviewEnv });
runCliJsonSmoke("status-repo-only-json", ["--status", "--repo-only", "--json", "--no-log"]);
runCliJsonSmoke("status-repo-only-json-tr", ["--status", "--repo-only", "--json", "--lang", "tr", "--no-log"]);
runCliSmoke("status-repo-only", ["--status", "--repo-only", "--plain", "--no-log"], [
  "AgentChef status",
  "Overall:",
  "Repo Git:",
  "Codex CLI: skipped",
  "MCP probe skipped",
  "MCP: skipped",
  "Installed runtime: skipped by this mode",
  "Skills: skipped",
  "Next action:",
  "Details: npm run chef -- --status --repo-only --details --no-log",
  "Log disabled by --no-log"
], {
  timeout: scaledTimeout(180000),
  forbiddenSnippets: [
    "MCP quick view:",
    "managed hooks=not inspected",
    "Target Codex home:"
  ]
});
runCliSmoke("status-repo-only-details", ["--status", "--repo-only", "--details", "--plain", "--no-log"], [
  "AgentChef status",
  "Codex CLI: skipped",
  "MCP probe skipped",
  "Installed runtime: skipped by this mode",
  "Skills: skipped",
  "MCP quick view:",
  "managed hooks=not inspected",
  "Codex skipped",
  "Log disabled by --no-log"
], { timeout: scaledTimeout(180000) });
runCliSmoke("reset-preview", ["--reset", "--details", "--plain", "--no-log"], [
  "Refresh preview",
  "--force",
  "completed: AgentChef dry run",
  "Log disabled by --no-log"
], { env: managedPreviewEnv });
fs.rmSync(managedPreviewRoot, { recursive: true, force: true });
runCliSmoke("auth", ["--auth", "--plain", "--no-log"], [
  "Authentication notes",
  "does not print account-scoped re-auth",
  "organization policy",
  "git ls-remote origin HEAD"
], { forbidAnsi: true });
runCliSmoke("auth-tr", ["--auth", "--tr", "--plain", "--no-log"], [
  "Kimlik doğrulama notları",
  "token",
  "kurum politikanıza",
  "git ls-remote origin HEAD"
], { forbidAnsi: true });

for (const [file, snippets] of Object.entries({
  "README.md": [
    "npm run chef",
    "npm run chef -- --status --repo-only",
    "npm run chef -- --install",
    "npm run chef -- --install --apply",
    "npm run chef -- --routing",
    "npm run chef -- --status --repo-only --no-log",
    "operator documentation",
    "Skills teach the agent how to handle a focused job",
    "the agent spawns a subagent"
  ],
  "README.tr.md": [
    "npm run chef",
    "npm run chef -- --status --repo-only",
    "npm run chef -- --install",
    "npm run chef -- --install --apply",
    "npm run chef -- --routing",
    "npm run chef -- --status --repo-only --no-log",
    "operatör dokümantasyonunda",
    "Skill, ajana belirli bir işi hangi adımlarla yapacağını anlatır",
    "ajan ancak iş"
  ],
  "docs/verification.md": [
    "npm run validate:chef-cli",
    "npm run chef -- --status",
    "npm run chef -- --status --repo-only",
    "npm run chef -- --preview",
    "npm run chef -- --update",
    "npm run chef -- --update --verbose-plan",
    "npm run chef -- --backups",
    "npm run chef -- --diagnostics",
    "npm run chef -- --processes",
    "backup delete",
    "backup archive",
    "Skill activation has two evidence levels"
  ],
  "docs/verification.tr.md": [
    "npm run validate:chef-cli",
    "npm run chef -- --status",
    "npm run chef -- --status --repo-only",
    "npm run chef -- --preview",
    "npm run chef -- --update",
    "npm run chef -- --update --verbose-plan",
    "npm run chef -- --backups",
    "npm run chef -- --diagnostics",
    "npm run chef -- --processes",
    "backup delete",
    "backup archive",
    "Skill aktivasyonunda iki kanit seviyesi"
  ],
  "docs/install.md": [
    "npm run chef",
    "npm run chef -- --status",
    "npm run chef -- --status --repo-only",
    "npm run chef -- --preview",
    "npm run chef -- --update",
    "npm run chef -- --update --verbose-plan",
    "npm run chef -- --backups",
    "npm run chef:backups",
    "npm run chef -- --backups --backup <id> --delete",
    "npm run chef -- --reset --apply",
    "npm run chef -- --repair --apply",
    "npm run chef -- --install --apply",
    "npm run chef -- --skills",
    "npm run chef -- --mcp",
    "npm run chef -- --routing",
    "npm run chef -- --diagnostics",
    "npm run chef -- --processes",
    "npm run chef -- --auth",
    "npm run chef -- --logs",
    "npm run chef -- --help --lang tr",
    "npm run chef -- --status --repo-only --no-log",
    "does not change managed/global files",
    "If the pull advances",
    "repo is already current",
    "does not install curated global skills",
    "completed agent threads",
    "Serena/MCP process-audit",
    "/agent",
    "Installed and ready skills do not execute by themselves",
    "live activation is",
    "GitHub CLI or Git Credential Manager",
    "organization policy"
  ],
  "docs/install.tr.md": [
    "npm run chef",
    "npm run chef -- --status",
    "npm run chef -- --status --repo-only",
    "npm run chef -- --preview",
    "npm run chef -- --update",
    "npm run chef -- --update --verbose-plan",
    "npm run chef -- --backups",
    "npm run chef:backups",
    "npm run chef -- --backups --backup <id> --delete",
    "npm run chef -- --reset --apply",
    "npm run chef -- --repair --apply",
    "npm run chef -- --install --apply",
    "npm run chef -- --skills",
    "npm run chef -- --mcp",
    "npm run chef -- --routing",
    "npm run chef -- --diagnostics",
    "npm run chef -- --processes",
    "npm run chef -- --auth",
    "npm run chef -- --logs",
    "npm run chef -- --help --lang tr",
    "npm run chef -- --status --repo-only --no-log",
    "managed/global dosyalari degistirmez",
    "Pull repo HEAD'ini ilerletirse",
    "Repo zaten guncelse",
    "curated global skill",
    "Tamamlanan agent thread",
    "Serena/MCP surec",
    "/agent",
    "Kurulu ve hazır skill'ler kendiliğinden çalışmaz",
    "canlı aktivasyon",
    "GitHub CLI veya Git Credential Manager",
    "kendi kurum politikaniza"
  ],
  "docs/upgrade.md": [
    "npm run chef -- --update",
    "npm run chef -- --update --verbose-plan",
    "npm run chef -- --backups",
    "does not change managed/global files",
    "If the pull advances the repo",
    "repo is already"
  ],
  "docs/upgrade.tr.md": [
    "npm run chef -- --update",
    "npm run chef -- --update --verbose-plan",
    "npm run chef -- --backups",
    "managed/global dosyalari degistirmez",
    "Pull repo HEAD'ini ilerletirse",
    "Repo zaten guncelse"
  ],
  "docs/security-model.md": [
    "npm run chef -- --update",
    "npm run chef -- --backups",
    "repo-local CLI logs",
    "prints a fresh preview",
    "local validation before the managed refresh",
    "may backup",
    "perform unscoped",
    "delete user skills"
  ],
  "docs/security-model.tr.md": [
    "npm run chef -- --update",
    "npm run chef -- --backups",
    "normal repo-local CLI loglari",
    "fresh preview basar",
    "managed refresh oncesi lokal validation",
    "backup alip replace",
    "Publish, unscoped",
    "user skill silme"
  ]
})) {
  const text = read(file);
  for (const snippet of snippets) {
    if (!text.includes(snippet)) fail(`${file} missing AgentChef CLI documentation snippet: ${snippet}`);
  }
}

runNodeCheck("scripts/validate-chef-cli.mjs");

if (failures.length > 0) {
  console.error("AgentChef CLI validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AgentChef CLI validation passed.");
