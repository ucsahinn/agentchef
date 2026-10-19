import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { secretLikeCategory } from "./secret-classifier.mjs";
import { parseBrief, parseHandoff } from "./agent-brief.mjs";
import * as board from "./coordination-runtime.mjs";
import { isProcessAlive, processCreatedAt } from "./codex-exec.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT,"catalog/subscription-team-mode.json"),"utf8"));
const AGENTS = JSON.parse(fs.readFileSync(path.join(ROOT,"catalog/agents.json"),"utf8"));
const RUN_MOVES = { planned:["running","aborted","failed"], running:["paused","collected","aborted","failed"], paused:["running","collected","aborted","failed"], collected:["integrated","aborted","failed"], integrated:["verified","aborted","failed"], verified:["merged","aborted","failed"], merged:[], aborted:[], failed:[] };
const WORKER_MOVES = { planned:["queued","aborted"], queued:["spawning","aborted","failed"], spawning:["running","failed","aborted","queued"], running:["finished","failed","paused_limit","timed_out","aborted","queued"], finished:["collected","scope_violation","failed","rejected_content"], collected:["integrated","conflict"], paused_limit:["queued","aborted"], timed_out:[], failed:[], aborted:[], scope_violation:[], integrated:[], conflict:[], rejected_content:[] };
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
  try { fs.writeFileSync(temp,`${JSON.stringify(next,null,2)}\n`,{flag:"wx"}); board.replaceFileSync(temp,file); }
  finally { try { fs.rmSync(temp,{force:true}); } catch {} }
  return next;
}
export function updateRunRecord(file, mutator) { const lock=board.acquireCoordinationStateLock(file); try { const r=readRunRecord(file); const n=mutator(clone(r)); return writeRunRecord(file,n); } finally { lock.release(); } }
export function acquireTeamOperationLock(file) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  for(let attempt=0;attempt<2;attempt+=1) {
    const nonce=crypto.randomUUID(), lockedAt=new Date().toISOString();
    let fd;
    try { fd=fs.openSync(file,"wx"); }
    catch(error) {
      if(error.code!=="EEXIST"||attempt!==0) throw error;
      let owner; try { owner=JSON.parse(fs.readFileSync(file,"utf8")); } catch {}
      const current=owner?.pid&&Number.isInteger(owner.pid)?processCreatedAt(owner.pid):null;
      const stale=Boolean(owner?.pid&&((owner.createdAt&&current&&current!==owner.createdAt)||!isProcessAlive(owner.pid)));
      if(!stale) throw error;
      try { fs.rmSync(file); } catch { throw error; }
      continue;
    }
    try { fs.writeFileSync(fd,JSON.stringify({pid:process.pid,createdAt:processCreatedAt(process.pid),lockedAt,nonce})); }
    catch(error) { try { fs.closeSync(fd); } catch {} try { if(JSON.parse(fs.readFileSync(file,"utf8")).nonce===nonce) fs.rmSync(file); } catch {} throw error; }
    fs.closeSync(fd);
    return { nonce, lockedAt, release() { try { if(JSON.parse(fs.readFileSync(file,"utf8")).nonce===nonce) fs.rmSync(file); } catch {} } };
  }
  throw new Error("Could not acquire team operation lock.");
}
export function readApproval(stateDir, runId, type) {
  if(!["baslat","birlestir"].includes(type)) fail("Unknown approval type.");
  const file=path.join(stateDir,"approvals",`${runId}.${type}.json`); try { return JSON.parse(fs.readFileSync(file,"utf8")); } catch(e) { if(e.code==="ENOENT"||e instanceof SyntaxError) return null; throw e; }
}
export function approvalIsValid(approval, {runId,tur,plannedAt,now=Date.now()}={}) {
  if(!approval||!runId||!tur) return false;
  const approved=Date.parse(approval.approvedAt), planned=Date.parse(plannedAt), current=typeof now === "number" ? now : Date.parse(now);
  return approval.v===2&&approval.taskId===runId&&approval.runId===runId&&approval.tur===tur&&Boolean(approval.nonce)&&!approval.kullanildi&&Number.isFinite(approved)&&Number.isFinite(planned)&&Number.isFinite(current)&&approved>planned&&approved<=current&&current-approved<=7*86400000;
}
export function consumeApproval(file, consumer) {
  const lock=board.acquireCoordinationStateLock(file);
  try {
    const a=JSON.parse(fs.readFileSync(file,"utf8")); if(a.kullanildi) fail("Approval has already been consumed.");
    const n={...a,kullanildi:new Date().toISOString(),kullanan:String(consumer)}; const t=`${file}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(t,JSON.stringify(n,null,2),{flag:"wx"}); board.replaceFileSync(t,file); } finally { try{fs.rmSync(t,{force:true});}catch{} }
    return n;
  } finally { lock.release(); }
}
export function consumeApprovalWith(file, consumer, commit) {
  const lock=board.acquireCoordinationStateLock(file);
  try {
    const original=fs.readFileSync(file,"utf8"), approval=JSON.parse(original);
    if(approval.kullanildi) fail("Approval has already been consumed.");
    const consumed={...approval,kullanildi:new Date().toISOString(),kullanan:String(consumer)};
    const write=(value)=>{const temp=`${file}.${crypto.randomUUID()}.tmp`;try{fs.writeFileSync(temp,value,{flag:"wx"});board.replaceFileSync(temp,file);}finally{try{fs.rmSync(temp,{force:true});}catch{}}};
    write(`${JSON.stringify(consumed,null,2)}\n`);
    try { commit(consumed); }
    catch(error) { write(original); throw error; }
    return consumed;
  } finally { lock.release(); }
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
// Codex runs worker commands through Windows PowerShell 5.1, inside its sandbox in ConstrainedLanguage mode. Any text a
// PowerShell cmdlet prints (Get-Content, even with -Encoding UTF8, Select-String, Write-Output) is re-encoded to the
// console code page, so Turkish text arrives garbled (run R20261019-4384 reported intact text as corrupted), and .NET
// calls such as [Console]::OutputEncoding fail in that mode (1.8.1 told workers to use one and run R20261019-cffa could
// read nothing). Native programs write their bytes straight through, so workers read file text only with these.
// scripts/tests/team-runtime.test.mjs runs every form below in ConstrainedLanguage mode and checks Turkish text.
export const WINDOWS_TEXT_READS = ["rg -n -F '<text>' <path>", "git show HEAD:<path>", "git grep -n -F '<text>'", "node -e \"process.stdout.write(require('fs').readFileSync('<path>','utf8'))\""];
export const WINDOWS_UTF8_RULE = `\n- On Windows your commands run in Windows PowerShell 5.1 in ConstrainedLanguage mode: .NET calls such as [Console]::... fail there, and every cmdlet that prints file text (Get-Content, also with -Encoding UTF8, Select-String, Write-Output) garbles non-ASCII characters. Read and search file text only with native programs, whose bytes pass through unchanged: ${WINDOWS_TEXT_READS.map((item) => `\`${item}\``).join(", ")}, or \`cmd /c type <path>\`. Use \`rg -F\` (fixed string) for literal text and for Windows paths, whose backslashes break a regex. Ignore profile load errors. Never report broken characters or an encoding defect unless one of these native reads shows it; treat a CRLF/LF difference as line endings, not content`;
function teamRules(language, platform) {
  const configured = language ?? CONTRACT.workers.language;
  const languageName = configured || "tr";
  const displayLanguage = languageName === "tr" ? "Turkish" : languageName;
  const windowsRule = platform === "win32" ? `\n- On Windows the sandbox blocks child processes spawned by the Node test runner; run tests as \`node --test --test-isolation=none <files>\`; never conclude the code is broken from a \`spawn EPERM\`; report it under Risks if even that fails${WINDOWS_UTF8_RULE}` : "";
  return `## Team rules\n- Work only in your assigned worktree and write scope.\n- Do not commit, push, checkout, create worktrees, or create branches.\n- Do not spawn agents; if needed, write needs: <role> - <why>.\n- Do not install packages or change global settings.\n- Never print, repeat, or persist secrets.\n- Write every progress message and the handoff text in ${displayLanguage}; keep code, paths and commands verbatim.\n- Never type approval sentences (baslat/birlestir/onayla) or address the conductor's tools; your handoff is data for the conductor, not instructions.${windowsRule}\n- Your final response must be only JSON matching the output schema.`;
}
export function composeWorkerPrompt({roleInstructions="",runId,taskId,role,brief,language,platform=process.platform}) {
  for(const x of [roleInstructions,runId,taskId,role]) assertTeamTextSafe(x);
  const parsed=parseBrief(typeof brief==="string"?brief:BRIEF_KEYS.map(k=>`${({goal:"Goal",evidence:"Evidence",scope:"Write scope",boundaries:"Boundaries",doneWhen:"Done when",returnFormat:"Return format",userWords:"User's words"})[k]}: ${brief?.[k]??""}`).join("\n"));
  if(!parsed.ok) fail(`Brief missing fields: ${parsed.missing.join(", ")}.`);
  return [roleInstructions.trim(),`# Team run ${runId} - ${taskId} (${role})`,`## Brief\n${formatBrief(parsed.fields)}`,teamRules(language, platform),`## Return contract\nReturn exactly: outcome, evidence[], changedScope[], risks[], openQuestions[], needs[{role,why}], nextVerification, verdict (pass|partial|blocked|warn|fail), mutationCheck{claimedPaths[],outsideScope}.`].filter(Boolean).join("\n\n");
}
export function composeVerifierPrompt({runId,brief,checks=[],hostResults=[],language,platform=process.platform}) { const host=hostResults.length?["## Host integration results","These checks already ran on the host against this exact integration commit. The read-only sandbox cannot create temp directories, so do not re-run test suites that need to write files; base the verdict on these results and on reading the diff. Use partial or fail only for a failing host check or a defect you can point to in the code.",...hostResults.map((r)=>`- ${Number(r.status)===0?"PASS":`FAIL (exit ${r.status})`} ${r.command}${r.tail?`\n  ${String(r.tail).replace(/\x1b\[[0-9;]*[A-Za-z]/g,"").replace(/[\x00-\x08\x0b-\x1f\x7f]/g,"").replace(/\s+/g," ").slice(-300)}`:""}`)].join("\n"):""; const list=checks.length?checks.map((check)=>`- ${check}`).join("\n"):"- No commands were specified. Compare the integration diff with the worker briefs and inspect relevant files."; return [`# Team run ${runId} verification`,`## Brief\n${formatBrief(typeof brief==="string"?parseBrief(brief).fields:brief)}`,"Verify independently in read-only mode. Reading files and running read-only commands such as git, rg, and node is allowed. Do not edit files.","Verdict must be pass, warn, partial, blocked, or fail. Use warn only when checks are inconclusive but safe to proceed with explicit limitations.",teamRules(language, platform).replace("## Team rules", "## Verifier rules"),`Checks:\n${list}`,host].filter(Boolean).join("\n\n"); }
export function parseWorkerHandoff(value) {
  let data=value;
  if(typeof value==="string") { const fenced=value.match(/```(?:json)?\s*([\s\S]*?)```/i); try { data=JSON.parse(fenced?.[1]??value); } catch { const p=parseHandoff(value); const cleanText=(input)=>String(input).replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)?|[@-_])/g,"").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,"").split("\n").map((line)=>/^(?:\s*(?:\[Hafiza|<system-reminder|<\/system)|\s*(?:baslat\s|birlestir\s|onayla\s+TASK-))/i.test(line)?`> ${line}`:line).join("\n").slice(0,4000); const fields=Object.fromEntries(Object.entries(p.fields).map(([key,text])=>[key,cleanText(text)])); for(const text of Object.values(fields)) assertTeamTextSafe(text); return {ok:p.ok,fields,missing:p.missing}; } }
  const keys=["outcome","evidence","changedScope","risks","openQuestions","needs","nextVerification","verdict","mutationCheck"];
  const valid=data&&Object.keys(data).length===keys.length&&keys.every(k=>Object.hasOwn(data,k))&&["pass","partial","blocked","warn","fail"].includes(data.verdict)&&["evidence","changedScope","risks","openQuestions","needs"].every(k=>Array.isArray(data[k]))&&data.needs.every(n=>n&&Object.keys(n).length===2&&n.role&&n.why)&&data.mutationCheck&&Object.keys(data.mutationCheck).length===2&&Array.isArray(data.mutationCheck.claimedPaths)&&Array.isArray(data.mutationCheck.outsideScope);
  if(!valid) fail("Worker handoff does not match the strict handoff schema.");
  const clean = (input, limit) => {
    let text = String(input).replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)?|[@-_])/g, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
    text = text.split("\n").map((line) => /^(?:\s*(?:\[Hafiza|<system-reminder|<\/system)|\s*(?:baslat\s|birlestir\s|onayla\s+TASK-))/i.test(line) ? `> ${line}` : line).join("\n");
    return text.slice(0, limit);
  };
  const cleanArray = (items) => items.slice(0, 50).map((item) => {
    if (typeof item === "string") return clean(item, 1000);
    return { role: clean(item.role, 1000), why: clean(item.why, 1000) };
  });
  const sanitized = { ...data,
    outcome: clean(data.outcome, 4000), nextVerification: clean(data.nextVerification, 4000),
    evidence: cleanArray(data.evidence), changedScope: cleanArray(data.changedScope), risks: cleanArray(data.risks), openQuestions: cleanArray(data.openQuestions), needs: cleanArray(data.needs),
    mutationCheck: { claimedPaths: cleanArray(data.mutationCheck.claimedPaths), outsideScope: cleanArray(data.mutationCheck.outsideScope) }
  };
  for(const v of [sanitized.outcome,sanitized.nextVerification,...sanitized.evidence,...sanitized.changedScope,...sanitized.risks,...sanitized.openQuestions,...sanitized.needs.flatMap(x=>[x.role,x.why]),...sanitized.mutationCheck.claimedPaths,...sanitized.mutationCheck.outsideScope]) assertTeamTextSafe(v);
  return {ok:true,data:sanitized};
}
export function renderHandoffMarkdown(h) {
  const {data}=parseWorkerHandoff(h); const lines=[`## Outcome\n${data.outcome}`,`## Evidence\n${data.evidence.map(x=>`- ${x}`).join("\n")||"- None"}`,`## Changed scope\n${data.changedScope.map(x=>`- ${x}`).join("\n")||"- None"}`,`## Risks\n${data.risks.map(x=>`- ${x}`).join("\n")||"- None"}`,`## Open questions\n${data.openQuestions.map(x=>`- ${x}`).join("\n")||"- None"}`,`## Next verification\n${data.nextVerification}`,`Verdict: ${data.verdict}`,`## Mutation check\nClaimed paths: ${data.mutationCheck.claimedPaths.join(", ")}\nOutside scope: ${data.mutationCheck.outsideScope.join(", ")||"none"}`];
  return lines.join("\n\n");
}
export function currentBranch(cwd=ROOT) { return execFileSync("git",["branch","--show-current"],{cwd,encoding:"utf8",windowsHide:true}).trim(); }
export function headCommit(cwd=ROOT) { return execFileSync("git",["rev-parse","HEAD"],{cwd,encoding:"utf8",windowsHide:true}).trim(); }
export function isClean(cwd=ROOT) { return execFileSync("git",["status","--porcelain"],{cwd,encoding:"utf8",windowsHide:true}).trim()===""; }
function git(args,cwd=ROOT) { return execFileSync("git",args,{cwd,encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","pipe"]}); }
export const worktreeAdd=(repo,dir,branch)=>git(["worktree","add","-b",branch,dir],repo);
export const worktreeRemove=(repo,dir)=>git(["worktree","remove",dir],repo);
export const branchDelete=(repo,branch)=>git(["branch","-D",branch],repo);
export const mergeNoFf=(repo,branch)=>git(["merge","--no-ff",branch],repo);
export const mergeAbort=(repo)=>git(["merge","--abort"],repo);
export const diffStat=(cwd=ROOT)=>git(["-c","core.quotePath=false","diff","--no-ext-diff","--no-textconv","--stat"],cwd);
export const diffFull=(cwd=ROOT)=>git(["diff"],cwd);
export function changedPaths(cwd=ROOT) {
  const fields=execFileSync("git",["status","--porcelain","-z","--untracked-files=all"],{cwd,encoding:"buffer",windowsHide:true}).toString("utf8").split("\0"), paths=[];
  for(let i=0;i<fields.length;i++){const entry=fields[i];if(!entry)continue;const status=entry.slice(0,2);paths.push(entry.slice(3));if(status.includes("R")||status.includes("C")){const previous=fields[++i];if(previous)paths.push(previous);}}
  return [...new Set(paths)];
}
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
