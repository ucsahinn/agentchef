import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const merger = path.join(root, "scripts", "merge-codex-config.mjs");

function merge(templateText, destinationText, extra = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-toml-"));
  const template = path.join(dir, "template.toml");
  const destination = path.join(dir, "config.toml");
  fs.writeFileSync(template, templateText);
  fs.writeFileSync(destination, destinationText);
  const run = spawnSync(process.execPath, [merger, template, destination, "--json", ...extra], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return { report: JSON.parse(run.stdout), text: fs.readFileSync(destination, "utf8") };
}

const template = [
  "[features]",
  "hooks = true",
  "",
  "[mcp_servers.context7]",
  'command = "npx"',
  "enabled = false",
  ""
].join("\n");

test("a table header with a trailing comment is still a table", () => {
  const destination = [
    "[features] # mine",
    "hooks = true",
    "",
    "[mcp_servers.context7]",
    'command = "npx"',
    "enabled = false",
    ""
  ].join("\n");
  const { report, text } = merge(template, destination);
  assert.deepEqual(report.addedTables, [], "features is present, so it must not be appended again");
  assert.equal((text.match(/^\s*\[features\]/gm) || []).length, 1, "no duplicate [features] table");
});

test("a user table after a managed table is not folded into it during a sync", () => {
  const destination = [
    "[features]",
    "hooks = true",
    "",
    "[mcp_servers.context7]",
    'command = "npx-old"',
    "enabled = false",
    "",
    "[mcp_servers.mine] # personal",
    'command = "mine"',
    ""
  ].join("\n");
  const { text } = merge(template, destination, ["--sync-managed-tables"]);
  assert.match(text, /\[mcp_servers\.mine\] # personal\ncommand = "mine"/, "the user's server survives the sync");
  assert.match(text, /\[mcp_servers\.context7\]\ncommand = "npx"\n/, "the managed table is synced");
});

test("an array of tables after a managed table is never folded into it", () => {
  const destination = [
    "[features]",
    "hooks = false",
    "",
    "[[skills.config]]",
    'path = "a"',
    ""
  ].join("\n");
  const { text } = merge(template, destination, ["--sync-managed-tables"]);
  assert.match(text, /\[\[skills\.config\]\]\npath = "a"/, "the array table survives");
  assert.match(text, /\[features\]\nhooks = true/, "the managed table is synced");
});

function mergeWithRetired(destinationText, retired, extra = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-retired-"));
  const templateFile = path.join(dir, "template.toml");
  const destination = path.join(dir, "config.toml");
  fs.writeFileSync(templateFile, template);
  fs.writeFileSync(destination, destinationText);
  fs.writeFileSync(path.join(dir, "retired-tables.json"), JSON.stringify({ tables: retired }));
  const run = spawnSync(process.execPath, [merger, templateFile, destination, "--json", ...extra], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return { report: JSON.parse(run.stdout), text: fs.readFileSync(destination, "utf8") };
}

const retiredBlock = '[mcp_servers.memory]\ncommand = "npx"\nenabled = false';
const retiredDigest = crypto.createHash("sha256").update(retiredBlock).digest("hex");
const withRetired = `${template}\n${retiredBlock}\n`;

test("a table AgentChef no longer ships is removed on sync when it is exactly what AgentChef wrote", () => {
  const { report, text } = mergeWithRetired(withRetired, { "mcp_servers.memory": [retiredDigest] }, ["--sync-managed-tables"]);
  assert.deepEqual(report.retiredRemovedTables, ["mcp_servers.memory"]);
  assert.doesNotMatch(text, /mcp_servers\.memory/);
  assert.match(text, /\[mcp_servers\.context7\]/, "other tables stay");
});

test("without a sync the retired table stays and is reported as pending", () => {
  const { report, text } = mergeWithRetired(withRetired, { "mcp_servers.memory": [retiredDigest] });
  assert.deepEqual(report.retiredPendingTables, ["mcp_servers.memory"]);
  assert.match(text, /mcp_servers\.memory/);
});

test("a retired table the user edited is kept and reported", () => {
  const edited = `${template}\n[mcp_servers.memory]\ncommand = "npx"\nenabled = true\n`;
  const { report, text } = mergeWithRetired(edited, { "mcp_servers.memory": [retiredDigest] }, ["--sync-managed-tables"]);
  assert.deepEqual(report.retiredUserModifiedTables, ["mcp_servers.memory"]);
  assert.match(text, /\[mcp_servers\.memory\]\ncommand = "npx"\nenabled = true/);
});

test("a second sync after a retirement changes nothing", () => {
  const first = mergeWithRetired(withRetired, { "mcp_servers.memory": [retiredDigest] }, ["--sync-managed-tables"]);
  const second = mergeWithRetired(first.text, { "mcp_servers.memory": [retiredDigest] }, ["--sync-managed-tables"]);
  assert.equal(second.text, first.text);
  assert.deepEqual(second.report.retiredRemovedTables, []);
});

test("a comment banner before the next table is not drift in the table above it", () => {
  const tmpl = ["[agents.a]", "description = \"a\"", "", "# Section note for b.", "[agents.b]", "description = \"b\"", ""].join("\n");
  // What a merge leaves after appending a table: its banner directly under the
  // previous table.
  const installed = ["[agents.a]", "description = \"a\"", "", "# AgentChef merged config blocks. Existing user-defined tables were preserved.", "[agents.b]", "description = \"b\"", ""].join("\n");
  const { report, text } = merge(tmpl, installed, ["--sync-managed-tables"]);
  assert.deepEqual(report.updatedManagedTables || [], [], "no table changes");
  assert.deepEqual(report.driftedManagedTables || [], []);
  assert.match(text, /# AgentChef merged config blocks/, "the banner stays");
  const second = merge(tmpl, text, ["--sync-managed-tables"]);
  assert.equal(second.text, text, "a second sync is a no-op");
});

test("a retired table still matches its digest when the next table's comment follows it", () => {
  const block = "[mcp_servers.memory]\ncommand = \"npx\"\nenabled = false";
  const withComment = `${block}\n\n# Optional graph-backed code intelligence.`;
  const digest = crypto.createHash("sha256").update(withComment).digest("hex");
  const { report, text } = mergeWithRetired(`${template}\n${withComment}\n[mcp_servers.other]\ncommand = "x"\n`, { "mcp_servers.memory": [digest] }, ["--sync-managed-tables"]);
  assert.deepEqual(report.retiredRemovedTables, ["mcp_servers.memory"]);
  assert.doesNotMatch(text, /mcp_servers\.memory/);
  assert.match(text, /# Optional graph-backed code intelligence\./, "the comment that belongs to the next table stays");
});
