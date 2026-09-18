#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const failures = [];

function fail(message) {
  failures.push(message);
}

const result = spawnSync(process.execPath, ["scripts/codex-doctor.mjs", "--json", "--redact-paths"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 60000,
  windowsHide: true
});

if (result.error) {
  fail(`codex doctor validation could not run: ${result.error.message}`);
} else if (result.status !== 0) {
  fail(`codex doctor exited ${result.status}: ${(result.stderr || result.stdout).trim()}`);
}

let report;
if (failures.length === 0) {
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    fail(`codex doctor did not emit parseable JSON: ${error.message}`);
  }
}

if (report) {
  if (report.schemaVersion !== "agentchef.doctor.v1") {
    fail("codex doctor schemaVersion drifted.");
  }
  if (report.status !== "ok") {
    fail(`codex doctor status must be ok, got ${report.status}.`);
  }
  if (report.repo?.private !== true) {
    fail("codex doctor must report package private=true.");
  }
  if ((report.agents?.count || 0) < 20) {
    fail("codex doctor must cover the expanded specialist-agent set.");
  }
  if ((report.agents?.liveResearchCount || 0) < 5) {
    fail("codex doctor must report live-research-capable specialists.");
  }
  if ((report.mcp?.count || 0) < 14) {
    fail("codex doctor must cover the MCP catalog.");
  }
  if ((report.skills?.installableCount || 0) < 15) {
    fail("codex doctor must cover installable curated skills.");
  }
  if ((report.skills?.directInstallCount || 0) < 3) {
    fail("codex doctor must cover managed direct skills.");
  }
  if (report.skills?.lockEntries !== report.skills?.installableCount) {
    fail("codex doctor lockEntries must match installableCount.");
  }
  if (report.docs?.languages !== 2) {
    fail("codex doctor must report the complete English and Turkish operator-doc matrix.");
  }
  if ((report.docs?.missing || []).length > 0) {
    fail("codex doctor must not report missing localized docs.");
  }
  if ((report.installPlan?.globalWriteOperations || 0) === 0) {
    fail("codex doctor must identify install-plan global-write operations.");
  }
  if (report.globalTargets?.inspected !== false) {
    fail("codex doctor validation should not inspect user-global state by default.");
  }
}

if (failures.length > 0) {
  console.error("Codex doctor validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Codex doctor validation passed.");
