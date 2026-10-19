// Live worker capacity for team runs. The worker cap follows a measured recommendation instead of a fixed number:
// Beyin writes <vault>/motor/scripts/.state/kapasite.json (`beyin kapasite -Json`, format v1:
// {"v":1,"ts","onerilen","tavan","bosRamGB","commitYuzde","neden"}); without a fresh file AgentChef measures free RAM
// itself with the supervisor's memory guard. The owner may lower the cap freely, or raise it up to the recommendation;
// a request above it is refused with the measured reason.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { memoryAllowance } from "./memory-guard.mjs";

export const CAPACITY_FILE_ENV = "AGENTCHEF_TEAM_RESOURCE_FILE";

function readText(file) { try { return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim(); } catch { return ""; } }

export function capacityFile({ env = process.env, home = os.homedir(), contract } = {}) {
  if (env[CAPACITY_FILE_ENV]) return path.resolve(env[CAPACITY_FILE_ENV]);
  const relative = contract?.workers?.capacity?.recommendationFile || "motor/scripts/.state/kapasite.json";
  const vault = readText(path.join(home, ".beyin", "vault.txt")) || path.join(home, "Documents", "Beyin");
  return path.join(vault, ...relative.split("/"));
}

// Returns { recommended, ceiling, source, reason, measuredAt }. recommended is never above ceiling.
export function capacityRecommendation({ contract, env = process.env, home = os.homedir(), nowMs = Date.now(), freeBytes = os.freemem() } = {}) {
  const policy = contract.workers.capacity;
  const ceiling = contract.workers.maxWorkers;
  const file = capacityFile({ env, home, contract });
  const text = readText(file);
  if (text) {
    try {
      const data = JSON.parse(text);
      const ageMs = nowMs - Date.parse(data.ts);
      const fresh = Number.isFinite(ageMs) && ageMs >= -60_000 && ageMs <= policy.freshMinutes * 60_000;
      if (data.v === 1 && fresh && Number.isInteger(data.onerilen) && data.onerilen >= 0) {
        const fileCeiling = Number.isInteger(data.tavan) && data.tavan >= 1 ? Math.min(ceiling, data.tavan) : ceiling;
        return { recommended: Math.min(fileCeiling, data.onerilen), ceiling: fileCeiling, source: "beyin", file, measuredAt: data.ts, reason: String(data.neden || `Beyin capacity recommendation: ${data.onerilen}`) };
      }
    } catch { /* fall through to the local measurement */ }
  }
  const memory = memoryAllowance({ freeBytes, perWorkerBytes: contract.limits.ramPerWorkerMb * 1024 * 1024, wanted: ceiling, env });
  const freeMb = Math.round(freeBytes / (1024 * 1024));
  return { recommended: Math.min(ceiling, memory.allowed), ceiling, source: "local", file: null, measuredAt: new Date(nowMs).toISOString(), reason: `${freeMb} MB free RAM, ${contract.limits.ramPerWorkerMb} MB per worker plus a reserve, so ${Math.min(ceiling, memory.allowed)} worker(s) fit` };
}

// A recommendation of 0 blocks a run unless the owner explicitly asks for one worker (owner decision 2026-10-19: the
// plan used to run one worker silently while merkez showed "0 önerilen").
export function zeroCapacityError(capacity, when = "plan") {
  return new Error(`The live capacity recommendation is 0 (${capacity.source}: ${capacity.reason}). Free resources and ${when === "plan" ? "plan" : "start"} again, or run one worker at a time on purpose with ${when === "plan" ? "plan" : "a new plan"} --max-workers 1.`);
}

// Effective concurrency for a run. requested = the owner's --max-workers (or null), planned = workers in the plan.
// Without a request the cap is the recommendation, and 0 refuses. --max-workers may go up to the recommendation; at a
// recommendation of 0 it may ask for exactly one worker, recorded as an owner override. Nothing silently shrinks.
export function resolveWorkerCap({ contract, requested = null, planned, capacity }) {
  if (requested != null) {
    const value = Number(requested);
    const allowed = Math.max(1, capacity.recommended);
    if (!Number.isInteger(value) || value < 1) { const error = new Error("--max-workers must be a positive integer."); error.usage = true; throw error; }
    if (value > capacity.ceiling) throw new Error(`--max-workers ${value} is above the hard ceiling of ${capacity.ceiling} workers.`);
    if (value > allowed) throw new Error(`--max-workers ${value} is above the live capacity recommendation of ${capacity.recommended} (${capacity.source}: ${capacity.reason}). Free resources or request at most ${allowed}.`);
    return Math.min(value, planned);
  }
  if (capacity.recommended < 1) throw zeroCapacityError(capacity, "plan");
  return Math.min(capacity.recommended, planned, contract.workers.maxWorkers);
}

// Start re-measures: the approved cap may only go down. An owner override of one worker survives a recommendation of
// 0; without an override a recommendation of 0 refuses the start before anything is consumed.
export function resolveStartCap({ run, capacity }) {
  const override = run.capacity?.requested != null;
  if (capacity.recommended < 1 && !override) throw zeroCapacityError(capacity, "start");
  const live = override ? Math.max(1, capacity.recommended) : capacity.recommended;
  return { cap: Math.min(run.maxWorkers, live), lowered: live < run.maxWorkers };
}
