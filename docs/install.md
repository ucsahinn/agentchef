# Installation Guide

Codex Chef installs into the current user's Codex home. That is `~/.codex` by
default; when `CODEX_HOME` is set, the installer respects that path instead.
Start with a preview so the first real write is never a surprise.

An app-managed or account-specific Codex profile is an independent Codex home;
it does not inherit root settings from `~/.codex/config.toml`. AgentSpace worker
profiles must therefore carry `sandbox_mode = "workspace-write"`,
`approval_policy = "on-request"`, and `approvals_reviewer = "auto_review"` in
their own `config.toml`. Restart the worker in a new pane after changing that
profile. Point `CODEX_HOME` at an alternate profile only when you intentionally
want the preview and installer to target it.

## Prerequisites

- Codex CLI or Codex app installed.
- Git installed.
- Node.js 18 or newer for validation and optional skill installation.
- `npx` available for the default stdio MCP servers and verified public skill
  installation.
- Optional: Gitleaks for stronger pre-commit and pre-push scanning.
- Optional on Windows: `winget` and current Windows 11 for the best native
  sandbox path.
- `uvx` for the pinned Serena backend. The installed bridge itself is Node-based
  and starts without `uvx`; `uvx` is needed only when semantic navigation is
  actually requested.

## PowerShell Install

Preview without writing:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
```

Inspect the manifest-backed operation plan without invoking either installer:

```bash
node scripts/plan-install.mjs --all --summary --redact-paths
node scripts/plan-install.mjs --all --json
```

List available manifest profiles and operations before reviewing the full JSON:

```bash
node scripts/plan-install.mjs --list-profiles
node scripts/plan-install.mjs --list-operations
```

The summary keeps normal previews short; the JSON and full human plan list
managed targets, optional global Git changes, curated skill commands, collision
policy, backup behavior, and risk level.
The selected manifest profile is the normative operation contract used by the
planner and installers. Its ordered operations include copied files, generated
`full`/`multi-session`/`offline` profiles, direct-skill ownership markers,
installed-plugin cache refresh, and the Unix hook-permission step instead of
leaving those mutations as undocumented installer behavior.
The profile operation includes `development.config.toml`,
`review.config.toml`, `ci.config.toml`, `token-safe.config.toml`,
`full.config.toml`, and `multi-session.config.toml`.
`full` and `multi-session` are generated from the installed platform-specific
MCP transport blocks, then change only the bundled local servers' `enabled`
states. This avoids profile-layer table replacement dropping Sequential
Thinking, Serena, or their launch details.

Default-enabled MCPs still have launcher prerequisites. Node/npx-backed MCPs
start after Node can download their pinned packages. Serena is default-enabled
through `serena-pool.mjs`, a local bridge installed beside `config.toml`. It
starts no Serena or language server at Codex startup. On the first allowlisted
semantic tool call it starts one pinned, loopback-only backend for that
canonical project; same-project sessions reuse it, while separate worktrees
remain isolated. The bridge uses an owner-only local token and an isolated UV
cache under the Codex home, never in project source or config. If `uvx` is
missing, only that first semantic call fails; install `uvx` or disable Serena.

Install after the preview is correct:

```powershell
git clone https://github.com/ucsahinn/codex-chef.git
cd codex-chef
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -Interactive
```

Automation-friendly install without questions:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All
```

Repair an existing global Codex setup:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair -WhatIf
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair
```

Repair mode is for machines that already have a Codex setup. It previews or
applies backup-backed reconciliation for Codex Chef-managed guidance, rules,
agent/profile files, the bundled plugin, all eleven managed direct local
workflows, `serena-pool.mjs`, missing config blocks, and the local plugin
marketplace entry. The launcher, Serena bridge, generated/copied profiles,
ownership markers, marketplace, and every other selected source and target are
preflighted before the first managed write; a missing, linked, or unsafe path
fails closed. It
preserves unrelated marketplace plugins and never deletes user skills; extra
or duplicate global skills are reported as cleanup candidates. If the
namespaced Codex Chef plugin is already installed, preview reports a stale
versioned plugin cache and apply refreshes it in place. Repair never installs
the plugin for a user who has not already installed it.

Update an existing checkout and managed setup through the guided CLI:

```powershell
npm run chef -- --update
npm run chef -- --update --verbose-plan
npm run chef -- --update --apply
```

Without `--apply`, update mode does not change managed/global files; normal
CLI logs are still repo-local unless `--no-log` is supplied. The default
preview is concise; `npm run chef -- --update --verbose-plan` prints the full
install dry-run evidence. Apply mode requires a clean worktree and runs
`git pull --ff-only`. If the pull advances the repo, the same approved CLI
prints a fresh preview, runs the bounded update-integrity validation and managed refresh, then
verifies installed-runtime parity. If the repo is already current, apply refreshes managed
files through the backup-backed update mode. The broad `npm run check` suite remains a CI/release
gate; Update does not make routine users wait for installer-smoke scenarios.
Update synchronizes source-owned files after backup and preserves unrelated
extras in managed directories. It also synchronizes managed config tables and
preserves user-owned `config.toml` settings. It does not install curated global skills
or optional global Git guards; use `--install --apply` or `--skills --apply`
when you want those explicit surfaces. An already-installed namespaced Codex
Chef plugin is refreshed and version-verified after its managed source is
synchronized; update leaves an uninstalled plugin uninstalled.

Inspect or restore Codex Chef backup archives through the same CLI:

```powershell
npm run chef -- --backups
npm run chef:backups
npm run chef -- --backups --backup <id>
npm run chef -- --backups --backup <id> --restore
npm run chef -- --backups --backup <id> --delete
npm run chef -- --backups --backup <id> --restore --apply
npm run chef -- --backups --backup <id> --delete --apply
```

The list and inspect commands are metadata-only: they show backup archive
locations, manifest status, verified-restorable file counts, sizes, and hashes
without printing file contents. An archive is not labelled restorable until its
manifest, full file set, hashes, and target allowlist all pass. Restore is a
preview unless `--apply` is supplied. The apply path reads and verifies the
exact source bytes, creates a new rollback backup of current targets, and then
copies known Codex Chef-managed files back as a rollback-protected transaction.
Commit-pinned skill replacement backups use a namespaced manifest and restore
the previous skill tree exactly, rather than leaving files from the replacement.
Restore fails
closed unless a valid `codex-chef.backup.v1` manifest exactly matches every
archive file by path, size, and SHA-256; missing, extra, altered, or unsupported
control-plane files such as auth, hook, session, memory, and cache state are
rejected. `--json` follows the same behavior: write requests report explicit
`applyRequested`, `applied`, and `outcome` fields and do not return a preview as
an applied result. Delete is also preview-first: `--delete` prints the resolved
archive path without removing it, and `--delete --apply` removes only the
selected Codex Chef backup archive under the canonical backup root.

## Codex Chef CLI Reference

The root README keeps the first-run path short. Use this section when you need
the full operator reference.

```powershell
npm run chef
npm run chef -- --status
npm run chef -- --status --details
npm run chef -- --status --repo-only
npm run chef -- --preview
npm run chef -- --preview --verbose-plan
npm run chef -- --update
npm run chef -- --update --verbose-plan
npm run chef -- --backups
npm run chef:backups
npm run chef -- --backups --backup <id> --delete
npm run chef -- --reset --apply
npm run chef -- --repair --apply
npm run chef -- --install --apply
npm run chef -- --skills
npm run chef -- --mcp
npm run chef -- --routing
npm run chef -- --continuity
npm run chef -- --diagnostics
npm run chef -- --processes
npm run chef -- --processes --cleanup-stale
npm run chef -- --auth
npm run chef -- --logs
npm run chef -- --help --lang tr
npm run chef -- --status --repo-only --no-log
```

The command center is state-aware. Before an interactive full install, it reads
the existing managed-file and curated-skill state and prints a compact preview.
A fresh or incomplete setup can continue to typed `APPLY`; an already complete
setup exits successfully without reinstalling; managed drift is directed to the
backup-backed repair flow instead of being presented as a clean first install.
Direct commands remain preview-first unless their documented `--apply` flag is
present.

The bundled plugin also installs one reviewed `SessionEnd` process-hygiene
hook. Start a new Codex session after install or refresh, open `/hooks`, inspect
the exact source/hash, and trust it only when it matches this repository. Hook
trust is intentionally not bypassed by the installer. See
[multi-session process hygiene](process-hygiene.md) for profiles, audit fields,
the 45-second grace period, and the separately gated cleanup command.

`Skill status & catalog` separates commit-pinned upstream skills, bundled/direct
Codex Chef skills, other user-installed skills, and the total visible global
inventory. A same-named directory is not enough: upstream entries need matching
source provenance and bundled entries need valid managed ownership. Only
missing or invalid upstream entries are offered for individual installation;
bundled/direct drift routes to repair. User-installed skills are counted and
preserved.

`MCP connectors` reads the installed `CODEX_HOME/config.toml` and separates
configured-and-enabled, configured-but-disabled, cataloged-but-not-configured,
and user-added connectors. These are configuration states, not live-health
claims. `codex mcp list --json` proves configuration discovery only; live
server/tool health remains unprobed until `/mcp` in a restarted Codex session
or another actual initialization probe succeeds.

The default status board is compact. Add `--details` to restore the per-MCP
inventory, routing controls, context budget, setup notes, target/ambient Codex
comparison, and log metadata.

`--routing` shows the task-shape map, expected skills and MCPs, and the
operator reporting contract. Use `/agent` to inspect and close completed agent threads;
use `/ps` and `/stop` for live terminal work started by the current
Codex session. `--diagnostics` includes the Serena/MCP process-audit command
and other read-only evidence commands, but it does not stop processes or mutate
global files.

`--continuity` makes Control and Brain visible without changing either system.
It reports the `codex-control-router` skill, installed `codex_control` MCP
configuration, bundled Brain skill, and an explicitly configured
`CODEX_CHEF_BRAIN_HOME` vault. Immediate work remains in the current session;
Control activates only for an explicit delayed, background, recurring,
restart-resilient, monitored, or Control-managed request. Brain automatic
capture stays disabled, and all Brain writes remain preview-first and
apply-gated.

The CLI subprocess can verify installed Control configuration but cannot call
the current Codex session's MCP tools. Confirm live project health from the
active Codex session with the Control MCP (or use `codex-control status --json`
from the owner terminal). A Control project's `brainMapped: true` state is
separate from the local `CODEX_CHEF_BRAIN_HOME` vault; configuring one does not
silently configure or write the other.

Installed and ready skills do not execute by themselves. A skill enters Codex
context when the user names it or the task clearly matches its description;
live activation is proven when the assistant prints `Skill selected` and reads
the skill's `SKILL.md` before acting.

If GitHub release, push, or workflow checks fail because local GitHub
authentication is stale, refresh GitHub CLI or Git Credential Manager according
to your organization policy. Keep account-scoped credential repair outside this
repository and never paste tokens into repo files, logs, prompts, skills, rules,
or shell history.

Useful switches:

- `-All`: install Codex templates, the local Codex Chef plugin, specialist
  agents, profiles, rules, and verified public/first-party skills. It does not
  change global Git config.
- Every default managed install synchronizes all eleven canonical local workflow
  sources to `AGENTS_HOME/skills/<name>`. This makes direct calls such as
  `$adaptive-agent-routing`, `$context-budget-planner`, `$fetch <url>`, `$seo
  <target>`, and `$evidence-research <question>` available without installing
  the plugin. Fetch disables implicit invocation; SEO and Evidence Research
  allow it only for unambiguous matching requests. If an exact direct target
  contains a foreign skill, installation fails before any managed write.
- The personal marketplace entry makes `codex-chef-workflows` discoverable; it
  does not install or enable the plugin. To use
  `$codex-chef-workflows:<skill-name>`, run `codex plugin add
  codex-chef-workflows@codex-chef --json` (or use `/plugins`) and start a new
  Codex session. After that explicit first install, later installer, update,
  and repair applies refresh a stale versioned plugin cache in place and verify
  the active version. They do not install the plugin before that opt-in.
- The personal marketplace reads its plugin mirror from
  `AGENTS_HOME/plugins/sources/codex-chef-workflows` through a path relative to
  the marketplace root. A custom `AGENTS_HOME` is an installer destination,
  not proof that the active Codex host discovers that marketplace. For a
  non-default root, register it with `codex plugin marketplace add <root>` and
  verify the resolved root with `codex plugin marketplace list --json`.
- `-AdoptFetchSkill`: explicitly adopt only
  `AGENTS_HOME/skills/fetch` after a foreign-collision preflight. The Bash
  equivalent is `--adopt-fetch-skill`. Normal install and repair never infer
  this authority.
- `-AdoptSeoSkill`: explicitly adopt only `AGENTS_HOME/skills/seo` after
  reviewing the foreign collision. The Bash equivalent is
  `--adopt-seo-skill`.
- `-AdoptEvidenceResearchSkill`: explicitly adopt only
  `AGENTS_HOME/skills/evidence-research`. The Bash equivalent is
  `--adopt-evidence-research-skill`.
- `-AdoptDirectSkill <name>`: explicitly adopt another cataloged direct skill.
  The Bash equivalent is `--adopt-direct-skill=<name>`.
- `-InstallSkills`: install `catalog/skills.json` entries that have
  `install: true`, a verified `package` in `owner/repo` format, a full commit
  SHA, and a matching `skill` name. The installer fetches that exact commit,
  verifies the selected skill, stages and hashes a native copy, then atomically
  activates it. It does not execute fetched repository code or a
  registry-delivered installer. A matching valid Codex Chef provenance marker
  permits a backup-backed managed upgrade. An unmarked, foreign, or locally
  drifted same-name target is preserved and reported as skipped.
  `--adopt-existing` is intentionally not a broad installer flag: after
  reviewing that exact target, rerun only its printed
  `install-pinned-skill.mjs` command with `--adopt-existing`.
- `-InstallGitGuards`: install global Git ignore, global pre-commit hook, and
  set `core.excludesfile` plus `core.hooksPath`. This is intentionally separate
  because it affects every Git repository for the current user. Existing
  foreign file or key state fails closed unless the exact conflict is adopted
  with `-AdoptGitIgnore`, `-AdoptGitHook`, `-AdoptGitExcludesFile`, or
  `-AdoptGitHooksPath`. Each switch grants authority only for its named file or
  key; it does not adopt the other three surfaces.
- `-Force`: after creating backups, replace managed individual files and
  synchronize only source-owned entries in managed directories. Unrelated
  directory extras are preserved. Use this for deliberate upgrades only after
  reviewing `-WhatIf`; without it, existing
  `config.toml` is backed up and receives only missing Codex Chef blocks, while
  existing agent files and rules are skipped. The personal plugin marketplace
  file is not replaced; only the Codex Chef entry is added or updated after
  backup and unrelated plugin entries are preserved.
- `-Repair`: repair an existing setup with the shared repair engine. With
  `-WhatIf`, it prints a no-write repair plan. Without `-WhatIf`, it backs up
  and repairs managed drift. It does not delete user skills.
- `-NoBackup`: compatibility switch accepted only for a fully creation-only
  apply into empty targets. If any selected action would merge, replace,
  delete, prune, adopt, refresh a cache, change global Git state, or touch an
  existing managed target, preflight rejects the run before the first write.
- `-WhatIf`: preview file, Git, and skill operations without changing the real
  setup.
- `-Interactive`: ask before using custom Codex/Agents home values and before
  enabling optional global Git guards. It also asks whether to install the
  reviewed skills, whether to force-replace managed files after backup, and
  whether to continue after the plan summary. It never asks for tokens or
  credentials.
- `-PlainOutput`: use ASCII status markers instead of emoji, useful for older
  Windows consoles, CI logs, and terminals that render Unicode poorly.

## Bash Install (macOS, Linux, Or WSL)

Preview without writing:

```bash
./scripts/install.sh --all --dry-run
```

Install after the preview is correct:

```bash
git clone https://github.com/ucsahinn/codex-chef.git
cd codex-chef
chmod +x scripts/install.sh
./scripts/install.sh --all --interactive
```

Useful flags:

- `--all`: recommended full Codex Chef setup without global Git config changes.
- `--install-skills`
- `--adopt-fetch-skill`, `--adopt-seo-skill`, and
  `--adopt-evidence-research-skill`: adopt only the named foreign direct target
  after review; normal install and repair fail closed.
- `--adopt-direct-skill=<name>`: adopt another cataloged foreign direct target
  after review.
- `--install-git-guards`: opt in to global Git ignore and hook settings.
- `--adopt-git-ignore`, `--adopt-git-hook`,
  `--adopt-git-excludes-file`, and `--adopt-git-hooks-path`: grant adoption
  authority for exactly one conflicting Git-guard file or key. Unselected
  foreign state still fails closed.
- `--force`: after backup, replace managed individual files and synchronize
  only source-owned directory entries while preserving unrelated extras;
  without it, existing
  `config.toml` is merged and other existing managed files are skipped. The
  personal plugin marketplace file is not replaced; only the Codex Chef entry
  is added or updated after backup and unrelated plugin entries are preserved.
- `--repair`: preview or apply backup-backed repair for an existing global
  Codex setup. Use it with `--dry-run` for a no-write plan.
- `--no-backup`: creation-only compatibility mode. It fails before any write
  when an existing target or any merge, replacement, deletion, adoption,
  cache refresh, or global mutation is selected.
- `--dry-run`
- `--plain-output`: use ASCII status markers.
- `--interactive`: guided macOS/Linux/WSL setup with the same path, skills, force,
  Git-guard, and continue prompts.

Both installers finish with a capability board that lists the specialist
agents, default-ready MCP servers, disabled opt-in MCP connectors, bundled
plugin skills, reviewed global skills, enterprise routing profiles, and MCP
setup notes. The setup notes call out local tooling, OAuth authorization,
filesystem-path selection, broad/destructive graph-indexing, and
Supabase project/read-only requirements before a task needs that connector. Account,
database, production, broad filesystem, and broad/destructive graph-indexing
connectors remain disabled unless you explicitly enable them later. Local
codebase graph reads are enabled only with destructive/admin graph tools
disabled.
Agent role files are installed without per-agent model/reasoning pins. The
active profile and Codex runtime choose the task-appropriate balance; use
`token-safe.config.toml` for broad or long-running work that needs lower
verbosity and tighter tool-output limits without disabling skills, agents, or
MCPs.

Codex Chef treats its template as the canonical managed baseline and the
existing machine configuration as a user-owned overlay. Normal install and
repair preserve the user's model and reasoning choice, approval and sandbox
settings, project trust entries, custom MCP servers, and unrelated personal
plugin marketplace entries. Chef-managed agent/MCP safety tables are merged
and validated; `--force` remains the explicit backup-backed synchronization
boundary and never authorizes removal of unrelated directory extras. This keeps
the package global and reusable without turning one machine's profile or trust
state into a distributable default.

## What Gets Backed Up

Existing files are copied into:

```text
~/.codex/backups/codex-chef-YYYYMMDD-HHMMSS/
```

New backups also include `.codex-chef-backup.json`, a small manifest with the
operation, package version, platform, backup-relative paths, sizes, hashes, and
any archive issues detected while writing metadata.

Before the first managed write, a per-home operation lock and an atomic
`.codex-chef-operation-journal.json` are created. Each completed managed write
records its post-write hash and the exact backup (when one existed). If a later
installer step fails, only targets that still match the installer-written hash
are restored or removed; a target changed after the write is preserved and the
journal remains as recovery evidence. An interrupted journal can supply the
same hash-validated restore inventory when the final manifest was not written.

On Unix, the installer prepares a missing `CODEX_HOME` before attempting the
atomic per-home lock. A lock-directory collision still fails closed as a
concurrent operation. Normal completion explicitly finishes the journal and
releases only the lock whose owner identity matches the current installer; the
exit trap retains the same cleanup path for failures and interruptions.

The installer backs up managed targets before replacing them:

- `AGENTS.md`
- `config.toml`
- `rules/default.rules`
- `agents/*.toml`
- managed profile files in `CODEX_HOME`
- personal plugin marketplace file
- both managed plugin mirrors
- all managed direct-skill directories and ownership markers

Managed directory updates synchronize source-owned entries and preserve
unrelated extras. A destructive prune remains a separate, explicit,
backup-backed operation. Before any write, the installer rejects symlink or
junction components below the configured homes so a managed-looking path
cannot escape to another directory.

Global Git guards use a separate typed recovery receipt because their two files
and two Git config keys are outside the ordinary managed-file archive. Before
mutation, apply records the exact prior bytes, file mode, presence/absence, and
ordered key values in `codex-chef.global-git-guards-receipt@1`. It also binds
the expected managed file hashes, Unix modes, and Git config values produced by
apply. If apply fails, the transaction rolls back from that receipt. Keep the receipt and use the
exact restore command printed by the installer; the underlying form is:

```bash
node scripts/manage-global-git-guards.mjs restore --home <home> --receipt <receipt-path> --json
```

Restore validates the receipt schema, recorded home, exact two-file/two-key
allowlist, size, paths, and link safety before restoring prior values or
removing targets that were previously absent. Restore refuses to write if a
managed file, mode, or key changed after apply, so later user edits are not
clobbered and the original repository templates are not needed. It is intentionally separate
from the `codex-chef.backup.v1` archive flow.

## Post-Install Checks

Restart Codex, then run:

```bash
codex doctor --summary
npm run codex:routing
npm run codex:status
npm run verify:install:runtime
codex exec --strict-config "Summarize the active Codex setup."
```

`npm run codex:routing` prints the enterprise routing board from
`catalog/routing-profiles.json`: task shapes, matching subagents, skills, MCPs,
and config/profile flags. The board is a visible routing contract, not a hidden
execution hook; risky account, deployment, database, destructive, and broad
filesystem actions still require explicit approval.

`npm run codex:status` is the end-user status board. It combines repo-only
starter health, installed-runtime drift, direct Codex doctor check summaries,
skill context-budget warnings, routing board summary, effective control summary,
and MCP setup notes. Use `npm run codex:status:all` when the real install
intentionally included curated skills and optional Git guards.

`npm run verify:install:runtime` is read-only. It checks the installed
`~/.codex` and `~/.agents` targets, checks managed agent, rule, profile, and
plugin files plus the installed `serena-pool.mjs` bridge for source drift, then
runs Codex CLI checks with `CODEX_HOME`
explicitly pointed at the installed target. If the ambient shell is reading a
sandbox or alternate `CODEX_HOME`, the verifier reports that drift as a warning
while still proving whether the installed target exposes the expected MCP
config.

Live probes print progress and use short per-probe timeouts. Add `--offline`
when live/network checks are unavailable, or `--no-mcp-probe` to validate the
managed install and Codex CLI without starting the MCP probe.

Inside Codex, use:

```text
/mcp
/skills
/plugins
/hooks
```

## Test Without Touching Your Real Setup

PowerShell:

```powershell
$env:CODEX_HOME = "$PWD\tmp\codex-home"
$env:AGENTS_HOME = "$PWD\tmp\agents-home"
.\scripts\install.ps1 -Force -WhatIf
```

Bash:

```bash
CODEX_HOME="$PWD/tmp/codex-home" AGENTS_HOME="$PWD/tmp/agents-home" \
  ./scripts/install.sh --force --dry-run
```

Use non-dry-run temp homes only when you intentionally want a smoke install.
Remove `tmp/` only when you created it intentionally.

### Portable Workspace OS Boundary

This is a portable Workspace OS install test: `CODEX_HOME` and `AGENTS_HOME`
are explicit, repository-relative targets, so the same commands work on another
PC without copying a user's real Codex state. Codex Chef installs only its own
Codex runtime templates, agents, skills, MCP configuration, and backup-backed
managed files into those targets. It does not install or control Codex Chef
Control, Codex Chef Brain, or Kitchen; those remain separate authority layers.

For an isolated, non-dry-run smoke install, choose a fresh folder you own and
review the plan before adding `--apply`:

```powershell
$portableRoot = Join-Path $PWD ".codex-chef-portable"
$env:CODEX_HOME = Join-Path $portableRoot "codex"
$env:AGENTS_HOME = Join-Path $portableRoot "agents"
node .\scripts\repair-install.mjs --preview --redact-paths --json
```

Do not reuse another person's home, copy `auth.json`, Brain notes, sessions, or
Control/Kitchen databases into this folder. A fresh machine can instead run the
same preview with its own empty portable root, then opt into a real user-home
install only after reviewing its backup-backed plan.

If you already have a Codex setup, inspect the repair plan first:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair -WhatIf
```

If repair is clean, continue with the normal install command. Existing
`config.toml` is backed up and merged; existing user tables are preserved.
Other existing managed files are skipped unless you use `-Force` / `--force`
after reviewing the preview. Force replaces only managed individual files and
synchronizes source-owned directory entries; unrelated extras remain. The
personal plugin marketplace keeps unrelated
entries and receives only the Codex Chef entry upsert after backup. When managed
drift exists, `-Repair` / `--repair` is the safer first step before force
synchronization.

## Rollback

1. Close Codex.
2. List backup archives with `npm run chef -- --backups`.
3. Preview restore from the selected archive:
   `npm run chef -- --backups --backup <id> --restore`.
4. Apply only after the preview is correct:
   `npm run chef -- --backups --backup <id> --restore --apply`.
5. Restart Codex.
6. Run `codex doctor --summary`.

Restore creates a rollback backup of the current managed targets first. The
installer and CLI do not delete backups unless you explicitly run the
preview-first backup delete flow with `--apply`.
