#!/usr/bin/env node
// Prompt-submit hook for Claude Code and Codex: scores the submitted prompt
// against the plugin's rendered routing index and, on a high-confidence
// match, writes ONE line of plain text built only from catalog identifiers
// (profile, skill, verifier, roles, spawn cap). Both CLIs add that line to the
// model's context.
//
// What it never does: block the prompt (exit code is always 0, output is never
// JSON), write to stderr, keep prompt text or matched words anywhere, start a
// process, or touch the network. Its only state is a per-session file of
// profile identifiers and counters so a profile is hinted once per session.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { formatRoutingHint, recommendProfiles, tokens } from "./routing-recommendation.mjs";

const IDENTIFIER = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const SESSION_HASH = /^[0-9a-f]{64}$/;
const STATE_FILE = /^[0-9a-f]{64}\.json$/;
const STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_GC_THRESHOLD = 200;
const STDIN_LIMIT = 1_000_000;
const STDIN_DEADLINE_MS = 2000;
const MIN_PROMPT_CHARS = 8;
const MIN_PROMPT_TOKENS = 2;
// A prompt that starts like one of these is a synthetic turn (a tool result,
// an agent report, a system notice), not something the user typed.
const SYNTHETIC_PREFIXES = [
  "<task-notification>", "<agent-message", "<command-name>", "<local-command-stdout>",
  "<system-reminder", "[subagent hand-back]", "[system notification", "<cross-session-message"
];
const COMMAND_PREFIXES = ["/", "$", "!"];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
let stateForRun = null;

function quietExit() {
  process.exitCode = 0;
}

function readStdin() {
  return new Promise((resolve) => {
    let input = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), STDIN_DEADLINE_MS);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
      if (input.length > STDIN_LIMIT) { clearTimeout(timer); finish(null); }
    });
    process.stdin.on("end", () => { clearTimeout(timer); finish(input); });
    process.stdin.on("error", () => { clearTimeout(timer); finish(null); });
  });
}

function isIdentifier(value) {
  return typeof value === "string" && IDENTIFIER.test(value);
}

// The index is derived data; anything outside its exact shape means a stale or
// edited copy, and then the hook prints nothing.
function readIndex() {
  const parsed = JSON.parse(fs.readFileSync(path.join(scriptDirectory, "routing-index.json"), "utf8"));
  const keys = Object.keys(parsed).sort().join(",");
  if (keys !== "cap,pluginVersion,profiles,schemaVersion" || parsed.schemaVersion !== 1) throw new Error("index shape");
  if (!/^\d+\.\d+\.\d+$/.test(parsed.pluginVersion)) throw new Error("index version");
  if (!Number.isInteger(parsed.cap) || parsed.cap < 1 || parsed.cap > 4) throw new Error("index cap");
  if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) throw new Error("index profiles");
  for (const profile of parsed.profiles) {
    if (Object.keys(profile).sort().join(",") !== "agents,autoSkill,autoSkillMode,autoVerify,id,match,verifier") throw new Error("profile shape");
    if (!isIdentifier(profile.id) || !isIdentifier(profile.verifier) || typeof profile.autoVerify !== "boolean") throw new Error("profile ids");
    if (profile.autoSkill !== null && !isIdentifier(profile.autoSkill)) throw new Error("profile skill");
    if (!["load", "suggest"].includes(profile.autoSkillMode)) throw new Error("profile skill mode");
    if (!Array.isArray(profile.agents) || !profile.agents.every(isIdentifier)) throw new Error("profile agents");
    for (const key of ["phrases", "terms"]) {
      if (!Array.isArray(profile.match?.[key]) || !profile.match[key].every((entry) => Array.isArray(entry) && typeof entry[0] === "string" && Number.isInteger(entry[1]))) throw new Error("profile match");
    }
    if (!Array.isArray(profile.match.excludeTerms) || !profile.match.excludeTerms.every((entry) => typeof entry === "string")) throw new Error("profile exclude");
    if (!Number.isInteger(profile.match.priority)) throw new Error("profile priority");
  }
  return parsed;
}

// State lives in a per-user location and is skipped entirely when the
// directory is not plainly ours (symlink, foreign owner, group/other bits).
function stateDirectory() {
  const base = process.env.CLAUDE_PLUGIN_DATA || process.env.PLUGIN_DATA || process.env.XDG_RUNTIME_DIR || os.tmpdir();
  const directory = path.join(base, "agentchef-routing");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
  if (process.platform !== "win32") {
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) return null;
    if ((stat.mode & 0o077) !== 0) return null;
  }
  return directory;
}

function emptyState() {
  return { v: 1, hinted: [], skipped: { low: 0, synthetic: 0, short: 0, dedupe: 0, agent: 0 }, errors: 0 };
}

function validState(candidate) {
  if (!candidate || candidate.v !== 1 || !Array.isArray(candidate.hinted) || !candidate.hinted.every(isIdentifier)) return null;
  const skipped = candidate.skipped;
  if (!skipped || typeof skipped !== "object") return null;
  for (const key of ["low", "synthetic", "short", "dedupe", "agent"]) {
    if (!Number.isInteger(skipped[key]) || skipped[key] < 0) return null;
  }
  if (!Number.isInteger(candidate.errors) || candidate.errors < 0) return null;
  return { v: 1, hinted: [...candidate.hinted], skipped: { ...skipped }, errors: candidate.errors };
}

function openState(sessionId) {
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 128) return null;
  const directory = stateDirectory();
  if (!directory) return null;
  const hash = crypto.createHash("sha256").update(sessionId).digest("hex");
  if (!SESSION_HASH.test(hash)) return null;
  const file = path.join(directory, `${hash}.json`);
  let state = emptyState();
  try {
    const stat = fs.lstatSync(file);
    if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4096) {
      state = validState(JSON.parse(fs.readFileSync(file, "utf8"))) || emptyState();
    }
  } catch {
    state = emptyState();
  }
  return { directory, file, state };
}

// Exclusive-create a temporary file, then rename it over the state file, so a
// planted symlink at the final name is never followed.
function saveState(handle) {
  if (!handle) return;
  const temporary = path.join(handle.directory, `${path.basename(handle.file, ".json")}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(handle.state), { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, handle.file);
  } catch {
    try { fs.rmSync(temporary, { force: true }); } catch { /* nothing to clean */ }
  }
}

// Removes only this hook's own state files, and only old ones.
function collectGarbage(directory) {
  let names;
  try { names = fs.readdirSync(directory); } catch { return; }
  if (names.length <= STATE_GC_THRESHOLD) return;
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const name of names) {
    if (!STATE_FILE.test(name)) continue;
    const file = path.join(directory, name);
    try {
      const stat = fs.lstatSync(file);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.mtimeMs < cutoff) fs.unlinkSync(file);
    } catch { /* leave it */ }
  }
}

function skipReason(input, prompt) {
  if (input.agent_id || input.agent_type) return "agent";
  const text = prompt.trimStart();
  const lower = text.toLowerCase();
  if (SYNTHETIC_PREFIXES.some((prefix) => lower.startsWith(prefix))) return "synthetic";
  if (COMMAND_PREFIXES.some((prefix) => text.startsWith(prefix))) return "synthetic";
  if (text.length < MIN_PROMPT_CHARS || tokens(text).length < MIN_PROMPT_TOKENS) return "short";
  return null;
}

// Pure decision: the line to print, or null, plus the counter to bump.
export function decide(input, index, state) {
  if (!input || typeof input !== "object") return { line: null, skipped: null };
  if (input.hook_event_name !== "UserPromptSubmit" || typeof input.prompt !== "string") return { line: null, skipped: null };
  const reason = skipReason(input, input.prompt);
  if (reason) return { line: null, skipped: reason };
  const [top] = recommendProfiles(index.profiles, input.prompt, 1);
  if (!top || top.confidence !== "high") return { line: null, skipped: "low" };
  if (state?.hinted.includes(top.profile.id)) return { line: null, skipped: "dedupe" };
  const profile = top.profile;
  const line = formatRoutingHint({
    id: profile.id,
    confidence: top.confidence,
    autoSkill: profile.autoSkill,
    autoSkillMode: profile.autoSkillMode,
    verifier: profile.verifier,
    autoVerify: profile.autoVerify,
    agents: profile.agents
  }, { version: index.pluginVersion, cap: index.cap });
  if (/^[\[{]/.test(line)) return { line: null, skipped: "low" };
  return { line, skipped: null, profileId: profile.id };
}

async function main() {
  process.exitCode = 0;
  if (String(process.env.AGENTCHEF_ROUTING_HINT || "").toLowerCase() === "off") return;
  const raw = await readStdin();
  if (raw === null) return;
  let input;
  try { input = JSON.parse(raw); } catch { return; }
  let index;
  try { index = readIndex(); } catch { return; }
  let handle = null;
  try { handle = openState(input?.session_id); } catch { handle = null; }
  stateForRun = handle;
  let outcome;
  try {
    outcome = decide(input, index, handle?.state ?? null);
  } catch {
    if (handle) { handle.state.errors += 1; saveState(handle); }
    return;
  }
  if (handle) {
    if (outcome.skipped) handle.state.skipped[outcome.skipped] += 1;
    if (outcome.profileId) handle.state.hinted.push(outcome.profileId);
    saveState(handle);
    collectGarbage(handle.directory);
  }
  if (outcome.line) process.stdout.write(`${outcome.line}\n`);
}

function invokedDirectly() {
  try {
    return fs.realpathSync(process.argv[1]).toLowerCase() === fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
}

if (process.argv[1] && invokedDirectly()) {
  process.on("uncaughtException", quietExit);
  process.on("unhandledRejection", quietExit);
  main().catch(quietExit);
}
