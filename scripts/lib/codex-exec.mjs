import { spawn, spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cmdShimInvocation, resolveWindowsCli } from "./platform-command.mjs";

export function resolveCodexCommand(env = process.env, platform = process.platform) {
  if (env.AGENTCHEF_TEAM_CODEX_COMMAND) return env.AGENTCHEF_TEAM_CODEX_COMMAND;
  if (platform === "win32") return resolveWindowsCli("codex", env) || "codex";
  return "codex";
}

export function classifyFailure(message = "") {
  return /usage\s*limit|rate\s*limit|quota|too many requests|\b429\b|weekly limit/i.test(String(message)) ? "usage_limit" : "exec_failed";
}

export function parseExecEvent(line, result) {
  let event;
  try { event = JSON.parse(line); } catch { return false; }
  const type = event.type || event.event;
  if (type === "thread.started" && event.thread_id) result.threadId = event.thread_id;
  if (type === "turn.completed" && event.usage) result.usage = event.usage;
  if (type === "item.completed") {
    result.items.push(event.item);
    const item = event.item;
    if (item?.type === "agent_message" && typeof item.text === "string") result.finalMessage = item.text;
  }
  if (type === "turn.failed" || type === "error") result.failure = { kind: classifyFailure(event.message || event.error?.message || event.message_text || "Codex execution failed"), message: event.message || event.error?.message || event.message_text || "Codex execution failed" };
  return true;
}

export function buildExecArgs({ worktree, sandbox, model = "gpt-6-luna", profile = "offline", schema, output, resumeThreadId, platform = process.platform }) {
  const args = ["exec"];
  if (resumeThreadId) args.push("resume", resumeThreadId);
  args.push("--json", "-C", worktree, "-s", sandbox, "-m", model, "-p", profile, "--output-schema", schema, "-o", output, "-c", "features.multi_agent=false", "-c", 'approval_policy="never"');
  if (platform === "win32") args.push("-c", 'windows.sandbox="unelevated"', "--ignore-rules");
  args.push("-");
  return args;
}

export function workerEnv({ runId, taskId, worktree, role, boardState }, env = process.env) {
  const result = { ...env, AGENTCHEF_TEAM_RUN: runId, AGENTCHEF_TEAM_TASK: taskId, AGENTCHEF_TEAM_WORKTREE: worktree, AGENTCHEF_TEAM_ROLE: role, AGENTCHEF_ROUTING_HINT: "off", AGENTCHEF_BOARD_STATE: boardState };
  delete result.BEYIN_CHILD;
  return result;
}

export function openViewerPane({ worktree, runId, taskId, title = `${runId} ${taskId}`, env = process.env, platform = process.platform } = {}) {
  if (env.AGENTCHEF_TEAM_PANE === "off" || platform !== "win32") return null;
  const wt = resolveWindowsCli("wt", env);
  if (!wt) return null;
  const invocation = wt.toLowerCase().endsWith(".cmd") ? cmdShimInvocation(wt, ["-w", "0", "new-tab", "--title", title, "node", path.join(worktree, "scripts", "team-run.mjs"), "watch", "--run", runId, "--task", taskId]) : { command: wt, args: ["-w", "0", "new-tab", "--title", title, "node", path.join(worktree, "scripts", "team-run.mjs"), "watch", "--run", runId, "--task", taskId] };
  try { spawn(invocation.command, invocation.args, { detached: true, stdio: "ignore", windowsVerbatimArguments: invocation.options?.windowsVerbatimArguments }).unref(); return true; } catch { return null; }
}

export function stopChild(child, { createdAt, cmdShim = child?.agentChefCmdShim === true, platform = process.platform } = {}) {
  if (!child || !Number.isInteger(child.pid)) return false;
  if (cmdShim && platform === "win32") {
    try {
      if (!createdAt) return false;
      const identity = childProcessIdentity(child.pid);
      if (!identity || Date.parse(identity.createdAt) !== Date.parse(createdAt)) return false;
      const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T"], { windowsHide: true, timeout: 5000 });
      return result.status === 0;
    } catch { return false; }
  }
  try { return child.kill(); } catch { return false; }
}

function childProcessIdentity(pid) {
  if (process.platform !== "win32") return null;
  const value = execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`], { encoding: "utf8", timeout: 3000 }).trim();
  return { createdAt: new Date(value).toISOString() };
}
export function spawnCodexExec({ prompt, worktree, runDir, schema, output, runId, taskId, role, boardState, sandbox, model, profile, resumeThreadId, env = process.env, platform = process.platform, spawnImpl = spawn }) {
  fs.mkdirSync(runDir, { recursive: true });
  const eventsPath = path.join(runDir, "events.jsonl");
  const stderrPath = path.join(runDir, "stderr.log");
  const result = { exitCode: null, signal: null, threadId: null, usage: null, finalMessage: null, items: [], failure: null };
  const command = resolveCodexCommand(env, platform);
  const args = buildExecArgs({ worktree, sandbox, model, profile, schema, output, resumeThreadId, platform });
  const invocation = platform === "win32" && command.toLowerCase().endsWith(".cmd") ? cmdShimInvocation(command, args) : { command, args };
  let childRef = null;
  const execution = new Promise((resolve, reject) => {
    let events = "";
    let pendingLine = "";
    let stderr = "";
    let done = false;
    const child = spawnImpl(invocation.command, invocation.args, { cwd: worktree, env: workerEnv({ runId, taskId, worktree, role, boardState }, env), stdio: ["pipe", "pipe", "pipe"], windowsVerbatimArguments: invocation.options?.windowsVerbatimArguments });
    childRef = child;
    child.agentChefCmdShim = invocation.command.toLowerCase().endsWith(".cmd") || invocation.command.toLowerCase().endsWith("cmd.exe");
    const finish = () => {
      if (done) return;
      done = true;
      if (pendingLine.trim()) parseExecEvent(pendingLine, result);
      fs.appendFileSync(eventsPath, events);
      fs.appendFileSync(stderrPath, stderr);
      if (result.exitCode !== 0 && !result.failure) result.failure = { kind: classifyFailure(stderr || result.finalMessage || "Codex exited with a non-zero status"), message: stderr.trim() || `Codex exited with ${result.exitCode ?? result.signal}` };
      resolve({ ...result });
    };
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk); events += text;
      const lines = (pendingLine + text).split(/\r?\n/);
      pendingLine = lines.pop() || "";
      for (const line of lines) if (line.trim()) parseExecEvent(line, result);
    });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", (error) => { if (!done) { result.failure = { kind: "spawn_error", message: error.message }; reject(error); } });
    child.once("close", (code, signal) => { result.exitCode = code; result.signal = signal; finish(); });
    child.stdin?.end(prompt);
  });
  Object.defineProperty(execution, "child", { get: () => childRef });
  return execution;
}
