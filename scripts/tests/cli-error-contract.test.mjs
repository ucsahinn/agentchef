import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { sanitizeCliError } from "../lib/cli-error-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function run(script, args, { env = {} } = {}) {
  return spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      ...env
    }
  });
}

function assertNoStack(result) {
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.doesNotMatch(combined, /file:\/{3}|node:internal|\n\s+at\s/);
  assert.equal(combined.includes(root), false, "error output must not expose the absolute repository path");
}

function assertJsonUsageError(script, args, expectedTool) {
  const result = run(script, args);
  assert.equal(result.status, 2, `${script} should return the CLI usage exit code`);
  assert.equal(result.stderr, "", `${script} JSON errors must not mix plain stderr output`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, "codex-chef.cli-error.v1");
  assert.equal(report.status, "error");
  assert.equal(report.tool, expectedTool);
  assert.equal(report.error?.code, "invalid-argument");
  assert.equal(typeof report.error?.message, "string");
  assertNoStack(result);
  return report;
}

test("public JSON CLIs emit one stable envelope for malformed arguments", () => {
  assertJsonUsageError("scripts/chef-cli.mjs", ["--json", "--definitely-invalid", "--no-log"], "chef");
  assertJsonUsageError("scripts/codex-status.mjs", ["--repo-only", "--output", "--json"], "codex-status");
  assertJsonUsageError("scripts/verify-install-runtime.mjs", ["--json", "--probe-timeout-ms=30000"], "verify-install-runtime");
  assertJsonUsageError("scripts/repair-install.mjs", ["--apply", "--agents-home", "--json"], "repair-install");
  assertJsonUsageError("scripts/codex-routing-board.mjs", ["--json", "--profile", "missing-profile"], "codex-routing-board");
  assertJsonUsageError("scripts/plan-install.mjs", ["--json", "--platform", "--summary"], "plan-install");
  assertJsonUsageError("scripts/codex-doctor.mjs", ["--json", "--incldue-global"], "codex-doctor");
  assertJsonUsageError("scripts/chef-cli.mjs", ["review", "verify", "--json", "--definitely-invalid"], "external-review");
  assertJsonUsageError("scripts/chef-cli.mjs", ["--json", "--routing", "--profile", "-h"], "chef");
  assertJsonUsageError("scripts/chef-cli.mjs", ["--json", "--backups", "--backup", "-h"], "chef");
  assertJsonUsageError("scripts/chef-cli.mjs", ["review", "pack", "--json", "--target", "-h"], "external-review");
});

test("malformed write-capable options fail before creating an accidental target", () => {
  const accidental = path.join(root, "--json");
  assert.equal(fs.existsSync(accidental), false, "fixture path must not pre-exist");

  assertJsonUsageError("scripts/codex-status.mjs", ["--repo-only", "--output", "--json"], "codex-status");
  assertJsonUsageError("scripts/repair-install.mjs", ["--apply", "--agents-home", "--json"], "repair-install");
  assertJsonUsageError("scripts/codex-status.mjs", ["--json", "--repo-only", "--output", "-h"], "codex-status");
  assertJsonUsageError("scripts/repair-install.mjs", ["--json", "--apply", "--agents-home", "-h"], "repair-install");

  assert.equal(fs.existsSync(accidental), false, "malformed value flags must not create a --json target");
});

test("repair preview rejects every write-capable companion flag", () => {
  const incompatibleArgs = [
    ["--preview", "--apply"],
    ["--preview", "--no-backup"],
    ["--preview", "--prune-managed-plugin-extras"],
    ["--preview", "--migrate-legacy-profile-pins"],
    ["--preview", "--adopt-fetch-skill"],
    ["--preview", "--adopt-direct-skill", "seo"]
  ];

  for (const flags of incompatibleArgs) {
    const report = assertJsonUsageError(
      "scripts/repair-install.mjs",
      ["--json", ...flags],
      "repair-install"
    );
    assert.match(report.error.message, /--preview cannot be combined with write-capable options/);
  }
});

test("shared error sanitizer redacts paths, secret shapes, and terminal controls", () => {
  const mixedCaseRoot = process.platform === "win32"
    ? root.replace(/[A-Za-z]/, (letter) => letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase())
    : root;
  const message = sanitizeCliError(new Error(
    `${mixedCaseRoot} ${"to"}ken=super-secret-value ${"sk"}-proj-abcdefghijklmnopqrstuvwxyz123456 `
    + `${"github_"}pat_abcdefghijklmnopqrstuvwxyz123456 `
    + `${"postgres:"}//sentinel-user:sentinel-password@example.invalid/database `
    + `${"eyJabcdefghijk"}.abcdefghijklmnop.abcdefghijklmnop `
    + "--password=sentinel first second "
    + `-----BEGIN ${"ENCRYPTED PRIVATE"} KEY----- sentinel-key-material `
    + "\u001b[31mred\u001b[0m \u202Espoof"
  ), { root });
  assert.match(message, /\$\{REPO\}/);
  assert.doesNotMatch(
    message,
    /super-secret-value|sk-proj-|github_pat_|sentinel-user|sentinel-password|eyJabcdefghijk|sentinel-key-material|sentinel first second|\\u001b|\u001b|\u202E/
  );
  assert.match(message, /token=\[REDACTED\]|\[REDACTED_OPENAI_KEY\]/);

  const isolatedSecretShapes = [
    [`${"github_"}pat_abcdefghijklmnopqrstuvwxyz123456`, "[REDACTED_GITHUB_TOKEN]"],
    [`${"postgres:"}//sentinel-user:sentinel-password@example.invalid/database`, "[REDACTED_CONNECTION_STRING]"],
    [`${"eyJabcdefghijk"}.abcdefghijklmnop.abcdefghijklmnop`, "[REDACTED_JWT]"],
    [`-----BEGIN ${"ENCRYPTED PRIVATE"} KEY----- sentinel-key-material`, "[REDACTED_PRIVATE_KEY]"],
    [`-----BEGIN ${"PGP PRIVATE KEY BLOCK"}----- sentinel-pgp-material`, "[REDACTED_PRIVATE_KEY]"]
  ];
  for (const [secret, marker] of isolatedSecretShapes) {
    const sanitized = sanitizeCliError(new Error(secret), { root });
    assert.equal(sanitized.includes(secret), false);
    assert.equal(sanitized.includes(marker), true);
  }

  const inlineCredential = run("scripts/codex-doctor.mjs", ["--json", "--credential=sentinel-do-not-log"]);
  assert.equal(inlineCredential.status, 2);
  assert.equal(`${inlineCredential.stdout}${inlineCredential.stderr}`.includes("sentinel-do-not-log"), false);
  assert.match(JSON.parse(inlineCredential.stdout).error.message, /--credential=\[REDACTED\]/);

  const spacedCredential = run("scripts/codex-doctor.mjs", [
    "--json",
    "password = sentinel multi word value"
  ]);
  assert.equal(spacedCredential.status, 2);
  assert.equal(`${spacedCredential.stdout}${spacedCredential.stderr}`.includes("sentinel multi word value"), false);
  assert.match(JSON.parse(spacedCredential.stdout).error.message, /password=\[REDACTED\]/);

  const quotedCredential = run("scripts/codex-doctor.mjs", [
    "--json",
    "\"password\": \"sentinel quoted multi word value\""
  ]);
  assert.equal(quotedCredential.status, 2);
  assert.equal(`${quotedCredential.stdout}${quotedCredential.stderr}`.includes("sentinel quoted multi word value"), false);
  assert.match(JSON.parse(quotedCredential.stdout).error.message, /"password"=\[REDACTED\]/);

  for (const keyName of [
    ["AWS", "SECRET", "ACCESS", "KEY"].join("_"),
    ["AWS", "SESSION", "TOKEN"].join("_")
  ]) {
    const cloudCredential = run("scripts/codex-doctor.mjs", [
      "--json",
      `${keyName}=sentinel-cloud-credential-value`
    ]);
    assert.equal(cloudCredential.status, 2);
    assert.equal(`${cloudCredential.stdout}${cloudCredential.stderr}`.includes("sentinel-cloud-credential-value"), false);
    assert.match(JSON.parse(cloudCredential.stdout).error.message, /\[REDACTED\]/);
  }
});

test("shared error sanitizer redacts explicit local roots outside HOME", () => {
  const agentsRoot = path.join(path.parse(root).root, "sentinel-agents-home");
  const leakedPath = path.join(agentsRoot, "skills", "evidence-research", "linked-child");
  const message = sanitizeCliError(
    new Error(`managed direct skill tree must not contain links: ${leakedPath}`),
    {
      root,
      pathRedactions: [{ target: agentsRoot, replacement: "${AGENTS_HOME}" }]
    }
  );

  assert.equal(message.includes(agentsRoot), false);
  assert.equal(
    message,
    `managed direct skill tree must not contain links: ${path.join("${AGENTS_HOME}", "skills", "evidence-research", "linked-child")}`
  );
});

test("plain errors wrap long unbroken arguments to the terminal width", () => {
  const result = run("scripts/codex-doctor.mjs", [`--${"x".repeat(160)}`], {
    env: { COLUMNS: "40" }
  });
  assert.equal(result.status, 2);
  assertNoStack(result);
  const lines = result.stderr.trimEnd().split(/\r?\n/);
  assert.equal(lines.every((line) => line.length <= 40), true, result.stderr);
});

test("plain internal helpers reject malformed arguments without a Node stack", () => {
  for (const [script, args] of [
    ["scripts/install-pinned-skill.mjs", ["--definitely-invalid"]],
    ["scripts/write-backup-manifest.mjs", ["--definitely-invalid"]]
  ]) {
    const result = run(script, args);
    assert.equal(result.status, 2);
    assert.notEqual(result.stderr.trim(), "");
    assertNoStack(result);
  }
});

test("release note extraction consumes options instead of falling back silently", () => {
  for (const args of [
    ["--check", "--tga", "v0.0.0"],
    ["--check", "--tag"],
    ["--check", "--tag", "v0.5.58", "--tag", "v0.0.0"]
  ]) {
    const result = run("scripts/extract-release-notes.mjs", args);
    assert.equal(result.status, 2);
    assertNoStack(result);
  }

  const equalsResult = run("scripts/extract-release-notes.mjs", ["--check", "--tag=v0.0.0"]);
  assert.equal(equalsResult.status, 1);
  assert.match(equalsResult.stderr, /does not contain a section for v0\.0\.0/);
  assert.doesNotMatch(equalsResult.stdout, /v0\.5\.58/);
  assertNoStack(equalsResult);
});

test("release note output refuses a linked in-repository ancestor", () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-release-notes-outside-"));
  const link = path.join(root, "tmp", `cli-error-contract-link-${process.pid}-${Date.now()}`);
  fs.mkdirSync(path.dirname(link), { recursive: true });
  try {
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    const relativeOut = path.relative(root, path.join(link, "notes.md"));
    const result = run("scripts/extract-release-notes.mjs", [
      "--tag",
      "v0.5.58",
      "--out",
      relativeOut
    ]);
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(path.join(outside, "notes.md")), false);
    assertNoStack(result);
  } finally {
    if (fs.existsSync(link) || fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) {
      fs.unlinkSync(link);
    }
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("release note output cannot overwrite source or protected repository files", () => {
  const releaseNotesPath = path.join(root, "docs", "release-notes.md");
  const packagePath = path.join(root, "package.json");
  const releaseNotesBefore = fs.readFileSync(releaseNotesPath, "utf8");
  const packageBefore = fs.readFileSync(packagePath, "utf8");

  const selfOverwrite = run("scripts/extract-release-notes.mjs", [
    "--file",
    "docs/release-notes.md",
    "--out",
    "docs/release-notes.md"
  ]);
  assert.notEqual(selfOverwrite.status, 0);
  assert.match(selfOverwrite.stderr, /must not overwrite/);

  const protectedOverwrite = run("scripts/extract-release-notes.mjs", [
    "--out",
    "package.json"
  ]);
  assert.notEqual(protectedOverwrite.status, 0);
  assert.match(protectedOverwrite.stderr, /unmanaged target|outside configured homes/i);

  assert.equal(fs.readFileSync(releaseNotesPath, "utf8"), releaseNotesBefore);
  assert.equal(fs.readFileSync(packagePath, "utf8"), packageBefore);
  assertNoStack(selfOverwrite);
  assertNoStack(protectedOverwrite);
});
