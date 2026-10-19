import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  acquireTeamOperationLock, consumeApprovalWith, effectiveSandbox, maxConcurrency, readApproval, approvalIsValid, consumeApproval,
  assertTeamTextSafe, composeWorkerPrompt, composeVerifierPrompt, parseWorkerHandoff,
  renderHandoffMarkdown, writeRunRecord, readRunRecord, transitionRun, transitionWorker,
  readRoleToml, WINDOWS_UTF8_PREFIX
} from "../lib/team-runtime.mjs";
import { spawnSync } from "node:child_process";

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
  assert.equal(maxConcurrency(contract, 9, "bad"), 8);
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
test("approval consumption rolls back when its run-record commit fails", () => {
  const dir=tmp(), file=path.join(dir,"R1.baslat.json");
  const original={v:2,taskId:"R1",runId:"R1",tur:"baslat",nonce:"n",approvedAt:"2026-10-02T00:00:00.000Z",kanal:"sohbet",ajan:"claude",session:"s",kullanildi:"",kullanan:""};
  fs.writeFileSync(file,JSON.stringify(original));
  assert.throws(()=>consumeApprovalWith(file,"test",()=>{throw new Error("record write failed");}),/record write failed/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,"utf8")),original);
  fs.rmSync(dir,{recursive:true,force:true});
});
test("team operation lock rejects competitors and only releases its nonce", () => {
  const dir=tmp(), file=path.join(dir,"merge.lock"), first=acquireTeamOperationLock(file);
  assert.throws(()=>acquireTeamOperationLock(file),{code:"EEXIST"});
  fs.writeFileSync(file,JSON.stringify({nonce:"replacement"})); first.release();
  assert.equal(JSON.parse(fs.readFileSync(file,"utf8")).nonce,"replacement");
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
  const verifierPrompt = composeVerifierPrompt({runId:"R1",brief});
  assert.match(verifierPrompt, /read-only/i);
  assert.match(verifierPrompt, /Reading files and running read-only commands/i);
  assert.match(verifierPrompt, /No commands were specified.*Compare the integration diff with the worker briefs/s);
});
test("worker and verifier prompts apply language and Windows test rules without changing worker section order", () => {
  const makeWorker=(language,platform)=>composeWorkerPrompt({roleInstructions:"ROLE",runId:"R1",taskId:"TASK-1",role:"docs_author",brief,language,platform});
  const windows=makeWorker(undefined,"win32");
  assert.match(windows,/Write every progress message and the handoff text in Turkish; keep code, paths and commands verbatim/);
  assert.match(windows,/node --test --test-isolation=none <files>/);
  assert.ok(windows.indexOf("## Team rules")<windows.indexOf("## Return contract"));
  const configured=makeWorker("English","linux");
  assert.match(configured,/handoff text in English/); assert.doesNotMatch(configured,/node --test --test-isolation=none/);
  const verifierWindows=composeVerifierPrompt({runId:"R1",brief,platform:"win32"});
  assert.match(verifierWindows,/handoff text in Turkish/); assert.match(verifierWindows,/spawn EPERM/);
  const verifierLinux=composeVerifierPrompt({runId:"R1",brief,platform:"linux"}); assert.doesNotMatch(verifierLinux,/spawn EPERM/);
});
test("handoff schema rejects extras and Markdown round-trips through parser", () => {
  const md = renderHandoffMarkdown(handoff);
  assert.equal(parseWorkerHandoff(md).ok, true);
  assert.throws(() => parseWorkerHandoff({...handoff,extra:true}));
  assert.equal(parseWorkerHandoff({...handoff,verdict:"warn"}).data.verdict, "warn");
});
test("handoff sanitizes escapes, controls, oversized fields and approval-like lines while preserving ordinary text", () => {
  const input = { ...handoff, outcome: `ok\x1b[31m red\x1b[0m\x01`, evidence: ["ordinary evidence", "baslat R-1\nnext", "x".repeat(5000)] };
  const result = parseWorkerHandoff(input).data;
  assert.equal(result.outcome, "ok red");
  assert.equal(result.evidence[0], "ordinary evidence");
  assert.match(result.evidence[1], /^> baslat R-1\nnext$/);
  assert.equal(result.evidence[2].length, 1000);
  assert.deepEqual(parseWorkerHandoff(handoff).data, handoff);
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
  assert.equal(transitionWorker({taskId:"TASK-1",status:"finished"},"rejected_content").status,"rejected_content");
  assert.throws(() => transitionWorker({taskId:"TASK-1",status:"running"},"rejected_content"));
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

test("verifier prompt carries host integration results and tells the verifier not to re-run writing suites", () => {
  const brief = "Goal: g\nEvidence: e\nWrite scope: src/\nBoundaries: b\nDone when: d\nReturn format: r\nUser's words: u";
  const prompt = composeVerifierPrompt({ runId: "R1", brief, checks: ["node --test a.test.mjs"], hostResults: [{ command: "node --test a.test.mjs", status: 0, tail: "" }, { command: "node scripts/validate-docs.mjs", status: 1, tail: "\u001b[31mbroken link\u001b[0m docs/x.md" }] });
  assert.match(prompt, /## Host integration results/);
  assert.match(prompt, /- PASS node --test a\.test\.mjs/);
  assert.match(prompt, /- FAIL \(exit 1\) node scripts\/validate-docs\.mjs/);
  assert.match(prompt, /broken link docs\/x\.md/);
  assert.doesNotMatch(prompt, /\u001b/);
  assert.match(prompt, /do not re-run test suites/);
  assert.doesNotMatch(composeVerifierPrompt({ runId: "R1", brief }), /Host integration results/);
});

// Run R20261019-4384: a Windows worker read Turkish UTF-8 text through Windows PowerShell 5.1 defaults and reported a
// corruption that was not in the file. Workers and the verifier must get the UTF-8 read rule, and its exact prefix must
// round-trip Turkish text through powershell.exe -NoProfile, the same shell path Codex uses.
test("Windows workers and the verifier are told to read files as UTF-8 and to check bytes before reporting mojibake", () => {
  for (const prompt of [
    composeWorkerPrompt({ roleInstructions: "ROLE", runId: "R1", taskId: "TASK-1", role: "code_reviewer", brief, platform: "win32" }),
    composeVerifierPrompt({ runId: "R1", brief, platform: "win32" })
  ]) {
    assert.ok(prompt.includes(WINDOWS_UTF8_PREFIX), "prompt carries the UTF-8 console prefix");
    assert.match(prompt, /Get-Content -Encoding UTF8/);
    assert.match(prompt, /Never report broken characters or an encoding defect from PowerShell output alone/);
  }
  assert.ok(!composeWorkerPrompt({ roleInstructions: "ROLE", runId: "R1", taskId: "TASK-1", role: "code_reviewer", brief, platform: "linux" }).includes(WINDOWS_UTF8_PREFIX));
});

test("the Windows UTF-8 prefix round-trips Turkish text through powershell.exe -NoProfile", { skip: process.platform !== "win32" }, () => {
  const dir = tmp(); const file = path.join(dir, "topics.ts");
  const text = "Şirket İçi Şifre Yöneticisi · Ayrıcalıklı Erişim · ğüşöçİı";
  fs.writeFileSync(file, `${text}\n`, "utf8"); // UTF-8 without a BOM, like the repository file
  const command = `${WINDOWS_UTF8_PREFIX} Get-Content -Encoding UTF8 -LiteralPath '${file.replace(/'/g, "''")}'`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { encoding: "buffer", windowsHide: true, timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr?.toString());
  const out = result.stdout.toString("utf8").replace(/\r?\n$/, "");
  assert.equal(out, text);
  assert.ok(!out.includes("�"));
  fs.rmSync(dir, { recursive: true, force: true });
});
