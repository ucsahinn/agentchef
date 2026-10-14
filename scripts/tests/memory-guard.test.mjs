import assert from "node:assert/strict";
import test from "node:test";
import { memoryAllowance } from "../lib/memory-guard.mjs";

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

test("plenty of memory allows every wanted worker", () => {
  const r = memoryAllowance({ freeBytes: 20 * GIB, wanted: 4, env: {} });
  assert.equal(r.ok, true);
  assert.equal(r.allowed, 4);
  assert.equal(r.needBytes, 2 * GIB + 4 * 1.5 * GIB);
  assert.equal(r.freeBytes, 20 * GIB);
  assert.equal(r.reason, "");
});

test("partial allowance explains the shortfall", () => {
  const r = memoryAllowance({ freeBytes: 6 * GIB, wanted: 4, env: {} });
  assert.equal(r.allowed, 2);
  assert.equal(r.ok, true);
  assert.match(r.reason, /2 may start/);
});

test("zero allowance is not ok", () => {
  const r = memoryAllowance({ freeBytes: 3 * GIB, wanted: 2, env: {} });
  assert.equal(r.allowed, 0);
  assert.equal(r.ok, false);
  assert.notEqual(r.reason, "");
  assert.equal(memoryAllowance({ freeBytes: 1 * GIB, wanted: 2, env: {} }).allowed, 0);
});

test("wanted 0 is ok with no reason", () => {
  const r = memoryAllowance({ freeBytes: 0, wanted: 0, env: {} });
  assert.equal(r.ok, true);
  assert.equal(r.allowed, 0);
  assert.equal(r.reason, "");
  assert.equal(r.needBytes, 2 * GIB);
});

test("AGENTCHEF_TEAM_MIN_FREE_MB replaces the reserve when a positive integer", () => {
  const r = memoryAllowance({ freeBytes: 4 * GIB, wanted: 2, env: { AGENTCHEF_TEAM_MIN_FREE_MB: "1024" } });
  assert.equal(r.allowed, 2);
  assert.equal(r.needBytes, 1024 * MIB + 3 * GIB);
});

test("invalid AGENTCHEF_TEAM_MIN_FREE_MB values are ignored", () => {
  for (const bad of ["abc", "0", "-5", "1.5", "", "12MB"]) {
    const r = memoryAllowance({ freeBytes: 4 * GIB, wanted: 2, env: { AGENTCHEF_TEAM_MIN_FREE_MB: bad } });
    assert.equal(r.needBytes, 2 * GIB + 3 * GIB, `value ${JSON.stringify(bad)}`);
    assert.equal(r.allowed, 1);
  }
});
