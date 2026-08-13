# Expected Output

Installer output is intentionally concise on success and detailed on failure.
PowerShell uses readable icons by default and supports `-PlainOutput` for
ASCII-only terminals.

## Install Plan Preview

Discovery output stays no-write and human-readable:

```text
Codex Chef install profiles
Package: codex-chef@0.5.69
Platform: windows

Profile | Operations | High risk | Optional flags
--- | ---: | ---: | ---
all | 24 | 1 | InstallSkills
default | 23 | 0 | none
```

```text
Codex Chef install plan
Platform: windows
Operations: ...

[file] codex-config
  source: templates/codex/config.windows.toml
  target: .../.codex/config.toml
  collision: merge-missing-blocks-unless-force-backup-before-replace
  backup: yes
  force: no
  risk: medium
```

JSON output uses `schemaVersion:
codex-chef.install-state-preview.v1` and does not write to global
Codex, Agents, or Git locations.

The JSON contract is documented in
`schemas/install-state-preview.schema.json` and verified by
`scripts/validate-install-state-preview.mjs`.

For publish-safe evidence, add `--redact-paths` so local home paths are shown as
placeholders:

```bash
node scripts/plan-install.mjs --all --json --redact-paths
```

## Routing Board

```text
Codex Chef enterprise routing board
Profiles: 18
Policy: task-shape routing names matching specialists, selects matching skills when applicable, and may spawn bounded local subagents when the current runtime permits delegation; risky actions remain approval-gated.

Subagent visibility contract:
- Agent plan: name each requested agent, scope, reason, expected output, and wait policy before spawning.
- Agent started: show the visible agent name or nickname and assigned task after spawning.
- Agent result: wait for requested subagent results before continuing unless the user explicitly asks for background work.
- Skill selected: name every selected skill and why it matches the task before acting on it.
- MCP selected: name every selected MCP/tool surface, why it is needed, and whether it is read-only or approval-gated.
- Surfaces used: agents=..., skills=..., mcp=..., commands=..., skipped=...
```

For one profile:

```bash
npm run chef -- --routing --profile starter-health --plain --no-log
```

## PowerShell Non-Interactive Dry Run

```text
[*] Codex Chef installer
  - Codex home: ...
  - Agents home: ...
  - Mode: preserve existing files; merge missing config blocks
  - Skills: install reviewed commit-pinned entries by verified native copy
  - Git guards: disabled by default
  - Dry run: no files, Git settings, or skills will be changed

[*] Managed Codex files
What if: Performing the operation ...

[*] Curated skills
  - would install skill: dependency-upgrade from wshobson/agents --skill dependency-upgrade
  - ...
  - Skipped skill installation because -WhatIf is active

[*] Capability board
  - Agents ready (21):
    code_mapper, docs_researcher, ...
  - MCP ready by default (2):
    openaiDeveloperDocs, serena
  - MCP opt-in / disabled by default (14):
    context7, sequential-thinking, playwright, chrome-devtools, memory, codebase-memory, github, figma, ...
  - MCP setup notes (14):
    context7 [tooling]: Requires npm/npx network access on first startup; no credential is required., ...
  - Local plugin skills (9):
    adaptive-agent-routing, codex-chef-brain, codex-chef-operator, context-budget-planner, evidence-research, external-review-workflow, fetch, offline-diagram-triplet, seo
  - Reviewed global skills (15):
    dependency-upgrade, gh-fix-ci, ...
  - Enterprise routing profiles (14):
    repo-map-before-change, current-docs-research, ...
  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.

[*] Next steps
  - completed: Codex Chef dry run
```

## PowerShell Interactive Dry Run

```text
[chef] Guided setup
  - Press Enter to accept the safe default shown in brackets.
  - No tokens, secrets, cookies, sessions, or credentials are requested.
Codex home [...]:
Agents home [...]:
Install or reconcile the 15 reviewed global Codex skills now? [Y/n]:
Replace existing managed Codex Chef files after backup instead of preserving/merging? [y/N]:
Install optional global Git guards for this Windows user? [y/N]:

[chef] Codex Chef installer
  - Codex home: ...
  - Agents home: ...
  - Mode: preserve existing files; merge missing config blocks
  - Skills: install reviewed commit-pinned entries by verified native copy
  - Git guards: disabled by default
  - Dry run: no files, Git settings, or skills will be changed
  - Existing config policy: backup + merge missing Codex Chef blocks unless Force is enabled
  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.
Continue with this plan? [Y/n]:
```

## PowerShell Success

```text
[chef] Codex Chef installer
  - Codex home: ...
  - Agents home: ...
  - Mode: preserve existing files; merge missing config blocks

[chef] Managed Codex files
  [ok] installed: ...

[chef] Capability board
  - Agents ready (21):
    code_mapper, docs_researcher, ...
  - MCP ready by default (2):
    openaiDeveloperDocs, serena
  - MCP opt-in / disabled by default (14):
    context7, sequential-thinking, playwright, chrome-devtools, memory, codebase-memory, github, figma, ...
  - MCP setup notes (14):
    context7 [tooling]: Requires npm/npx network access on first startup; no credential is required., ...
  - Local plugin skills (9):
    adaptive-agent-routing, codex-chef-brain, codex-chef-operator, context-budget-planner, evidence-research, external-review-workflow, fetch, offline-diagram-triplet, seo
  - Reviewed global skills (15):
    dependency-upgrade, gh-fix-ci, ...
  - Enterprise routing profiles (14):
    repo-map-before-change, current-docs-research, ...
  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.

[chef] Next steps
  - 28 existing managed target(s) were preserved; use -Force only for a deliberate backup-backed replacement
  [ok] completed: Codex Chef install
  - Restart Codex, then run:
    codex doctor --summary
    npm run codex:routing
    npm run codex:status
    npm run verify:install:runtime
    codex exec --strict-config "Summarize the active Codex setup."
  - Backup: ...
```

Existing `config.toml` is backed up and merged unless `-Force` is used; other
existing managed files are skipped unless `-Force` is used.

## Repair Preview

```text
Codex Chef repair
Mode: plan
Overall: attention
Codex home: ...
Agents home: ...
Managed files: <current>/<expected> current, <planned> planned, <applied> applied
Config: current
Marketplace: planned
Skills: <installed> unique installed (<managed-expected> managed expected, <missing> missing, <other> non-curated, <duplicates> duplicate names)
Action: planned copy-file .../.codex/rules/default.rules
Action: planned update-marketplace-entry .../.agents/plugins/marketplace.json
Warning: <other> non-curated global skill(s) are installed; repair reports them but does not delete user skills.
```

JSON output uses `schemaVersion: codex-chef.repair.v1`. `-Repair -WhatIf` and
`npm run repair:install -- --json` stay no-write. `-Repair` and
`npm run repair:install -- --apply` create backups before fixing managed drift.
Counts in this example are placeholders because installed user skills and the
current managed-file inventory vary by machine and release.

## Status Board

```text
Codex Chef status
Overall: attention
Repo Git: attention - git status --short reports changed lines.
MCP: 16/16 cataloged configured, 0 missing, <user-added> user-added; 3 catalog defaults enabled/13 disabled; live not probed
Codex CLI: ok (strict config ok, login ok, MCP ok)
Installed runtime: attention/current (...)
Skills: <installed> total across global roots (<managed> Codex Chef managed, <missing> missing, <other> other/user-installed)
Codex doctor checks: attention (...)
Next action: Review attention items; they do not necessarily mean Codex Chef install is broken.
Details: npm run chef -- --status --details
```

Use `--details` for target/ambient runtime comparison, individual MCP entries,
routing controls, context-budget evidence, setup notes, and log metadata.

An untracked-only worktree is informational: the status board keeps the files
visible, reports no tracked or staged changes, and says that update preserves
them. Tracked or staged edits remain `attention`.

## Bash Dry Run

```text
[*] Codex Chef installer
  - Codex home: ...
  - Agents home: ...
  - Mode: preserve existing files; merge missing config blocks
  - Dry run: no files, Git settings, or skills will be changed

[*] Managed Codex files
Would install file from ...

[*] Capability board
  - Agents ready (21):
    code_mapper, docs_researcher, ...
  - MCP ready by default (2):
    openaiDeveloperDocs, serena
  - MCP opt-in / disabled by default (14):
    context7, sequential-thinking, playwright, chrome-devtools, memory, codebase-memory, github, figma, ...
  - MCP setup notes (14):
    context7 [tooling]: Requires npm/npx network access on first startup; no credential is required., ...
  - Local plugin skills (9):
    adaptive-agent-routing, codex-chef-brain, codex-chef-operator, context-budget-planner, evidence-research, external-review-workflow, fetch, offline-diagram-triplet, seo
  - Reviewed global skills (15):
    dependency-upgrade, gh-fix-ci, ...
  - Enterprise routing profiles (14):
    repo-map-before-change, current-docs-research, ...
  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.

[*] Next steps
  - completed: Codex Chef dry run
```

## Bash Success

```text
[*] Codex Chef installer
  - Codex home: ...
  - Agents home: ...
  - Mode: preserve existing files; merge missing config blocks

[*] Managed Codex files
  - installed: ...

[*] Capability board
  - Agents ready (21):
    code_mapper, docs_researcher, ...
  - MCP ready by default (2):
    openaiDeveloperDocs, serena
  - MCP opt-in / disabled by default (14):
    context7, sequential-thinking, playwright, chrome-devtools, memory, codebase-memory, github, figma, ...
  - MCP setup notes (14):
    context7 [tooling]: Requires npm/npx network access on first startup; no credential is required., ...
  - Local plugin skills (9):
    adaptive-agent-routing, codex-chef-brain, codex-chef-operator, context-budget-planner, evidence-research, external-review-workflow, fetch, offline-diagram-triplet, seo
  - Reviewed global skills (15):
    dependency-upgrade, gh-fix-ci, ...
  - Enterprise routing profiles (14):
    repo-map-before-change, current-docs-research, ...
  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.

[*] Next steps
  - 28 existing managed target(s) were preserved; use --force only for a deliberate backup-backed replacement
  - completed: Codex Chef install
  - Restart Codex, then run:
    codex doctor --summary
    npm run codex:routing
    npm run codex:status
    npm run verify:install:runtime
    codex exec --strict-config "Summarize the active Codex setup."
  - Backup: ...
```

## Skill Installation

Successful skill installs print concise status lines:

```text
Pinned skill already current: ...
Installed pinned skill ... by native copy from ...@...
Skipped existing user-owned skill ...; rerun this exact command with --adopt-existing only after reviewing that target.
```

The top-level installers translate the helper receipt without claiming a
preserved target was installed:

```text
  - skill already current: ...
  - installed skill: ...
  - upgraded managed skill: ...
  - preserved user-owned skill: ...
```

Failures identify the fetch, staging, hash, activation, or rollback phase.
Installation does not execute a registry-delivered Skills CLI.
