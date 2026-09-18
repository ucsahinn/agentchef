#!/usr/bin/env node
// Renders every generated, committed target artifact from its single source:
//   templates/shared/working-agreement.md -> templates/codex/AGENTS.md
//                                          -> templates/claude/rules/agentchef-working-agreement.md
//   catalog/agents.json + templates/codex/agents/*.toml -> plugins/codex-chef-workflows/agents/*.md
//   templates/codex/rules/default.rules -> templates/claude/settings.fragment.json
// `--check` (used by npm run check) fails when a committed artifact drifts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderWorkingAgreement, workingAgreementTargets } from "./lib/emitters/working-agreement.mjs";
import { emitClaudeAgents } from "./lib/emitters/claude-agents.mjs";
import { emitClaudePermissions } from "./lib/emitters/claude-permissions.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const agentsOutputDirectory = "plugins/codex-chef-workflows/agents";
const settingsFragmentPath = "templates/claude/settings.fragment.json";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

export function renderAllTargetArtifacts(repoRoot = root) {
  const outputs = new Map();
  const source = fs.readFileSync(path.join(repoRoot, "templates", "shared", "working-agreement.md"), "utf8");
  for (const target of Object.values(workingAgreementTargets)) {
    outputs.set(target.output, `${renderWorkingAgreement(source, target.id).trimEnd()}\n`);
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, "catalog", "agents.json"), "utf8"));
  for (const [fileName, text] of emitClaudeAgents({ catalog, roleDirectory: path.join(repoRoot, "templates", "codex", "agents") })) {
    outputs.set(`${agentsOutputDirectory}/${fileName}`, text);
  }
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
