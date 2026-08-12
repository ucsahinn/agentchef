# Verification

Run the full local gate before committing, pushing, or telling another user to
install the setup.

```bash
npm run check
```

This runs:

- `scripts/validate-repo.mjs`: repository shape, JSON/TOML heuristics, plugin
  manifest, skill metadata, MCP metadata, README signals, SVG accessibility, and
  basic leak-pattern checks. It also checks that `package.json`, `CHANGELOG.md`,
  and release notes agree on the current version.
- `scripts/validate-docs.mjs`: Markdown relative link checks and GitHub workflow
  shape checks.
- `scripts/validate-readme-locales.mjs`: root README language switcher,
  localized entry-point files, shared install/verification signals, and
  placeholder localization checks.
- `scripts/validate-workflow-security.mjs`: GitHub Actions hardening checks for
  least-privilege permissions, `actions/checkout` credential persistence,
  publish/auth command boundaries, and implicit dependency installs.
- `scripts/validate-install-plan.mjs`: install manifest, collision policy,
  required flags, source paths, and high-risk operation checks.
- `scripts/validate-install-state-preview.mjs`: machine-readable no-write plan
  output contract, selected/skipped component IDs, operation shape, source
  version alignment, and high-risk selection checks.
- `scripts/validate-installer-alignment.mjs`: manifest-to-installer drift
  checks for PowerShell and Bash install surfaces.
- `scripts/validate-repair-install.mjs`: fixture-based repair-mode validation
  for drift preview, backup-backed apply, marketplace preservation, config
  merge, skill cleanup reporting, and explicit managed-plugin pruning.
- `scripts/validate-agent-config.mjs`: specialist-agent catalog/config drift
  checks across Windows and Unix Codex templates, including automatic
  model/reasoning selection for role files without overriding the active user
  profile.
- `scripts/validate-adaptive-runtime.mjs`: conditional spawn policy, compact
  routing visibility, `max_threads = 10` capacity, one-to-four normal
  parallelism, canonical skill aliases, user-owned config overlay, token-audit
  layers, platform command resolution, and bounded runtime-probe contracts.
- `scripts/validate-agent-research-corpus.mjs`: specialist-agent research
  corpus drift, authority-reference source markers, source freshness cadence,
  stale `dateChecked` checks, and per-agent expertise signal coverage.
- `scripts/validate-mcp-config.mjs`: MCP catalog/config drift checks across
  Windows and Unix Codex templates.
- `scripts/validate-chef-cli.mjs`: grouped Codex Chef command-center contract,
  accurate write/account-guidance badges, state-aware install preview, curated
  skill ready/missing/invalid fixtures, installed MCP config inventory, log
  location, README usage snippets, and public-safe GitHub auth boundary
  guidance.
- `scripts/validate-token-surfaces.mjs`: token audit script, `token-safe`
  profile, AGENTS token discipline, context-budget skill reference, README
  command docs, and unpinned agent model/reasoning contract.
- `scripts/verify-skill-sources.mjs`: offline skill catalog validation and
  `catalog/skills-lock.json` commit, skill, CLI version, and integrity pin drift
  checks.
- `scripts/scan-supply-chain-iocs.mjs`: high-signal remote execution,
  dangerous shell, floating package, and implicit installer dependency checks.
- `scripts/security-audit.mjs`: public-readiness files, bilingual docs, safe
  Codex defaults, shell environment policy, disabled authenticated MCPs, and
  secret/state checks.
- `scripts/validate-package-surface.mjs`: source package dry-run validation
  using `npm pack --dry-run --json --ignore-scripts` with a repo-local npm
  cache, rejecting scratch output, local agent state, auth files, archives, and
  release artifacts.
- `scripts/validate-release-readiness.mjs`: release notes, GitHub settings docs,
  workflow hardening, Gitleaks gate documentation, and source artifact hygiene.
- `scripts/verify-install-runtime.mjs`: optional read-only post-install runtime
  verification that compares installed Codex Chef targets with the active
  Codex CLI `CODEX_HOME`.

Additional release checks:

```bash
npm run token:audit
git status --short
git diff --check
gitleaks detect --redact --no-banner --no-git --verbose
```

The repository `.gitleaks.toml` keeps default Gitleaks rules enabled while
excluding ignored local scratch, dependency, build, and cache directories.

`npm run token:audit` reports distinct cost surfaces: always-loaded
instructions, discoverability metadata, invoked or deferred skill/agent
content, repository maintenance size, tool schema/context, measured session
telemetry when available, and per-agent cost. Repository byte/token estimates
are diagnostic context weights, not provider billing or measured usage.
The audit normally requires Git so ignored/private local files stay outside the
source set. Outside a Git worktree it fails closed; use
`node scripts/analyze-token-surfaces.mjs --allow-filesystem-fallback` only
after reviewing that directory. The explicit fallback rejects linked,
secret-like, special, and oversized files.

When installable skills change, also run the network-backed resolver check:

```bash
npm run verify:skills:online
```

The online verifier uses an ignored workspace-local npm cache at
`tmp/npm-cache` so Windows checks do not depend on the current user's global npm
cache permissions. Each installable skill resolution is bounded by a per-skill
timeout so release verification returns a concrete pass/fail instead of hanging.

## Syntax Checks

Run available parser checks locally:

```bash
node --check scripts/validate-repo.mjs
node --check scripts/validate-docs.mjs
node --check scripts/validate-readme-locales.mjs
node --check scripts/validate-workflow-security.mjs
node --check scripts/validate-content-safety.mjs
node --check scripts/validate-install-plan.mjs
node --check scripts/validate-install-state-preview.mjs
node --check scripts/validate-installer-alignment.mjs
node --check scripts/plan-install.mjs
node --check scripts/validate-agent-config.mjs
node --check scripts/validate-agent-research-corpus.mjs
node --check scripts/validate-mcp-config.mjs
node --check scripts/chef-cli.mjs
node --check scripts/validate-chef-cli.mjs
node --check scripts/analyze-token-surfaces.mjs
node --check scripts/validate-token-surfaces.mjs
node --check scripts/verify-skill-sources.mjs
node --check scripts/scan-supply-chain-iocs.mjs
node --check scripts/validate-package-surface.mjs
node --check scripts/validate-release-readiness.mjs
node --check scripts/security-audit.mjs
```

Install plan smoke:

```bash
node scripts/plan-install.mjs --list-profiles
node scripts/plan-install.mjs --list-operations
node scripts/plan-install.mjs --all --json
```

On systems with Bash:

```bash
bash -n scripts/install.sh
```

On Windows:

```powershell
$errors = $null
$tokens = $null
[System.Management.Automation.Language.Parser]::ParseFile("scripts/install.ps1", [ref]$tokens, [ref]$errors) | Out-Null
$errors
```

## Installer Smoke Tests

PowerShell dry run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
```

Bash dry run:

```bash
./scripts/install.sh --all --dry-run
```

Codex Chef CLI smoke:

```bash
npm run validate:chef-cli
npm run chef -- --status
npm run chef -- --status --details
npm run chef -- --status --repo-only
npm run chef -- --status --repo-only --no-log
npm run chef -- --preview
npm run chef -- --update
npm run chef -- --update --verbose-plan
npm run chef -- --backups
npm run chef -- --backups --backup <id> --delete
npm run chef -- --backups --backup <id>
npm run chef -- --reset
npm run chef -- --routing --profile starter-health
npm run chef -- --diagnostics
npm run chef -- --processes
npm run chef -- --processes --cleanup-stale
```

`npm run chef` opens the numbered operator menu. The noninteractive smoke
commands above do not write global/user state. They create ignored repo-local
CLI logs unless `--no-log` is supplied. Write paths require `--apply`:
`npm run chef -- --update --apply` for a tracked-clean Git fast-forward that
preserves unrelated untracked files plus
a fresh preview when new commits are pulled, or backup-backed managed refresh
when the repo is already current after local validation,
`npm run chef -- --reset --apply` for backup-backed managed refresh,
`npm run chef -- --repair --apply` for backup-backed repair, and
`npm run chef -- --install --apply` for a full managed install. In an
interactive terminal, `npm run chef -- --skills` reports every curated skill as
ready, missing, or invalid and lets the user select only an actionable entry.
`npm run chef -- --mcp` reports installed config states, preserves user-added
connectors, and lets the user inspect transport, endpoint/package,
setup/auth/source/rollback notes without enabling anything.

`npm run chef -- --diagnostics --no-log` is the read-only triage menu. It runs a
repo-only status snapshot, shows current health, attention reasons, next safe
actions, backup/log summaries, and the diagnostic evidence commands for status,
doctor, routing, update preview, repair preview, backups, logs, runtime parity,
and Serena/MCP process audits. `npm run chef -- --processes --no-log` runs the
schema-v2 parent/child audit without stopping anything. It separates active
Codex owners, logical local MCP instances, helper-process trees, grace-period
trees, old unowned candidates, and unrelated Node/Python runtimes. Add
`--cleanup-stale` for a no-write exact cleanup preview; only
`--cleanup-stale --apply` can stop candidates. For parseable JSON through npm,
use `npm run --silent chef -- --processes --json --no-log`. Full semantics and
the SessionEnd trust step are in
[multi-session process hygiene](process-hygiene.md).

`npm run chef -- --backups` lists backup archive metadata without touching
global/user state. `npm run chef -- --backups --backup <id>` inspects a backup
archive using paths, sizes, hashes, manifest status, and restorable target
metadata only. `npm run validate:chef-cli` includes temporary-home backup
smokes for list, inspect, restore preview, restore apply, backup delete
preview/apply, rollback backup creation, and parseable JSON.

The update apply path is intentionally not a skill installer: curated global
skills and optional global Git guards stay behind `--install --apply`,
`--skills --apply`, or the explicit installer flags.

CI also runs Bash dry-run and PowerShell `-WhatIf` smoke checks with temporary
homes so installer runtime branches are exercised without global writes.

Temporary-home smoke tests are allowed when you intentionally want files written
under ignored `tmp/` paths:

```powershell
$env:CODEX_HOME = "$PWD\tmp\codex-home"
$env:AGENTS_HOME = "$PWD\tmp\agents-home"
.\scripts\install.ps1
```

The generated `tmp/` folder is ignored and must not be committed.

## Real Install Verification

Run the real installer only after the user explicitly approves writes to the
current user's Codex/Git setup:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -Interactive
```

Expected skill behavior is idempotent and quiet: already installed skills are
reported as `Skill already installed`, successful new installs are reported as
`Installed pinned skill`, and native-copy failures identify the fetch, staging,
hash, activation, or rollback phase without executing a registry installer.

Skill activation has two evidence levels. Repo checks prove that the catalog,
routing profiles, and activation contract are present:

```bash
npm run chef -- --skills --plain --no-log
npm run chef -- --routing --profile starter-health --plain --no-log
```

Actual live activation is session evidence: start a no-write Codex turn that
names a skill such as `$security-best-practices` or a bundled local skill, then
confirm the assistant prints `Skill selected` and reads the target `SKILL.md`
before acting.

For a compact end-user view of repo health, installed runtime drift, curated
skills, configured MCPs, Codex CLI/login, doctor checks, attention items, and
the next action, run:

```bash
npm run codex:status
```

Add `--details` for target/ambient runtime comparison, per-MCP entries, routing
controls, context-budget evidence, setup notes, and log metadata:

```bash
npm run chef -- --status --details
```

The target/ambient comparison covers login status plus the safe MCP state
fields (`name`, enabled state, disabled reason, and auth status), so equal
server names cannot hide runtime drift. A parseable `codex doctor --json`
response with a nonzero exit code is reported as `attention`, not `ok`.

For a fast repository-only audit that avoids installed-runtime checks, global
skill-root inventory, Codex log metadata, and live Codex CLI probes, run:

```bash
npm run chef -- --status --repo-only --no-log
```

Use `npm run codex:status:all` when the real install intentionally included
curated global skills and optional Git guards.

After a real install or upgrade, run the read-only runtime verifier:

```bash
npm run verify:install:runtime -- --expect-skills
```

Use `--expect-skills` only when the real install included `-All` or
`-InstallSkills`. The verifier checks managed files for source drift, runs
Codex CLI checks with `CODEX_HOME` explicitly set to the installed target,
reports ambient sandbox/offline home drift as a warning, and fails only when
the installed target itself cannot be verified.

Every live probe has a short timeout and progress output. Use `--offline` when
network-backed/live runtime checks are unavailable, or `--no-mcp-probe` when
managed files and the Codex CLI should still be checked without starting the
MCP probe. These modes skip only the named probe surface; they do not weaken
source-drift validation.

## Remote Verification

After an approved push:

```bash
git rev-parse HEAD
git -c http.sslBackend=openssl ls-remote origin refs/heads/main
```

The two hashes should match. Then verify the GitHub Actions run status before
publishing release notes.
