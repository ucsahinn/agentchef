# Custom Claude Home And Ambient Drift

Use this article when `CLAUDE_CONFIG_DIR` or a scratch directory makes the
Claude target's plan, status, or verification look inconsistent.

## First Question

Confirm which homes the command is using:

```bash
node scripts/install-claude-target.mjs --json --redact-paths
npm run dev:assert-scratch
```

`CLAUDE_CONFIG_DIR` relocates the whole Claude config directory, including the
user-scope `.claude.json`; without it that file lives at `~/.claude.json`, next
to `~/.claude`, not inside it. A plan produced against a scratch directory says
nothing about `~/.claude`.

## Clean Decision Flow

1. Verify the repo state with `npm run validate`.
2. Print the plan with redacted paths and read the `target` block.
3. If `AGENTS_HOME` is also overridden, remember that skill links under the
   Claude home point at that agents home; a link to a scratch tree is drift
   in the real home.
4. Run `npm run verify:install:runtime -- --target claude` against the home
   you actually mean before deciding anything is broken.

## Stop Conditions

- Do not run installer flows against `~/.claude` while developing; point
  `CLAUDE_CONFIG_DIR` at a scratch root first.
- Do not copy `.claude.json` or `settings.json` between homes.
- Do not delete a scratch home that still holds a backup you may need.
