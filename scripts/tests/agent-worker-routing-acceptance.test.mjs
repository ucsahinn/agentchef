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
    assert.match(owners.get(agent.name), /^(backend|data|devops|frontend|leadership|product|qa|design|security|marketing|support)$/);
    assert.ok(corpusNames.has(agent.name));

    const template = fs.readFileSync(path.join(root, "templates", "codex", agent.configFile), "utf8");
    assert.match(template, /^approval_policy = "on-request"$/m, agent.name);
    assert.match(template, new RegExp(`^sandbox_mode = "${agent.sandboxMode}"$`, "m"), agent.name);
    assert.doesNotMatch(template, /danger-full-access|approval_policy\s*=\s*"never"/);
  }
});

test("eleven installed coordinators own bounded worker groups and peer consultation stays parent-routed", () => {
  assert.equal(agents.agents.length, 21);
  assert.equal(agents.coordinators.length, 11);
  assert.equal(agents.coordinationPolicy.maxDelegationDepth, 2);
  assert.equal(agents.coordinationPolicy.maxWorkersPerCoordinator, 4);
  assert.equal(agents.coordinationPolicy.peerCommunication, "parent-routed-handoff");

  const specialistNames = new Set(agents.agents.map((agent) => agent.name));
  const ownedWorkers = new Set();
  for (const coordinator of agents.coordinators) {
    assert.match(coordinator.name, /_coordinator$/);
    assert.equal(coordinator.configFile, `agents/${coordinator.name}.toml`);
    assert.ok(coordinator.workers.length >= 1 && coordinator.workers.length <= 4);
    for (const worker of coordinator.workers) {
      assert.ok(specialistNames.has(worker));
      assert.ok(!ownedWorkers.has(worker), `worker assigned twice: ${worker}`);
      ownedWorkers.add(worker);
    }

    const template = fs.readFileSync(path.join(root, "templates", "codex", coordinator.configFile), "utf8");
    assert.match(template, /^approval_policy = "on-request"$/m, coordinator.name);
    assert.match(template, /^sandbox_mode = "read-only"$/m, coordinator.name);
    assert.match(template, /Do not delegate to another coordinator or create nested worker trees\./);
    assert.doesNotMatch(template, /\.agentspace[\\/]|MEMORY\.md|auth\.json|sessions[\\/]/i);
  }
  assert.equal(ownedWorkers.size, specialistNames.size);
});

test("installed global agreement forbids worker recursion and routes coordinator peers through the parent", () => {
  const agreement = fs.readFileSync(path.join(root, "templates", "codex", "AGENTS.md"), "utf8");
  assert.match(agreement, /A coordinator may delegate only to its cataloged specialist workers/);
  assert.match(agreement, /Specialist workers must not spawn agents/);
  assert.match(agreement, /parent-routed handoff/);
  assert.match(agreement, /private AgentSpace memory/);
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
  assert.ok(report.coordination.primaryCoordinator);
  assert.ok(report.coordination.primaryCoordinator.workers.every((worker) => selected.some((selectedWorker) => selectedWorker.name === worker)));
  assert.ok(report.coordination.peerHandoffs.every((handoff) => handoff.via === "parent-routed-handoff"));
  assert.doesNotMatch(output, /\.agentspace[\\/]|MEMORY\.md|auth\.json|sessions[\\/]/i);
});

test("data and support task shapes select their callable coordinators", () => {
  const cases = [
    {
      task: "data quality source lineage data catalog schema",
      profile: "data-systems",
      coordinator: "data_coordinator",
      worker: "docs_researcher"
    },
    {
      task: "customer support onboarding first run setup friction",
      profile: "onboarding-support",
      coordinator: "support_coordinator",
      worker: "devex_auditor"
    }
  ];

  for (const expected of cases) {
    const output = execFileSync(process.execPath, [routingBoard, "--task", expected.task, "--json"], {
      cwd: root,
      encoding: "utf8"
    });
    const report = JSON.parse(output);
    assert.ok(report.profiles.some((profile) => profile.id === expected.profile));
    assert.equal(report.coordination.primaryCoordinator.name, expected.coordinator);
    assert.ok(report.coordination.primaryCoordinator.workers.includes(expected.worker));
    assert.ok(report.coordination.peerHandoffs.every((handoff) => handoff.via === "parent-routed-handoff"));
    assert.doesNotMatch(output, /\.agentspace[\\/]|MEMORY\.md|auth\.json|sessions[\\/]/i);
  }
});

test("data evidence route exposes a parent-routed handoff instead of a fabricated data specialist", () => {
  const output = execFileSync(process.execPath, [routingBoard, "--task", "data lineage catalog quality evidence", "--json"], {
    cwd: root,
    encoding: "utf8"
  });
  const report = JSON.parse(output);
  const dataProfile = report.profiles.find((profile) => profile.id === "data-systems");

  assert.equal(report.coordination.primaryCoordinator.name, "data_coordinator");
  assert.deepEqual(dataProfile.workers.map((worker) => worker.name), ["docs_researcher"]);
  assert.equal(dataProfile.crossDomainHandoffs[0].toCoordinator, "backend_coordinator");
  assert.equal(dataProfile.crossDomainHandoffs[0].via, "parent-routed-handoff");
  assert.match(dataProfile.crossDomainHandoffs[0].action, /question, inspected evidence, conflict, decision needed, and open verification need/);
});

test("repository validation ignores local AgentSpace notification and result artifacts", () => {
  const result = execFileSync(process.execPath, [path.join(root, "scripts", "validate-repo.mjs")], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.match(result, /Validation passed\./);
});

test("installer alignment ignores local AgentSpace notification and result artifacts", () => {
  const result = execFileSync(process.execPath, [path.join(root, "scripts", "validate-installer-alignment.mjs")], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.match(result, /Installer alignment and portability validation passed\./);
});

test("package validation excludes local AgentSpace notification and result artifacts", () => {
  const result = execFileSync(process.execPath, [path.join(root, "scripts", "validate-package-surface.mjs")], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.match(result, /Package surface validation passed\./);
});

test("security audit ignores local AgentSpace notification and result artifacts", () => {
  const result = execFileSync(process.execPath, [path.join(root, "scripts", "security-audit.mjs")], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.match(result, /Security audit passed\./);
});
