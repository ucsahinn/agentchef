# Custom Codex Home And Ambient Drift

Use this article when `CODEX_HOME`, `AGENTS_HOME`, or a custom test directory
makes installed-runtime checks look inconsistent.

## First Question

Confirm which homes the command is using:

```bash
node scripts/plan-install.mjs --all --json --redact-paths
npm run codex:status -- --plain --no-log
```

If a command was run with a temporary `CODEX_HOME` or `AGENTS_HOME`, do not use
that result as proof of the user's real global setup.

## Clean Decision Flow

1. Verify the repo state with `npm run validate`.
2. Preview the plan with redacted paths.
3. Run status with `--no-log` if you need a no-log inspection.
4. Use repair preview before applying repair to global managed targets.

Repair preview:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair -WhatIf
```

## Stop Conditions

- Do not copy files between custom homes by hand.
- Do not delete old homes, caches, or backups without explicit approval.
- Do not treat a temporary smoke-test home as the production operator setup.
