#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { headingLevels } from "./lib/markdown-headings.mjs";

const root = path.resolve(process.cwd());
const kbDir = path.join(root, "kb");
const failures = [];
const localeSuffix = ".tr.md";
const turkishSignal = /[\u00e7\u011f\u0131\u00f6\u015f\u00fc\u00c7\u011e\u0130\u00d6\u015e\u00dc]/;

function fail(message) {
  failures.push(message);
}

function read(file) {
  return fs.readFileSync(path.join(kbDir, file), "utf8");
}

function hasH1(text) {
  return /^#\s+\S+/m.test(text);
}

function indexTargets(text) {
  const targets = new Set();
  const linkPattern = /\]\(([^)\s]+\.md)(?:#[^)]+)?\)/g;
  let match;
  while ((match = linkPattern.exec(text)) !== null) {
    const target = match[1].replace(/^\.\//, "");
    if (target.startsWith("../")) continue;
    if (target === "README.md" || target === "README.tr.md") continue;
    targets.add(target);
  }
  return targets;
}

function compareIndex(indexFile, actualTargets, expectedTargets) {
  for (const expected of expectedTargets) {
    if (!actualTargets.has(expected)) fail(`${indexFile} missing KB article link: ${expected}`);
  }
  for (const actual of actualTargets) {
    if (!expectedTargets.has(actual)) fail(`${indexFile} links unexpected KB article: ${actual}`);
  }
}

if (!fs.existsSync(kbDir)) {
  fail("Missing kb directory.");
} else {
  const files = fs.readdirSync(kbDir).filter((file) => file.endsWith(".md")).sort();
  const fileSet = new Set(files);
  const englishFiles = files.filter((file) => !file.endsWith(localeSuffix));
  const turkishFiles = files.filter((file) => file.endsWith(localeSuffix));

  if (!fileSet.has("README.md")) fail("Missing kb/README.md.");
  if (!fileSet.has("README.tr.md")) fail("Missing kb/README.tr.md.");

  for (const file of englishFiles) {
    const pair = file.replace(/\.md$/, localeSuffix);
    if (!fileSet.has(pair)) {
      fail(`Missing Turkish KB pair for kb/${file}: kb/${pair}`);
      continue;
    }
    const english = headingLevels(read(file));
    const turkish = headingLevels(read(pair));
    if (english.join(",") !== turkish.join(",")) {
      fail(`kb/${file} and kb/${pair} differ in heading structure (${english.length} vs ${turkish.length} headings)`);
    }
  }

  for (const file of turkishFiles) {
    const pair = file.replace(/\.tr\.md$/, ".md");
    if (!fileSet.has(pair)) fail(`Turkish KB file has no English pair: kb/${file}`);
  }

  for (const file of files) {
    const text = read(file);
    if (!hasH1(text)) fail(`kb/${file} must start with a Markdown H1.`);
    if (file.endsWith(localeSuffix) && !turkishSignal.test(text)) {
      fail(`kb/${file} must contain Turkish language characters, not English-only or ASCII-only text.`);
    }
    if (/(?:TODO|TBD|translation needed|lorem ipsum)/i.test(text)) {
      fail(`kb/${file} contains placeholder text.`);
    }
  }

  if (fileSet.has("README.md") && fileSet.has("README.tr.md")) {
    const englishArticles = new Set(englishFiles.filter((file) => file !== "README.md"));
    const turkishArticles = new Set(turkishFiles.filter((file) => file !== "README.tr.md"));
    compareIndex("kb/README.md", indexTargets(read("README.md")), englishArticles);
    compareIndex("kb/README.tr.md", indexTargets(read("README.tr.md")), turkishArticles);
  }
}

if (failures.length > 0) {
  console.error("KB locale validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("KB locale validation passed.");
