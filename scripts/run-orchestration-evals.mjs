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
    const [command, evidenceFile] = process.argv.slice(2);
    const tasks = JSON.parse(fs.readFileSync(new URL('../evals/tasks.json', import.meta.url), 'utf8'));
    if (command === 'list') console.log(JSON.stringify(tasks, null, 2));
    else if (command === 'run') {
      const result = runSmokeEvaluations(tasks); console.log(JSON.stringify(result, null, 2));
      if (result.results.some(task => !task.passed)) process.exitCode = 1;
    }
    else if (command === 'score' && evidenceFile) console.log(JSON.stringify(runEvaluations(tasks, JSON.parse(fs.readFileSync(evidenceFile, 'utf8'))), null, 2));
    else throw new Error('Usage: node scripts/run-orchestration-evals.mjs list|run|score <evidence.json>. Model tasks use team-run.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
