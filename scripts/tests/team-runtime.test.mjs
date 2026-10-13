import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  effectiveSandbox, maxConcurrency, readApproval, approvalIsValid, consumeApproval,
  assertTeamTextSafe, composeWorkerPrompt, composeVerifierPrompt, parseWorkerHandoff,
  renderHandoffMarkdown, writeRunRecord, readRunRecord, transitionRun, transitionWorker,
  readRoleToml
} from "../lib/team-runtime.mjs";

const contract = JSON.parse(fs.readFileSync(new URL("../../catalog/subscription-team-mode.json", import.meta.url)));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "team-runtime-"));
const brief = Object.fromEntries(["goal", "evidence", "scope", "boundaries", "doneWhen", "returnFormat", "userWords"].map((key) => [key, key]));
const handoff = { outcome:"ok", evidence:["test"], changedScope:["a.mjs"], risks:[], openQuestions:[], needs:[], nextVerification:"none", verdict:"pass", mutationCheck:{claimedPaths:["a.mjs"], outsideScope:[]} };

test("sandbox ceilings dominate role TOML and unknown/full access are rejected", () => {
  assert.throws(() => effectiveSandbox("docs_author", "danger-full-access", contract), /danger-full-access/);
  assert.equal(effectiveSandbox("test_verifier", "workspace-write", contract), "read-only");
  assert.throws(() => effectiveSandbox("unknown", "read-only", contract));
  assert.throws(() => effectiveSandbox("docs_author", "danger-full-access", contract, { rejectFullAccess: true }));
});
test("worker concurrency respects contract, env ceiling and request", () => {
  assert.equal(maxConcurrency(contract, 3, "2"), 2);
  assert.equal(maxConcurrency(contract, 9, "bad"), 4);
  assert.equal(maxConcurrency(contract, 0, "2"), 1);
});
test("approvals are validated and consumed once", () => {
  const dir = tmp(); const plannedAt = "2026-10-01T00:00:00.000Z"; const file = path.join(dir, "R1.baslat.json");
  const row = { v:2, taskId:"R1", runId:"R1", tur:"baslat", nonce:"n", approvedAt:"2026-10-02T00:00:00.000Z", kanal:"sohbet", ajan:"claude", session:"s", kullanildi:"", kullanan:"" };
  assert.equal(readApproval(dir,"R1","baslat"), null);
  fs.writeFileSync(file, JSON.stringify(row));
  assert.equal(approvalIsValid(row,{runId:"R1",tur:"baslat",plannedAt,now:"2026-10-03T00:00:00Z"}), true);
  assert.equal(approvalIsValid((({tur,...rest})=>rest)(row),{runId:"R1",tur:"baslat",plannedAt,now:"2026-10-03T00:00:00Z"}), false);
  assert.equal(approvalIsValid({...row,taskId:"other"},{runId:"R1",tur:"baslat",plannedAt}), false);
  assert.equal(approvalIsValid({...row,approvedAt:"2026-09-30T00:00:00Z"},{runId:"R1",tur:"baslat",plannedAt}), false);
  assert.equal(approvalIsValid({...row,approvedAt:"2026-10-02T00:00:00Z"},{runId:"R1",tur:"baslat",plannedAt,now:"2026-10-11T00:00:00Z"}), false);
  assert.equal(approvalIsValid(row,{runId:"R1",tur:"baslat",plannedAt,now:Date.parse("2026-10-03T00:00:00Z")}), true);
  consumeApproval(file,"claude/session");
  assert.ok(JSON.parse(fs.readFileSync(file,"utf8")).kullanildi);
  assert.throws(() => consumeApproval(file,"claude/session"));
  fs.rmSync(dir,{recursive:true,force:true});
});
test("worker prompt ordering, seven brief fields, safety rules and verifier prompt", () => {
  const prompt = composeWorkerPrompt({roleInstructions:"ROLE",runId:"R1",taskId:"TASK-1",role:"docs_author",brief});
  assert.ok(prompt.indexOf("ROLE") < prompt.indexOf("# Team run"));
  assert.ok(prompt.indexOf("# Team run") < prompt.indexOf("## Brief"));
  assert.ok(prompt.indexOf("## Brief") < prompt.indexOf("## Team rules"));
  assert.ok(prompt.indexOf("## Team rules") < prompt.indexOf("## Return contract"));
  for (const rule of ["worktree", "commit", "push", "checkout", "needs:", "global", "secret", "JSON"]) assert.match(prompt,new RegExp(rule,"i"));
  for (const value of Object.values(brief)) assert.ok(prompt.includes(value));
  assert.throws(() => composeWorkerPrompt({roleInstructions:"",runId:"R1",taskId:"TASK-1",role:"docs_author",brief:{...brief,goal:"token=abcdefghijklmnop"}}));
  assert.match(composeVerifierPrompt({runId:"R1",brief}), /read-only/i);
});
test("handoff schema rejects extras and Markdown round-trips through parser", () => {
  const md = renderHandoffMarkdown(handoff);
  assert.equal(parseWorkerHandoff(md).ok, true);
  assert.throws(() => parseWorkerHandoff({...handoff,extra:true}));
  assert.equal(parseWorkerHandoff({...handoff,verdict:"warn"}).data.verdict, "warn");
});
test("run writes use revision CAS and status transitions reject invalid edges", () => {
  const dir=tmp(), file=path.join(dir,"run.json"); const run={schemaVersion:1,revision:0,runId:"R1",status:"planned",workers:[]};
  writeRunRecord(file,run); const read=readRunRecord(file); assert.equal(read.revision,1);
  assert.throws(() => writeRunRecord(file,run), /revision/);
  assert.equal(transitionRun(read,"running").status,"running");
  assert.equal(transitionRun({ ...read, status: "paused" }, "collected").status, "collected");
  assert.throws(() => transitionRun(read,"merged"));
  const worker={taskId:"TASK-1",status:"planned"};
  assert.equal(transitionWorker(worker,"queued").status,"queued");
  assert.throws(() => transitionWorker(worker,"finished"));
  assert.equal(transitionWorker({taskId:"TASK-1",status:"finished"},"failed").status,"failed");
  fs.rmSync(dir,{recursive:true,force:true});
});
test("role TOML returns developer instructions, sandbox and catalog-default model", () => {
  const role=readRoleToml("docs_author");
  assert.ok(role.developerInstructions.length>0);
  assert.equal(role.model,"gpt-6-luna");
  assert.equal(typeof role.sandboxMode,"string");
});
test("team text classifier fails closed with category label", () => {
  assert.throws(() => assertTeamTextSafe(["ghp_", "123456789012345678901234567890"].join("")), /github-token/);
  assert.equal(assertTeamTextSafe("ordinary brief"), "ordinary brief");
});
