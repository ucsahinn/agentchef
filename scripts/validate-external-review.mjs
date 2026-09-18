#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const failures = [];
const required = [
  "scripts/external-review-cli.mjs",
  "scripts/tests/external-review.test.mjs",
  "schemas/external-review-manifest.schema.json",
  "schemas/external-review-report.schema.json",
  "plugins/agentchef-workflows/skills/external-review-workflow/SKILL.md",
  "plugins/agentchef-workflows/skills/external-review-workflow/references/review-protocol.md",
  "plugins/agentchef-workflows/skills/external-review-workflow/agents/openai.yaml"
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing external review surface: ${file}`);
}

const cli = fs.readFileSync(path.join(root, "scripts/external-review-cli.mjs"), "utf8");
const chef = fs.readFileSync(path.join(root, "scripts/chef-cli.mjs"), "utf8");
const skill = fs.readFileSync(path.join(root, "plugins/agentchef-workflows/skills/external-review-workflow/SKILL.md"), "utf8");
const routing = JSON.parse(fs.readFileSync(path.join(root, "catalog/routing-profiles.json"), "utf8"));
const manifestSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/external-review-manifest.schema.json"), "utf8"));
const reportSchema = JSON.parse(fs.readFileSync(path.join(root, "schemas/external-review-report.schema.json"), "utf8"));

for (const command of ["pack", "handoff", "verify", "status"]) {
  if (!cli.includes(`command === "${command}"`)) failures.push(`CLI missing review command: ${command}`);
}
for (const signal of ["trackedTextOnly", "externalUploadPerformed", "outputOutsideTarget", "sha256", "SECRET_DETECTED", "STALE_SNAPSHOT"]) {
  if (!cli.includes(signal)) failures.push(`CLI missing safety signal: ${signal}`);
}
if (!chef.includes('args[0] === "review"')) failures.push("chef CLI does not dispatch the review namespace.");
if (/\b(?:fetch|https?:|curl|Invoke-WebRequest|danger-full-access|ignore-rules)\b/i.test(cli)) {
  failures.push("External review CLI must stay zero-network and must not include unsafe execution flags.");
}
for (const command of ["chef review pack", "chef review handoff", "chef review verify", "chef review status"]) {
  if (!skill.includes(command)) failures.push(`External review skill missing command: ${command}`);
}
if (!routing.profiles.some((profile) => profile.id === "external-deep-review")) {
  failures.push("Routing catalog missing external-deep-review.");
}
for (const [label, schema] of [["manifest", manifestSchema], ["report", reportSchema]]) {
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") failures.push(`${label} schema must use JSON Schema 2020-12.`);
  if (schema.additionalProperties !== false) failures.push(`${label} schema must reject unknown top-level properties.`);
}

if (failures.length > 0) {
  console.error("External review validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("External review validation passed.");
