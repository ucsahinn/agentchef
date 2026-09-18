#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runProcessHygieneCli
} from "../plugins/agentchef-workflows/scripts/codex-process-hygiene.mjs";

export * from "../plugins/agentchef-workflows/scripts/codex-process-hygiene.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath);

if (isMain) {
  try {
    process.exitCode = await runProcessHygieneCli(process.argv.slice(2));
  } catch (error) {
    console.error(`Codex process hygiene error: ${error.message}`);
    process.exitCode = 1;
  }
}
