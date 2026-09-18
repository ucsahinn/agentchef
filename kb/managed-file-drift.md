# Managed File Drift

Use this article when a validator or runtime check reports AgentChef-managed
files are missing, stale, or different from the repository templates.

## Managed Surfaces

The authoritative write plan is `manifests/install-plan.json`. Typical managed
targets include:

- `~/.codex/AGENTS.md`
- `~/.codex/config.toml`
- `~/.codex/*.config.toml`
- `~/.codex/agents/*.toml`
- `~/.codex/rules/default.rules`
- `~/.codex/plugins/agentchef-workflows`
- `~/.agents/plugins/marketplace.json`

## Repair Without Guessing

Preview first:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair -WhatIf
```

Then apply only after reviewing the plan:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair
```

## What Repair Must Preserve

- User skills are not deleted.
- Unrelated marketplace plugin entries are preserved.
- Managed files are backed up before repair.
- Ownership markers written before 1.0.0 (`.codex-chef-managed.json`,
  `.codex-chef-source.json`) are still recognized; run
  `npm run chef -- --migrate-identity` to convert them to the `agentchef`
  names.
- Auth files, sessions, memories, logs, and local caches are not imported into
  source control.

## Verification

```bash
npm run validate:repair
npm run verify:install:runtime -- --expect-skills --expect-git-guards
```
