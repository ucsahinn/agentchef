#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const modulePath = path.join(root, "scripts/lib/brain-foundation.mjs");
const templateRoot = path.join(root, "templates/brain");
const manifestPath = path.join(root, "manifests/brain-vault.json");
const auditSchemaPath = path.join(root, "schemas/brain-audit.schema.json");

const canonicalTwenty = [
  ".codex-chef-brain.json",
  ".gitignore",
  "AGENTS.md",
  "README.md",
  "brain.config.json",
  "00-inbox/README.md",
  "10-command-center/dashboard.md",
  "20-goals/README.md",
  "30-projects/README.md",
  "40-knowledge/README.md",
  "50-research/README.md",
  "60-decisions/README.md",
  "70-personal/README.md",
  "80-memory/profile.md",
  "80-memory/current-context.md",
  "80-memory/active-threads.md",
  "80-memory/decisions.md",
  "80-memory/session-index.md",
  "90-archive/README.md",
  "templates/note.md"
];
const controlCanvasFiles = [
  "10-command-center/system-map.canvas",
  "10-command-center/control-brain-flow.canvas",
  "10-command-center/portfolio-map.canvas"
];
const requiredFiles = [...canonicalTwenty, ...controlCanvasFiles, ".obsidian/core-plugins.json"];

function readTemplate(relativePath) {
  return fs.readFileSync(path.join(templateRoot, ...relativePath.split("/")), "utf8");
}

async function loadFoundation() {
  assert.equal(
    fs.existsSync(modulePath),
    true,
    "Brain foundation module must exist before behavior can be verified."
  );
  return import(pathToFileURL(modulePath).href);
}

test("required-file contract keeps the canonical twenty and adds the Control Canvas surface", async () => {
  const { BRAIN_REQUIRED_FILES } = await loadFoundation();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.deepEqual(BRAIN_REQUIRED_FILES, requiredFiles);
  assert.deepEqual(manifest.requiredFiles, requiredFiles);
  for (const relativePath of requiredFiles) {
    assert.equal(fs.existsSync(path.join(templateRoot, ...relativePath.split("/"))), true, relativePath);
  }

  const plugins = JSON.parse(readTemplate(".obsidian/core-plugins.json"));
  assert.equal(plugins.canvas, true);
  for (const relativePath of controlCanvasFiles) {
    const canvas = JSON.parse(readTemplate(relativePath));
    assert.ok(Array.isArray(canvas.nodes) && canvas.nodes.length > 0, `${relativePath} nodes`);
    assert.ok(Array.isArray(canvas.edges), `${relativePath} edges`);
  }
});

test("canonical Brain copy is anonymous and every human-facing template is bilingual TR/EN", () => {
  const markdownFiles = canonicalTwenty.filter((relativePath) => relativePath.endsWith(".md"));
  for (const relativePath of markdownFiles) {
    const text = readTemplate(relativePath);
    assert.match(text, /(?:^|\n)## Türkçe(?:\r?\n|$)/, `${relativePath} Turkish section`);
    assert.match(text, /(?:^|\n)## English(?:\r?\n|$)/, `${relativePath} English section`);
  }

  const humanFacing = [
    ...markdownFiles.map((relativePath) => readTemplate(relativePath)),
    ...controlCanvasFiles.map((relativePath) => readTemplate(relativePath))
  ].join("\n");
  assert.doesNotMatch(humanFacing, /(?:[A-Za-z]:\\Users\\|\/Users\/|\/home\/)[^\s"'`]+/i);
  const privateIdentifiers = [
    ["ula", "sc"].join(""),
    ["uc", "sahinn"].join(""),
    ["Vault", "Pilot"].join(""),
    ["Pass", "Man"].join(""),
    ["My", "Vuln"].join(""),
    ["Vault", "ek"].join("")
  ];
  assert.doesNotMatch(humanFacing, new RegExp(`\\b(?:${privateIdentifiers.join("|")})\\b`, "i"));
  assert.doesNotMatch(humanFacing, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);

  for (const relativePath of controlCanvasFiles) {
    const canvas = JSON.parse(readTemplate(relativePath));
    const textNodes = canvas.nodes.filter((node) => node.type === "text");
    assert.ok(textNodes.length > 0, `${relativePath} text nodes`);
    for (const node of textNodes) {
      assert.match(node.text, /\bTR:/, `${relativePath} Turkish Canvas text`);
      assert.match(node.text, /\bEN:/, `${relativePath} English Canvas text`);
    }
  }
});

test("apply preserves conflicting Control Canvas and Obsidian plugin files", async () => {
  const { applyBrainPlan, buildBrainPlan } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-canvas-conflict-"));
  const target = path.join(sandbox, "CodexChefBrain");
  const preserved = new Map([
    ["10-command-center/system-map.canvas", '{"user":"owned canvas"}\n'],
    [".obsidian/core-plugins.json", '{"canvas":false,"userOwned":true}\n']
  ]);

  for (const [relativePath, content] of preserved) {
    const absolute = path.join(target, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, "utf8");
  }

  const plan = buildBrainPlan({ templateRoot, target });
  assert.deepEqual(plan.conflicts.map((entry) => entry.relativePath).sort(), [...preserved.keys()].sort());

  const result = applyBrainPlan(plan);
  assert.equal(result.overwritten.length, 0);
  for (const [relativePath, content] of preserved) {
    assert.equal(fs.readFileSync(path.join(target, ...relativePath.split("/")), "utf8"), content);
  }
  assert.ok(result.created.includes("10-command-center/control-brain-flow.canvas"));
  assert.ok(result.created.includes("10-command-center/portfolio-map.canvas"));
});

test("preview plans a complete vault without writing the target", async () => {
  const { buildBrainPlan } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-preview-"));
  const target = path.join(sandbox, "CodexChefBrain");

  const plan = buildBrainPlan({ templateRoot, target });

  assert.equal(fs.existsSync(target), false);
  assert.equal(plan.conflicts.length, 0);
  assert.ok(plan.operations.some((entry) => entry.relativePath === "AGENTS.md"));
  assert.ok(plan.operations.some((entry) => entry.relativePath === "brain.config.json"));
  assert.ok(plan.operations.some((entry) => entry.relativePath === "80-memory/current-context.md"));
});

test("apply creates missing files and never overwrites a conflicting file", async () => {
  const { applyBrainPlan, buildBrainPlan } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-apply-"));
  const target = path.join(sandbox, "CodexChefBrain");

  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "AGENTS.md"), "user-owned\n", "utf8");

  const plan = buildBrainPlan({ templateRoot, target });
  assert.deepEqual(plan.conflicts.map((entry) => entry.relativePath), ["AGENTS.md"]);

  const result = applyBrainPlan(plan);

  assert.equal(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), "user-owned\n");
  assert.equal(result.overwritten.length, 0);
  assert.ok(result.created.includes("brain.config.json"));
});

test("validation reports missing required files", async () => {
  const { validateBrainVault } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-invalid-"));

  const result = validateBrainVault(sandbox);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("AGENTS.md")));
  assert.ok(result.errors.some((message) => message.includes("brain.config.json")));
});

test("validation ignores Obsidian session state and validates canonical note frontmatter", async () => {
  const { applyBrainPlan, buildBrainPlan, validateBrainVault } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-note-validation-"));
  const target = path.join(sandbox, "CodexChefBrain");
  applyBrainPlan(buildBrainPlan({ templateRoot, target }));
  fs.mkdirSync(path.join(target, ".obsidian"), { recursive: true });
  fs.writeFileSync(path.join(target, ".obsidian", "workspace.json"), '{"session":"OPENAI_API_KEY=not-canonical"}', "utf8");
  assert.equal(validateBrainVault(target).ok, true);

  fs.writeFileSync(path.join(target, "30-projects", "invalid.md"), `---
brain_schema: "codex-chef.brain-note.v1"
type: "project"
title: "Invalid note"
project_id: "brain"
status: "active"
privacy: "local"
confidence: "confirmed"
retention: "project"
created: "2026-07-22T10:00:00.000Z"
updated: "2026-07-22T10:00:00.000Z"
source_refs: ["local:test"]
---

Missing an ID.
`, "utf8");
  const invalid = validateBrainVault(target);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((message) => /invalid\.md.*id/i.test(message)));
});

test("audit correlates canonical notes, flags stale context, and reports broken Brain links", async () => {
  const { applyBrainPlan, auditBrainVault, buildBrainPlan } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-audit-"));
  const target = path.join(sandbox, "CodexChefBrain");
  applyBrainPlan(buildBrainPlan({ templateRoot, target }));

  fs.writeFileSync(path.join(target, "30-projects", "audit-sample.md"), `---
brain_schema: "codex-chef.brain-note.v1"
id: "brn_55555555-5555-4555-8555-555555555555"
type: "project"
title: "Audit sample"
project_id: "audit-sample"
status: "active"
privacy: "local"
confidence: "confirmed"
retention: "project"
created: "2026-01-01T00:00:00.000Z"
updated: "2026-01-02T00:00:00.000Z"
source_refs: ["local:test"]
---

# Audit sample
[[../10-command-center/system-map.canvas|System map]]
[[README|Project index]]

[[audit-sample|Current context]]
[[../80-memory/missing-context|Missing context]]
`, "utf8");

  const report = auditBrainVault({ target, now: "2026-08-10T00:00:00.000Z", staleAfterDays: 30 });

  assert.equal(report.schemaVersion, "codex-chef.brain-audit.v1");
  assert.equal(report.ok, false);
  assert.ok(report.notes.total > 0);
  assert.ok(report.freshness.stale.some((entry) => entry.relativePath === "30-projects/audit-sample.md"));
  assert.ok(report.relationships.resolvedLinks.some((entry) => entry.from === "30-projects/audit-sample.md" && entry.to === "30-projects/audit-sample.md"));
  assert.ok(report.relationships.resolvedLinks.some((entry) => entry.from === "30-projects/audit-sample.md" && entry.to === "10-command-center/system-map.canvas"));
  assert.ok(report.relationships.resolvedLinks.some((entry) => entry.from === "30-projects/audit-sample.md" && entry.to === "30-projects/README.md"));
  assert.ok(report.relationships.brokenLinks.some((entry) => entry.from === "30-projects/audit-sample.md" && entry.target === "../80-memory/missing-context"));
});

test("unsafe broad targets are rejected", async () => {

  const { assertSafeBrainTarget, validateBrainVault } = await loadFoundation();

  assert.throws(() => assertSafeBrainTarget(path.parse(process.cwd()).root), /filesystem root/i);
  assert.throws(() => assertSafeBrainTarget(os.homedir()), /user profile root/i);
  assert.throws(() => assertSafeBrainTarget("\\\\server\\share\\Brain"), /network|UNC/i);
  assert.throws(() => validateBrainVault(path.parse(process.cwd()).root), /filesystem root/i);
  assert.throws(() => validateBrainVault(os.homedir()), /user profile root/i);
});


test("Brain correlation audit publishes a machine-readable report schema", () => {
  assert.equal(fs.existsSync(auditSchemaPath), true, "Brain audit schema must exist.");
  const schema = JSON.parse(fs.readFileSync(auditSchemaPath, "utf8"));
  assert.equal(schema.$id, "https://codex-chef.dev/schemas/brain-audit.schema.json");
  assert.equal(schema.type, "object");
  assert.ok(schema.required.includes("notes"));
  assert.ok(schema.required.includes("freshness"));
  assert.ok(schema.required.includes("relationships"));
});
test("a second apply is idempotent and creates nothing", async () => {
  const { applyBrainPlan, buildBrainPlan } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-idempotent-"));
  const target = path.join(sandbox, "CodexChefBrain");

  applyBrainPlan(buildBrainPlan({ templateRoot, target }));
  const result = applyBrainPlan(buildBrainPlan({ templateRoot, target }));

  assert.equal(result.created.length, 0);
  assert.equal(result.conflicts.length, 0);
  assert.ok(result.identical.includes("AGENTS.md"));
});

test("apply re-resolves every planned destination inside the vault", async () => {
  const { applyBrainPlan, buildBrainPlan } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-plan-tamper-"));
  const target = path.join(sandbox, "CodexChefBrain");
  const outside = path.join(sandbox, "outside.md");
  const plan = buildBrainPlan({ templateRoot, target });
  plan.operations[0].destinationPath = outside;

  assert.throws(() => applyBrainPlan(plan), /plan|destination|vault/i);
  assert.equal(fs.existsSync(outside), false);
});

test("capture is preview-first, rejects secrets, and retrieve stays project-scoped", async () => {
  const {
    applyBrainPlan,
    applyCapturePlan,
    buildBrainPlan,
    buildCapturePlan,
    retrieveBrainNotes
  } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-capture-"));
  const target = path.join(sandbox, "CodexChefBrain");
  applyBrainPlan(buildBrainPlan({ templateRoot, target }));

  const candidate = {
    schemaVersion: "codex-chef.brain-candidate.v1",
    candidateId: "11111111-1111-4111-8111-111111111111",
    type: "decision",
    title: "VaultPilot lisans kararı",
    projectId: "vaultpilot",
    bodyMarkdown: "Lisanslar çevrimdışı imzalı olacak.",
    privacy: "local",
    confidence: "confirmed",
    retention: "permanent",
    sourceRefs: ["user:2026-07-22"]
  };
  const plan = buildCapturePlan({ target, candidate, now: "2026-07-22T12:00:00.000Z" });
  assert.equal(fs.existsSync(plan.destinationPath), false);
  applyCapturePlan(plan);

  const context = retrieveBrainNotes({ target, projectId: "vaultpilot", query: "lisans" });
  assert.equal(context.notes.length, 1);
  assert.equal(context.notes[0].title, candidate.title);
  assert.equal(context.notes[0].projectId, "vaultpilot");
  assert.equal(retrieveBrainNotes({ target, projectId: "başka", query: "lisans" }).notes.length, 0);

  assert.throws(() => buildCapturePlan({
    target,
    candidate: { ...candidate, candidateId: "22222222-2222-4222-8222-222222222222", bodyMarkdown: "password = super-secret-value-123456" },
    now: "2026-07-22T12:00:00.000Z"
  }), /secret/i);
  const githubTokenFixture = ["github", "pat", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
  assert.throws(() => buildCapturePlan({
    target,
    candidate: { ...candidate, candidateId: "33333333-3333-4333-8333-333333333333", bodyMarkdown: `Credential: ${githubTokenFixture}` },
    now: "2026-07-22T12:00:00.000Z"
  }), /github-token|secret/i);
});

test("capture and vault validation share portable source reference rules", async () => {
  const { applyBrainPlan, buildBrainPlan, buildCapturePlan, validateBrainVault } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-source-ref-"));
  const target = path.join(sandbox, "CodexChefBrain");
  applyBrainPlan(buildBrainPlan({ templateRoot, target }));
  const candidate = {
    schemaVersion: "codex-chef.brain-candidate.v1",
    candidateId: "55555555-5555-4555-8555-555555555555",
    type: "knowledge",
    title: "Portable source reference",
    projectId: "codex-chef",
    bodyMarkdown: "Portable provenance must remain safe.",
    privacy: "local",
    confidence: "confirmed",
    retention: "project",
    sourceRefs: ["user:2026-08-14"]
  };

  assert.doesNotThrow(() => buildCapturePlan({ target, candidate }));
  for (const sourceRefs of [["/tmp/private"], ["C:\\fixture\\private"], ["../../private"], ["\\\\server\\share"], ["ab"]]) {
    assert.throws(() => buildCapturePlan({ target, candidate: { ...candidate, sourceRefs } }), /sourceRefs/i);
  }

  const invalidNote = path.join(target, "40-knowledge", "unsafe-source-ref.md");
  fs.writeFileSync(invalidNote, `---
brain_schema: "codex-chef.brain-note.v1"
id: "brn_66666666-6666-4666-8666-666666666666"
type: "knowledge"
title: "Unsafe source ref"
project_id: "codex-chef"
status: "active"
privacy: "local"
confidence: "confirmed"
retention: "project"
created: "2026-08-14T00:00:00.000Z"
updated: "2026-08-14T00:00:00.000Z"
source_refs: ["/tmp/private"]
---

Unsafe provenance fixture.
`, "utf8");
  const validation = validateBrainVault(target);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => /unsafe-source-ref\.md.*source_refs/i.test(error)));
});

test("identical capture is rechecked at apply time", async () => {
  const { applyBrainPlan, applyCapturePlan, buildBrainPlan, buildCapturePlan } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-identical-race-"));
  const target = path.join(sandbox, "CodexChefBrain");
  applyBrainPlan(buildBrainPlan({ templateRoot, target }));
  const candidate = {
    schemaVersion: "codex-chef.brain-candidate.v1",
    candidateId: "44444444-4444-4444-8444-444444444444",
    type: "knowledge",
    title: "Idempotent capture",
    projectId: "codex-chef",
    bodyMarkdown: "Same candidate must remain identical.",
    privacy: "local",
    confidence: "confirmed",
    retention: "project",
    sourceRefs: ["user:2026-07-22"]
  };
  const now = "2026-07-22T12:00:00.000Z";
  applyCapturePlan(buildCapturePlan({ target, candidate, now }));
  const identicalPlan = buildCapturePlan({ target, candidate, now });
  assert.equal(identicalPlan.status, "identical");
  fs.writeFileSync(identicalPlan.destinationPath, "changed after preview\n", "utf8");
  assert.throws(() => applyCapturePlan(identicalPlan), /changed|identical|conflict/i);
});

test("backup and restore are explicit plans and round-trip Markdown", async () => {
  const {
    applyBackupPlan,
    applyBrainPlan,
    applyRestorePlan,
    buildBackupPlan,
    buildBrainPlan,
    buildRestorePlan
  } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-backup-"));
  const target = path.join(sandbox, "CodexChefBrain");
  applyBrainPlan(buildBrainPlan({ templateRoot, target }));
  const file = path.join(target, "80-memory", "current-context.md");
  fs.writeFileSync(file, "original context\n", "utf8");

  const backup = applyBackupPlan(buildBackupPlan({ target, backupId: "backup-test" }));
  fs.writeFileSync(file, "changed context\n", "utf8");
  const restorePlan = buildRestorePlan({ target, backupId: backup.backupId });
  assert.ok(restorePlan.operations.some((entry) => entry.relativePath === "80-memory/current-context.md"));
  applyRestorePlan(restorePlan);

  assert.equal(fs.readFileSync(file, "utf8"), "original context\n");
});

test("restore preflights every file before changing any vault content", async () => {
  const {
    applyBackupPlan,
    applyBrainPlan,
    applyRestorePlan,
    buildBackupPlan,
    buildBrainPlan,
    buildRestorePlan
  } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-restore-race-"));
  const target = path.join(sandbox, "CodexChefBrain");
  applyBrainPlan(buildBrainPlan({ templateRoot, target }));
  const first = path.join(target, "80-memory", "current-context.md");
  const second = path.join(target, "80-memory", "decisions.md");
  applyBackupPlan(buildBackupPlan({ target, backupId: "preflight-test" }));
  fs.writeFileSync(first, "first changed\n", "utf8");
  fs.writeFileSync(second, "second changed\n", "utf8");
  const restorePlan = buildRestorePlan({ target, backupId: "preflight-test" });
  fs.writeFileSync(second, "second changed after preview\n", "utf8");

  assert.throws(() => applyRestorePlan(restorePlan), /changed after restore preview/i);
  assert.equal(fs.readFileSync(first, "utf8"), "first changed\n");
  assert.equal(fs.readFileSync(second, "utf8"), "second changed after preview\n");
});

test("restore detects a change immediately before a later publish and rolls back earlier writes", async () => {
  const { applyBackupPlan, applyBrainPlan, applyRestorePlan, buildBackupPlan, buildBrainPlan, buildRestorePlan } = await loadFoundation();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-brain-restore-late-race-"));
  const target = path.join(sandbox, "CodexChefBrain");
  applyBrainPlan(buildBrainPlan({ templateRoot, target }));
  const first = path.join(target, "80-memory", "current-context.md");
  const second = path.join(target, "80-memory", "decisions.md");
  fs.writeFileSync(first, "first original\n", "utf8");
  fs.writeFileSync(second, "second original\n", "utf8");
  applyBackupPlan(buildBackupPlan({ target, backupId: "late-race-test" }));
  fs.writeFileSync(first, "first changed\n", "utf8");
  fs.writeFileSync(second, "second changed\n", "utf8");
  const plan = buildRestorePlan({ target, backupId: "late-race-test" });

  assert.throws(() => applyRestorePlan(plan, {
    beforePublish(entry) {
      if (entry.relativePath === "80-memory/decisions.md") fs.writeFileSync(second, "second concurrent edit\n", "utf8");
    }
  }), /changed during restore/i);
  assert.equal(fs.readFileSync(first, "utf8"), "first changed\n");
  assert.equal(fs.readFileSync(second, "utf8"), "second concurrent edit\n");
});
