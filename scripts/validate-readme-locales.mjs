#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const failures = [];
const locales = [
  { file: "README.md", label: "English" },
  { file: "README.tr.md", label: "Türkçe" }
];
const retiredLocales = ["README.de.md", "README.es.md", "README.fr.md", "README.pt-BR.md"];
const sharedSignals = [
  "assets/banner.svg",
  "readme-2%20languages",
  "npm run check"
];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

for (const file of retiredLocales) {
  if (fs.existsSync(path.join(root, file))) {
    failures.push(`Retired README summary must not return; English and Turkish are the only entry points: ${file}`);
  }
}

for (const { file } of locales) {
  if (!fs.existsSync(path.join(root, file))) {
    failures.push(`Missing localized README entry point: ${file}`);
    continue;
  }
  const text = read(file);
  for (const { file: peer, label } of locales) {
    if (!text.includes(`href="${peer}"`)) failures.push(`${file} missing language switch link to ${peer}`);
    if (!text.includes(label)) failures.push(`${file} missing language label: ${label}`);
  }
  for (const signal of sharedSignals) {
    if (!text.includes(signal)) failures.push(`${file} missing public entry signal: ${signal}`);
  }
  if (!/unofficial|resmi olmayan|resmi bir OpenAI veya Anthropic ürünü değildir/i.test(text)) {
    failures.push(`${file} must state that AgentChef is unofficial.`);
  }
  for (const vendor of ["OpenAI", "Anthropic", "Codex", "Claude Code"]) {
    if (!text.includes(vendor)) failures.push(`${file} must name ${vendor}.`);
  }
  if (/(?:TODO|TBD|translation needed|lorem ipsum)/i.test(text)) failures.push(`${file} contains placeholder text.`);
}

const canonicalReadmes = [
  {
    file: "README.md",
    signals: [
      "docs/agents.md",
      "docs/skills.md",
      "docs/mcp-catalog.md",
      "docs/README.md",
      "docs/release-notes.md",
      "kb/README.md",
      "assets/workflow-overview.svg"
    ]
  },
  {
    file: "README.tr.md",
    signals: [
      "docs/agents.tr.md",
      "docs/skills.tr.md",
      "docs/mcp-catalog.tr.md",
      "docs/README.tr.md",
      "docs/release-notes.tr.md",
      "kb/README.tr.md",
      "assets/workflow-overview.tr.svg"
    ]
  }
];

for (const { file, signals } of canonicalReadmes) {
  const text = read(file);
  for (const required of [
    ...signals,
    "npm run chef -- --install",
    "npm run chef -- --install --apply",
    "codebase-memory"
  ]) {
    if (!text.includes(required)) failures.push(`${file} missing canonical public entry signal: ${required}`);
  }
}

const english = read("README.md");
if (!english.includes('href="README.tr.md"')) failures.push("README.md must keep the Turkish public entry point visible.");
if (!english.includes("English and Turkish")) failures.push("README.md must describe canonical English and Turkish documentation.");

if (failures.length > 0) {
  console.error("README locale validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`README locale validation passed. Checked ${locales.length} honest public entry points.`);
