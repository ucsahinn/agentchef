import assert from "node:assert/strict";
import test from "node:test";
import { nextResumeAt, parseUsageLimitReset } from "../lib/usage-limit-reset.mjs";

const now = new Date(2026, 9, 14, 14, 0, 0); // local 2026-10-14 14:00
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m, 0, 0).getTime();

test("12h clock time later today", () => {
  assert.equal(parseUsageLimitReset("You hit your limit, try again at 3:45 PM.", now).getTime(), at(14, 15, 45));
  assert.equal(parseUsageLimitReset("try again at 3 pm", now).getTime(), at(14, 15));
});

test("clock time already passed rolls to tomorrow", () => {
  assert.equal(parseUsageLimitReset("try again at 9:30 AM", now).getTime(), at(15, 9, 30));
  assert.equal(parseUsageLimitReset("try again at 12:00 AM", now).getTime(), at(15, 0));
});

test("24h clock time", () => {
  assert.equal(parseUsageLimitReset("try again at 15:45", now).getTime(), at(14, 15, 45));
  assert.equal(parseUsageLimitReset("try again at 09:15", now).getTime(), at(15, 9, 15));
});

test("relative long form", () => {
  assert.equal(parseUsageLimitReset("try again in 2 hours 13 minutes", now).getTime(), now.getTime() + (2 * 60 + 13) * 60000);
  assert.equal(parseUsageLimitReset("Try again in 1 hour and 5 minutes.", now).getTime(), now.getTime() + 65 * 60000);
  assert.equal(parseUsageLimitReset("try again in 3 days", now).getTime(), now.getTime() + 3 * 86400000);
});

test("relative short form", () => {
  assert.equal(parseUsageLimitReset("resets in 45m", now).getTime(), now.getTime() + 45 * 60000);
  assert.equal(parseUsageLimitReset("resets in 2h 13m", now).getTime(), now.getTime() + 133 * 60000);
});

test("ISO timestamps, future only", () => {
  assert.equal(parseUsageLimitReset("resets at 2026-10-15T08:00:00Z", now).toISOString(), "2026-10-15T08:00:00.000Z");
  assert.equal(parseUsageLimitReset("resets at 2026-10-15 08:00", now).getTime(), at(15, 8));
  assert.equal(parseUsageLimitReset("resets at 2026-10-01T08:00:00Z", now), null);
});

test("unknown or empty text gives null", () => {
  assert.equal(parseUsageLimitReset("weekly limit reached", now), null);
  assert.equal(parseUsageLimitReset("try again at 5", now), null);
  assert.equal(parseUsageLimitReset("", now), null);
  assert.equal(parseUsageLimitReset(null, now), null);
});

const worker = (status, failure) => ({ taskId: "t", status, failure });

test("nextResumeAt takes the latest reset plus margin", () => {
  const run = { workers: [worker("paused_limit", "try again in 30m"), worker("paused_limit", "try again at 3:45 PM"), worker("finished", null)] };
  assert.equal(nextResumeAt(run, now).getTime(), at(14, 15, 47));
  assert.equal(nextResumeAt(run, now, { marginMinutes: 5 }).getTime(), at(14, 15, 50));
});

test("nextResumeAt falls back when nothing parses", () => {
  const run = { workers: [worker("paused_limit", "weekly limit reached")] };
  assert.equal(nextResumeAt(run, now).getTime(), now.getTime() + 30 * 60000);
  assert.equal(nextResumeAt(run, now, { fallbackMinutes: 10 }).getTime(), now.getTime() + 10 * 60000);
});

test("nextResumeAt is null with no paused worker", () => {
  assert.equal(nextResumeAt({ workers: [worker("running", null), worker("failed", "try again in 5m")] }, now), null);
  assert.equal(nextResumeAt({ workers: [] }, now), null);
  assert.equal(nextResumeAt({}, now), null);
});

test("nextResumeAt reads each message relative to when the worker hit the limit", () => {
  const now = new Date("2026-10-14T20:00:00Z");
  const fourHoursAgo = new Date(now.getTime() - 4 * 3600000).toISOString();
  const run = { workers: [{ status: "paused_limit", failure: "Usage limit reached. Try again in 5 hours.", finishedAt: fourHoursAgo }] };
  assert.equal(nextResumeAt(run, now).getTime(), now.getTime() + 3600000 + 2 * 60000);
  const longAgo = { workers: [{ status: "paused_limit", failure: "Try again in 1 hour.", finishedAt: new Date(now.getTime() - 3 * 3600000).toISOString() }] };
  assert.equal(nextResumeAt(longAgo, now).getTime(), now.getTime());
  const noTime = { workers: [{ status: "paused_limit", failure: "weekly limit reached", finishedAt: new Date(now.getTime() - 10 * 60000).toISOString() }] };
  assert.equal(nextResumeAt(noTime, now).getTime(), now.getTime() + 20 * 60000);
});
