import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { acceptsSchema, backupKind, envValue, identity, isManagedBackupId, modernSchema, schemaId } from "../lib/identity.mjs";
import { acquireOperationLock, inspectOperationLock } from "../lib/operation-lock.mjs";
import { createOperationJournal } from "../lib/operation-journal.mjs";
import { readReceipt, receiptSchemaVersion } from "../lib/json-merge-receipt.mjs";
import { KNOWN_LEGACY_FILE_SHA256, RECEIPT_SCHEMA, LEGACY_RECEIPT_SCHEMA, validateGlobalGitGuardReceipt } from "../lib/global-git-guards.mjs";
import { resolvePluginId, PLUGIN_ID } from "../refresh-installed-plugin.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("identity helpers accept legacy schema spellings and classify both backup prefixes", () => {
  assert.equal(schemaId("backup", 1), "agentchef.backup.v1");
  assert.equal(acceptsSchema("codex-chef.backup.v1", "backup", 1), true);
  assert.equal(acceptsSchema("agentchef.backup.v1", "backup", 1), true);
  assert.equal(acceptsSchema("agentchef.backup.v2", "backup", 1), false);
  assert.equal(modernSchema("codex-chef.operation-journal.v1"), "agentchef.operation-journal.v1");
  assert.equal(modernSchema("agentchef.repair.v1"), "agentchef.repair.v1");
  assert.equal(backupKind("codex-chef-repair-20260101-abc"), "repair");
  assert.equal(backupKind("agentchef-restore-20260101-1"), "restore");
  assert.equal(backupKind("codex-chef-20260101-120000-1"), "install");
  assert.equal(backupKind("agentchef-remove-2026"), "remove");
  assert.equal(backupKind("something-else"), null);
  assert.equal(isManagedBackupId("codex-chef-skill-2026-x"), true);
  assert.equal(envValue("LANG", { CODEX_CHEF_LANG: "tr" }), "tr");
  assert.equal(envValue("LANG", { AGENTCHEF_LANG: "en", CODEX_CHEF_LANG: "tr" }), "en");
  assert.equal(envValue("LANG", {}), undefined);
});

test("a legacy operation lock still blocks new operations and is reported by inspection", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-legacy-lock-"));
  const legacyLock = path.join(home, identity.legacyLockDirectory);
  fs.mkdirSync(legacyLock);
  fs.writeFileSync(path.join(legacyLock, "owner.json"), `${JSON.stringify({ id: "legacy", pid: 1, operation: "install", startedAt: new Date().toISOString() })}\n`);
  const inspection = inspectOperationLock({ root: home });
  assert.notEqual(inspection.status, "absent");
  assert.equal(inspection.lockPath, legacyLock);
  assert.throws(() => acquireOperationLock({ root: home, operation: "install" }), /already in progress/);
  fs.rmSync(legacyLock, { recursive: true, force: true });
  const lock = acquireOperationLock({ root: home, operation: "install" });
  assert.equal(path.basename(lock.lockPath), identity.lockDirectory);
  lock.release();
  fs.rmSync(home, { recursive: true, force: true });
});

test("a journal written under the legacy file name is still found for finish and rollback", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-legacy-journal-"));
  const backupRoot = path.join(home, "backup");
  fs.mkdirSync(backupRoot);
  const journal = createOperationJournal({ backupRoot, operation: "install" });
  assert.equal(path.basename(journal.journalPath), identity.journalFile);
  journal.finish("complete");
  // Rename to the legacy spelling and make sure a second journal cannot silently start beside it.
  fs.renameSync(journal.journalPath, path.join(backupRoot, identity.legacyJournalFile));
  assert.throws(() => createOperationJournal({ backupRoot, operation: "install" }), /already exists/);
  const legacy = JSON.parse(fs.readFileSync(path.join(backupRoot, identity.legacyJournalFile), "utf8"));
  assert.equal(legacy.schemaVersion, "agentchef.operation-journal.v1");
  fs.rmSync(home, { recursive: true, force: true });
});

test("legacy merge receipts and Git guard receipts remain readable", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-legacy-receipts-"));
  const receiptPath = path.join(home, "receipt.json");
  fs.writeFileSync(receiptPath, `${JSON.stringify({ schemaVersion: "codex-chef.json-merge-receipt.v1", entries: [] })}\n`);
  assert.equal(readReceipt(receiptPath).schemaVersion, "codex-chef.json-merge-receipt.v1");
  assert.equal(receiptSchemaVersion, "agentchef.json-merge-receipt.v1");
  const legacyGuardReceipt = {
    schema: LEGACY_RECEIPT_SCHEMA,
    version: 1,
    createdAt: new Date().toISOString(),
    home,
    files: [],
    gitConfig: []
  };
  // The legacy schema string passes the schema gate; structural checks still apply.
  try {
    validateGlobalGitGuardReceipt(legacyGuardReceipt, { home });
  } catch (error) {
    assert.doesNotMatch(error.message, /schema or version/);
  }
  assert.throws(() => validateGlobalGitGuardReceipt({ ...legacyGuardReceipt, schema: "someone-else.receipt" }, { home }), /schema or version/);
  assert.equal(RECEIPT_SCHEMA, "agentchef.global-git-guards-receipt");
  assert.ok(KNOWN_LEGACY_FILE_SHA256["pre-commit-hook"].every((hash) => /^[a-f0-9]{64}$/.test(hash)));
  fs.rmSync(home, { recursive: true, force: true });
});

test("the installed plugin id follows the personal marketplace name until migration", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-plugin-id-"));
  const agentsHome = path.join(home, ".agents");
  fs.mkdirSync(path.join(agentsHome, "plugins"), { recursive: true });
  fs.writeFileSync(path.join(agentsHome, "plugins", "marketplace.json"), `${JSON.stringify({ name: identity.legacyMarketplaceName, plugins: [] })}\n`);
  assert.equal(resolvePluginId(agentsHome), `${identity.pluginName}@${identity.legacyMarketplaceName}`);
  fs.writeFileSync(path.join(agentsHome, "plugins", "marketplace.json"), `${JSON.stringify({ name: identity.marketplaceName, plugins: [] })}\n`);
  assert.equal(resolvePluginId(agentsHome), PLUGIN_ID);
  assert.equal(resolvePluginId(path.join(home, "missing")), PLUGIN_ID);
  assert.equal(PLUGIN_ID, "agentchef-workflows@agentchef");
  fs.rmSync(home, { recursive: true, force: true });
});

test("the repository plugin, operator skill, and marketplace carry the current identity", () => {
  assert.ok(fs.existsSync(path.join(root, "plugins", identity.pluginName, ".codex-plugin", "plugin.json")));
  assert.ok(fs.existsSync(path.join(root, "plugins", identity.pluginName, "skills", identity.operatorSkill, "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(root, "plugins", identity.legacyPluginName)));
  const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
  assert.equal(marketplace.name, identity.marketplaceName);
  assert.ok(marketplace.plugins.some((plugin) => plugin.name === identity.pluginName));
  const skills = JSON.parse(fs.readFileSync(path.join(root, "catalog", "skills.json"), "utf8"));
  assert.equal(skills.compatibilityAliases[identity.legacyOperatorSkill], identity.operatorSkill, "the legacy operator skill name resolves through compatibilityAliases");
  const hook = fs.readFileSync(path.join(root, "templates", "git", "pre-commit"), "utf8");
  assert.ok(hook.includes(identity.hookBanner) && !hook.includes(identity.legacyHookBanner));
});
