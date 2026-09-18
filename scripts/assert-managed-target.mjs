#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertManagedTargetPath } from "./lib/managed-path-safety.mjs";

function readTargetList(listPath) {
  return fs.readFileSync(listPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const [baseRoot, ...rest] = process.argv.slice(2);
  let targets = rest;
  if (rest[0] === "--list") {
    // One helper process can verify a whole directory sync; installers pass a
    // newline-separated target list instead of spawning Node per file.
    targets = rest[1] ? readTargetList(rest[1]) : [];
  }
  if (!baseRoot || targets.length === 0) {
    console.error("Usage: node scripts/assert-managed-target.mjs <managed-root> <target> [target...]");
    console.error("       node scripts/assert-managed-target.mjs <managed-root> --list <newline-separated-target-file>");
    process.exit(2);
  }

  try {
    for (const target of targets) {
      assertManagedTargetPath(path.resolve(target), [path.resolve(baseRoot)]);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
