import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const board = path.join(root, "scripts", "codex-routing-board.mjs");

function route(task) {
  return JSON.parse(execFileSync(process.execPath, [board, "--task", task, "--json"], { cwd: root, encoding: "utf8" }));
}

test("GPT Pro context and returned-report intents route to their narrow skill owners", () => {
  const englishContext = route("Prepare a GPT Pro Project context ZIP with named architecture bundles");
  const turkishContext = route("GPT Pro proje baglam paketi ve subsystem zip hazirla");
  const englishReport = route("Verify the returned GPT Pro report against live code before implementation");
  const turkishReport = route("GPT Pro raporunu canli kodla dogrula ve sadece kanitli bulgulari uygula");
  assert.equal(englishContext.taskRecommendation.recommendations[0]?.id, "gptpro-project-context");
  assert.equal(turkishContext.taskRecommendation.recommendations[0]?.id, "gptpro-project-context");
  assert.equal(englishReport.taskRecommendation.recommendations[0]?.id, "gptpro-report-verification");
  assert.equal(turkishReport.taskRecommendation.recommendations[0]?.id, "gptpro-report-verification");
});
