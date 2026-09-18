# Install Preview Safety

Use this article when you want to inspect AgentChef before it writes to
`~/.codex`, `~/.agents`, or optional Git guard targets.

## Recommended Flow

1. Clone the repository.
2. Run the PowerShell or Bash dry run.
3. Inspect the manifest-backed install plan.
4. Install only after the plan matches the files you expect to manage.

PowerShell preview:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
node scripts/plan-install.mjs --all --json --redact-paths
```

Bash or WSL preview:

```bash
./scripts/install.sh --all --dry-run
node scripts/plan-install.mjs --all --json --redact-paths
```

## What A Clean Preview Should Show

- Managed writes are limited to Codex, Agents, plugin, profile, rule, and
  optional Git guard targets described by `manifests/install-plan.json`.
- Backups are planned before replacing managed files.
- Account, database, production, and broad filesystem connectors remain
  disabled unless the user opts in later.
- Local auth, sessions, memories, caches, screenshots, and logs are not copied
  into the install payload.

## Stop And Investigate

Stop before applying if the preview shows:

- A write outside the documented managed targets.
- Missing backups for existing managed files.
- A connector that would expose accounts, databases, production telemetry, or a
  broad filesystem path by default.
- A generated artifact, archive, auth file, local cache, or machine-specific
  path in the source surface.

## Next Step

After a clean preview, use [Runtime verification](runtime-verification.md) to
check the installed state.
