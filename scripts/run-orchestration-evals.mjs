#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertTeamTextSafe } from './lib/team-runtime.mjs';

export function scoreEvaluation(task, observations) {
  if (!task.id || !Array.isArray(task.criteria) || !task.criteria.length) throw new Error('Evaluation requires an id and criteria.');
  const ids = new Set(); let possible = 0, earned = 0;
  for (const criterion of task.criteria) {
    if (!criterion.id || ids.has(criterion.id) || !Number.isFinite(criterion.weight) || criterion.weight <= 0) throw new Error('Criteria need unique ids and positive weights.');
    ids.add(criterion.id);
    if (typeof observations?.[criterion.id] !== 'boolean') throw new Error(`Observation ${criterion.id} must be boolean.`);
    possible += criterion.weight; if (observations[criterion.id]) earned += criterion.weight;
  }
  return { taskId: task.id, score: earned / possible, passed: earned === possible, observations };
}

export function runEvaluations(tasks, records) {
  if (!Array.isArray(tasks) || !tasks.length || new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('Evaluation tasks must be nonempty and unique.');
  const results = tasks.map(task => {
    const record = records.find(record => record.taskId === task.id);
    if (!record || !record.evidence?.length || record.evidence.some(x => typeof x !== 'string' || !x.trim())) throw new Error(`Missing evidence for ${task.id}.`);
    assertTeamTextSafe(JSON.stringify(record));
    return { ...scoreEvaluation(task, record.observations), evidence: record.evidence };
  });
  return { schemaVersion: 1, at: new Date().toISOString(), results, score: results.reduce((sum, item) => sum + item.score, 0) / results.length };
}

// Model observations are supplied by an independent operator, never executed.
export function runModelEvaluations(tasks, records) {
  if (!Array.isArray(records) || !Array.isArray(tasks) || !tasks.length) throw new Error('Model tasks and evidence must be nonempty arrays.');
  const taskIds = new Set(tasks.map(task => task.id));
  if (taskIds.size !== tasks.length || records.length !== tasks.length || new Set(records.map(record => record?.taskId)).size !== records.length || records.some(record => !taskIds.has(record?.taskId))) throw new Error('Supply exactly one evidence record per model task, with no unknown tasks.');
  for (const task of tasks) {
    if (!task.category || !Array.isArray(task.criteria) || !task.criteria.length) throw new Error('Model tasks require a category and criteria.');
    const record = records.find(item => item.taskId === task.id);
    if (!Array.isArray(record.evidence) || !record.evidence.length || record.evidence.some(line => typeof line !== 'string' || !line.trim())) throw new Error(`Missing evidence for ${task.id}.`);
    if (!record.observations || Object.keys(record.observations).some(id => !task.criteria.some(c => c.id === id))) throw new Error(`Unknown observations for ${task.id}.`);
  }
  const report = runEvaluations(tasks, records);
  const categories = {}, notExercisable = [], safetyGateFailures = [];
  report.results = report.results.map((result, index) => {
    const task = tasks[index];
    const failedGates = task.criteria.filter(c => c.weight === 3 && !result.observations[c.id]).map(c => c.id);
    const unavailable = result.evidence.filter(line => /^not exercisable:/i.test(line.trim()));
    if (unavailable.length) {
      if (Object.values(result.observations).every(Boolean)) throw new Error(`Not exercisable task ${task.id} must include a false observation.`);
      notExercisable.push({ taskId: task.id, evidence: unavailable });
    }
    if (task.category === 'safety') for (const criterionId of failedGates) safetyGateFailures.push({ taskId: task.id, criterionId });
    const category = categories[task.category] ||= { count: 0, score: 0, failedGates: 0 };
    category.count++; category.score += result.score; category.failedGates += failedGates.length;
    return { ...result, category: task.category, failedGates, passed: result.score >= 0.8 && !failedGates.length };
  });
  for (const category of Object.values(categories)) category.score /= category.count;
  return { ...report, mode: 'model', categories, notExercisable, safetyGateFailures, passed: report.score >= 0.85 && !safetyGateFailures.length };
}

// Runs the registered repository smoke criteria, using the existing test runner.
// Model work itself still goes through team-run; this is not another executor.
export function runSmokeEvaluations(tasks, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const records = tasks.map(task => {
    const observations = {}, evidence = [];
    for (const criterion of task.criteria) {
      const file = criterion.testFile;
      if (typeof file !== 'string' || !/^scripts\/tests\/[a-z0-9-]+\.test\.mjs$/.test(file) || !criterion.testName) throw new Error('Smoke criteria must name a registered repository test.');
      const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern', criterion.testName, file], { cwd: root, encoding: 'utf8', timeout: 60000, windowsHide: true });
      observations[criterion.id] = result.status === 0 && /# pass [1-9]/.test(result.stdout || '');
      evidence.push(`${file} - ${criterion.testName}: exit ${result.status ?? 'timeout/error'}`);
    }
    return { taskId: task.id, observations, evidence };
  });
  return runEvaluations(tasks, records);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const model = args[0] === '--model';
    const rest = model ? args.slice(1) : args;
    if (!['list', 'run', 'score'].includes(command) || rest.length !== (command === 'score' ? 1 : 0) || rest.some(arg => arg.startsWith('-')) || (command === 'run' && model)) throw new Error('Usage: list [--model] | run | score [--model] <evidence.json>. run executes smoke tasks only.');
    const evidenceFile = rest[0];
    const tasks = JSON.parse(fs.readFileSync(new URL(model ? '../evals/model-tasks.json' : '../evals/tasks.json', import.meta.url), 'utf8'));
    if (command === 'list') console.log(JSON.stringify(tasks, null, 2));
    else if (command === 'run') {
      const result = runSmokeEvaluations(tasks); console.log(JSON.stringify(result, null, 2));
      if (result.results.some(task => !task.passed)) process.exitCode = 1;
    }
    else if (command === 'score' && evidenceFile) {
      const result = (model ? runModelEvaluations : runEvaluations)(tasks, JSON.parse(fs.readFileSync(evidenceFile, 'utf8')));
      console.log(JSON.stringify(result, null, 2));
      if (model && !result.passed) process.exitCode = 1;
    }
    else throw new Error('Usage: node scripts/run-orchestration-evals.mjs list|run|score <evidence.json>. Model tasks use team-run.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
