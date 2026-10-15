import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const cli=path.join(root,"scripts/team-run.mjs"), boardCli=path.join(root,"scripts/coordination-board.mjs"), fakeCodex=path.join(root,"scripts/tests/fixtures/fake-codex/fake-codex.cjs");
function node(file,args,options={}) { return spawnSync(process.execPath,[file,...args],{cwd:root,encoding:"utf8",windowsHide:true,...options}); }
function git(cwd,...args) { const result=spawnSync("git",args,{cwd,encoding:"utf8",windowsHide:true}); assert.equal(result.status,0,result.stderr); return result.stdout.trim(); }
function initRepo(dir) { fs.mkdirSync(dir,{recursive:true}); git(dir,"init","-b","main"); git(dir,"config","user.name","AgentChef Test"); git(dir,"config","user.email","agentchef-test@example.invalid"); fs.writeFileSync(path.join(dir,"README.md"),"base\n"); git(dir,"add","README.md"); git(dir,"commit","-m","base"); }
function makeRun(temp,runId,workers,scenario="ok",extraEnv={},setupRepo=()=>{}) {
  const repo=path.join(temp,"repo"),state=path.join(temp,"board.json"); initRepo(repo); setupRepo(repo); assert.equal(node(boardCli,["init","--state",state,"--json"]).status,0);
  const wrapper=path.join(temp,process.platform==="win32"?"fake-codex.cmd":"fake-codex");
  if(process.platform==="win32") fs.writeFileSync(wrapper,`@echo off\r\n"${process.execPath}" "${fakeCodex}" %*\r\nexit /b %ERRORLEVEL%\r\n`);
  else { fs.writeFileSync(wrapper,`#!/bin/sh\nexec node ${JSON.stringify(fakeCodex)} "$@"\n`); fs.chmodSync(wrapper,0o755); }
  const isolatedTemp=path.join(temp,"tmp"); fs.mkdirSync(isolatedTemp);
  const env={...process.env,AGENTCHEF_TEAM_MODE:"experimental",AGENTCHEF_TEAM_CODEX_COMMAND:wrapper,FAKE_CODEX_SCENARIO:scenario,AGENTCHEF_TEAM_PANE:"off",TEMP:isolatedTemp,TMP:isolatedTemp,TMPDIR:isolatedTemp,...extraEnv};
  const brief=path.join(temp,"brief.md"); fs.writeFileSync(brief,["Goal: complete", "Evidence: fixture", "Write scope: src/", "Boundaries: stay in scope", "Done when: collected", "Return format: JSON", "User's words: complete"].join("\n"));
  const plan=path.join(temp,"plan.json"); fs.writeFileSync(plan,JSON.stringify({workers:workers.map(taskId=>({taskId,role:"docs_author",briefFile:"brief.md",writeScope:[extraEnv.FAKE_CODEX_FILE_BY_TASK?`src/${taskId}/`:"src/"]}))}));
  const planned=node(cli,["plan","--state",state,"--json","--repo",repo,"--plan-file",plan,"--run",runId],{env}); assert.equal(planned.status,0,planned.stderr||planned.stdout); return {repo,state,env,run:JSON.parse(planned.stdout).run};
}
function approveStart(state,run) { const dir=path.join(path.dirname(state),"approvals"); fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,`${run.runId}.baslat.json`),JSON.stringify({v:2,taskId:run.runId,runId:run.runId,tur:"baslat",nonce:"test-nonce",approvedAt:new Date().toISOString(),kanal:"sohbet",ajan:"claude",session:"test",kullanildi:"",kullanan:""})); }
async function waitFinished(state,runId,count) { const until=Date.now()+15000; while(Date.now()<until) { const result=node(cli,["status","--state",state,"--json","--run",runId]); assert.equal(result.status,0,result.stderr); const run=JSON.parse(result.stdout).run; if(run.workers.filter(w=>w.status==="finished").length===count) return run; await new Promise(resolve=>setTimeout(resolve,50)); } throw new Error("workers did not finish"); }
async function startRun(state,run,env,count) { approveStart(state,run); const started=node(cli,["start","--state",state,"--json","--run",run.runId],{env}); assert.equal(started.status,0,started.stderr||started.stdout); await waitFinished(state,run.runId,count); }
test("merge rejects the unreachable skip-conflicted option",()=>{
  const result=spawnSync(process.execPath,[path.join(root,"scripts/team-run.mjs"),"merge","--run","R-test","--state","unused.json","--skip-conflicted"],{cwd:root,encoding:"utf8",windowsHide:true});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/merge does not accept --skip-conflicted/);
});
test("collect accepts a worker change whose unchanged fixture context contains secret-like text",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"team-diff-context-")); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const contextLine=`${["to","ken"].join("")}=${"z".repeat(16)}`;
  const {state,env,run}=makeRun(temp,"R-diff-context",["TASK-CONTEXT"],"fixture-context",{FAKE_CODEX_CONTEXT_LINE:contextLine},(repo)=>{ const fixture=path.join(repo,"src","change.txt"); fs.mkdirSync(path.dirname(fixture),{recursive:true}); fs.writeFileSync(fixture,`${contextLine}\nworker original neighbor\n`); git(repo,"add","src/change.txt"); git(repo,"commit","-m","add independent fixture context"); });
  await startRun(state,run,env,1);
  const result=node(cli,["collect","--state",state,"--json","--run",run.runId],{env}); assert.equal(result.status,0,result.stderr||result.stdout); assert.equal(JSON.parse(result.stdout).run.workers[0].status,"collected");
});
test("collect rejects only the worker whose added line is secret-like and continues collecting others",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"team-diff-reject-")); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const {state,env,run}=makeRun(temp,"R-diff-reject",["TASK-SECRET","TASK-SAFE"],"sensitive-output",{FAKE_CODEX_REJECT_TASK:"TASK-SECRET",FAKE_CODEX_FILE_BY_TASK:"1"});
  await startRun(state,run,env,2);
  const result=node(cli,["collect","--state",state,"--json","--run",run.runId],{env}); assert.equal(result.status,4,result.stderr||result.stdout); const workers=JSON.parse(result.stdout).run.workers;
  assert.equal(workers.find(w=>w.taskId==="TASK-SECRET").status,"rejected_content"); assert.match(workers.find(w=>w.taskId==="TASK-SECRET").failure,/src\/TASK-SECRET\/change\.txt:\d+/); assert.doesNotMatch(workers.find(w=>w.taskId==="TASK-SECRET").failure,/[x]{12}/);
  assert.equal(workers.find(w=>w.taskId==="TASK-SAFE").status,"collected");
});
test("collect truncates long worker evidence for the board instead of failing after the delivery commit",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"team-long-evidence-")); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const {state,env,run}=makeRun(temp,"R-long-evidence",["TASK-LONG"],"ok",{FAKE_CODEX_EVIDENCE_CHARS:"3000"});
  await startRun(state,run,env,1);
  const result=node(cli,["collect","--state",state,"--json","--run",run.runId],{env}); assert.equal(result.status,0,result.stderr||result.stdout);
  const worker=JSON.parse(result.stdout).run.workers[0]; assert.equal(worker.status,"collected"); assert.ok(worker.commit);
  const task=JSON.parse(fs.readFileSync(state,"utf8")).tasks.find(item=>item.id==="TASK-LONG"); const evidence=task.evidence.at(-1).text;
  assert.ok(evidence.length<=2000,`board evidence is ${evidence.length} characters`); assert.match(evidence,/\[truncated: \d+ characters; full text in the worker report\]$/);
});
test("collect reuses an existing delivery commit instead of failing the worker for having no changes",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"team-collect-idem-")); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const {state,env,run}=makeRun(temp,"R-collect-idem",["TASK-IDEM"],"ok");
  await startRun(state,run,env,1);
  const worktree=JSON.parse(node(cli,["status","--state",state,"--json","--run",run.runId]).stdout).run.workers[0].worktree;
  git(worktree,"add","-A"); git(worktree,"commit","-m","feat(team-mode): TASK-IDEM worker delivery"); const head=git(worktree,"rev-parse","HEAD");
  const result=node(cli,["collect","--state",state,"--json","--run",run.runId],{env}); assert.equal(result.status,0,result.stderr||result.stdout);
  const collected=JSON.parse(result.stdout).run; const worker=collected.workers[0];
  assert.equal(worker.status,"collected"); assert.equal(worker.commit,head); assert.deepEqual(worker.changedPaths,["src/change.txt"]);
  assert.ok(collected.history.some(item=>item.event==="worker_collected_existing_commit"&&item.taskId==="TASK-IDEM"));
  const repeated=node(cli,["collect","--state",state,"--json","--run",run.runId],{env}); assert.equal(repeated.status,0,repeated.stderr||repeated.stdout); assert.equal(JSON.parse(repeated.stdout).run.workers[0].status,"collected");
});
test("team execution is on by default and AGENTCHEF_TEAM_MODE=off switches it off",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"team-switch-")); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const {state,env,run}=makeRun(temp,"R-switch",["TASK-SWITCH"],"ok");
  const unset={...env}; delete unset.AGENTCHEF_TEAM_MODE;
  const doctor=node(cli,["doctor","--state",state,"--json"],{env:unset}); // doctor exits 4 when any environment check fails (no Windows Terminal in CI); only the execution check matters here
  const execution=JSON.parse(doctor.stdout).checks.find(check=>check.id==="execution"); assert.equal(execution.status,"pass");
  const status=node(cli,["status","--state",state,"--json","--run",run.runId],{env:unset}); assert.equal(status.status,0,status.stderr||status.stdout);
  const off=node(cli,["plan","--state",state,"--json","--repo",path.join(temp,"repo"),"--plan-file",path.join(temp,"plan.json"),"--run","R-switch-off"],{env:{...env,AGENTCHEF_TEAM_MODE:"off"}}); assert.equal(off.status,1,off.stderr||off.stdout);
  assert.match(off.stderr||off.stdout,/team-mode-disabled/);
  const offDoctor=node(cli,["doctor","--state",state,"--json"],{env:{...env,AGENTCHEF_TEAM_MODE:"off"}});
  assert.equal(JSON.parse(offDoctor.stdout).checks.find(check=>check.id==="execution").status,"fail");
  const no=node(cli,["doctor","--state",state,"--json"],{env:{...env,AGENTCHEF_TEAM_MODE:"no"}});
  const noCheck=JSON.parse(no.stdout).checks.find(check=>check.id==="execution"); assert.equal(noCheck.status,"fail"); assert.match(noCheck.details,/unrecognized value treated as off/);
});
test("collect includes committed and dirty paths from a worker delivery",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"team-commit-dirty-")); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const {state,env,run}=makeRun(temp,"R-commit-dirty",["TASK-DIRTY"],"commit-dirty"); await startRun(state,run,env,1);
  const result=node(cli,["collect","--state",state,"--json","--run",run.runId],{env}); assert.equal(result.status,0,result.stderr||result.stdout);
  assert.deepEqual(JSON.parse(result.stdout).run.workers[0].changedPaths.sort(),["src/change.txt","src/dirty.txt"]);
});
test("start refuses changed persisted briefs after planning",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"team-plan-hash-")); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const {state,env,run}=makeRun(temp,"R-plan-hash",["TASK-HASH"]); approveStart(state,run);
  const brief=path.join(path.dirname(state),"team-runs",run.runId,"briefs","TASK-HASH.md"); fs.appendFileSync(brief,"\nchanged after plan\n");
  const result=node(cli,["start","--state",state,"--json","--run",run.runId],{env}); assert.equal(result.status,1); assert.match(result.stderr||result.stdout,/plan changed after approval; plan again/);
});
test("plan rejects brief files that resolve outside its directory",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"team-plan-brief-path-")); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const {state,env}=makeRun(temp,"R-brief-path",["TASK-PATH"]);
  const plan=path.join(temp,"plan.json"), external=path.join(path.dirname(temp),`${path.basename(temp)}-outside.md`); t.after(()=>{ if(fs.existsSync(external)) fs.unlinkSync(external); }); fs.copyFileSync(path.join(temp,"brief.md"),external);
  fs.writeFileSync(plan,JSON.stringify({workers:[{taskId:"TASK-PATH",role:"docs_author",briefFile:"../outside.md",writeScope:["src/"]}]}));
  const result=node(cli,["plan","--state",state,"--json","--repo",path.join(temp,"repo"),"--plan-file",plan,"--run","R-brief-path-2"],{env}); assert.notEqual(result.status,0); assert.match(result.stderr||result.stdout,/must stay inside the plan directory/);
});
test("doctor treats a missing prior run as informational and reports the board and the approval writer", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-doctor-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const { state, env } = makeRun(temp, "R-doctor", ["TASK-DOC"], "ok");
  const home = path.join(temp, "home"); fs.mkdirSync(path.join(home, ".beyin"), { recursive: true });
  const homeEnv = { ...env, USERPROFILE: home, HOME: home };
  const parse = (result) => Object.fromEntries(JSON.parse(result.stdout).checks.map((check) => [check.id, check]));
  let checks = parse(node(cli, ["doctor", "--state", state, "--json"], { env: homeEnv }));
  assert.equal(checks["last-run"].status, "pass");
  assert.equal(checks.board.status, "pass");
  assert.equal(checks["approval-writer"].status, "fail");
  assert.match(checks["approval-writer"].details, /dual-agent-brain/);
  const vault = path.join(temp, "vault"); fs.mkdirSync(path.join(vault, "motor", "scripts", ".state"), { recursive: true });
  fs.writeFileSync(path.join(home, ".beyin", "vault.txt"), vault);
  checks = parse(node(cli, ["doctor", "--state", state, "--json"], { env: homeEnv }));
  assert.equal(checks["approval-writer"].status, "fail");
  assert.match(checks["approval-writer"].details, /not Beyin's/);
  const beyinState = path.join(vault, "motor", "scripts", ".state", "board.json"); fs.copyFileSync(state, beyinState);
  checks = parse(node(cli, ["doctor", "--state", beyinState, "--json"], { env: homeEnv }));
  assert.equal(checks["approval-writer"].status, "pass");
  checks = parse(node(cli, ["doctor", "--state", path.join(temp, "missing.json"), "--json"], { env: homeEnv }));
  assert.equal(checks.board.status, "fail");
  assert.match(checks.board.details, /coordination-board init/);
});
test("resume continues a usage-limited run on the saved Codex thread",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"team-resume-")); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const log=path.join(temp,"resume.log");
  const {state,env,run}=makeRun(temp,"R-resume",["TASK-RES"],"usage-limit",{FAKE_CODEX_RESUME_LOG:log});
  approveStart(state,run); assert.equal(node(cli,["start","--state",state,"--json","--run",run.runId],{env}).status,0);
  const until=Date.now()+20000; let paused=null;
  while(Date.now()<until){ const r=JSON.parse(node(cli,["status","--state",state,"--json","--run",run.runId]).stdout).run; if(r.status==="paused"&&!r.supervisor?.heartbeatAt||r.status==="paused"&&r.workers[0].status==="paused_limit"){ paused=r; break; } await new Promise(res=>setTimeout(res,100)); }
  assert.ok(paused,"run did not pause on the usage limit"); assert.equal(paused.workers[0].codexThreadId,"fake-thread-limit");
  const pausedStatus=JSON.parse(node(cli,["status","--state",state,"--json","--run",run.runId]).stdout); assert.ok(Date.parse(pausedStatus.resumeAt)>Date.now(),"paused status carries resumeAt");
  const waitFlag=node(cli,["resume","--state",state,"--json","--wait","--run","R-missing"],{env}); assert.notEqual(waitFlag.status,0); assert.doesNotMatch(waitFlag.stderr||waitFlag.stdout,/does not accept --wait/);
  const notPaused=node(cli,["resume","--state",state,"--json","--run","R-missing"],{env}); assert.notEqual(notPaused.status,0);
  let resumed=null; for(let i=0;i<100&&!resumed;i++){ const r=node(cli,["resume","--state",state,"--json","--run",run.runId],{env:{...env,FAKE_CODEX_SCENARIO:"ok"}}); if(r.status===0) resumed=JSON.parse(r.stdout); else { assert.match(r.stderr||r.stdout,/supervisor is still running/); await new Promise(res=>setTimeout(res,100)); } }
  assert.ok(resumed,"resume never succeeded"); assert.deepEqual(resumed.resumed,["TASK-RES"]);
  await waitFinished(state,run.runId,1);
  assert.match(fs.readFileSync(log,"utf8"),/TASK-RES fake-thread-limit/);
  const finalRun=JSON.parse(node(cli,["status","--state",state,"--json","--run",run.runId]).stdout).run; assert.ok(finalRun.history.some(item=>item.event==="resumed"));
  const again=node(cli,["resume","--state",state,"--json","--run",run.runId],{env}); assert.notEqual(again.status,0); assert.match(again.stderr||again.stdout,/Only a paused run can be resumed/);
});
test("resume recovers a running run whose supervisor and worker died (crash, sleep or restart)",async(t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"team-recover-")); t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const log=path.join(temp,"resume.log");
  const {state,env,run}=makeRun(temp,"R-recover",["TASK-REC"],"usage-limit",{FAKE_CODEX_RESUME_LOG:log});
  approveStart(state,run); assert.equal(node(cli,["start","--state",state,"--json","--run",run.runId],{env}).status,0);
  const file=path.join(path.dirname(state),"team-runs",`${run.runId}.json`);
  const alive=(pid)=>{ if(!Number.isInteger(pid)) return false; try { process.kill(pid,0); return true; } catch { return false; } };
  const until=Date.now()+20000; let paused=null;
  while(Date.now()<until){ const r=JSON.parse(fs.readFileSync(file,"utf8")); if(r.status==="paused"&&r.workers[0].status==="paused_limit"&&!alive(r.supervisor?.pid)){ paused=r; break; } await new Promise(res=>setTimeout(res,100)); }
  assert.ok(paused,"run did not pause with its supervisor stopped");
  const crashed={...paused,status:"running",supervisor:{pid:null,createdAt:null,heartbeatAt:new Date(Date.now()-5*60_000).toISOString()},workers:[{...paused.workers[0],status:"running",pid:null,processCreatedAt:null}]};
  fs.writeFileSync(file,JSON.stringify({...crashed,supervisor:{...crashed.supervisor,heartbeatAt:new Date().toISOString()}}));
  const early=node(cli,["resume","--state",state,"--json","--run",run.runId],{env}); assert.notEqual(early.status,0); assert.match(early.stderr||early.stdout,/supervisor is still running/);
  fs.writeFileSync(file,JSON.stringify({...crashed,workers:[{...crashed.workers[0],pid:process.pid,processCreatedAt:null}]}));
  const liveWorker=node(cli,["resume","--state",state,"--json","--run",run.runId],{env}); assert.notEqual(liveWorker.status,0); assert.match(liveWorker.stderr||liveWorker.stdout,/still running without a supervisor/);
  fs.writeFileSync(file,JSON.stringify(crashed));
  const recovered=node(cli,["resume","--state",state,"--json","--run",run.runId],{env:{...env,FAKE_CODEX_SCENARIO:"ok"}});
  assert.equal(recovered.status,0,recovered.stderr||recovered.stdout); const out=JSON.parse(recovered.stdout);
  assert.equal(out.recovered,true); assert.deepEqual(out.resumed,["TASK-REC"]);
  const twice=node(cli,["resume","--state",state,"--json","--run",run.runId],{env}); assert.notEqual(twice.status,0); assert.match(twice.stderr||twice.stdout,/supervisor is still running|Only a paused run|changed while resuming/);
  await waitFinished(state,run.runId,1);
  assert.match(fs.readFileSync(log,"utf8"),/TASK-REC fake-thread-limit/);
  const finalRun=JSON.parse(node(cli,["status","--state",state,"--json","--run",run.runId]).stdout).run; assert.ok(finalRun.history.some(item=>item.event==="recovered"));
});
test("integrate --recheck is accepted and refuses anything but a failed integration",()=>{
  const missing=node(cli,["integrate","--recheck","--state","unused.json","--json","--run","R-missing"]); assert.notEqual(missing.status,0); assert.doesNotMatch(missing.stderr||missing.stdout,/does not accept --recheck/);
});
test("integrate --recheck --covers is accepted and validates its target",()=>{
  const bad=node(cli,["integrate","--recheck","--covers","TASK-X","--state","unused.json","--json","--run","R-missing"]); assert.notEqual(bad.status,0); assert.doesNotMatch(bad.stderr||bad.stdout,/does not accept --covers/);
});
