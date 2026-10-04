# Harness Map

[English](harness-map.md) | [Türkçe](harness-map.tr.md)

The harness is everything AgentChef installs for an agent to work with: skills,
agent roles, and MCP servers. This page counts them, says where each one comes
from on each target, and explains how `npm run chef -- --inventory` reports
their state on your machine.

## What The Harness Is

AgentChef ships one plugin, `agentchef`. It carries the skills, the agent roles,
and the MCP servers Claude Code loads from a plugin. Codex CLI reads skills
from the same plugin, while its agent roles and MCP servers live in the Codex
home: role files under `agents/` and `[mcp_servers.*]` tables in `config.toml`.

Everything else on the machine (your own skills, roles, and MCP servers) is not
part of the harness. The inventory lists it so you can see what sits next to
the harness, but it never changes it.

## Counts

The numbers come from the catalog, and the inventory computes the same totals
from the same files, so they cannot disagree.

| Component | Count | Catalog source |
| --- | --- | --- |
| Bundled skills | 10 | `catalog/skills.json`, `directInstall: true` |
| Pinned upstream skills | 18 | `catalog/skills.json`, `install: true` |
| Harness skills in total | 28 | bundled + pinned |
| Specialist roles | 21 | `catalog/agents.json`, `agents` |
| Coordinator roles | 7 | `catalog/agents.json`, `coordinators` |
| Agent roles in total | 28 | specialists + coordinators |
| MCP servers | 14 | `catalog/mcp-servers.json` |
| Codex default-enabled MCP servers | 3 | `defaultEnabled: true` (`openaiDeveloperDocs`, `playwright`, `serena`) |
| MCP servers the Claude Code plugin ships | 3 | `claudeSource: "plugin"` (`context7`, `playwright`, `serena`) |

## Where Each Component Comes From

Homes resolve from `CODEX_HOME`, `AGENTS_HOME`, and `CLAUDE_CONFIG_DIR`, with
`~/.codex`, `~/.agents`, and `~/.claude` as the defaults.

| Component | Codex CLI | Claude Code |
| --- | --- | --- |
| Skills | the plugin source, `~/.agents/plugins/sources/agentchef/skills/<name>` | the same plugin source, loaded from Claude Code's plugin cache |
| Agent roles | `~/.codex/agents/<name>.toml` | the plugin's `agents/<name>.md` |
| MCP servers | `[mcp_servers.<name>]` in `~/.codex/config.toml`; three enabled, the rest present but disabled | the plugin's `mcp/claude.mcp.json` ships three; the other catalog servers are configured only if you add them to `~/.claude.json` |

The inventory also scans the places where a copy can outrank the plugin:
`~/.agents/skills`, `~/.codex/skills`, `~/.claude/skills`, `~/.claude/agents`,
and the `mcpServers` object in `~/.claude.json`.

## State Vocabulary

- `installed`: the harness skill or role is in place on that target.
- `missing`: the harness skill or role is not in the plugin (or, for a Codex role, not in `~/.codex/agents`).
- `shadowed`: your own skill, role, or user-scope MCP entry with the same name outranks the harness one.
- `migration-pending`: a copy or link left by a 1.0-1.2 install is still in place.
- `broken-link`: a skill link points at a target that no longer exists.
- `drifted`: the plugin cache differs from its source; shown on the target line and counted in `Issues`, not as a row state.
- `user`: a skill, role, or MCP server you added; not part of the harness.
- `optional`: a cataloged skill that the default install does not include.
- `retired`: a name the catalog has retired.
- `legacy-name`: a compatibility alias or a former AgentChef name.
- `plugin`: an MCP server that the Claude Code plugin provides.
- `enabled` / `disabled`: a Codex MCP table and its `enabled` value.
- `not-configured`: a catalog MCP server with no entry on that target.
- `user-added`: a catalog MCP server you added to `~/.claude.json` yourself.
- `legacy-plugin-name`: the plugin is still installed under its pre-1.3.0 name.
- `-`: nothing of that name on that target.

## Running The Inventory

The inventory is read-only: it reads the homes and never writes.

```bash
npm run chef -- --inventory
npm run chef -- --inventory --target codex
npm run chef -- --inventory --target claude --details
npm run chef -- --inventory --json
```

`--target` selects `codex`, `claude`, or `both` (the default). `--details` also
lists the harness rows that are already in their expected state. `--json`
prints the full report, including per-row notes about where each copy was
found. The command exits 1 when AgentChef is installed but a harness skill or
role is missing on a selected target, so it also works as a check in scripts.

## Reading The Output

A fictional example:

```text
COMPONENT         KIND   SOURCE               CODEX              CLAUDE
frontend-design   skill  plugin (pinned)      missing            missing
gptpro            skill  plugin (bundled)     migration-pending  installed
old-team-notes    skill  user                 broken-link        -
release-verify    skill  legacy-name          legacy-name        -
team-style-guide  skill  user                 user               user
code_reviewer     agent  plugin (specialist)  installed          shadowed
github            mcp    catalog              disabled           user-added
local-notes       mcp    user                 user (enabled)     -
serena            mcp    catalog + plugin     enabled            shadowed

Harness: 28 skills (10 bundled + 18 pinned) · 28 agent roles (21 specialists + 7 coordinators) · 14 MCP servers (Codex default 3, Claude plugin 3)
codex: 27/28 skills · 28/28 roles · 14/14 MCP configured
claude: 27/28 skills · 28/28 roles · 4/14 MCP configured · cache differs from source in 2 file(s)
Issues: missing 2, shadowed 2, migration-pending 1, broken-link 1, drifted 2
```

- `SOURCE` says where a row comes from: `plugin (bundled)`, `plugin (pinned)`,
  `plugin (specialist)`, `plugin (coordinator)`, `catalog`, `catalog + plugin`,
  or a non-harness classification such as `user`.
- Without `--details`, harness rows in their expected state are hidden;
  non-harness rows are always listed.
- The `Harness:` line is the catalog total. Each target line counts what was
  found against it.
- `Issues` sums the problem states across the selected targets. `none` means
  there is nothing to fix.

## Fixing Each Issue

| State | What to do |
| --- | --- |
| `missing` | Run `npm run chef -- --update` to preview the refresh, then add `--apply`. |
| `shadowed` | Remove or rename your own copy of the skill or role. For an MCP server, remove your entry from `~/.claude.json`, or rerun the installer with `-AdoptMcp` / `--adopt-mcp` to retire it with a backup. |
| `migration-pending` | Run `npm run chef -- --migrate-identity --target both` to preview, then add `--apply`. |
| `legacy-plugin-name` | Same as `migration-pending`: `npm run chef -- --migrate-identity --target both`. |
| `broken-link` | Remove the dangling link; nothing points at it any more. |
| `drifted` | Rerun the installer update (`npm run chef -- --update --apply`) so the cache matches the source again. |

The `user`, `optional`, `retired`, and `legacy-name` rows are informational.
AgentChef does not touch them; remove one only if you no longer want it.
