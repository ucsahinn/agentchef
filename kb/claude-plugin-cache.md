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

## A Cache Copy That Went Stale Without A Version Change

Claude Code serves a plugin from its own cache copy, not from the managed
marketplace source, and it refreshes that copy by version. AgentChef's plugin
source is a local directory, so its contents can change while the version stays
the same. When that happens every session keeps loading the previous role
definitions even though the install verifies clean and `claude plugin list`
reports the right version.

`npm run verify:install:runtime -- --target claude` compares the served cache
copy with the managed source and says so:

```text
Warning: the Claude plugin cache copy 1.0.0 differs from the managed source in
21 of 32 agent files, so sessions load stale definitions
```

Refresh it by reinstalling the plugin, then start a new session:

```bash
claude plugin uninstall agentchef-workflows@agentchef
claude plugin install agentchef-workflows@agentchef --scope user
```

Older version directories left under the cache are not served and are not
reported. Only the version the managed source would install is compared.

## Stop Conditions

- Do not delete `~/.claude/plugins/cache` to force a refresh; use the `claude
  plugin` commands.
- Do not hand-edit `installed_plugins.json`.
- Do not register the marketplace at `project` scope inside this repository
  checkout; the user scope keeps one registration per machine.
