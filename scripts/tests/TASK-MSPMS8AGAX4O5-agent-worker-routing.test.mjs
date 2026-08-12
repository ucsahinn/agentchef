import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const agents = JSON.parse(fs.readFileSync(path.join(root, "catalog", "agents.json"), "utf8"));
const corpus = JSON.parse(fs.readFileSync(path.join(root, "catalog", "agent-research-corpus.json"), "utf8"));
const routingBoard = path.join(root, "scripts", "codex-routing-board.mjs");

test("all 21 specialists expose AgentSpace ownership, knowledge, and safe worker runtime policy", () => {
  assert.equal(agents.agents.length, 21);
  assert.equal(corpus.agents.length, 21);
  const corpusNames = new Set(corpus.agents.map((agent) => agent.name));
  const owners = new Map(agents.agentSpaceRoles.flatMap((role) => role.specialists.map((name) => [name, role.id])));
  assert.equal(owners.size, 21);
  assert.deepEqual(agents.workerApprovalProfile, {
    approvalPolicy: "on-request",
    sandboxSource: "catalog-agent",
    rules: "rules/default.rules"
  });
  for (const agent of agents.agents) {
    assert.match(owners.get(agent.name), /^(backend|data|devops|frontend|leadership|product|qa|design)$/);
    assert.ok(corpusNames.has(agent.name));
    const template = fs.readFileSync(path.join(root, "templates", "codex", agent.configFile), "utf8");
    assert.match(template, /^approval_policy = "on-request"$/m, agent.name);
    assert.match(template, new RegExp("^sandbox_mode = \"" + agent.sandboxMode + "\"$", "m"), agent.name);
    assert.doesNotMatch(template, /danger-full-access|approval_policy\s*=\s*"never"/);
  }
});

test("real routing CLI returns selected specialist knowledge without private content injection", () => {
  const output = execFileSync(process.execPath, [routingBoard, "--task", "repository architecture mapping before implementation", "--json"], {
    cwd: root,
    encoding: "utf8"
  });
  const report = JSON.parse(output);
  const selected = report.profiles.flatMap((profile) => profile.workers);
  assert.ok(selected.some((worker) => worker.name === "code_mapper"));
  assert.ok(selected.every((worker) => worker.knowledgeRef === worker.name));
  assert.ok(selected.every((worker) => worker.workerApprovalProfile.approvalPolicy === "on-request"));
  assert.doesNotMatch(output, /\.agentspace[\\/]|MEMORY\.md|auth\.json|sessions[\\/]/i);
});
