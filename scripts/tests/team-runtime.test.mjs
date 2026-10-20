import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  acquireTeamOperationLock, consumeApprovalWith, effectiveSandbox, maxConcurrency, readApproval, approvalIsValid, consumeApproval,
  assertTeamTextSafe, composeWorkerPrompt, composeVerifierPrompt, parseWorkerHandoff,
  renderHandoffMarkdown, writeRunRecord, readRunRecord, transitionRun, transitionWorker,
  readRoleToml, WINDOWS_TEXT_READS
} from "../lib/team-runtime.mjs";
import { spawnSync } from "node:child_process";
import { handoffWarnings, quotedNativeCalls } from "../lib/team-warnings.mjs";

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

// Runs R20261019-4384, R20261019-cffa and R20261019-9b83: Codex runs worker commands through Windows PowerShell 5.1 in
// its sandbox's ConstrainedLanguage mode. Cmdlet output garbles Turkish text, .NET calls fail, and double quotes inside
// native arguments are dropped. Workers and the verifier must be told to read with quote-free native forms only, and
// every form the rule names must return Turkish text intact under ConstrainedLanguage mode.
test("Windows workers and the verifier read file text with quote-free native forms only", () => {
  for (const form of WINDOWS_TEXT_READS) assert.ok(!form.includes("\""), `${form} must not contain a double quote`);
  for (const prompt of [
    composeWorkerPrompt({ roleInstructions: "ROLE", runId: "R1", taskId: "TASK-1", role: "code_reviewer", brief, platform: "win32" }),
    composeVerifierPrompt({ runId: "R1", brief, platform: "win32" })
  ]) {
    for (const form of WINDOWS_TEXT_READS) assert.ok(prompt.includes(form), `prompt names ${form}`);
    assert.match(prompt, /ConstrainedLanguage mode/);
    assert.match(prompt, /a double quote inside an argument to a native program is dropped/);
    assert.match(prompt, /never put a double quote in a command argument, and do not use `node -e`/);
    assert.match(prompt, /Never report broken characters or an encoding defect unless one of these reads shows it/);
    assert.doesNotMatch(prompt, /OutputEncoding=|Get-Content -Encoding UTF8`|such as git, cat, and Get-Content/, "no advice that fails or garbles in the sandbox");
  }
  assert.ok(!composeWorkerPrompt({ roleInstructions: "ROLE", runId: "R1", taskId: "TASK-1", role: "code_reviewer", brief, platform: "linux" }).includes(WINDOWS_TEXT_READS[0]));
});

test("every read form named in the Windows rule returns Turkish text intact under ConstrainedLanguage mode", { skip: process.platform !== "win32" }, () => {
  const dir = fs.mkdtempSync(path.join(os.homedir(), "agentchef-clm-")); // git refuses some temp roots; home is safe and removed below
  try {
    const text = "Kendi Sunucunda Barındırma · Şifre Yöneticisi · Ayrıcalıklı Erişim · ğüşöçİı";
    const body = `const topics = [\n  {\n    key: "guide-self-hosted", title: "${text}",\n  },\n];\n`;
    const run = (args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", `core.hooksPath=${path.join(dir, "no-hooks")}`, ...args], { cwd: dir, encoding: "utf8", windowsHide: true });
    run(["init", "-q"]); fs.writeFileSync(path.join(dir, "topics.ts"), body, "utf8"); run(["add", "topics.ts"]); run(["commit", "-qm", "fixture"]);
    const clm = "$ExecutionContext.SessionState.LanguageMode='ConstrainedLanguage';";
    const shell = (command) => spawnSync("powershell.exe", ["-NoProfile", "-Command", `${clm} ${command}`], { cwd: dir, encoding: "buffer", windowsHide: true, timeout: 60_000 });
    assert.equal(shell("$ExecutionContext.SessionState.LanguageMode").stdout.toString().trim(), "ConstrainedLanguage");
    for (const form of WINDOWS_TEXT_READS.map((item) => item.replaceAll("<word>", "guide-self-hosted").replaceAll("<path>", "topics.ts"))) {
      const result = shell(form);
      const out = result.stdout.toString("utf8");
      assert.equal(result.status, 0, `${form}: ${result.stderr.toString()}`);
      assert.ok(out.includes(text), `${form} returned ${JSON.stringify(out.slice(0, 120))}`);
      assert.ok(!out.includes("�"), form);
    }
    // The two traps the rule names stay real in this mode; if either ever passes, the rule can be relaxed.
    assert.equal(shell("rg -n 'key: \"guide-self-hosted\"' topics.ts").status, 1, "a double quote inside a native argument is dropped");
    assert.ok(!shell("Get-Content -Encoding UTF8 topics.ts").stdout.toString("utf8").includes(text), "Get-Content output is garbled");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Collect-time warnings. The command strings follow the exact shape Codex logged in runs R20261019-d4cb and -9b83.
test("quoted rg and node -e calls are found in a worker's command log", () => {
  const ps = "\"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\"";
  const event = (command, exit) => JSON.stringify({ type: "item.completed", item: { type: "command_execution", command, exit_code: exit } });
  const log = [
    event(`${ps} -Command "rg -n -F -A 145 'key: \\"guide-pam\\"' src/content/topics.ts"`, 1),
    event(`${ps} -Command 'rg -n -F guide-pam src/content/topics.ts'`, 0),
    event(`${ps} -Command "node -e \\"console.log(1)\\""`, 0),
    event(`${ps} -NoProfile -Command 'git show HEAD:src/content/topics.ts'`, 0),
    JSON.stringify({ type: "item.started", item: { type: "command_execution", command: `${ps} -Command "rg -n 'a \\"b\\"' x"` } }),
    "not json"
  ].join("\n");
  assert.deepEqual(quotedNativeCalls(log), [{ kind: "quoted-rg", exitCode: 1 }, { kind: "node-e", exitCode: 0 }]);
});

test("a report that says its findings are listed must name at least one line", () => {
  const base = { evidence: [], risks: [], openQuestions: [], verdict: "warn", outcome: "Bunları aşağıda alan ve satır numarasıyla belirttim." };
  assert.equal(handoffWarnings(base).length, 1, "TASK-VP-TR52: nothing listed");
  assert.equal(handoffWarnings({ ...base, evidence: ["Tam blok `src/content/topics.ts:3979–4059` arasında."] }).length, 1, "a block range is not a finding");
  assert.equal(handoffWarnings({ ...base, evidence: ["`src/content/topics.ts:4337` — Alan: `lead`. Öneri: ..."] }).length, 0, "TASK-VP-TR54 form");
  assert.equal(handoffWarnings({ ...base, evidence: ["Bulgu — `sections[1].body`, satır 4864: ..."] }).length, 0, "TASK-VP-TR57 form");
  assert.equal(handoffWarnings({ ...base, evidence: ["finding: guide text reads like a translation"] }).length, 0);
  assert.equal(handoffWarnings({ ...base, verdict: "pass" }).length, 0, "a passing report claims nothing missing");
  assert.equal(handoffWarnings({ ...base, outcome: "No issues found." }).length, 0);
  assert.match(composeWorkerPrompt({ roleInstructions: "ROLE", runId: "R1", taskId: "TASK-1", role: "code_reviewer", brief }), /`<path>:<line> - <issue> - <suggestion>`/);
});
