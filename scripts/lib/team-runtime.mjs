import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { secretLikeCategory } from "./secret-classifier.mjs";
import { parseBrief, parseHandoff } from "./agent-brief.mjs";
import * as board from "./coordination-runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT,"catalog/subscription-team-mode.json"),"utf8"));
const AGENTS = JSON.parse(fs.readFileSync(path.join(ROOT,"catalog/agents.json"),"utf8"));
const RUN_MOVES = { planned:["running","aborted","failed"], running:["paused","collected","aborted","failed"], paused:["running","aborted","failed"], collected:["integrated","aborted","failed"], integrated:["verified","aborted","failed"], verified:["merged","aborted","failed"], merged:[], aborted:[], failed:[] };
const WORKER_MOVES = { planned:["queued","aborted"], queued:["spawning","aborted","failed"], spawning:["running","failed","aborted"], running:["finished","failed","paused_limit","timed_out","aborted"], finished:["collected","scope_violation"], collected:["integrated","conflict"], paused_limit:["queued","aborted"], timed_out:[], failed:[], aborted:[], scope_violation:[], integrated:[], conflict:[] };
const fail = (message) => { throw new Error(message); };
const clone = (value) => structuredClone(value);
export function loadTeamContract(file = path.join(ROOT,"catalog/subscription-team-mode.json")) { return JSON.parse(fs.readFileSync(file,"utf8")); }
function sandboxRank(mode) { return ({"read-only":0,"workspace-write":1})[mode] ?? -1; }
export function effectiveSandbox(role, roleMode, contract = CONTRACT) {
  const ceiling = contract.execution?.roleModeCeilings?.[role];
  if (!ceiling || sandboxRank(ceiling) < 0) fail(`Unknown team role or sandbox ceiling: ${role}.`);
  if (roleMode === "danger-full-access") fail("danger-full-access is forbidden for team workers.");
  if (sandboxRank(roleMode) < 0) fail(`Unsupported role sandbox mode for ${role}.`);
  return sandboxRank(roleMode) < sandboxRank(ceiling) ? roleMode : ceiling;
}
export function maxConcurrency(contract = CONTRACT, requested = contract.workers.maxWorkers, env = process.env.AGENTCHEF_TEAM_MAX_WORKERS) {
  const parsed = Number(env);
  const cap = env == null || env === "" || !Number.isInteger(parsed) || parsed < 1 ? contract.workers.maxWorkers : parsed;
  const want = Number(requested);
  return Math.max(1, Math.min(contract.workers.maxWorkers, cap, Number.isFinite(want) ? Math.floor(want) : contract.workers.maxWorkers));
}
function catalogAgent(role) { return AGENTS.agents.find((entry) => entry.name === role); }
export function readRoleToml(role) {
  const agent = catalogAgent(role);
  if (!agent || !CONTRACT.workers.allowedRoleIds.includes(role)) fail(`Unknown or disallowed worker role: ${role}.`);
  const file = path.join(ROOT,"templates/codex",agent.configFile.replace(/^agents\//,"agents/"));
  const text = fs.readFileSync(file,"utf8");
  const get = (key) => text.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`,"m"))?.[1] ?? null;
  const block = text.match(/developer_instructions\s*=\s*"""([\s\S]*?)"""/);
  return { developerInstructions:block?.[1]?.trim() ?? "", sandboxMode:get("sandbox_mode"), model:get("model") ?? AGENTS.workerModels.codex, configFile:agent.configFile };
}
export function readRunRecord(file) { const r=JSON.parse(fs.readFileSync(file,"utf8")); if(r.schemaVersion!==1||!Number.isInteger(r.revision)||!r.runId) fail("Invalid team run record."); return r; }
export function writeRunRecord(file, record) {
  const current = fs.existsSync(file) ? readRunRecord(file) : null;
  if (current && current.revision !== record.revision) { const e=new Error(`Run record revision conflict (${record.revision} -> ${current.revision}).`); e.code="TEAM_RUN_CONFLICT"; throw e; }
  fs.mkdirSync(path.dirname(file),{recursive:true}); const next={...record,revision:(record.revision??0)+1};
  const temp=`${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temp,`${JSON.stringify(next,null,2)}\n`,{flag:"wx"}); fs.renameSync(temp,file); }
  finally { try { fs.rmSync(temp,{force:true}); } catch {} }
  return next;
}
export function updateRunRecord(file, mutator) { const lock=board.acquireCoordinationStateLock(file); try { const r=readRunRecord(file); const n=mutator(clone(r)); return writeRunRecord(file,n); } finally { lock.release(); } }
export function readApproval(stateDir, runId, type) {
  if(!["baslat","birlestir"].includes(type)) fail("Unknown approval type.");
  const file=path.join(stateDir,"approvals",`${runId}.${type}.json`); try { return JSON.parse(fs.readFileSync(file,"utf8")); } catch(e) { if(e.code==="ENOENT") return null; throw e; }
}
export function approvalIsValid(approval, {runId,tur,plannedAt,now=Date.now()}={}) {
  if(!approval||!runId||!tur) return false;
  const approved=Date.parse(approval.approvedAt), planned=Date.parse(plannedAt), current=Date.parse(now);
  return approval.v===2&&approval.taskId===runId&&approval.runId===runId&&(!approval.tur||approval.tur===tur)&&!approval.kullanildi&&Number.isFinite(approved)&&Number.isFinite(planned)&&Number.isFinite(current)&&approved>planned&&approved<=current&&current-approved<=7*86400000;
}
export function consumeApproval(file, consumer) {
  const a=JSON.parse(fs.readFileSync(file,"utf8")); if(a.kullanildi) fail("Approval has already been consumed.");
  const n={...a,kullanildi:new Date().toISOString(),kullanan:String(consumer)}; const t=`${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(t,JSON.stringify(n,null,2),{flag:"wx"}); fs.renameSync(t,file); } finally { try{fs.rmSync(t,{force:true});}catch{} }
  return n;
}
export function assertTeamTextSafe(text) { const category=secretLikeCategory(String(text??"")); if(category) fail(`Team content contains a ${category} and was rejected.`); return String(text??""); }
const BRIEF_KEYS=["goal","evidence","scope","boundaries","doneWhen","returnFormat","userWords"];
function formatBrief(brief) {
  let values=brief;
  if(typeof brief === "string") { const parsed=parseBrief(brief); if(!parsed.ok) fail(`Brief missing fields: ${parsed.missing.join(", ")}.`); values=parsed.fields; }
  if(!values||BRIEF_KEYS.some((k)=>!String(values[k]??"").trim())) fail("Brief must provide all seven required fields.");
  for(const k of BRIEF_KEYS) assertTeamTextSafe(values[k]);
  const labels={goal:"Goal",evidence:"Evidence",scope:"Write scope",boundaries:"Boundaries",doneWhen:"Done when",returnFormat:"Return format",userWords:"User's words"};
  return BRIEF_KEYS.map(k=>`### ${labels[k]}\n${values[k]}`).join("\n\n");
}
const TEAM_RULES=`## Team rules\n- Work only in your assigned worktree and write scope.\n- Do not commit, push, checkout, create worktrees, or create branches.\n- Do not spawn agents; if needed, write needs: <role> - <why>.\n- Do not install packages or change global settings.\n- Never print, repeat, or persist secrets.\n- Your final response must be only JSON matching the output schema.`;
export function composeWorkerPrompt({roleInstructions="",runId,taskId,role,brief}) {
  for(const x of [roleInstructions,runId,taskId,role]) assertTeamTextSafe(x);
  const parsed=parseBrief(typeof brief==="string"?brief:BRIEF_KEYS.map(k=>`${({goal:"Goal",evidence:"Evidence",scope:"Write scope",boundaries:"Boundaries",doneWhen:"Done when",returnFormat:"Return format",userWords:"User's words"})[k]}: ${brief?.[k]??""}`).join("\n"));
  if(!parsed.ok) fail(`Brief missing fields: ${parsed.missing.join(", ")}.`);
  return [roleInstructions.trim(),`# Team run ${runId} - ${taskId} (${role})`,`## Brief\n${formatBrief(parsed.fields)}`,TEAM_RULES,`## Return contract\nReturn exactly: outcome, evidence[], changedScope[], risks[], openQuestions[], needs[{role,why}], nextVerification, verdict (pass|partial|blocked|fail), mutationCheck{claimedPaths[],outsideScope}.`].filter(Boolean).join("\n\n");
}
export function composeVerifierPrompt({runId,brief,checks=[]}) { return [`# Team run ${runId} verification`,`## Brief\n${formatBrief(typeof brief==="string"?parseBrief(brief).fields:brief)}`,"Verify independently in read-only mode. Do not edit files.",`Checks: ${checks.join(", ")}`].join("\n\n"); }
export function parseWorkerHandoff(value) {
  let data=value;
  if(typeof value==="string") { const fenced=value.match(/```(?:json)?\s*([\s\S]*?)```/i); try { data=JSON.parse(fenced?.[1]??value); } catch { const p=parseHandoff(value); return {ok:p.ok,fields:p.fields,missing:p.missing}; } }
  const keys=["outcome","evidence","changedScope","risks","openQuestions","needs","nextVerification","verdict","mutationCheck"];
  const valid=data&&Object.keys(data).length===keys.length&&keys.every(k=>Object.hasOwn(data,k))&&["pass","partial","blocked","fail"].includes(data.verdict)&&["evidence","changedScope","risks","openQuestions","needs"].every(k=>Array.isArray(data[k]))&&data.needs.every(n=>n&&Object.keys(n).length===2&&n.role&&n.why)&&data.mutationCheck&&Object.keys(data.mutationCheck).length===2&&Array.isArray(data.mutationCheck.claimedPaths)&&Array.isArray(data.mutationCheck.outsideScope);
  if(!valid) fail("Worker handoff does not match the strict handoff schema.");
  for(const v of [data.outcome,data.nextVerification,...data.evidence,...data.changedScope,...data.risks,...data.openQuestions,...data.needs.flatMap(x=>[x.role,x.why]),...data.mutationCheck.claimedPaths,...data.mutationCheck.outsideScope]) assertTeamTextSafe(v);
  return {ok:true,data};
}
export function renderHandoffMarkdown(h) {
  const {data}=parseWorkerHandoff(h); const lines=[`## Outcome\n${data.outcome}`,`## Evidence\n${data.evidence.map(x=>`- ${x}`).join("\n")||"- None"}`,`## Changed scope\n${data.changedScope.map(x=>`- ${x}`).join("\n")||"- None"}`,`## Risks\n${data.risks.map(x=>`- ${x}`).join("\n")||"- None"}`,`## Open questions\n${data.openQuestions.map(x=>`- ${x}`).join("\n")||"- None"}`,`## Next verification\n${data.nextVerification}`,`Verdict: ${data.verdict}`,`## Mutation check\nClaimed paths: ${data.mutationCheck.claimedPaths.join(", ")}\nOutside scope: ${data.mutationCheck.outsideScope.join(", ")||"none"}`];
  return lines.join("\n\n");
}
export function currentBranch(cwd=ROOT) { return execFileSync("git",["branch","--show-current"],{cwd,encoding:"utf8"}).trim(); }
export function headCommit(cwd=ROOT) { return execFileSync("git",["rev-parse","HEAD"],{cwd,encoding:"utf8"}).trim(); }
export function isClean(cwd=ROOT) { return execFileSync("git",["status","--porcelain"],{cwd,encoding:"utf8"}).trim()===""; }
function git(args,cwd=ROOT) { return execFileSync("git",args,{cwd,encoding:"utf8",stdio:["ignore","pipe","pipe"]}); }
export const worktreeAdd=(repo,dir,branch)=>git(["worktree","add","-b",branch,dir],repo);
export const worktreeRemove=(repo,dir)=>git(["worktree","remove",dir],repo);
export const branchDelete=(repo,branch)=>git(["branch","-D",branch],repo);
export const mergeNoFf=(repo,branch)=>git(["merge","--no-ff",branch],repo);
export const mergeAbort=(repo)=>git(["merge","--abort"],repo);
export const diffStat=(cwd=ROOT)=>git(["diff","--stat"],cwd);
export const diffFull=(cwd=ROOT)=>git(["diff"],cwd);
export function changedPaths(cwd=ROOT) { const b=execFileSync("git",["status","--porcelain","-z"],{cwd,encoding:"buffer"}); return b.toString("utf8").split("\0").filter(Boolean).map(x=>x.slice(3)); }
export function commitAll(cwd=ROOT,message) { git(["add","-A"],cwd); return git(["commit","-m",message],cwd); }
const mutate=(statePath,fn)=>{const lock=board.acquireCoordinationStateLock(statePath);try{const s=board.readState(statePath);const result=fn(s);board.writeState(statePath,s);return result;}finally{lock.release();}};
export const createTask=(p,i)=>mutate(p,s=>board.createTask(s,i));
export const setBrief=(p,i)=>mutate(p,s=>board.setBrief(s,i));
export const assignTask=(p,i)=>mutate(p,s=>board.assignTask(s,i));
export const renewLease=(p,i)=>mutate(p,s=>board.renewLease(s,i));
export const transitionTask=(p,i)=>mutate(p,s=>board.transitionTask(s,i));
export const addEvidence=(p,i)=>mutate(p,s=>board.addEvidence(s,i));
export const attachReport=(p,i)=>mutate(p,s=>board.attachReport(s,i));
export function collectUsage(workers=[]) { return workers.reduce((sum,w)=>{for(const k of ["input_tokens","cached_input_tokens","output_tokens","turns"]) sum[k]=(sum[k]??0)+(Number(w.usage?.[k])||0); return sum;},{}); }
export { RUN_MOVES, WORKER_MOVES };
export function transitionRun(run,status) { if(!RUN_MOVES[run.status]?.includes(status)) fail(`Invalid run transition: ${run.status} -> ${status}.`); return {...run,status}; }
export function transitionWorker(worker,status) { if(!WORKER_MOVES[worker.status]?.includes(status)) fail(`Invalid worker transition: ${worker.status} -> ${status}.`); return {...worker,status}; }
