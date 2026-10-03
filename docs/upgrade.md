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
  migration step is needed for 0.6.0. The identity rename shipped in
  1.0.0 with a dedicated, preview-first migration command.
- The German, Spanish, French, and Brazilian Portuguese README summaries were
  removed; English and Turkish documentation remain at full parity.

The regular update flow below applies; the preview will show the renamed
`AGENTS.md` text and the removed Brain skill step.

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
  The generated MCP profiles (full, multi-session, offline) also stay. The
  cached pinned-skill checkouts under `CODEX_HOME/cache/pinned-skill-sources`
  that carry AgentChef's receipt are removed without a backup, because a
  reinstall downloads them again from the pinned commit. A plugin marketplace
  file left holding nothing but AgentChef's own empty skeleton is removed with
  the entry. `CODEX_HOME/serena-pool` keeps the local pool token, which both
  harnesses share; delete it once no session is open. While a `config.toml`
  merged into your own settings stays, the Serena bridge and agent role files
  it points at stay as `kept-referenced`, so Codex keeps starting cleanly.
  Remove the `[mcp_servers.serena]` and `[agents.*]` tables, then run the
  removal again to delete them.
- `npm run verify:install:runtime -- --target claude` and
  `npm run codex:status -- --target both` verify the Claude side.

## Upgrading From 0.9.0 To 1.0.0

1.0.0 renames the on-disk identity from `codex-chef` to `agentchef`: the
ownership markers (`.agentchef-managed.json`, `.agentchef-source.json`), the
operation journal and lock names, backup-folder prefixes, receipt and report
schema strings (`agentchef.<name>.vN`), the plugin folder
(`plugins/agentchef-workflows`), the operator skill (`agentchef-operator`),
the personal marketplace name and plugin id (`agentchef-workflows@agentchef`;
the plugin itself became `agentchef` in 1.3.0),
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

The migration also rewrites the banner comments and the plugin-id keys
AgentChef itself wrote into `CODEX_HOME/config.toml` (including the
`[hooks.state."<plugin id>:…"]` key) and removes an emptied legacy plugin-cache
directory. When the plugin has already been re-added under its new id, Codex has
written that hook-state table itself; the legacy table is then dropped rather
than renamed, so the file never ends up with two identical tables. Other products' tables, project trust entries, and your own settings
in that file are never touched.

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

## Upgrading From 1.x To 1.2.0

No migration step is needed. Run the guided update; it refreshes every target
that is installed (the Codex target, the Claude Code target, or both) and moves
Claude Code to the new plugin version:

```powershell
npm run chef -- --update            # preview
npm run chef -- --update --apply    # apply after review
```

Pass `--target codex|claude|both` to choose explicitly. After the update the
Serena backend is fetched once more for the new pin (v1.7.0), so the first
semantic call takes longer. See the [release notes](release-notes.md) for what
changed.

## Upgrading From 1.0–1.2 To 1.3.0

1.3.0 renames the plugin from `agentchef-workflows` to `agentchef`. Calls now
read `$agentchef:<skill>` in Codex, `/agentchef:<skill>` in Claude Code (bare
`/<skill>` also works there when no other command has that name), and
`agentchef:<role>` for a role.

Every AgentChef skill now reaches both CLIs only as a plugin skill. The ten
bundled skills ship inside the plugin, and the fifteen pinned upstream skills
(`-All`, `-InstallSkills`, `--all`, `--install-skills`) are written into the
same plugin source, `AGENTS_HOME/plugins/sources/agentchef/skills/<name>`,
each with its `.agentchef-source.json` provenance record. The installer no
longer copies skills into `AGENTS_HOME/skills` and no longer links skills into
`~/.claude/skills`, so each skill is listed once per CLI instead of twice.
`-AdoptSkillLinks`, `--adopt-skill-links`, and the `-Adopt*Skill` /
`--adopt-*-skill` flags are still accepted but only print a warning.

Convert a 1.0–1.2 install with the migration command; preview first:

```powershell
npm run chef -- --migrate-identity --target both          # preview
npm run chef -- --migrate-identity --target both --apply
```

The migration renames the plugin folders, the marketplace entries, and the
Codex `[plugins."agentchef-workflows@agentchef"]` and hook-state tables, and
swaps the Codex and Claude plugin registrations. It also retires AgentChef's
own direct skill copies in `AGENTS_HOME/skills`: each copy is backed up, then
removed. A copy is retired only when its marker (`.agentchef-managed.json`)
or provenance record (`.agentchef-source.json`) proves it is AgentChef's, and
only when the plugin source already holds that skill. A pinned copy whose
skill the plugin does not hold yet is kept (decision `keep-until-plugin`)
until the installer has written it into the plugin; run the full install, then
the migration again. Claude links that point into a retired copy are removed
with it and dropped from the install receipt. Your own skills and foreign
links are never touched.

The Claude installer also retires the skill links its previous install
receipt recorded, but only after the plugin was registered successfully. If
registration is skipped or fails, the links stay and stay recorded.

After the migration, AgentChef skills are no longer under `~/.agents/skills`.
Other tools that read `~/.agents/skills` directly no longer see them; only
Codex and Claude Code, through the plugin, do.

`npm run verify:install:runtime -- --expect-skills` checks the skills inside
the plugin source and warns, without failing, when a skill still has a direct
copy outside the plugin, pointing to the migration command.

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
~/.codex/backups/agentchef-YYYYMMDD-HHMMSS-<pid>/
```

Archives made before 1.0.0 start with `codex-chef-`. The Claude Code target
backs up the files it changes under `~/.claude/agentchef/backups/agentchef-*`.

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
