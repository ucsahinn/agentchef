#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { BRAIN_REQUIRED_FILES } from "./lib/brain-foundation.mjs";

const root = path.resolve(process.cwd());
const failures = [];
const requiredFiles = [
  ...BRAIN_REQUIRED_FILES.map((relativePath) => `templates/brain/${relativePath}`),
  "schemas/brain-config.schema.json",
  "schemas/brain-candidate.schema.json",
  "schemas/brain-context-pack.schema.json",
  "schemas/brain-note.schema.json",
  "schemas/brain-operation-plan.schema.json",
  "schemas/brain-audit.schema.json",
  "manifests/brain-vault.json",
  "scripts/lib/brain-foundation.mjs",
  "scripts/lib/brain-permissions-windows.mjs",
  "scripts/brain-cli.mjs",
  "scripts/tests/brain-permissions-windows.test.mjs",
  "plugins/codex-chef-workflows/skills/codex-chef-brain/SKILL.md",
  "plugins/codex-chef-workflows/skills/codex-chef-brain/references/brain-protocol.md",
  "plugins/codex-chef-workflows/skills/codex-chef-brain/agents/openai.yaml",
  "docs/brain/README.md",
  "docs/brain/README.tr.md",
  "docs/decisions/002-brain-content-and-windows-acl-status.md"
];

const manifestPath = path.join(root, "manifests/brain-vault.json");
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (JSON.stringify(manifest.requiredFiles) !== JSON.stringify(BRAIN_REQUIRED_FILES)) {
      failures.push("Brain manifest requiredFiles must match BRAIN_REQUIRED_FILES exactly");
    }
  } catch {
    // The general JSON validation below reports the parse error.
  }
}

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`Missing ${relativePath}`);
}

for (const relativePath of requiredFiles.filter((file) => file.endsWith(".json"))) {
  if (!fs.existsSync(path.join(root, relativePath))) continue;
  try {
    JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch (error) {
    failures.push(`Invalid JSON in ${relativePath}: ${error.message}`);
  }
}

for (const relativePath of [
  "plugins/codex-chef-workflows/skills/codex-chef-brain/SKILL.md",
  "plugins/codex-chef-workflows/skills/codex-chef-brain/references/brain-protocol.md",
  "docs/brain/README.md",
  "docs/brain/README.tr.md"
]) {
  const absolute = path.join(root, relativePath);
  if (fs.existsSync(absolute) && /\b(?:TODO|TBD|lorem ipsum)\b/i.test(fs.readFileSync(absolute, "utf8"))) {
    failures.push(`Unresolved authoring marker in ${relativePath}`);
  }
}

const templateRoot = path.join(root, "templates/brain");
if (fs.existsSync(templateRoot)) {
  const stack = [templateRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      const text = fs.readFileSync(absolute, "utf8");
      if (/\{\{[^}]+\}\}/.test(text)) failures.push(`Unresolved placeholder in ${path.relative(root, absolute)}`);
      if (/\b(?:MEM0_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)\s*[:=]\s*[^\s]+/i.test(text)) {
        failures.push(`Secret-like value in ${path.relative(root, absolute)}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Brain foundation validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Brain foundation validation passed.");
