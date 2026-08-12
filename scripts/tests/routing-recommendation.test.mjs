import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const board = path.join(root, "scripts", "codex-routing-board.mjs");

function run(...args) {
  return JSON.parse(execFileSync(process.execPath, [board, ...args], { cwd: root, encoding: "utf8" }));
}

test("task routing is deterministic, weighted, bounded, and advisory-only", () => {
  const first = run("--task", "MCP connector OAuth tool allowlist güvenlik", "--json");
  const second = run("--task", "MCP connector OAuth tool allowlist güvenlik", "--json");
  assert.deepEqual(first.taskRecommendation.recommendations, second.taskRecommendation.recommendations);
  assert.equal(first.taskRecommendation.algorithm, "weighted-catalog-v1");
  assert.equal(first.taskRecommendation.recommendations[0].id, "mcp-connector-change");
  assert.equal(first.taskRecommendation.recommendations[0].confidence, "high");
  assert.ok(first.taskRecommendation.recommendations[0].matchedPhrases.includes("mcp connector"));
  assert.ok(first.taskRecommendation.recommendations.length > 0);
  assert.ok(first.taskRecommendation.recommendations.length <= 3);
  assert.ok(first.taskRecommendation.recommendations.every((entry) => entry.advisory === true));
});

test("release and Turkish security signals select their high-priority routes", () => {
  const release = run("--task", "GitHub Release tag oluştur ve origin main push", "--json");
  const security = run("--task", "kimlik yetki parola güvenlik incelemesi", "--json");
  assert.equal(release.taskRecommendation.recommendations[0].id, "release-or-publish");
  assert.equal(security.taskRecommendation.recommendations[0].id, "security-sensitive");
});

test("data systems and onboarding support tasks select their primary coordinators", () => {
  const data = run("--task", "read-only data modeling schema query pipeline analytics data quality source evidence", "--json");
  const support = run("--task", "onboarding support setup diagnostics recovery guidance", "--json");

  assert.equal(data.taskRecommendation.recommendations[0].id, "data-systems");
  assert.equal(data.coordination.primaryCoordinator.name, "data_coordinator");
  assert.equal(support.taskRecommendation.recommendations[0].id, "onboarding-support");
  assert.equal(support.coordination.primaryCoordinator.name, "support_coordinator");
});

test("data evidence work keeps its coordinator primary and exposes parent-routed cross-domain handoffs", () => {
  const data = run("--task", "read-only data lineage catalog data quality evidence", "--json");

  assert.equal(data.coordination.primaryCoordinator.name, "data_coordinator");
  assert.deepEqual(data.profiles.find((profile) => profile.id === "data-systems").crossDomainHandoffs, [
    {
      when: "The task needs application implementation, database access, or database performance work.",
      toCoordinator: "backend_coordinator",
      via: "parent-routed-handoff",
      action: "Return the question, inspected evidence, conflict, decision needed, and open verification need to the parent for backend_coordinator routing."
    }
  ]);
});

test("equal worker-count routing preserves the first recommended profile's owner", () => {
  const report = run("--task", "onboarding support setup diagnostics recovery guidance", "--json");
  const repeated = run("--task", "onboarding support setup diagnostics recovery guidance", "--json");

  assert.equal(report.coordination.primaryCoordinator.name, "support_coordinator");
  assert.deepEqual(report.coordination, repeated.coordination);
});

test("unmatched task returns no advisory route", () => {
  const report = run("--task", "zzzxqv unmatched token", "--json");
  assert.deepEqual(report.taskRecommendation.recommendations, []);
  assert.deepEqual(report.profiles, []);
});
