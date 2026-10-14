import assert from "node:assert/strict";
import test from "node:test";
import { nextResumeAt, parseUsageLimitReset } from "../lib/usage-limit-reset.mjs";

const now = new Date("2026-10-14T12:00:00.000Z");

test("ISO timestamp without a zone uses the runtime's local timezone", () => {
  const expected = new Date("2026-10-15T08:30:00");
  const actual = parseUsageLimitReset("resets at 2026-10-15T08:30:00", now);
  assert.ok(actual instanceof Date);
  assert.equal(actual.getTime(), expected.getTime());
});

test("past ISO wins over a relative hint and produces no parsed reset", () => {
  // Current parser behavior: ISO has priority; a past ISO returns null without trying "in 2 hours".
  assert.equal(parseUsageLimitReset("2026-10-14T11:00:00Z; try again in 2 hours", now), null);
});

test("far-future ISO timestamp is preserved", () => {
  assert.equal(
    parseUsageLimitReset("resets at 2099-12-31T23:59:59Z", now)?.toISOString(),
    "2099-12-31T23:59:59.000Z",
  );
});

test("nextResumeAt selects the later reset across paused workers", () => {
  const run = {
    workers: [
      { status: "paused_limit", failure: "try again in 30 minutes", finishedAt: "2026-10-14T11:00:00Z" },
      { status: "paused_limit", failure: "resets at 2026-10-14T15:00:00Z", finishedAt: "2026-10-14T11:30:00Z" },
    ],
  };
  assert.equal(nextResumeAt(run, now).toISOString(), "2026-10-14T15:02:00.000Z");
});

test("worker without finishedAt uses now as the message reference", () => {
  const run = { workers: [{ status: "paused_limit", failure: "try again in 45 minutes" }] };
  assert.equal(nextResumeAt(run, now).toISOString(), "2026-10-14T12:47:00.000Z");
});
