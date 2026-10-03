# Claude Settings Merge And Receipts

Use this article when `~/.claude/settings.json` or `.claude.json` looks
different from what AgentChef planned, or when you need to know exactly which
entries AgentChef added.

## What AgentChef Controls

- `permissions.allow` and `permissions.ask` rules generated from
  `templates/codex/rules/default.rules`, plus MCP tool rules generated from
  `catalog/mcp-servers.json` in `allow`, `ask`, and `deny` (the denials cover
  codebase-memory's admin tools and Playwright's `browser_run_code_unsafe`,
  `browser_evaluate`, and `browser_file_upload`). A `deny` rule is only ever
  added; existing `deny` rules are never removed.
- Nothing else in `settings.json`: `hooks`, `env`, and every other key stay as
  you wrote them. No hook is installed for Claude Code in this release.
- In `.claude.json` (`~/.claude.json`, or `$CLAUDE_CONFIG_DIR/.claude.json`
  when that variable is set) AgentChef writes no MCP entry since 1.3.0, because
  the plugin ships `context7`, `playwright`, and `serena`. It only retires the
  `mcpServers.context7` and `mcpServers.serena` entries an earlier release
  wrote, when their value still matches the receipt hash. A same-name entry of
  yours is kept and reported as shadowing the plugin; `-AdoptMcp` /
  `--adopt-mcp` retires it after a backup.

Everything else in those two files belongs to you or to Claude Code. AgentChef
records each added entry in a sidecar receipt under
`~/.claude/agentchef/receipts/` with a JSON pointer and a value hash.

## Recommended Checks

```bash
node scripts/install-claude-target.mjs --json --redact-paths
npm run verify:install:runtime -- --target claude
```

The plan lists every entry it would add and every entry it skipped because it
already exists or a stricter list (`deny` over `ask` over `allow`) already
names it.

## Clean Decision Flow

1. Preview first; the plan is read-only.
2. If an entry you expect is missing, check the receipt: an entry that Claude
   Code or you removed later shows as `missing`, and a re-run re-adds it.
3. If you changed an AgentChef entry by hand, the receipt shows `changed` and
   removal leaves your version alone.
4. To take AgentChef's entries back out, run the removal preview and then
   apply it.

## Stop Conditions

- Do not edit the receipt files by hand; they are evidence, not settings.
- Do not paste `permissions.allow` wildcards such as `Bash(*)` to make a prompt
  go away.
- Do not copy `.claude.json` between machines; it holds account state.
