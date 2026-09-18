#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.cwd());
const failures = [];

const packages = {
  seo: {
    required: [
      "SKILL.md",
      "agents/openai.yaml",
      "assets/seo-audit-report.template.json",
      "assets/keyword-intent-map.template.csv",
      "references/intake-and-evidence.md",
      "references/technical-seo.md",
      "references/javascript-and-rendering.md",
      "references/structured-data.md",
      "references/content-and-growth.md",
      "references/international-and-local.md",
      "references/measurement-and-roadmap.md",
      "references/safety-and-approvals.md",
      "references/sources.md",
      "references/verification-rubric.md",
      "references/forward-tests.md",
      "scripts/validate-seo-report.mjs"
    ],
    validator: "scripts/validate-seo-report.mjs",
    template: "assets/seo-audit-report.template.json",
    requiredSkillPhrases: [
      "$seo",
      "$agentchef-workflows:seo",
      "local-source",
      "local-rendered",
      "deployed-public",
      "authorized-private",
      "evidence-research",
      "validate-seo-report.mjs"
    ],
    requiredSourcePhrases: [
      "developers.google.com/search/docs/fundamentals/creating-helpful-content",
      "developers.google.com/search/docs/essentials/spam-policies",
      "developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering",
      "developers.google.com/search/docs/appearance/core-web-vitals",
      "developers.google.com/search/blog/2024/10/sitelinks-search-box",
      "developers.google.com/search/blog/2023/08/howto-faq-changes"
    ]
  },
  "evidence-research": {
    required: [
      "SKILL.md",
      "agents/openai.yaml",
      "assets/research-charter.template.md",
      "assets/research-report.template.json",
      "references/scoping-and-charter.md",
      "references/search-and-screening.md",
      "references/source-appraisal.md",
      "references/synthesis-and-uncertainty.md",
      "references/qualitative-and-quantitative.md",
      "references/domain-method-routing.md",
      "references/reproducibility-and-ethics.md",
      "references/sources.md",
      "references/verification-rubric.md",
      "references/forward-tests.md",
      "scripts/validate-research-report.mjs"
    ],
    validator: "scripts/validate-research-report.mjs",
    template: "assets/research-report.template.json",
    requiredSkillPhrases: [
      "$evidence-research",
      "$agentchef-workflows:evidence-research",
      "fact",
      "inference",
      "recommendation",
      "validate-research-report.mjs"
    ],
    requiredSourcePhrases: [
      "prisma-statement.org/prisma-2020",
      "cochrane.org/authors/handbooks-and-manuals/handbook/current",
      "nist.gov/publications/nistsematech-e-handbook-statistical-methods",
      "gov.uk/guidance/the-aqua-book",
      "crossref.org/documentation/retrieve-metadata/rest-api",
      "developers.openalex.org/api-reference/introduction",
      "ncbi.nlm.nih.gov/sites/books/NBK25497"
    ]
  }
};

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8").replace(/^\uFEFF/, "");
}

function requireIncludes(text, expected, label) {
  if (!text.includes(expected)) failures.push(`${label} must include: ${expected}`);
}

function validateTemplate(skillRoot, spec) {
  const result = spawnSync(process.execPath, [
    path.join(skillRoot, spec.validator),
    "--report",
    path.join(skillRoot, spec.template)
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 30000
  });
  if (result.error) {
    failures.push(`${skillRoot} template validator could not run: ${result.error.message}`);
  } else if (result.status !== 0) {
    failures.push(
      `${skillRoot} template must pass its validator: ${[result.stdout, result.stderr].filter(Boolean).join("\n").trim()}`
    );
  }
}

const catalog = JSON.parse(read("catalog/skills.json"));
const installPlan = JSON.parse(read("manifests/install-plan.json"));
const catalogByName = new Map((catalog.skills || []).map((skill) => [skill.name, skill]));
const operationById = new Map((installPlan.operations || []).map((operation) => [operation.id, operation]));

for (const [skillName, spec] of Object.entries(packages)) {
  const skillRel = `plugins/agentchef-workflows/skills/${skillName}`;
  const skillRoot = path.join(root, skillRel);
  for (const relativePath of spec.required) {
    if (!fs.existsSync(path.join(skillRoot, relativePath))) {
      failures.push(`${skillRel} is missing required package file: ${relativePath}`);
    }
  }
  if (!fs.existsSync(skillRoot)) continue;

  const skillText = read(`${skillRel}/SKILL.md`);
  const sourceText = read(`${skillRel}/references/sources.md`);
  const openAiText = read(`${skillRel}/agents/openai.yaml`);
  for (const phrase of spec.requiredSkillPhrases) {
    requireIncludes(skillText, phrase, `${skillRel}/SKILL.md`);
  }
  for (const phrase of spec.requiredSourcePhrases) {
    requireIncludes(sourceText, phrase, `${skillRel}/references/sources.md`);
  }
  requireIncludes(openAiText, `$${skillName}`, `${skillRel}/agents/openai.yaml`);
  requireIncludes(openAiText, `$agentchef-workflows:${skillName}`, `${skillRel}/agents/openai.yaml`);
  requireIncludes(openAiText, "allow_implicit_invocation: true", `${skillRel}/agents/openai.yaml`);

  const catalogEntry = catalogByName.get(skillName);
  if (!catalogEntry) {
    failures.push(`catalog/skills.json must include ${skillName}.`);
  } else {
    if (catalogEntry.install !== false || catalogEntry.directInstall !== true) {
      failures.push(`${skillName} must be bundled with install=false and directInstall=true.`);
    }
    if (catalogEntry.directTarget !== `\${AGENTS_HOME}/skills/${skillName}`) {
      failures.push(`${skillName} directTarget must use AGENTS_HOME/skills/${skillName}.`);
    }
  }

  const operationId = `${skillName}-direct-skill`;
  const operation = operationById.get(operationId);
  if (!operation) {
    failures.push(`manifests/install-plan.json must include ${operationId}.`);
  } else {
    if (operation.source !== skillRel) failures.push(`${operationId} source must be ${skillRel}.`);
    if (operation.destination !== `\${AGENTS_HOME}/skills/${skillName}`) {
      failures.push(`${operationId} destination must use AGENTS_HOME/skills/${skillName}.`);
    }
  }
  for (const profileName of ["default", "all"]) {
    if (!installPlan.profiles?.[profileName]?.includes(operationId)) {
      failures.push(`install profile ${profileName} must include ${operationId}.`);
    }
  }

  validateTemplate(skillRoot, spec);
}

const seoText = [
  read("plugins/agentchef-workflows/skills/seo/SKILL.md"),
  read("plugins/agentchef-workflows/skills/seo/references/technical-seo.md"),
  read("plugins/agentchef-workflows/skills/seo/references/structured-data.md"),
  read("plugins/agentchef-workflows/skills/seo/references/content-and-growth.md")
].join("\n");
const staleSeoClaims = [
  /E-E-A-T (?:is|as) (?:a )?(?:direct|specific|standalone) ranking factor/i,
  /Core Web Vitals (?:are|is) (?:a )?direct ranking (?:factor|signal)/i,
  /SearchAction.{0,80}(?:will|guarantees?|enables?).{0,40}(?:sitelinks search box|internal search box)/i,
  /HowTo.{0,80}(?:Google rich result|Google Search rich result).{0,40}(?:recommended|supported|eligible)/i,
  /(?:changefreq|priority).{0,50}(?:improve|increase|boost).{0,30}(?:ranking|crawl)/i,
  /all URLs? (?:must|should) end with (?:a )?(?:slash|\/)/i
];
for (const pattern of staleSeoClaims) {
  if (pattern.test(seoText)) failures.push(`SEO package contains stale or universalized guidance: ${pattern}`);
}

const packageJson = JSON.parse(read("package.json"));
for (const scriptName of ["validate:growth-skills", "test:growth-skills"]) {
  if (!packageJson.scripts?.[scriptName]) failures.push(`package.json must define ${scriptName}.`);
}
if (!packageJson.scripts?.check?.includes("validate-growth-skills.mjs")) {
  failures.push("package.json check must run validate-growth-skills.mjs.");
}
if (!packageJson.scripts?.check?.includes("growth-skills.test.mjs")) {
  failures.push("package.json check must run growth-skills.test.mjs.");
}

const docs = [
  "README.md",
  "README.tr.md",
  "docs/skills.md",
  "docs/skills.tr.md",
  "docs/install.md",
  "docs/install.tr.md",
  "docs/security-model.md",
  "docs/security-model.tr.md"
];
for (const doc of docs) {
  const text = read(doc);
  requireIncludes(text, "$seo", doc);
  requireIncludes(text, "$evidence-research", doc);
}

if (failures.length > 0) {
  console.error("Growth skill validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Growth skill validation passed.");
