#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { advanceSkill } from './lib/skill-lifecycle.mjs';
import { acquireTeamOperationLock } from './lib/team-runtime.mjs';
import { replaceFileSync } from './lib/coordination-runtime.mjs';

// Local readiness ledger only; no installed-home or external publication writes.
try {
  const [action, ...args] = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--source', '--ledger', '--approval', '--views', '--version'].includes(args[i]) || !args[i + 1]) throw new Error('Use draft|lint|approve|publish --source SKILL.md --ledger <repo-local.json> [--approval file --views file --version x.y.z].');
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.ledger || !options.source) throw new Error('--source and --ledger are required.');
  const root = fs.realpathSync(process.cwd()), ledger = path.resolve(options.ledger);
  const relative = path.relative(root, ledger);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Ledger must stay inside the working repository.');
  let ancestor = path.dirname(ledger);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const realAncestor = fs.realpathSync(ancestor), ancestorRelative = path.relative(root, realAncestor);
  if (ancestorRelative.startsWith('..') || path.isAbsolute(ancestorRelative)) throw new Error('Linked ledger directories are forbidden.');
  for (let current = path.dirname(ledger); current !== root && current !== path.dirname(current); current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Linked ledger directories are forbidden.');
  }
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  if (fs.existsSync(ledger) && fs.lstatSync(ledger).isSymbolicLink()) throw new Error('Linked ledgers are forbidden.');
  const lock = acquireTeamOperationLock(`${ledger}.lock`);
  try {
    const read = file => file ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
    const next = advanceSkill(fs.existsSync(ledger) ? read(ledger) : null, action, { source: fs.readFileSync(options.source, 'utf8'), approval: read(options.approval), views: read(options.views), version: options.version });
    const temporary = `${ledger}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' });
    replaceFileSync(temporary, ledger);
    console.log(JSON.stringify({ ok: true, state: next.state, digest: next.digest }));
  } finally { lock.release(); }
} catch (error) { console.error(error.message); process.exitCode = 1; }
