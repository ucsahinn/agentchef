import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderWorkingAgreement, workingAgreementTargets } from "../lib/emitters/working-agreement.mjs";
import { renderAllTargetArtifacts } from "../render-target-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(path.join(root, "templates", "shared", "working-agreement.md"), "utf8");

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

test("the shared working agreement renders both committed targets byte for byte", () => {
  for (const target of Object.values(workingAgreementTargets)) {
    const rendered = `${renderWorkingAgreement(source, target.id).trimEnd()}\n`;
    const committed = normalize(fs.readFileSync(path.join(root, target.output), "utf8"));
    assert.equal(normalize(rendered), committed, `${target.output} is stale; run npm run render:targets`);
  }
});

test("rendered agreements contain no target fences, unresolved tokens, or the other harness's launcher", () => {
  const codex = renderWorkingAgreement(source, "codex");
  const claude = renderWorkingAgreement(source, "claude");
  for (const [label, text] of [["codex", codex], ["claude", claude]]) {
    assert.doesNotMatch(text, /<!--\s*\/?target:/, `${label} leaks fence markers`);
    assert.doesNotMatch(text, /\{\{[A-Z_]+\}\}/, `${label} leaks template tokens`);
  }
  assert.match(codex, /codex\.cmd/);
  assert.doesNotMatch(codex, /claude\.cmd/);
  assert.match(claude, /claude\.cmd/);
  assert.doesNotMatch(claude, /codex\.cmd/);
  assert.match(claude, /Anthropic/);
  assert.notEqual(codex, claude);
  assert.throws(() => renderWorkingAgreement(source, "cursor"), /target/i);
});

test("every generated artifact is current in the repository", () => {
  const outputs = renderAllTargetArtifacts(root);
  assert.ok(outputs.size >= 36, `expected the agreement targets, 32 agents, the plugin manifest, and the settings fragment; got ${outputs.size}`);
  const stale = [];
  for (const [relative, text] of outputs) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute) || normalize(fs.readFileSync(absolute, "utf8")) !== normalize(text)) stale.push(relative);
  }
  assert.deepEqual(stale, []);
});
