import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { defaultTargets, operationAppliesToTargets, parseTargetSelection, targetIds } from "../lib/targets/index.mjs";
import { resolveClaudeHomes } from "../lib/targets/claude.mjs";
import { readInstallManifest, resolveInstallContract, selectInstallComponents } from "../lib/install-contract.mjs";

const manifest = readInstallManifest();
const baseOptions = {
  manifest,
  platform: "windows",
  codexHome: "C:\\Codex",
  agentsHome: "C:\\Agents",
  claudeHome: "C:\\Claude",
  home: "C:\\Home"
};

test("target selection defaults to codex and expands both/all to every target", () => {
  assert.deepEqual([...parseTargetSelection(undefined)], [...defaultTargets]);
  assert.deepEqual([...parseTargetSelection("")], ["codex"]);
  assert.deepEqual([...parseTargetSelection("claude")], ["claude"]);
  assert.deepEqual([...parseTargetSelection("both")].sort(), [...targetIds].sort());
  assert.deepEqual([...parseTargetSelection("codex,claude")].sort(), ["claude", "codex"]);
  assert.throws(() => parseTargetSelection("cursor"), /Unknown install target: cursor/);
});

test("shared operations apply to every selection while claude operations need an explicit claude target", () => {
  const codexOnly = new Set(["codex"]);
  const claudeOnly = new Set(["claude"]);
  assert.equal(operationAppliesToTargets({ target: "shared" }, codexOnly), true);
  assert.equal(operationAppliesToTargets({ target: "shared" }, claudeOnly), true);
  assert.equal(operationAppliesToTargets({ target: "claude" }, codexOnly), false);
  assert.equal(operationAppliesToTargets({ target: "claude" }, claudeOnly), true);
  assert.equal(operationAppliesToTargets({ target: "codex" }, claudeOnly), false);
  assert.equal(operationAppliesToTargets({}, codexOnly), true, "operations without a target stay codex");
});

test("every manifest operation declares a target and the default selection is codex plus shared", () => {
  for (const operation of manifest.operations) {
    assert.ok(["codex", "claude", "shared"].includes(operation.target), `${operation.id} target`);
  }
  const selection = selectInstallComponents(manifest, { platform: "windows" });
  assert.deepEqual(selection.targets, ["codex"]);
  assert.ok(selection.selected.every((operation) => operation.target !== "claude"));
  assert.ok(selection.skipped.some((operation) => operation.target === "claude"));
});

test("claude-only contract keeps shared operations once and resolves the Claude home tokens", () => {
  const contract = resolveInstallContract({ ...baseOptions, targets: "claude" });
  assert.deepEqual(contract.targets, ["claude"]);
  assert.ok(contract.selectedComponents.every((operation) => operation.target !== "codex"));
  const ids = contract.selectedComponents.map((operation) => operation.id);
  assert.equal(ids.filter((id) => id === "codex-plugin-marketplace-source").length, 1);
  const agreement = contract.operations.find((action) => action.id === "claude-working-agreement");
  assert.equal(agreement.destination, path.win32.join("C:\\Claude", "rules", "agentchef-working-agreement.md"));
  assert.equal(agreement.selectedBy, "--target claude");
  const mcp = contract.operations.find((action) => action.id === "claude-mcp-merge");
  assert.equal(mcp.destination, path.win32.join("C:\\Claude", ".claude.json"));
  const links = contract.operations.find((action) => action.id === "claude-skill-links");
  assert.equal(links.source, path.win32.join("C:\\Agents", "skills"));
  assert.equal(links.destination, path.win32.join("C:\\Claude", "skills"));
  const register = contract.operations.find((action) => action.id === "claude-plugin-register");
  assert.match(register.command, /^claude\.cmd plugin marketplace add .*\\plugins && claude\.cmd plugin install agentchef-workflows@agentchef --scope user$/);
  assert.ok(!contract.preflightTargets.includes(links.destination), "link roots are not preflight write targets");
});

test("both-target contract is the union of both selections in manifest order", () => {
  const codex = resolveInstallContract({ ...baseOptions, targets: "codex" });
  const claude = resolveInstallContract({ ...baseOptions, targets: "claude" });
  const both = resolveInstallContract({ ...baseOptions, targets: "both" });
  const union = new Set([...codex.selectedComponents, ...claude.selectedComponents].map((operation) => operation.id));
  const bothIds = both.selectedComponents.map((operation) => operation.id);
  assert.equal(bothIds.length, union.size);
  const manifestOrder = manifest.operations.map((operation) => operation.id);
  assert.deepEqual(bothIds, manifestOrder.filter((id) => union.has(id)));
  assert.ok(bothIds.indexOf("claude-plugin-register") < bothIds.indexOf("installed-plugin-cache-refresh"));
});

test("unix contract keeps the Claude JSON in the home directory unless the Claude home is relocated", () => {
  const base = {
    manifest,
    platform: "unix",
    codexHome: "/opt/agentchef-home/.codex",
    agentsHome: "/opt/agentchef-home/.agents",
    home: "/opt/agentchef-home",
    targets: "claude"
  };
  const contract = resolveInstallContract({ ...base, claudeHome: "/opt/agentchef-home/.claude" });
  const mcp = contract.operations.find((action) => action.id === "claude-mcp-merge");
  assert.equal(mcp.destination, "/opt/agentchef-home/.claude.json", "default Claude home: Claude Code reads ~/.claude.json");
  const register = contract.operations.find((action) => action.id === "claude-plugin-register");
  assert.match(register.command, /^claude plugin marketplace add \/opt\/agentchef-home\/\.agents\/plugins && claude plugin install/);
  const relocated = resolveInstallContract({ ...base, claudeHome: "/opt/claude-config" });
  assert.equal(relocated.operations.find((action) => action.id === "claude-mcp-merge").destination, "/opt/claude-config/.claude.json", "a relocated config directory holds .claude.json itself");
  const explicit = resolveInstallContract({ ...base, claudeHome: "/opt/claude-config", claudeJson: "/elsewhere/.claude.json" });
  assert.equal(explicit.operations.find((action) => action.id === "claude-mcp-merge").destination, "/elsewhere/.claude.json");
});

test("resolveClaudeHomes follows CLAUDE_CONFIG_DIR and explicit overrides", () => {
  const fromEnv = resolveClaudeHomes({ env: { CLAUDE_CONFIG_DIR: path.join("C:\\", "cfg") }, home: "C:\\Home" });
  assert.equal(fromEnv.claudeHome, path.resolve(path.join("C:\\", "cfg")));
  assert.equal(fromEnv.claudeJson, path.resolve(path.join("C:\\", "cfg", ".claude.json")));
  assert.equal(fromEnv.relocated, true);
  const fallback = resolveClaudeHomes({ env: {}, home: "C:\\Home" });
  assert.equal(fallback.claudeHome, path.resolve(path.join("C:\\Home", ".claude")));
  assert.equal(fallback.claudeJson, path.resolve(path.join("C:\\Home", ".claude.json")), "without CLAUDE_CONFIG_DIR Claude Code keeps .claude.json in the home directory");
  assert.equal(fallback.relocated, false);
  const sameAsDefault = resolveClaudeHomes({ env: {}, home: "C:\\Home", claudeHome: path.join("C:\\Home", ".claude") });
  assert.equal(sameAsDefault.claudeJson, path.resolve(path.join("C:\\Home", ".claude.json")), "an explicit default Claude home is not a relocation");
  const envSameAsDefault = resolveClaudeHomes({ env: { CLAUDE_CONFIG_DIR: path.join("C:\\Home", ".claude") }, home: "C:\\Home" });
  assert.equal(envSameAsDefault.claudeJson, path.resolve(path.join("C:\\Home", ".claude", ".claude.json")), "a set CLAUDE_CONFIG_DIR relocates even when it names the default folder");
  const moved = resolveClaudeHomes({ env: {}, home: "C:\\Home", claudeHome: "D:\\claude" });
  assert.equal(moved.claudeJson, path.resolve(path.join("D:\\claude", ".claude.json")), "a relocated Claude home holds .claude.json itself");
  assert.equal(moved.relocated, true);
  const explicit = resolveClaudeHomes({ env: { CLAUDE_CONFIG_DIR: "C:\\ignored" }, home: "C:\\Home", claudeHome: "D:\\claude", claudeJson: "D:\\elsewhere\\.claude.json" });
  assert.equal(explicit.claudeHome, path.resolve("D:\\claude"));
  assert.equal(explicit.claudeJson, path.resolve("D:\\elsewhere\\.claude.json"));
});
