import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as runtime from '../lib/team-runtime.mjs';
import * as contract from '../lib/agent-brief.mjs';
import { validateEngines } from '../validate-orchestration-engines.mjs';
import { resolveWorkerCap } from '../lib/team-capacity.mjs';
const { BRIEF_FIELDS, HANDOFF_FIELDS } = contract;
const { buildOwnership, requiredVerifiers, validateLeadReview, workerResources } = runtime;

test('overlapping files are ordered and independent owners stay parallel', () => {
  assert.equal(typeof buildOwnership, 'function');
  const plan = buildOwnership([
    { taskId: 'TASK-A', writeScope: ['src/a/'] },
    { taskId: 'TASK-B', writeScope: ['docs/'] },
    { taskId: 'TASK-C', writeScope: ['src/a/x.js'] }
  ]);
  assert.deepEqual(plan.dependencies, { 'TASK-A': [], 'TASK-B': [], 'TASK-C': ['TASK-A'] });
  assert.equal(plan.ownership['src/a/x.js'].at(-1), 'TASK-C');
  assert.throws(() => buildOwnership([{ taskId: 'TASK-A', writeScope: ['../escape'] }]), /relative/);
});

test('routing catalog is the source of mandatory verifier roles', () => {
  assert.equal(typeof requiredVerifiers, 'function');
  const profiles = JSON.parse(fs.readFileSync('catalog/routing-profiles.json', 'utf8'));
  const result = requiredVerifiers(['release-or-publish', 'frontend-ui']);
  for (const id of ['release-or-publish', 'frontend-ui']) {
    const p = profiles.profiles.find(p => p.id === id);
    assert.ok(result.includes(p.verifier));
  }
  assert.throws(() => requiredVerifiers(['invented']), /Unknown/);
});

test('lead review must pass and bind to the integration commit', () => {
  assert.equal(typeof validateLeadReview, 'function');
  const run = { integration: { commit: 'a'.repeat(40) }, workers: [{ sandbox: 'workspace-write' }] };
  assert.throws(() => validateLeadReview(run), /Claude/);
  const review = { engine: 'claude', reviewer: 'lead', verdict: 'pass', integrationCommit: 'a'.repeat(40), evidence: ['review.md:10 - inspected diff'] };
  assert.doesNotThrow(() => validateLeadReview(run, review));
  assert.throws(() => validateLeadReview(run, { ...review, integrationCommit: 'b'.repeat(40) }), /commit/);
  assert.throws(() => validateLeadReview(run, { ...review, evidence: [] }), /evidence/);
});

test('worker cache is shared and port ranges do not overlap', () => {
  assert.equal(typeof workerResources, 'function');
  const a = workerResources('/run', 0), b = workerResources('/run', 1);
  assert.equal(a.cache, b.cache);
  assert.ok(a.portEnd < b.portStart);
  assert.throws(() => workerResources('/run', 8), /index/);
});

test('JSON schemas mirror the canonical seven and six fields', () => {
  assert.equal(typeof contract.contractSchema, 'function');
  for (const [kind, fields] of [['brief', BRIEF_FIELDS], ['handoff', HANDOFF_FIELDS]]) {
    const schema = contract.contractSchema(kind);
    assert.deepEqual(schema.required, fields.filter(f => !f.optional).map(f => f.key));
    assert.deepEqual(Object.keys(schema.properties), fields.map(f => f.key));
    assert.equal(schema.additionalProperties, false);
  }
});

test('canonical JSON objects use the same brief and handoff checks', () => {
  const brief = Object.fromEntries(BRIEF_FIELDS.filter(f => !f.optional).map(f => [f.key, 'fixture value']));
  assert.equal(contract.parseBrief(JSON.stringify(brief)).ok, true);
  assert.equal(contract.parseBrief(JSON.stringify({ ...brief, injected: 'unrecognized' })).ok, false);
  delete brief.goal;
  assert.equal(contract.parseBrief(JSON.stringify(brief)).ok, false);
  const handoff = Object.fromEntries(HANDOFF_FIELDS.filter(f => !f.optional).map(f => [f.key, 'none']));
  assert.equal(contract.parseHandoff(JSON.stringify(handoff)).ok, true);
  assert.equal(contract.parseHandoff(JSON.stringify(handoff), { strict: true }).ok, false);
});

test('engine registry refuses claims of an unimplemented adapter', () => {
  const catalog = JSON.parse(fs.readFileSync('catalog/orchestration-engines.json', 'utf8'));
  assert.deepEqual(validateEngines(catalog), []);
  catalog.engines.find(e => e.id === 'claude').teamRunWorkerImplemented = true;
  assert.ok(validateEngines(catalog).some(error => error.includes('unimplemented')));
});

test('capacity refuses excess with the measured reason', () => {
  const contract = JSON.parse(fs.readFileSync('catalog/subscription-team-mode.json', 'utf8'));
  assert.throws(() => resolveWorkerCap({ contract, requested: 3, planned: 3, capacity: { recommended: 2, ceiling: 8, source: 'fixture', reason: 'measured fixture RAM' } }), /measured fixture RAM/);
});
