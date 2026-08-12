import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function copyFile(relativePath, targetRoot) {
  const target = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, relativePath), target);
}

function tempSurface(t, files) {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-policy-"));
  t.after(() => fs.rmSync(targetRoot, { recursive: true, force: true }));
  for (const file of files) copyFile(file, targetRoot);
  return targetRoot;
}

function runValidator(targetRoot, relativeScript) {
  return spawnSync(process.execPath, [path.join(targetRoot, relativeScript)], {
    cwd: targetRoot,
    encoding: "utf8"
  });
}

function assertPolicyFailure(result, expectedMessage) {
  assert.notEqual(result.status, 0, `validator unexpectedly passed:\n${result.stdout}`);
  assert.match(`${result.stdout}\n${result.stderr}`, expectedMessage);
}

const routingFiles = [
  "catalog/routing-profiles.json",
  "catalog/agents.json",
  "catalog/mcp-servers.json",
  "catalog/skills.json",
  "templates/codex/AGENTS.md",
  "scripts/codex-routing-board.mjs",
  "scripts/validate-routing-profiles.mjs",
  "plugins/codex-chef-workflows/skills/adaptive-agent-routing/references/global-working-agreements.md"
];

function routingFixture(t, mutate) {
  const targetRoot = tempSurface(t, routingFiles);
  const catalogPath = path.join(targetRoot, "catalog", "routing-profiles.json");
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  mutate(catalog);
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return runValidator(targetRoot, "scripts/validate-routing-profiles.mjs");
}

test("routing validation rejects read-only profiles that request workspace writes", (t) => {
  const result = routingFixture(t, (catalog) => {
    const profile = catalog.profiles.find(({ id }) => id === "repo-map-before-change");
    profile.flags = ["sandbox:read-only", "workspace-write"];
  });
  assertPolicyFailure(result, /repo-map-before-change cannot combine read-only routing with workspace-write/);
});

test("routing validation rejects review profiles that request on-request approval mode", (t) => {
  const result = routingFixture(t, (catalog) => {
    const profile = catalog.profiles.find(({ id }) => id === "security-sensitive");
    profile.flags = ["profile:review", "sandbox:read-only", "approval:on-request"];
  });
  assertPolicyFailure(result, /security-sensitive cannot combine profile:review with approval:on-request/);
});

for (const [field, invalidValue] of [
  ["skills", ""],
  ["skills", null],
  ["mcp", ""],
  ["mcp", {}]
]) {
  test(`routing validation rejects non-array ${field}`, (t) => {
    const result = routingFixture(t, (catalog) => {
      catalog.profiles[0][field] = invalidValue;
    });
    assertPolicyFailure(result, new RegExp(`routing profile ${field} must be an array: repo-map-before-change`));
  });
}

for (const [field, label] of [
  ["agents", "agent"],
  ["skills", "skill"],
  ["mcp", "MCP server"],
  ["flags", "flag"]
]) {
  test(`routing validation rejects duplicate profile ${field}`, (t) => {
    const result = routingFixture(t, (catalog) => {
      const profile = catalog.profiles.find(({ id }) => id === "repo-map-before-change");
      profile[field].push(profile[field][0]);
    });
    assertPolicyFailure(result, new RegExp(`routing profile repo-map-before-change has duplicate ${label}:`));
  });
}

for (const [catalogName, collection, label] of [
  ["agents", "agents", "agent"],
  ["skills", "skills", "skill"]
]) {
  test(`routing validation rejects duplicate ${label} catalog names`, (t) => {
    const targetRoot = tempSurface(t, routingFiles);
    const catalogPath = path.join(targetRoot, "catalog", `${catalogName}.json`);
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    catalog[collection].push({ ...catalog[collection][0] });
    fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

    assertPolicyFailure(
      runValidator(targetRoot, "scripts/validate-routing-profiles.mjs"),
      new RegExp(`duplicate ${label} catalog name: ${catalog[collection][0].name}`)
    );
  });
}

const mcpFiles = [
  ".gitignore",
  "catalog/mcp-servers.json",
  "scripts/validate-mcp-config.mjs",
  "templates/codex/config.windows.toml",
  "templates/codex/config.unix.toml",
  "templates/codex/profiles/full.config.toml",
  "templates/codex/profiles/multi-session.config.toml",
  "templates/codex/profiles/offline.config.toml",
  "templates/codex/serena-pool.mjs"
];

function mcpFixture(t, key, value) {
  const targetRoot = tempSurface(t, mcpFiles);
  const configPath = path.join(targetRoot, "templates", "codex", "config.windows.toml");
  const source = fs.readFileSync(configPath, "utf8");
  const pattern = new RegExp(`^(\\s*${key}\\s*=\\s*).+$`, "m");
  assert.match(source, pattern, `missing fixture key ${key}`);
  fs.writeFileSync(configPath, source.replace(pattern, `$1${value}`));
  return runValidator(targetRoot, "scripts/validate-mcp-config.mjs");
}

for (const [key, unsafeValue, expected] of [
  ["enabled", "true", /apps\._default must set enabled = false/],
  ["destructive_enabled", "true", /apps\._default must set destructive_enabled = false/],
  ["open_world_enabled", "true", /apps\._default must set open_world_enabled = false/],
  ["default_tools_approval_mode", '"approve"', /apps\._default must set default_tools_approval_mode = "prompt"/]
]) {
  test(`MCP validation rejects unsafe apps._default ${key}`, (t) => {
    assertPolicyFailure(mcpFixture(t, key, unsafeValue), expected);
  });
}
