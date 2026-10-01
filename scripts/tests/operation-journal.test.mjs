import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createOperationJournal, rollbackAfterFailure } from "../lib/operation-journal.mjs";

test("operation journal durably records a completed backup before mutation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-"));
  try {
    const backup = path.join(root, "codex", "AGENTS.md");
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, "original\n", "utf8");
    const journal = createOperationJournal({ backupRoot: root, operation: "repair-install" });
    journal.recordBackup(backup);
    const beforeFinish = JSON.parse(fs.readFileSync(journal.journalPath, "utf8"));
    assert.equal(beforeFinish.state, "in-progress");
    assert.deepEqual(beforeFinish.backups.map((entry) => entry.path), ["codex/AGENTS.md"]);
    journal.finish();
    assert.equal(JSON.parse(fs.readFileSync(journal.journalPath, "utf8")).state, "complete");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("operation journal records mutation intent before a target is changed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-prepared-"));
  try {
    const target = path.join(root, "codex", "AGENTS.md");
    const backup = path.join(root, "backup", "AGENTS.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(target, "original\n", "utf8");
    fs.writeFileSync(backup, "original\n", "utf8");
    const journal = createOperationJournal({ backupRoot: root, operation: "repair-install" });
    journal.prepareMutation({ target, backup });
    const prepared = JSON.parse(fs.readFileSync(journal.journalPath, "utf8")).mutations[0];
    assert.equal(prepared.phase, "prepared");
    assert.equal(prepared.before.kind, "file");
    assert.equal(prepared.output, null);

    fs.writeFileSync(target, "new output\n", "utf8");
    journal.markApplied(target);
    const applied = JSON.parse(fs.readFileSync(journal.journalPath, "utf8")).mutations[0];
    assert.equal(applied.phase, "applied");
    assert.equal(applied.output.kind, "file");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("journal CLI persists prepared intent before a mutation and applied output after it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-cli-phases-"));
  const journalScript = path.resolve("scripts/lib/operation-journal.mjs");
  const target = path.join(root, "codex", "config.toml");
  const backup = path.join(root, "backup", "codex", "config.toml");
  const run = (...args) => spawnSync(process.execPath, [journalScript, ...args], { encoding: "utf8" });
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(target, "before\\n", "utf8");
    fs.writeFileSync(backup, "before\\n", "utf8");
    assert.equal(run("start", root, "install").status, 0);
    assert.equal(run("prepare", root, target, backup).status, 0);
    assert.notEqual(run("finish", root, "complete").status, 0);

    const prepared = JSON.parse(fs.readFileSync(path.join(root, ".agentchef-operation-journal.json"), "utf8")).mutations[0];
    assert.equal(prepared.phase, "prepared");
    assert.equal(prepared.before.kind, "file");
    assert.equal(prepared.output, null);

    fs.writeFileSync(target, "after\\n", "utf8");
    assert.equal(run("applied", root, target).status, 0);
    assert.equal(run("finish", root, "complete").status, 0);
    const applied = JSON.parse(fs.readFileSync(path.join(root, ".agentchef-operation-journal.json"), "utf8")).mutations[0];
    assert.equal(applied.phase, "applied");
    assert.equal(applied.output.kind, "file");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("journal CLI records directory backups and closes only once", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-cli-"));
  const journalScript = path.resolve("scripts/lib/operation-journal.mjs");
  const run = (...args) => spawnSync(process.execPath, [journalScript, ...args], { encoding: "utf8" });
  try {
    const backup = path.join(root, "agents", "skills", "example", "SKILL.md");
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, "original\n", "utf8");
    assert.equal(run("start", root, "install").status, 0);
    assert.equal(run("record", root, path.join(root, "agents")).status, 0);
    assert.equal(run("finish", root, "complete").status, 0);
    const journal = JSON.parse(fs.readFileSync(path.join(root, ".agentchef-operation-journal.json"), "utf8"));
    assert.equal(journal.state, "complete");
    assert.deepEqual(journal.backups.map((entry) => entry.path), ["agents/skills/example/SKILL.md"]);
    assert.notEqual(run("finish", root, "failed").status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("journal rollback removes a newly created file when the applied marker was not persisted", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-unmarked-create-"));
  const journalScript = path.resolve("scripts/lib/operation-journal.mjs");
  const codexHome = path.join(root, "codex-home");
  const backupRoot = path.join(codexHome, "backups", "operation");
  const target = path.join(codexHome, "config.toml");
  const run = (...args) => spawnSync(process.execPath, [journalScript, ...args], { encoding: "utf8" });
  try {
    fs.mkdirSync(codexHome, { recursive: true });
    assert.equal(run("start", backupRoot, "install").status, 0);
    assert.equal(run("prepare", backupRoot, target, "-").status, 0);
    fs.writeFileSync(target, "installer output\n", "utf8");
    assert.equal(run("rollback", backupRoot, "-", codexHome).status, 0);
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("journal rollback restores only a target still matching the transaction output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-rollback-"));
  const journalScript = path.resolve("scripts/lib/operation-journal.mjs");
  const codexHome = path.join(root, "codex-home");
  const backupRoot = path.join(codexHome, "backups", "operation");
  const target = path.join(codexHome, "AGENTS.md");
  const backup = path.join(backupRoot, "codex", "AGENTS.md");
  const run = (...args) => spawnSync(process.execPath, [journalScript, ...args], { encoding: "utf8" });
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(target, "original\n", "utf8");
    fs.writeFileSync(backup, "original\n", "utf8");
    assert.equal(run("start", backupRoot, "install").status, 0);
    fs.writeFileSync(target, "installer output\n", "utf8");
    assert.equal(run("track", backupRoot, target, backup).status, 0);
    assert.equal(run("rollback", backupRoot, "-", codexHome).status, 0);
    assert.equal(fs.readFileSync(target, "utf8"), "original\n");

    fs.writeFileSync(target, "installer output\n", "utf8");
    assert.equal(run("track", backupRoot, target, backup).status, 0);
    fs.writeFileSync(target, "user change\n", "utf8");
    assert.notEqual(run("rollback", backupRoot, "-", codexHome).status, 0);
    assert.equal(fs.readFileSync(target, "utf8"), "user change\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("journal track-tree records source-owned files without recording directory extras", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-tree-"));
  const journalScript = path.resolve("scripts/lib/operation-journal.mjs");
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const run = (...args) => spawnSync(process.execPath, [journalScript, ...args], { encoding: "utf8" });
  try {
    writeTreeFile(source, "managed.txt", "source\n");
    writeTreeFile(target, "managed.txt", "source\n");
    writeTreeFile(target, "user-extra.txt", "preserve\n");
    assert.equal(run("start", root, "install").status, 0);
    assert.equal(run("track-tree", root, target, source, "-").status, 0);
    const journal = JSON.parse(fs.readFileSync(path.join(root, ".agentchef-operation-journal.json"), "utf8"));
    assert.deepEqual(journal.mutations.map((entry) => path.basename(entry.target)), ["managed.txt"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("journal tree phases durably surround every source-owned managed write", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-tree-phases-"));
  const journalScript = path.resolve("scripts/lib/operation-journal.mjs");
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  const run = (...args) => spawnSync(process.execPath, [journalScript, ...args], { encoding: "utf8" });
  try {
    writeTreeFile(source, "nested/managed.txt", "after\\n");
    writeTreeFile(target, "nested/managed.txt", "before\\n");
    assert.equal(run("start", root, "install").status, 0);
    assert.equal(run("prepare-tree", root, target, source, "-").status, 0);
    const prepared = JSON.parse(fs.readFileSync(path.join(root, ".agentchef-operation-journal.json"), "utf8")).mutations[0];
    assert.equal(prepared.phase, "prepared");
    assert.equal(prepared.output, null);

    writeTreeFile(target, "nested/managed.txt", "after\\n");
    assert.equal(run("applied-tree", root, target, source).status, 0);
    const applied = JSON.parse(fs.readFileSync(path.join(root, ".agentchef-operation-journal.json"), "utf8")).mutations[0];
    assert.equal(applied.phase, "applied");
    assert.equal(applied.output.kind, "file");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function writeTreeFile(root, relative, text) {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

test("a journal marked failed can still be rolled back, and a complete one cannot", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-failed-"));
  try {
    const target = path.join(root, "home", "settings.json");
    const backup = path.join(root, "backup", "settings.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(target, "original\n", "utf8");
    fs.copyFileSync(target, backup);
    const journal = createOperationJournal({ backupRoot: root, operation: "claude-install" });
    journal.recordBackup(backup);
    journal.prepareMutation({ target, backup });
    fs.writeFileSync(target, "half-applied\n", "utf8");
    journal.markApplied(target);
    // Every Node write flow marks the journal failed before asking for rollback.
    journal.finish("failed");

    const rolledBack = rollbackAfterFailure({ backupRoot: root, allowedTargets: [path.join(root, "home")], error: new Error("boom") });
    assert.equal(rolledBack, true);
    assert.equal(fs.readFileSync(target, "utf8"), "original\n");

    const done = createOperationJournal({ backupRoot: path.join(root, "second"), operation: "claude-install" });
    done.finish();
    const error = new Error("later failure");
    assert.equal(rollbackAfterFailure({ backupRoot: path.join(root, "second"), allowedTargets: [path.join(root, "home")], error }), false);
    assert.match(error.message, /only an in-progress or failed operation can be rolled back/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rolling back a removed skill link recreates the link, not a copy", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-link-"));
  try {
    const managed = path.join(root, "agents", "skills", "seo");
    const link = path.join(root, "claude", "skills", "seo");
    fs.mkdirSync(managed, { recursive: true });
    fs.writeFileSync(path.join(managed, "SKILL.md"), "managed\n");
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(managed, link, process.platform === "win32" ? "junction" : "dir");
    const journal = createOperationJournal({ backupRoot: path.join(root, "backup"), operation: "claude-remove" });
    journal.prepareMutation({ target: link, backup: null, link: true });
    fs.unlinkSync(link);
    journal.markApplied(link);
    journal.finish("failed");

    assert.equal(rollbackAfterFailure({ backupRoot: path.join(root, "backup"), allowedTargets: [path.join(root, "claude"), path.join(root, "agents")], error: new Error("boom") }), true);
    assert.ok(fs.lstatSync(link).isSymbolicLink(), "the link is back as a link");
    assert.equal(fs.readFileSync(path.join(link, "SKILL.md"), "utf8"), "managed\n");
    assert.equal(fs.readdirSync(managed).length, 1, "the managed tree was not copied or changed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("journal rollback never deletes a replaced file that has no backup", () => {
  // A write made without a backup (--no-backup) cannot be undone; deleting the
  // file on rollback would remove the only copy of the user's data.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-operation-journal-no-backup-"));
  const journalScript = path.resolve("scripts/lib/operation-journal.mjs");
  const home = path.join(root, "claude-home");
  const backupRoot = path.join(home, "backups", "operation");
  const target = path.join(home, "settings.json");
  const run = (...args) => spawnSync(process.execPath, [journalScript, ...args], { encoding: "utf8" });
  try {
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(target, "user settings\n", "utf8");
    assert.equal(run("start", backupRoot, "install").status, 0);
    assert.equal(run("prepare", backupRoot, target, "-").status, 0);
    fs.writeFileSync(target, "merged settings\n", "utf8");
    assert.equal(run("applied", backupRoot, target).status, 0);
    const rollback = run("rollback", backupRoot, "-", home);
    assert.notEqual(rollback.status, 0, "the rollback reports the target it could not restore");
    assert.match(`${rollback.stdout}${rollback.stderr}`, /no backup/);
    assert.equal(fs.readFileSync(target, "utf8"), "merged settings\n", "the file is kept, not deleted");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
