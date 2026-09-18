#!/usr/bin/env node
// Renders every generated, committed target artifact from its single source:
//   templates/shared/working-agreement.md -> templates/codex/AGENTS.md
//                                          -> templates/claude/rules/agentchef-working-agreement.md
//   catalog/agents.json + templates/codex/agents/*.toml -> plugins/agentchef-workflows/agents/*.md
//   templates/codex/rules/default.rules -> templates/claude/settings.fragment.json
//   .codex-plugin/plugin.json + agents/*.md -> .claude-plugin/plugin.json
// The Claude manifest declares no hooks: the SessionEnd process-hygiene hook
// stays Codex-only until the Claude owner-detection branch ships.
// `--check` (used by npm run check) fails when a committed artifact drifts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderWorkingAgreement, workingAgreementTargets } from "./lib/emitters/working-agreement.mjs";
import { emitClaudeAgents } from "./lib/emitters/claude-agents.mjs";
import { emitClaudePermissions } from "./lib/emitters/claude-permissions.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const pluginDirectory = "plugins/agentchef-workflows";
const agentsOutputDirectory = `${pluginDirectory}/agents`;
const codexPluginManifestPath = `${pluginDirectory}/.codex-plugin/plugin.json`;
const claudePluginManifestPath = `${pluginDirectory}/.claude-plugin/plugin.json`;
const settingsFragmentPath = "templates/claude/settings.fragment.json";
const projectUrl = "https://github.com/ucsahinn/agentchef";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function readJson(repoRoot, relative) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8"));
}

// Claude Code's plugin manifest lists agent files explicitly (a directory
// value is rejected by `claude plugin validate`), so the list is generated
// from the same emitter output that produces the files.
export function renderClaudePluginManifest(repoRoot, agentFileNames) {
  const codexManifest = readJson(repoRoot, codexPluginManifestPath);
  const packageJson = readJson(repoRoot, "package.json");
  return {
    name: codexManifest.name,
    version: codexManifest.version,
    description: codexManifest.description,
    author: { name: "AgentChef", url: projectUrl },
    homepage: projectUrl,
    repository: projectUrl,
    license: packageJson.license,
    keywords: ["agentchef", "claude-code", "codex", "workflows", "security-first"],
    skills: "./skills/",
    agents: [...agentFileNames].sort().map((fileName) => `./agents/${fileName}`)
  };
}

export function renderAllTargetArtifacts(repoRoot = root) {
  const outputs = new Map();
  const source = fs.readFileSync(path.join(repoRoot, "templates", "shared", "working-agreement.md"), "utf8");
  for (const target of Object.values(workingAgreementTargets)) {
    outputs.set(target.output, `${renderWorkingAgreement(source, target.id).trimEnd()}\n`);
  }
  const catalog = readJson(repoRoot, "catalog/agents.json");
  const agentFileNames = [];
  for (const [fileName, text] of emitClaudeAgents({ catalog, roleDirectory: path.join(repoRoot, "templates", "codex", "agents") })) {
    outputs.set(`${agentsOutputDirectory}/${fileName}`, text);
    agentFileNames.push(fileName);
  }
  outputs.set(claudePluginManifestPath, `${JSON.stringify(renderClaudePluginManifest(repoRoot, agentFileNames), null, 2)}\n`);
  const rules = fs.readFileSync(path.join(repoRoot, "templates", "codex", "rules", "default.rules"), "utf8");
  const permissions = emitClaudePermissions(rules);
  outputs.set(settingsFragmentPath, `${JSON.stringify({
    $comment: "Generated from templates/codex/rules/default.rules by scripts/render-target-artifacts.mjs; do not edit by hand.",
    permissions: permissions.permissions
  }, null, 2)}\n`);
  return outputs;
}

function main(argv) {
  const write = argv.includes("--write");
  const check = argv.includes("--check") || !write;
  const outputs = renderAllTargetArtifacts();
  const drifted = [];
  for (const [relative, text] of outputs) {
    const absolute = path.join(root, relative);
    const current = fs.existsSync(absolute) ? normalize(fs.readFileSync(absolute, "utf8")) : null;
    if (current === normalize(text)) continue;
    drifted.push(relative);
    if (write) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, text, "utf8");
    }
  }
  if (check && !write && drifted.length > 0) {
    console.error("Generated target artifacts are out of date; run `npm run render:targets`:");
    for (const relative of drifted) console.error(`- ${relative}`);
    process.exit(1);
  }
  console.log(write
    ? `Rendered ${outputs.size} target artifacts (${drifted.length} updated).`
    : `Target artifacts are current. Checked ${outputs.size} files.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2));
}
