#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_RECEIPT_BYTES,
  applyGlobalGitGuards,
  assertSafeReceiptPath,
  inspectGlobalGitGuards,
  restoreGlobalGitGuards
} from "./lib/global-git-guards.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function parseArguments(argv) {
  const [command, ...args] = argv;
  if (!command || !["preview", "apply", "restore"].includes(command)) {
    throw new Error("Usage: manage-global-git-guards.mjs <preview|apply|restore> [options] --json");
  }
  const options = {
    command,
    home: os.homedir(),
    ignoreSource: path.join(repoRoot, "templates", "git", ".gitignore_global"),
    hookSource: path.join(repoRoot, "templates", "git", "pre-commit"),
    adoptFiles: [],
    adoptKeys: [],
    json: false
  };
  const valueFlags = new Map([
    ["--home", "home"],
    ["--git-config-global", "gitConfigGlobal"],
    ["--ignore-source", "ignoreSource"],
    ["--hook-source", "hookSource"],
    ["--receipt", "receiptPath"]
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--adopt-file" || argument === "--adopt-key") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      (argument === "--adopt-file" ? options.adoptFiles : options.adoptKeys).push(value);
      index += 1;
      continue;
    }
    const key = valueFlags.get(argument);
    if (!key) throw new Error(`Unknown option: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    options[key] = value;
    index += 1;
  }
  if (!options.json) throw new Error("--json is required so callers receive a machine-readable result.");
  if ((command === "apply" || command === "restore") && !options.receiptPath) {
    throw new Error(`${command} requires --receipt <path>.`);
  }
  if (command === "restore" && (options.adoptFiles.length > 0 || options.adoptKeys.length > 0)) {
    throw new Error("restore does not accept adoption flags.");
  }
  return options;
}

function readReceipt(receiptPath) {
  const resolved = assertSafeReceiptPath(receiptPath, { mustExist: true });
  const stat = fs.statSync(resolved);
  if (stat.size > MAX_RECEIPT_BYTES) {
    throw new Error(`Receipt is too large (maximum ${MAX_RECEIPT_BYTES} bytes).`);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function errorPayload(error) {
  return {
    ok: false,
    error: {
      name: error?.name || "Error",
      message: error?.message || String(error)
    }
  };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === "preview") {
    const inspection = inspectGlobalGitGuards(options);
    process.stdout.write(`${JSON.stringify({ ok: inspection.ok, inspection }, null, 2)}\n`);
    process.exitCode = inspection.ok ? 0 : 2;
    return;
  }
  if (options.command === "apply") {
    const result = applyGlobalGitGuards({ ...options, receiptPath: path.resolve(options.receiptPath) });
    const { receipt, ...publicResult } = result;
    process.stdout.write(`${JSON.stringify({
      ok: true,
      ...publicResult,
      receipt: {
        path: path.resolve(options.receiptPath),
        schema: receipt.schema,
        version: receipt.version
      }
    }, null, 2)}\n`);
    return;
  }
  const result = restoreGlobalGitGuards({
    home: options.home,
    gitConfigGlobal: options.gitConfigGlobal,
    receipt: readReceipt(options.receiptPath)
  });
  process.stdout.write(`${JSON.stringify({ ok: true, restored: result.restored }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stdout.write(`${JSON.stringify(errorPayload(error), null, 2)}\n`);
  process.exitCode = 1;
}
