import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cmdShimInvocation, resolveWindowsCli } from "./platform-command.mjs";
import { secretLikeCategory } from "./secret-classifier.mjs";

function safeFailureMessage(value) {
  const message = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ");
  const category = secretLikeCategory(message);
  return category ? `sensitive ${category} output omitted` : message.slice(0, 500);
}

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
  if (type === "turn.failed" || type === "error") { const rawMessage = event.message || event.error?.message || event.message_text || "Codex execution failed"; result.failure = { kind: classifyFailure(rawMessage), message: safeFailureMessage(rawMessage) }; }
  return true;
}

export function buildExecArgs({ worktree, sandbox, model = "gpt-6-luna", profile = "offline", schema, output, resumeThreadId, platform = process.platform }) {
  const args = ["exec"];
  if (resumeThreadId) {
    // `resume` does not accept -C, -s, -p, or --full-auto. The worktree is
    // supplied as spawn cwd; the sandbox is a config override.
    args.push("resume", resumeThreadId, "--json", "-m", model, "--output-schema", schema, "-o", output, "-c", "features.multi_agent=false", "-c", "approval_policy=never", "-c", `sandbox_mode=${sandbox}`);
    if (platform === "win32") args.push("-c", "windows.sandbox=unelevated", "--ignore-rules");
    args.push("-");
    return args;
  }
  args.push("--json", "-C", worktree, "-s", sandbox, "-m", model, "-p", profile, "--output-schema", schema, "-o", output, "-c", "features.multi_agent=false", "-c", "approval_policy=never");
  if (platform === "win32") args.push("-c", "windows.sandbox=unelevated", "--ignore-rules");
  args.push("-");
  return args;
}

export function workerEnv({ runId, taskId, worktree, role, boardState }, env = process.env) {
  const result = { ...env, AGENTCHEF_TEAM_RUN: runId, AGENTCHEF_TEAM_TASK: taskId, AGENTCHEF_TEAM_WORKTREE: worktree, AGENTCHEF_TEAM_ROLE: role, AGENTCHEF_ROUTING_HINT: "off", AGENTCHEF_BOARD_STATE: boardState };
  delete result.BEYIN_CHILD;
  return result;
}

export function buildViewerPaneArgs({ root, state, worktree, runId, taskId, title = `${runId} ${taskId}` }) {
  return ["-w", "0", "new-tab", "--title", title, "node", path.join(root, "scripts", "team-run.mjs"), "watch", "--run", runId, "--task", taskId, "--state", state];
}

export function openViewerPane({ root, state, worktree, runId, taskId, title = `${runId} ${taskId}`, env = process.env, platform = process.platform } = {}) {
  if (env.AGENTCHEF_TEAM_PANE === "off" || platform !== "win32") return null;
  const wt = resolveWindowsCli("wt", env);
  if (!wt) return null;
  const args = buildViewerPaneArgs({ root, state, worktree, runId, taskId, title });
  const invocation = wt.toLowerCase().endsWith(".cmd") ? cmdShimInvocation(wt, args) : { command: wt, args };
  try { spawn(invocation.command, invocation.args, { detached: true, stdio: "ignore", windowsVerbatimArguments: invocation.options?.windowsVerbatimArguments }).unref(); return true; } catch { return null; }
}

export function stopChild(child, { createdAt, cmdShim = child?.agentChefCmdShim === true, platform = process.platform } = {}) {
  if (!child || !Number.isInteger(child.pid)) return false;
  if (cmdShim && platform === "win32") {
    try {
      if (!createdAt) return false;
      const identity = childProcessIdentity(child.pid);
      if (!identity || Date.parse(identity.createdAt) !== Date.parse(createdAt)) return false;
      const tree = childProcessTree(child.pid);
      const descendants = tree.filter((entry) => entry.pid !== child.pid).sort((a, b) => b.depth - a.depth);
      for (const entry of descendants) {
        const current = childProcessIdentity(entry.pid);
        if (current && Date.parse(current.createdAt) === Date.parse(entry.createdAt)) { try { process.kill(entry.pid); } catch {} }
      }
      try { process.kill(child.pid); return true; } catch { return false; }
    } catch { return false; }
  }
  try { return child.kill(); } catch { return false; }
}

function childProcessIdentity(pid) {
  if (process.platform !== "win32") return null;
  const value = execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  return { createdAt: new Date(value).toISOString() };
}
function childProcessTree(rootPid) {
  const script = "$rows = Get-CimInstance Win32_Process | ForEach-Object { if ($_.CreationDate -is [datetime]) { [pscustomobject]@{ pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; createdAt=$_.CreationDate.ToUniversalTime().ToString('o') } } }; ConvertTo-Json -InputObject $rows -Compress";
  const value = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 5000 }).trim();
  const parsed = JSON.parse(value || "[]"), rows = Array.isArray(parsed) ? parsed : [parsed];
  const result = [], seen = new Set([rootPid]);
  const visit = (parent, depth) => { for (const row of rows.filter((entry) => entry.parent === parent)) if (!seen.has(row.pid)) { seen.add(row.pid); result.push({ pid: row.pid, createdAt: row.createdAt, depth }); visit(row.pid, depth + 1); } };
  visit(rootPid, 1);
  return [{ pid: rootPid, createdAt: childProcessIdentity(rootPid).createdAt, depth: 0 }, ...result];
}
export function processCreatedAt(pid, platform = process.platform) {
  if (!Number.isInteger(pid)) return null;
  if (platform === "win32") { try { return childProcessIdentity(pid)?.createdAt || null; } catch { return null; } }
  try {
    const value = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return value || null;
  } catch { return null; }
}
export function spawnCodexExec({ prompt, worktree, runDir, schema, output, runId, taskId, role, boardState, sandbox, model, profile, resumeThreadId, onActivity = () => {}, env = process.env, platform = process.platform, spawnImpl = spawn }) {
  fs.mkdirSync(runDir, { recursive: true });
  const eventsPath = path.join(runDir, "events.jsonl");
  const stderrPath = path.join(runDir, "stderr.log");
  const result = { exitCode: null, signal: null, threadId: null, usage: null, finalMessage: null, items: [], failure: null };
  const command = resolveCodexCommand(env, platform);
  const args = buildExecArgs({ worktree, sandbox, model, profile, schema, output, resumeThreadId, platform });
  const invocation = platform === "win32" && command.toLowerCase().endsWith(".cmd") ? cmdShimInvocation(command, args) : { command, args };
  let childRef = null;
  const execution = new Promise((resolve, reject) => {
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
      if (pendingLine.trim()) {
        const category = secretLikeCategory(pendingLine);
        fs.appendFileSync(eventsPath, category ? `[sensitive ${category} event omitted]\n` : `${pendingLine}\n`);
      }
      if (stderr) {
        const category = secretLikeCategory(stderr);
        fs.appendFileSync(stderrPath, category ? `[sensitive ${category} stderr omitted]\n` : stderr);
      }
      if (result.failure) result.failure.message = safeFailureMessage(result.failure.message);
      if (result.exitCode !== 0 && !result.failure) { const rawMessage = stderr.trim() || result.finalMessage || `Codex exited with ${result.exitCode ?? result.signal}`; result.failure = { kind: classifyFailure(rawMessage), message: safeFailureMessage(rawMessage) }; }
      resolve({ ...result });
    };
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      onActivity();
      const lines = (pendingLine + text).split(/\r?\n/);
      pendingLine = lines.pop() || "";
      for (const line of lines) if (line.trim()) {
        const category = secretLikeCategory(line);
        fs.appendFileSync(eventsPath, category ? `[sensitive ${category} event omitted]\n` : `${line}\n`);
        parseExecEvent(line, result);
      }
    });
    child.stderr?.on("data", (chunk) => { const text = String(chunk); stderr = (stderr + text).slice(-200_000); onActivity(); });
    child.once("error", (error) => { if (!done) { result.failure = { kind: "spawn_error", message: error.message }; reject(error); } });
    child.once("close", (code, signal) => { result.exitCode = code; result.signal = signal; finish(); });
    child.stdin?.on("error", (error) => { if (error.code !== "EPIPE" && !result.failure) result.failure = { kind: "stdin_error", message: error.message }; });
    try { child.stdin?.end(prompt); } catch (error) { if (error.code !== "EPIPE") result.failure = { kind: "stdin_error", message: error.message }; }
  });
  Object.defineProperty(execution, "child", { get: () => childRef });
  return execution;
}
