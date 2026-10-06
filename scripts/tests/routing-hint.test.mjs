import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decide } from "../../plugins/agentchef/scripts/routing-hint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = path.join(root, "plugins", "agentchef", "scripts", "routing-hint.mjs");
const index = JSON.parse(fs.readFileSync(path.join(root, "plugins", "agentchef", "scripts", "routing-index.json"), "utf8"));
const source = fs.readFileSync(script, "utf8");

const prompt = (text, extra = {}) => ({ hook_event_name: "UserPromptSubmit", session_id: "s-1", prompt: text, ...extra });

function run(stdin, env = {}) {
  const stateHome = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-hint-test-"));
  const result = spawnSync(process.execPath, [script], { input: stdin, encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_DATA: stateHome, ...env } });
  return { ...result, stateHome };
}

test("a high-confidence prompt yields exactly one identifier-only line; the rest yield nothing", () => {
  const hit = decide(prompt("yayına al: sürüm çıkar, etiket oluştur ve GitHub release yap"), index, null);
  assert.match(hit.line, /^AgentChef route \d+\.\d+\.\d+: release-or-publish \(high\) \| load skill: shipping-and-launch \| verifier: release_verifier \(required\) \| agents: release_verifier, test_verifier \| auto-spawn cap: 2$/);
  assert.ok(hit.line.length <= 300);
  assert.equal(decide(prompt("devam"), index, null).skipped, "short");
  assert.equal(decide(prompt("/agentchef:fetch"), index, null).skipped, "synthetic");
  assert.equal(decide(prompt("<task-notification> done </task-notification>"), index, null).skipped, "synthetic");
  assert.equal(decide(prompt("[Subagent hand-back] Outcome: done"), index, null).skipped, "synthetic");
  assert.equal(decide(prompt("merhaba nasılsın bugün"), index, null).skipped, "low");
  assert.equal(decide(prompt("review this PR", { agent_type: "agentchef:qa-coordinator" }), index, null).skipped, "agent");
  assert.equal(decide({ hook_event_name: "SessionStartX", prompt: "deploy" }, index, null).line, null);
  assert.equal(decide({ hook_event_name: "UserPromptSubmit", prompt: 42 }, index, null).line, null);
});

test("a profile is hinted once per session", () => {
  const state = { v: 1, hinted: ["release-or-publish"], skipped: { low: 0, synthetic: 0, short: 0, dedupe: 0, agent: 0 }, errors: 0 };
  assert.equal(decide(prompt("deploy and publish the GitHub release"), index, state).skipped, "dedupe");
  assert.equal(decide(prompt("deploy and publish the GitHub release"), index, null).profileId, "release-or-publish");
});

test("an explicit-only auto-skill is suggested, never loaded", () => {
  const hit = decide(prompt("güvenlik incelemesi yap: kimlik doğrulama ve yetkilendirme"), index, null);
  assert.match(hit.line, /\| suggest skill: security-best-practices \| verifier: security_auditor \(required\)/);
});

test("the process never blocks a prompt: exit 0 and empty stderr on every path", () => {
  const good = run(JSON.stringify(prompt("yayına al: sürüm çıkar, etiket oluştur ve GitHub release yap")));
  assert.equal(good.status, 0);
  assert.equal(good.stderr, "");
  assert.match(good.stdout, /^AgentChef route .*\n$/);
  assert.ok(!good.stdout.startsWith("{") && !good.stdout.startsWith("["));
  for (const bad of ["not json", "", JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "x".repeat(10) }), JSON.stringify(prompt("tamam"))]) {
    const result = run(bad);
    assert.equal(result.status, 0, bad.slice(0, 20));
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  }
  const off = run(JSON.stringify(prompt("yayına al: sürüm çıkar, etiket oluştur ve GitHub release yap")), { AGENTCHEF_ROUTING_HINT: "off" });
  assert.deepEqual([off.status, off.stdout, off.stderr], [0, "", ""]);
});

test("state holds identifiers and counters only; the second run of a session is deduplicated", () => {
  const stateHome = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-hint-state-"));
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: stateHome };
  const text = "yayına al: sürüm çıkar, etiket oluştur ve GitHub release yap";
  const first = spawnSync(process.execPath, [script], { input: JSON.stringify(prompt(text, { session_id: "session-abc" })), encoding: "utf8", env });
  const second = spawnSync(process.execPath, [script], { input: JSON.stringify(prompt(text, { session_id: "session-abc" })), encoding: "utf8", env });
  assert.match(first.stdout, /release-or-publish/);
  assert.equal(second.stdout, "");
  const files = fs.readdirSync(path.join(stateHome, "agentchef-routing"));
  assert.equal(files.length, 1);
  assert.match(files[0], /^[0-9a-f]{64}\.json$/);
  const saved = fs.readFileSync(path.join(stateHome, "agentchef-routing", files[0]), "utf8");
  assert.deepEqual(JSON.parse(saved).hinted, ["release-or-publish"]);
  // Catalog identifiers may share a word with the prompt ("release"); every other prompt word must be absent.
  const identifierText = JSON.parse(saved).hinted.join(" ");
  for (const token of text.split(/\s+/)) {
    if (!identifierText.includes(token.toLowerCase())) assert.ok(!saved.includes(token), `state leaks ${token}`);
  }
  assert.ok(!saved.includes("matchedTerms"));
});

test("prompt text with credential shapes never reaches stdout or state", () => {
  const stateHome = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-hint-leak-"));
  const secretish = ["ghp", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_");
  const text = `deploy the release with token ${secretish} and password=hunter2hunter2`;
  const result = spawnSync(process.execPath, [script], { input: JSON.stringify(prompt(text, { session_id: "leak" })), encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_DATA: stateHome } });
  const all = `${result.stdout}${result.stderr}${fs.readdirSync(path.join(stateHome, "agentchef-routing")).map((name) => fs.readFileSync(path.join(stateHome, "agentchef-routing", name), "utf8")).join("")}`;
  assert.ok(!all.includes(secretish));
  assert.ok(!all.includes("hunter2"));
  assert.ok(!all.includes("password"));
});

test("the hook source stays inert: fixed imports, no process or network access, no blocking exit", () => {
  const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]).sort();
  assert.deepEqual(imports, ["./routing-recommendation.mjs", "node:crypto", "node:fs", "node:os", "node:path", "node:url"]);
  for (const forbidden of ["child_process", "node:http", "node:https", "node:net", "node:dns", "node:tls", "worker_threads", "fetch(", "exitCode = 2", "exit(2)", "transcript_path", "console.error", "process.stderr", "import("]) {
    assert.ok(!source.includes(forbidden), `hook source contains ${forbidden}`);
  }
});
