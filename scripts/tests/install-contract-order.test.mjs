import assert from "node:assert/strict";
import test from "node:test";

import { readInstallManifest, resolveInstallContract, selectInstallComponents } from "../lib/install-contract.mjs";

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
