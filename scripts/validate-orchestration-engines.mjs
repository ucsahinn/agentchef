#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateEngines(catalog, root = process.cwd()) {
  const errors = [];
  if (catalog.schemaVersion !== 1 || catalog.runtime !== 'scripts/team-run.mjs' || catalog.contract !== 'catalog/subscription-team-mode.json') errors.push('Engine registry must extend the existing team runtime and contract.');
  const engines = catalog.engines || [];
  if (engines.length !== 2 || new Set(engines.map(e => e.id)).size !== 2 || !['codex', 'claude'].every(id => engines.some(e => e.id === id))) errors.push('Registry must cover Codex and Claude exactly once.');
  for (const engine of engines) {
    if (['leaderSuitable', 'workerSuitable', 'teamRunWorkerImplemented'].some(key => typeof engine[key] !== 'boolean')) errors.push(`${engine.id}: suitability flags must be boolean.`);
    if (!engine.continuation?.interactive || !engine.continuation?.headless || !engine.mcpDelivery?.method || !engine.mcpDelivery?.workerDiet || !engine.structuredOutput) errors.push(`${engine.id}: continuation, MCP delivery and structured output are required.`);
    if (!engine.sources?.length || engine.sources.some(source => !/^https:\/\/(?:developers\.openai\.com|code\.claude\.com)\//.test(source))) errors.push(`${engine.id}: official references required.`);
    if (engine.teamRunWorkerImplemented !== (engine.id === 'codex')) errors.push(`${engine.id}: do not claim an unimplemented team-run adapter.`);
  }
  for (const file of [catalog.runtime, catalog.contract, engines.find(e => e.id === 'codex')?.mcpDelivery?.workerDiet].filter(Boolean)) if (!fs.existsSync(path.join(root, file))) errors.push(`Missing registry surface: ${file}`);
  return errors;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = validateEngines(JSON.parse(fs.readFileSync('catalog/orchestration-engines.json', 'utf8')));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Orchestration engine registry passed.');
}
