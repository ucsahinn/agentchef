import test from 'node:test';
import assert from 'node:assert/strict';
import * as hints from '../validate-command-hints.mjs';

test('hints reject invented commands and flags without executing examples', () => {
  for (const text of ['`team-run cleanup --approve`', '`coordination-board fake --state b.json`', '`npm run chef -- --invented`', '```sh\nnode scripts/team-run.mjs start --state b.json --run R-123 --purge-logs\n```']) {
    assert.ok(hints.validateCommandText(text, 'example.md').length, text);
  }
});
test('hints accept scoped flags, aliases, quoted values and continuation lines', () => {
  for (const text of ['`team-run cleanup --approved --run R-123 --state b.json`', '`coordination-board brief-check --brief-file brief.md --json`', '`npm.cmd run chef -- --routing --task "say --invented"`', '```sh\nnode scripts/team-run.mjs plan \\\n --state b.json --repo . --plan-file plan.json --serialize-overlaps\n```', '`node scripts/team-run.mjs <command> --state <board.json> --json`', '`chef --status --repo-only`']) {
    assert.deepEqual(hints.validateCommandText(text, 'example.md'), [], text);
  }
});
test('hints validate each command separately in compound examples', () => {
  assert.equal(hints.validateCommandText('`team-run status --run R-123 --state b.json && team-run cleanup --typo`', 'compound.md').length, 1);
});
test('hints report filename and line, including CLI string hints', () => {
  const result = hints.validateCommandText('text\n`team-run statuz --run R-123`', 'guide.md');
  assert.match(result.join('\n'), /guide.md:2.*statuz/);
  assert.ok(hints.validateCommandText('const hint = "npm run chef -- --status --typo";', 'hint.mjs').length);
});
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('hints reject optional unknown flags and chef review typos', () => {
  for (const text of ['`team-run start --run R-123 [--invented]`', '`npm run chef -- review nope --target .`', '`npm run chef -- review pack --invented`', '`team-run` and `cleanup --typo`']) assert.ok(hints.validateCommandText(text, 'guide.md').length, text);
  assert.deepEqual(hints.validateCommandText('`npm.cmd --prefix $chefRoot run chef -- review pack --target $repo --out $out`', 'guide.md'), []);
});

test('command tables are read from the actual CLI source and fail closed on parser drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hint-contract-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    for (const file of ['team-run.mjs', 'coordination-board.mjs', 'chef-cli.mjs', 'external-review-cli.mjs']) fs.copyFileSync(`scripts/${file}`, path.join(root, 'scripts', file));
    const cli = path.join(root, 'scripts/team-run.mjs');
    fs.writeFileSync(cli, fs.readFileSync(cli, 'utf8').replace('"cleanup-approved"', '"reclaim-approved"'));
    const contracts = hints.readCommandContracts(root);
    assert.ok(hints.validateCommandText('`team-run merge --cleanup-approved`', 'guide.md', contracts).length);
    assert.deepEqual(hints.validateCommandText('`team-run merge --reclaim-approved`', 'guide.md', contracts), []);
    fs.writeFileSync(cli, 'const COMMANDS = new Map();');
    assert.throws(() => hints.readCommandContracts(root), /command table/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('hints respect real global flag scope and reject unsupported equals syntax', () => {
  for (const text of ['`team-run status --help`', '`coordination-board brief-check --state b.json --brief-file b.md`', '`team-run status --run=R-123`', '`npm run chef -- --lang=tr`']) assert.ok(hints.validateCommandText(text, 'guide.md').length, text);
});

test('hints check short flags instead of silently ignoring them', () => {
  for (const text of ['`team-run status -x`', '`coordination-board show -q`', '`chef --status -x`']) assert.ok(hints.validateCommandText(text, 'guide.md').length, text);
  assert.deepEqual(hints.validateCommandText('`chef -h`', 'guide.md'), []);
});
