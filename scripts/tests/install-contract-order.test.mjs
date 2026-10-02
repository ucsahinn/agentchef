import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readInstallManifest, resolveInstallContract, selectInstallComponents } from "../lib/install-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function componentIds(contract) {
  return contract.selectedComponents.map((component) => component.id);
}

test("install plan reports the same terminal side-effect order as the installers", () => {
  const manifest = readInstallManifest();
  const baseOptions = {
    manifest,
    platform: "windows",
    codexHome: "C:\\Codex",
    agentsHome: "C:\\Agents",
    home: "C:\\Home"
  };

  const contract = resolveInstallContract({
    ...baseOptions,
    installGitGuards: true,
    installSkills: true
  });
  const ids = componentIds(contract);
  const terminalIds = [
    "git-ignore-global",
    "git-pre-commit-hook",
    "git-config-excludesfile",
    "git-config-hooks-path",
    "curated-skills",
    "installed-plugin-cache-refresh"
  ];

  assert.deepEqual(ids.slice(-terminalIds.length), terminalIds);
  for (const id of terminalIds) assert.ok(ids.includes(id), `expected ${id} in resolved plan`);
});

test("canonical ordering does not hide an invalid profile component", () => {
  const manifest = readInstallManifest();
  manifest.profiles.default = [...manifest.profiles.default, "not-a-real-operation"];

  assert.throws(
    () => selectInstallComponents(manifest, { platform: "windows" }),
    /references unknown operation: not-a-real-operation/
  );
});

test("both installers run the Claude helper as the last mutating step", () => {
  // A failure after the Claude helper finished would roll the Codex side back
  // while Claude stayed installed, so nothing that can fail may follow it.
  for (const [file, claudeCall, refreshCall] of [
    ["scripts/install.ps1", String.raw`$ClaudeHelper = Join-Path $RepoRoot "scripts\install-claude-target.mjs"`, String.raw`$PluginRefreshHelper = Join-Path $RepoRoot "scripts\refresh-installed-plugin.mjs"`],
    ["scripts/install.sh", '"$REPO_ROOT/scripts/install-claude-target.mjs"', 'PLUGIN_REFRESH_HELPER="$REPO_ROOT/scripts/refresh-installed-plugin.mjs"']
  ]) {
    const text = fs.readFileSync(path.join(repoRoot, file), "utf8");
    const claudeAt = text.indexOf(claudeCall);
    const refreshAt = text.indexOf(refreshCall);
    assert.ok(claudeAt > 0 && refreshAt > 0, `${file}: both steps are present`);
    assert.ok(refreshAt < claudeAt, `${file}: the Codex plugin refresh runs before the Claude helper`);
  }
  const bash = fs.readFileSync(path.join(repoRoot, "scripts/install.sh"), "utf8");
  assert.match(bash, /<<'NODE' \|\| echo "Capability board could not be rendered/, "the read-only board cannot trip the rollback trap");
});
