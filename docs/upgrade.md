# Upgrade Guide

An upgrade should refresh AgentChef's managed files without flattening the
choices you already made. The flow below previews the incoming change, creates
a backup, applies only the managed surface, and verifies the installed runtime.

## Upgrading From Codex Chef 0.5.74 To AgentChef 0.6.0

0.6.0 is the first release under the AgentChef name. What changes for an
existing 0.5.74 installation:

- The repository moved to `https://github.com/ucsahinn/agentchef`; the old
  URL redirects, but update your remote:
  `git remote set-url origin https://github.com/ucsahinn/agentchef.git`.
- Node.js 22.12 or newer is required (Node 18 and 20 are end-of-life).
- The built-in Brain workflow is gone (see [Brain retirement](brain-retirement.md)).
  The installer no longer manages `~/.agents/skills/codex-chef-brain`; the old
  copy is left untouched and you may delete it yourself. `--continuity` and
  `CODEX_CHEF_BRAIN_HOME` are removed.
- On-disk identity is unchanged: the plugin id, ownership markers, backup
  folder names, and schema strings still use the `codex-chef` prefix, so no
  migration step is needed for 0.6.0. The identity rename is scheduled for
  1.0.0 with a dedicated, preview-first migration command.
- The German, Spanish, French, and Brazilian Portuguese README summaries were
  removed; English and Turkish documentation remain at full parity.

The regular update flow below applies; the preview will show the renamed
`AGENTS.md` text and the removed Brain skill step.

## Upgrading From 0.9.0 To 1.0.0

1.0.0 renames the on-disk identity from `codex-chef` to `agentchef`: the
ownership markers (`.agentchef-managed.json`, `.agentchef-source.json`), the
operation journal and lock names, backup-folder prefixes, receipt and report
schema strings (`agentchef.<name>.vN`), the plugin folder
(`plugins/agentchef-workflows`), the operator skill (`agentchef-operator`),
the personal marketplace name and plugin id (`agentchef-workflows@agentchef`),
the Git hook banner, and the `AGENTCHEF_*` environment variables.

Nothing breaks on upgrade day: every reader accepts the legacy spelling, so an
un-migrated home is still recognized as managed, repaired, verified, and
removed correctly. The conversion itself is one explicit, preview-first
command:

```powershell
npm run chef -- --migrate-identity                     # preview, Codex target
npm run chef -- --migrate-identity --target both       # preview, both targets
npm run chef -- --migrate-identity --target both --apply
```

The migration renames markers, the operator skill folder, and the plugin
folders; rewrites the marketplace entry, name, and plugin id; refreshes a Git
hook that still carries the legacy banner (only when its bytes match a shipped
template); rewrites Claude receipts and the operator skill link; and
re-registers the plugin through the `codex plugin` and `claude plugin` CLIs
when they are available. Backups land under `CODEX_HOME/backups/agentchef-migrate-*`.
Old backup folders keep their names and stay listed by `npm run chef -- --backups`.
Legacy `CODEX_CHEF_*` environment variables keep working and are reported so
you can rename them yourself.

1.0.0 also corrects where the Claude target finds the user-scope `.claude.json`:
`~/.claude.json` in the home directory, or `$CLAUDE_CONFIG_DIR/.claude.json`
only when that variable is set. 0.9.0 merged its MCP entries into
`~/.claude/.claude.json`, a file Claude Code does not read without the
variable. If a 0.9.0 Claude install left that file behind, rerun the installer
(it merges into the right file and rewrites the receipt), then delete the stray
`~/.claude/.claude.json` yourself once you have checked it holds nothing else.
The skill-link step now links only skills that are still in
`catalog/skills.json`; a managed directory that left the catalog is reported as
`retired` and left alone.

## Upgrading From 0.6.0 To 0.9.0

0.9.0 adds Claude Code as a second install target. For an existing Codex
install nothing changes by default: the update flow below keeps managing
`~/.codex` and `~/.agents` exactly as before, and on-disk identity still uses
the `codex-chef` prefix. New in 0.9.0:

- `--target codex|claude|both` on the installers, `npm run chef -- --install`,
  `--preview`, `--reset`, and the new `--remove`. Interactive installs
  detect the `codex` and `claude` CLIs and ask which targets to manage.
- The Claude Code surface is installed by one transaction helper
  (`scripts/install-claude-target.mjs`); see
  [Claude Code surfaces](claude-surfaces.md).
- `npm run chef -- --remove --target <t>` is a preview-first removal that
  deletes only AgentChef-owned files, links, marketplace entries, and
  receipt-recorded settings; user content, Git guards, and backups stay.
- `npm run verify:install:runtime -- --target claude` and
  `npm run codex:status -- --target both` verify the Claude side.

## Safe Upgrade Flow

The guided CLI wraps the safe path:

```powershell
npm run chef -- --update
npm run chef -- --update --verbose-plan
npm run chef -- --update --apply
```

Without `--apply`, update mode does not change managed/global files; normal CLI
logs are still repo-local unless `--no-log` is supplied. The default preview is
concise; `npm run chef -- --update --verbose-plan` prints the full install
dry-run evidence. Apply mode blocks tracked or staged worktree edits, while
preserving unrelated untracked files, and runs
`git pull --ff-only`. If the pull advances the repo, the same approved CLI
runs a fresh installer preview from the updated tree, continues local validation, refreshes managed files,
and verifies installed-runtime parity. A second invocation is not required.
If the repo is already current, apply runs local validation and refreshes managed files through the backup-backed
installer without installing curated global skills or optional global Git
guards.

Manual flow:

1. Pull the repository update.
2. Review the diff.
3. Preview installer changes.
4. Run the installer only after the preview looks correct.
5. Restart Codex.
6. Verify active config and skills.

PowerShell:

```powershell
git pull
npm run check
node scripts/plan-install.mjs --all --json
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
.\scripts\install.ps1 -All -Interactive
npm run verify:install:runtime -- --expect-skills
```

Bash or WSL:

```bash
git pull
npm run check
node scripts/plan-install.mjs --all --json
./scripts/install.sh --all --dry-run
./scripts/install.sh --all --interactive
npm run verify:install:runtime -- --expect-skills
```

`-Force` / `--force` is for deliberate replacement upgrades. A normal first
install or existing-user refresh should omit force so existing `config.toml` is
merged and other existing managed files are skipped. During replacement
upgrade, force is safe only after you reviewed the preview and are comfortable
replacing managed targets from this repo's templates.

If you intentionally want to replace managed targets from the current repo
templates after reviewing the preview, rerun the same installer with `-Force`
or `--force`.

## Backups

By default, overwritten managed files are backed up under:

```text
~/.codex/backups/codex-chef-YYYYMMDD-HHMMSS/
```

Do not use `-NoBackup` or `--no-backup` unless you already have another backup.

List and inspect available backup archives before rollback:

```powershell
npm run chef -- --backups
npm run chef -- --backups --backup <id>
npm run chef -- --backups --backup <id> --delete
```

The backup archive inspect view is metadata-only and prints paths, sizes,
hashes, manifest status, and restorable targets without printing file contents.
Deletion is preview-first; add `--apply` only after confirming the resolved
archive path belongs to the backup you no longer need.

## What To Compare

Review these files before upgrading:

- `templates/codex/AGENTS.md`
- `templates/codex/config.windows.toml`
- `templates/codex/config.unix.toml`
- `templates/codex/profiles/full.config.toml`
- `templates/codex/profiles/multi-session.config.toml`
- `templates/codex/profiles/token-safe.config.toml`
- `templates/codex/rules/default.rules`
- `catalog/skills.json`
- `catalog/skills-lock.json`
- `catalog/agents.json`
- `catalog/mcp-servers.json`
- `manifests/install-plan.json`
- `schemas/install-plan.schema.json`

## After Upgrade

Run:

```bash
codex doctor --summary
npm run token:audit
npm run chef -- --processes --no-log
npm run verify:install:runtime -- --expect-skills
codex exec --strict-config "Summarize the active Codex setup."
```

Confirm the installed agent role files do not reintroduce per-agent
`model`/`model_reasoning_effort` pins, and use `token-safe.config.toml` for
broad or long-running sessions where lower output volume matters more than
maximum default reasoning.

Older local `conservative`, `trusted-project`, or `full-access` profile files
may still contain hard model pins from earlier releases. Preview the repair,
then opt in to the backup-backed migration only if those pins should be removed:

```bash
node scripts/repair-install.mjs --migrate-legacy-profile-pins
node scripts/repair-install.mjs --apply --migrate-legacy-profile-pins
```

The migration removes only the legacy model/reasoning pin fields. It preserves
the profile files, current default profile, project trust, approvals, sandbox
settings, custom MCPs, and the rest of the user-owned config overlay.

Inside Codex, check:

```text
/mcp
/skills
/plugins
/hooks
```

If `/hooks` reports a new or changed process-hygiene source hash, inspect it
before trusting it. Upgrade and repair do not bypass Codex hook trust.

## Rollback

1. Close Codex.
2. Preview restore from the selected backup archive:
   `npm run chef -- --backups --backup <id> --restore`.
3. Apply only after the preview is correct:
   `npm run chef -- --backups --backup <id> --restore --apply`.
4. Restart Codex.
5. Re-run `codex doctor --summary`.

The restore apply path creates a rollback backup of current targets first. It
restores only known AgentChef-managed files and does not delete old backup
archives automatically.
