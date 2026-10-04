#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { headingLevels } from "./lib/markdown-headings.mjs";

const root = path.resolve(process.cwd());
const docsDir = path.join(root, "docs");
const failures = [];
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const currentReleaseHeading = `## v${packageJson.version} - `;


if (!fs.existsSync(docsDir)) {
  failures.push("Missing docs directory.");
} else {
  const files = fs.readdirSync(docsDir).filter((file) => file.endsWith(".md")).sort();
  const fileSet = new Set(files);
  const englishDocs = files.filter((file) => !file.endsWith(".tr.md"));
  const turkishDocs = files.filter((file) => file.endsWith(".tr.md"));

  for (const file of englishDocs) {
    const slug = file.replace(/\.md$/, "");
    const pair = `${slug}.tr.md`;
    if (!fileSet.has(pair)) failures.push(`Missing Turkish pair for docs/${file}: docs/${pair}`);
  }

  for (const file of turkishDocs) {
    const pair = file.replace(/\.tr\.md$/, ".md");
    if (!fileSet.has(pair)) failures.push(`Turkish doc has no English source pair: docs/${file}`);
  }

  // A pair carries the same sections: the same number of headings at the same
  // levels, in order (code fences excluded). A section missing from one
  // language is how translations drift.
  for (const file of englishDocs) {
    const pair = file.replace(/\.md$/, ".tr.md");
    if (!fileSet.has(pair)) continue;
    const english = headingLevels(fs.readFileSync(path.join(docsDir, file), "utf8"));
    const turkish = headingLevels(fs.readFileSync(path.join(docsDir, pair), "utf8"));
    if (english.join(",") !== turkish.join(",")) {
      failures.push(`docs/${file} and docs/${pair} differ in heading structure (${english.length} vs ${turkish.length} headings)`);
    }
  }

  for (const file of files) {
    if (/\.(?:de|es|fr|pt-BR)\.md$/.test(file)) {
      failures.push(`Generated summary locale should not return to deep docs: docs/${file}`);
    }
    const text = fs.readFileSync(path.join(docsDir, file), "utf8");
    if (/(?:TODO|TBD|translation needed|lorem ipsum)/i.test(text)) {
      failures.push(`Doc contains placeholder text: docs/${file}`);
    }
  }

  for (const file of ["release-notes.md", "release-notes.tr.md"]) {
    const text = fs.readFileSync(path.join(docsDir, file), "utf8");
    if (!text.includes(currentReleaseHeading)) {
      failures.push(`docs/${file} missing current ${currentReleaseHeading.trim()} section.`);
    }
  }

  for (const [indexFile, suffix] of [["README.md", ".md"], ["README.tr.md", ".tr.md"]]) {
    const index = fs.readFileSync(path.join(docsDir, indexFile), "utf8");
    const expected = suffix === ".md" ? englishDocs : turkishDocs;
    for (const file of expected.filter((entry) => entry !== indexFile)) {
      if (!index.includes(`(${file})`)) failures.push(`docs/${indexFile} does not link docs/${file}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Doc locale validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Doc locale validation passed for complete English and Turkish operator docs.");
