# Claude Plugin Cache And Marketplace

Use this article when `/plugin` inside Claude Code does not show the AgentChef
marketplace or plugin, or when the plugin is listed but stale.

## What AgentChef Controls

- `~/.agents/plugins/.claude-plugin/marketplace.json`, the Claude-side
  marketplace manifest that points at the shared plugin source tree.
- The two CLI calls that register it: `claude plugin marketplace add
  <AGENTS_HOME>/plugins` and `claude plugin install
  agentchef-workflows@agentchef --scope user`.

AgentChef never writes Claude Code's own plugin cache
(`~/.claude/plugins/known_marketplaces.json`, `installed_plugins.json`,
`cache/`). Those files belong to Claude Code and change shape between versions.

## Recommended Checks

```bash
claude --version
claude plugin list
claude plugin validate "$AGENTS_HOME/plugins/sources/agentchef-workflows"
node scripts/install-claude-target.mjs --json --redact-paths
```

## Clean Decision Flow

1. If `claude` is not on `PATH`, the installer skips registration and prints
   the exact commands; run them after installing Claude Code.
2. If the marketplace is registered but the plugin is stale, run
   `claude plugin update agentchef-workflows@agentchef`.
3. If `/plugin` shows a second copy of a skill (for example both `/seo` and
   `/agentchef:seo`), that is expected: the direct skill link wins for the
   unqualified name and the plugin keeps the namespaced one.
4. Start a new Claude Code session after any plugin change.

## Stop Conditions

- Do not delete `~/.claude/plugins/cache` to force a refresh; use the `claude
  plugin` commands.
- Do not hand-edit `installed_plugins.json`.
- Do not register the marketplace at `project` scope inside this repository
  checkout; the user scope keeps one registration per machine.
