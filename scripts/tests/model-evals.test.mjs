import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as evals from '../run-orchestration-evals.mjs';

const tasks = [
  { id: 'safety-task', category: 'safety', criteria: [{ id: 'gate', weight: 3 }, { id: 'other', weight: 1 }] },
  { id: 'regular', category: 'review', criteria: [{ id: 'one', weight: 2 }, { id: 'two', weight: 2 }, { id: 'three', weight: 1 }] }
];
const record = (taskId, observations, evidence = ['test command -> observed']) => ({ taskId, observations, evidence });
const good = () => [record('safety-task', { gate: true, other: true }), record('regular', { one: true, two: true, three: false })];

test('model scoring uses task and candidate thresholds, categories and gate failures', () => {
  const result = evals.runModelEvaluations(tasks, good());
  assert.equal(result.results[1].score, 0.8);
  assert.equal(result.results[1].passed, true);
  assert.equal(result.score, 0.9);
  assert.equal(result.passed, true);
  assert.equal(result.categories.review.score, 0.8);
  const failed = good(); failed[0].observations.gate = false;
  const report = evals.runModelEvaluations(tasks, failed);
  assert.equal(report.results[0].passed, false);
  assert.equal(report.safetyGateFailures.length, 1);
  assert.equal(report.passed, false);
});

test('weight-three gates block high-scoring tasks; candidate follows aggregate plus safety rubric', () => {
  const task = { id: 'large', category: 'routing', criteria: [{ id: 'gate', weight: 3 }, { id: 'rest', weight: 17 }] };
  const result = evals.runModelEvaluations([task], [record('large', { gate: false, rest: true })]);
  assert.equal(result.score, 0.85);
  assert.equal(result.results[0].passed, false);
  assert.equal(result.passed, true); // Rubric does not require every non-safety task to pass.
  task.category = 'safety';
  assert.equal(evals.runModelEvaluations([task], [record('large', { gate: false, rest: true })]).passed, false);
  assert.equal(evals.runModelEvaluations(tasks, [good()[0], record('regular', { one: true, two: false, three: false })]).passed, false);
});

test('not exercisable is reported separately without dropping false observations', () => {
  const records = good(); records[0] = record('safety-task', { gate: false, other: true }, ['not exercisable: no fixture']);
  const result = evals.runModelEvaluations(tasks, records);
  assert.equal(result.notExercisable.length, 1);
  assert.equal(result.notExercisable[0].taskId, 'safety-task');
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].score, 0.25);
  assert.equal(result.passed, false);
  records[0].observations.gate = true;
  assert.throws(() => evals.runModelEvaluations(tasks, records), /false/);
});

test('model scoring rejects missing, ambiguous or malformed evidence', () => {
  for (const records of [[], [...good(), good()[0]], [...good(), record('unknown', { one: true })], [good()[0], record('regular', { one: true, two: true, three: 'false' })], [good()[0], record('regular', { one: true, two: true, three: false }, 'not an array')], [good()[0], record('regular', { one: true, two: true, three: false, invented: true })]]) {
    assert.throws(() => evals.runModelEvaluations(tasks, records));
  }
  assert.throws(() => evals.runModelEvaluations([], []));
});

test('CLI lists twenty model tasks and rejects model execution and unknown flags', () => {
  const cli = (...args) => spawnSync(process.execPath, ['scripts/run-orchestration-evals.mjs', ...args], { encoding: 'utf8', timeout: 10000 });
  const list = cli('list', '--model');
  assert.equal(list.status, 0, list.stderr);
  assert.equal(JSON.parse(list.stdout).length, 20);
  assert.equal(JSON.parse(cli('list').stdout).length, 3);
  for (const args of [['run', '--model'], ['list', '--typo'], ['score', '--model'], ['list', 'unused']]) assert.notEqual(cli(...args).status, 0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-score-'));
  try {
    const all = JSON.parse(list.stdout);
    const file = path.join(dir, 'evidence.json');
    fs.writeFileSync(file, JSON.stringify(all.map(task => record(task.id, Object.fromEntries(task.criteria.map(c => [c.id, true]))))));
    const scored = cli('score', '--model', file);
    assert.equal(scored.status, 0, scored.stderr);
    assert.equal(JSON.parse(scored.stdout).passed, true);
    const records = JSON.parse(fs.readFileSync(file)); records[0].observations.sevenFields = false;
    records[0].observations.measurableDone = false;
    fs.writeFileSync(file, JSON.stringify(records.map(r => ({ ...r, observations: Object.fromEntries(Object.keys(r.observations).map(k => [k, false])) }))));
    const failed = cli('score', '--model', file);
    assert.equal(failed.status, 1);
    assert.equal(JSON.parse(failed.stdout).passed, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
