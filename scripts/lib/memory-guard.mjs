import os from "node:os";

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

export const DEFAULT_PER_WORKER_BYTES = 1.5 * GIB;
export const DEFAULT_RESERVE_BYTES = 2 * GIB;
export const MIN_FREE_ENV = "AGENTCHEF_TEAM_MIN_FREE_MB";

function reserveFromEnv(env, fallback) {
  const raw = env?.[MIN_FREE_ENV];
  if (typeof raw !== "string" && typeof raw !== "number") return fallback;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return fallback;
  const mb = Number(text);
  return Number.isSafeInteger(mb) && mb > 0 ? mb * MIB : fallback;
}

export function memoryAllowance({
  freeBytes = os.freemem(),
  perWorkerBytes = DEFAULT_PER_WORKER_BYTES,
  reserveBytes = DEFAULT_RESERVE_BYTES,
  wanted,
  env = process.env
} = {}) {
  const reserve = reserveFromEnv(env, reserveBytes);
  const want = Math.max(0, Math.floor(Number(wanted) || 0));
  const fits = Math.floor((freeBytes - reserve) / perWorkerBytes);
  const allowed = Math.min(want, Math.max(0, Number.isFinite(fits) ? fits : 0));
  const needBytes = reserve + want * perWorkerBytes;
  const ok = allowed > 0 || want === 0;
  const mb = (n) => Math.round(n / MIB);
  const reason = allowed < want
    ? `Only ${mb(freeBytes)} MB free; ${want} worker(s) need ${mb(needBytes)} MB including a ${mb(reserve)} MB reserve, so ${allowed} may start.`
    : "";
  return { ok, allowed, freeBytes, needBytes, reason };
}
