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
  const plan=path.join(temp,"plan.json"); fs.writeFileSync(plan,JSON.stringify({workers:workers.map(taskId=>({taskId,role:"docs_author",briefFile:"brief.md",writeScope:["src/"]}))}));
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
  const {state,env,run}=makeRun(temp,"R-diff-reject",["TASK-SECRET","TASK-SAFE"],"sensitive-output",{FAKE_CODEX_SECRET_TASK:"TASK-SECRET"});
  await startRun(state,run,env,2);
  const result=node(cli,["collect","--state",state,"--json","--run",run.runId],{env}); assert.equal(result.status,4,result.stderr||result.stdout); const workers=JSON.parse(result.stdout).run.workers;
  assert.equal(workers.find(w=>w.taskId==="TASK-SECRET").status,"rejected_content"); assert.match(workers.find(w=>w.taskId==="TASK-SECRET").failure,/src\/change\.txt:\d+/); assert.doesNotMatch(workers.find(w=>w.taskId==="TASK-SECRET").failure,/[x]{12}/);
  assert.equal(workers.find(w=>w.taskId==="TASK-SAFE").status,"collected");
});
