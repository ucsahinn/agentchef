// Pure helpers that read when a Codex usage limit resets. No I/O, timers or clocks:
// callers pass `now` so results are deterministic.

const MS = { d: 86400000, h: 3600000, m: 60000 };
const ISO_RE = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/i;
const RELATIVE_RE = /\bin\s+((?:\d+(?:\.\d+)?\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m)\b[\s,]*(?:and\s+)?)+)/i;
const UNIT_RE = /(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m)\b/gi;
const CLOCK_RE = /\b(?:at|until|by)\s+(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m\b\.?)?(?![\d:])/i;

function toDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseIso(text, now) {
  const match = ISO_RE.exec(text);
  if (!match) return undefined;
  const date = new Date(match[0].replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.getTime() > now.getTime() ? date : null;
}

function parseRelative(text, now) {
  const match = RELATIVE_RE.exec(text);
  if (!match) return undefined;
  let total = 0;
  for (const part of match[1].matchAll(UNIT_RE)) {
    const unit = part[2][0].toLowerCase();
    total += Number(part[1]) * MS[unit];
  }
  return total > 0 ? new Date(now.getTime() + total) : undefined;
}

function parseClock(text, now) {
  const match = CLOCK_RE.exec(text);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  // A bare number such as "at 5" is too ambiguous to trust.
  if (!meridiem && match[2] === undefined) return undefined;
  if (minute > 59) return undefined;
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hour > 23) return undefined;
  const date = new Date(now.getTime());
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
  return date;
}

export function parseUsageLimitReset(text, now) {
  const base = toDate(now);
  if (typeof text !== "string" || !text.trim() || !base) return null;
  for (const parse of [parseIso, parseRelative, parseClock]) {
    const result = parse(text, base);
    if (result !== undefined) return result;
  }
  return null;
}

export function nextResumeAt(run, now, { fallbackMinutes = 30, marginMinutes = 2 } = {}) {
  const base = toDate(now);
  if (!base) return null;
  const paused = (run?.workers || []).filter((worker) => worker?.status === "paused_limit");
  if (paused.length === 0) return null;
  // Each message is read relative to when that worker hit the limit (finishedAt), not to now: "try again in 5 hours"
  // seen 4 hours ago means about one hour from now. A time that has already passed means resume now.
  let latest = null;
  for (const worker of paused) {
    const failure = worker.failure;
    const text = typeof failure === "string" ? failure : failure?.message;
    const hit = toDate(worker.finishedAt) || base;
    const reset = parseUsageLimitReset(text, hit);
    const at = reset ? reset.getTime() + marginMinutes * MS.m : hit.getTime() + fallbackMinutes * MS.m;
    if (latest === null || at > latest) latest = at;
  }
  return new Date(Math.max(latest, base.getTime()));
}
