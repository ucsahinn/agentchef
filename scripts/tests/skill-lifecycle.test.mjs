import test from 'node:test';
import assert from 'node:assert/strict';
import * as lifecycle from '../lib/skill-lifecycle.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('publish requires lint, hash-bound approval and matching engine views', () => {
  assert.equal(typeof lifecycle.advanceSkill, 'function');
  const source = '---\nname: example\ndescription: Example skill.\n---\n# Example\nRead a file.\n';
  const draft = lifecycle.advanceSkill(null, 'draft', { source });
  assert.throws(() => lifecycle.advanceSkill(draft, 'publish', { source }), /lint|approved/);
  const linted = lifecycle.advanceSkill(draft, 'lint', { source });
  assert.throws(() => lifecycle.advanceSkill(linted, 'approve', { source, approval: { digest: 'wrong' } }), /approval/);
  const approved = lifecycle.advanceSkill(linted, 'approve', { source, approval: { digest: linted.digest, approvedBy: 'user', approvedAt: new Date().toISOString() } });
  assert.throws(() => lifecycle.advanceSkill(approved, 'publish', { source, version: '1.0.0', views: { codex: approved.digest, claude: 'different' } }), /reconcil/);
  const published = lifecycle.advanceSkill(approved, 'publish', { source, version: '1.0.0', views: { codex: approved.digest, claude: approved.digest } });
  assert.equal(published.versions[0].version, '1.0.0');
  assert.throws(() => lifecycle.advanceSkill(approved, 'publish', { source: source + 'changed', version: '1.0.0', views: {} }), /changed/);
});

test('a ledger through a junction is refused before creating any outside directories', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-confinement-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, 'repo'), outside = path.join(temp, 'outside');
  fs.mkdirSync(repo); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(repo, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const source = path.join(repo, 'SKILL.md'); fs.writeFileSync(source, '---\nname: fixture\ndescription: Fixture.\n---\n# Fixture\nRead a file.\n');
  const cli = fileURLToPath(new URL('../skill-lifecycle.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'draft', '--source', source, '--ledger', path.join(repo, 'linked/new/ledger.json')], { cwd: repo, encoding: 'utf8', windowsHide: true });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Linked/);
  assert.equal(fs.existsSync(path.join(outside, 'new')), false);
  const local = spawnSync(process.execPath, [cli, 'draft', '--source', source, '--ledger', path.join(repo, 'ledger.json')], { cwd: repo, encoding: 'utf8', windowsHide: true });
  assert.equal(local.status, 0, local.stderr);
});

test('draft refuses to overwrite unrelated JSON', () => {
  assert.throws(() => lifecycle.advanceSkill({ name: 'unrelated', version: '1.8.6' }, 'draft', { source: 'anything' }), /non-lifecycle/);
});
