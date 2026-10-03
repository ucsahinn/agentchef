import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { collectCorrelationFailures } from "../validate-catalog-correlation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const files = [
  "catalog/skills.json",
  "catalog/routing-profiles.json",
  "catalog/agents.json",
  "catalog/mcp-servers.json",
  "plugins/agentchef/.codex-plugin/plugin.json",
  "plugins/agentchef/.claude-plugin/plugin.json",
  "plugins/agentchef/skills/gptpro/SKILL.md"
];

function fixture(t) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-correlation-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(target, file));
  }
  return target;
}

function mutateJson(target, file, mutate) {
  const full = path.join(target, file);
  const value = JSON.parse(fs.readFileSync(full, "utf8"));
  mutate(value);
  fs.writeFileSync(full, JSON.stringify(value, null, 2));
}

test("the shipped catalogs correlate", () => {
  assert.deepEqual(collectCorrelationFailures(root), []);
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "validate-catalog-correlation.mjs")], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("a routing skill that is not a harness skill fails", (t) => {
  const target = fixture(t);
  mutateJson(target, "catalog/routing-profiles.json", (routing) => { routing.profiles[0].skills.push("db-migration-review"); });
  assert.match(collectCorrelationFailures(target).join("\n"), /names db-migration-review, which is not a harness skill/);
});

test("an uncataloged routing MCP server fails", (t) => {
  const target = fixture(t);
  mutateJson(target, "catalog/routing-profiles.json", (routing) => { routing.profiles[0].mcp.push("not-a-server"); });
  assert.match(collectCorrelationFailures(target).join("\n"), /MCP server not-a-server/);
});

test("an alias whose target is not a harness skill fails", (t) => {
  const target = fixture(t);
  mutateJson(target, "catalog/skills.json", (catalog) => { catalog.compatibilityAliases["old-name"] = "vercel-optimize"; });
  assert.match(collectCorrelationFailures(target).join("\n"), /alias old-name targets vercel-optimize/);
});

test("a retired replacement that resolves nowhere fails", (t) => {
  const target = fixture(t);
  mutateJson(target, "catalog/skills.json", (catalog) => {
    catalog.skills.find((skill) => skill.retired === true).replacedBy = ["ghost_role"];
  });
  assert.match(collectCorrelationFailures(target).join("\n"), /replaced by ghost_role/);
});

test("an over-long reason or bundled description fails", (t) => {
  const target = fixture(t);
  mutateJson(target, "catalog/skills.json", (catalog) => { catalog.skills[0].reason = "x".repeat(401); });
  const skillFile = path.join(target, "plugins/agentchef/skills/gptpro/SKILL.md");
  fs.writeFileSync(skillFile, fs.readFileSync(skillFile, "utf8").replace(/^description: .*$/m, `description: ${"y".repeat(401)}`));
  const failures = collectCorrelationFailures(target).join("\n");
  assert.match(failures, /reason is 401 characters/);
  assert.match(failures, /bundled skill gptpro description is 401 characters/);
});

test("a coordinator worker that is not a specialist fails", (t) => {
  const target = fixture(t);
  mutateJson(target, "catalog/agents.json", (agents) => { agents.coordinators[0].workers.push("ghost_worker"); });
  assert.match(collectCorrelationFailures(target).join("\n"), /worker ghost_worker/);
});

test("plugin manifests that disagree fail", (t) => {
  const target = fixture(t);
  mutateJson(target, "plugins/agentchef/.claude-plugin/plugin.json", (manifest) => { manifest.version = "0.0.0"; });
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "validate-catalog-correlation.mjs"), "--root", target], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /plugin manifests disagree on version/);
});
