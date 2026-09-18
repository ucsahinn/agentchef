# Claude Code surfaces

[English](claude-surfaces.md) | [Türkçe](claude-surfaces.tr.md)

This page lists every Claude Code surface AgentChef touches, where it lives on
disk, how it is owned, and how to verify it. The Codex CLI equivalent is in
[Codex surfaces](codex-surfaces.md); the mapping between the two is in the
[target capability map](target-capability-map.md).

Date checked: 2026-09-18 (Claude Code 2.1.276).

## Homes

| Root | Default | Override | Notes |
| --- | --- | --- | --- |
| Claude config directory | `~/.claude` | `CLAUDE_CONFIG_DIR` | Also relocates `.claude.json`, so a scratch directory isolates everything. |
| User-scope MCP and account state | `~/.claude/.claude.json` (inside the config directory) | follows `CLAUDE_CONFIG_DIR` | AgentChef reads and writes only the `mcpServers` key. |
| Shared skills and plugin marketplace | `~/.agents` | `AGENTS_HOME` | Shared with the Codex target; one managed tree. |

Development and tests must point all three at a scratch root;
`npm run dev:assert-scratch` refuses live homes.

## Managed surfaces

| Surface | Path | Ownership | Collision policy |
| --- | --- | --- | --- |
| Working agreement | `~/.claude/rules/agentchef-working-agreement.md` | AgentChef file, content hash | backup, then refresh when the rendered source changed |
| Serena bridge | `~/.claude/agentchef/serena-pool.mjs` | AgentChef file | backup, then refresh; state lives in `CODEX_HOME/serena-pool` so both agents share one lazy backend |
| Permissions | `~/.claude/settings.json` → `permissions.allow`, `permissions.ask` | sidecar receipt `~/.claude/agentchef/receipts/claude-settings-merge-receipt.json` | additive only; existing rules, `deny` lists, `env`, and hooks are never removed or reordered |
| Process-hygiene hook | not published in this release | Codex plugin only | Claude Code stops its own MCP children at session end; the Claude branch is planned for a later release |
| MCP servers | `~/.claude/.claude.json` → `mcpServers.context7`, `mcpServers.serena` | receipt `claude-mcp-merge-receipt.json` | a server with the same name is left untouched |
| Skill links | `~/.claude/skills/<name>` → `~/.agents/skills/<name>` | directory link (junction on Windows) | foreign real directories are skipped; AgentChef-marked copies are adopted only with `--adopt-skill-links` |
| Plugin marketplace | `~/.agents/plugins/.claude-plugin/marketplace.json` | AgentChef file | backup, then refresh |
| Plugin installation | Claude's plugin cache | Claude Code (`claude plugin`) | AgentChef runs `claude plugin marketplace add` and `claude plugin install agentchef-workflows@agentchef`; it never writes the cache directly |
| Install receipt | `~/.claude/agentchef/install-receipt.json` | AgentChef file | lists installed files, links, receipts, and commands for status, repair, and removal |
| Backups, journal, lock | `~/.claude/agentchef/backups/agentchef-*`, `.agentchef-operation-journal.json`, `.agentchef-operation.lock` | AgentChef | same transaction machinery as the Codex target |

## Commands

```powershell
node scripts/install-claude-target.mjs                 # plan only
node scripts/install-claude-target.mjs --apply         # install
node scripts/install-claude-target.mjs --json --redact-paths
.\scripts\install.ps1 -Target both -WhatIf              # both targets, preview
./scripts/install.sh --target claude --dry-run          # Claude only, preview
```

Interactive installs detect `codex` and `claude` on `PATH` and ask which
targets to manage. Non-interactive installs manage the Codex target unless
`--target claude` or `--target both` is passed; the Claude target is never
selected implicitly.

## Verification

```powershell
npm run verify:install:runtime -- --target claude
claude --version
claude plugin validate "$env:AGENTS_HOME\plugins\sources\agentchef-workflows"
claude mcp list
```

Inside a Claude Code session, `/context` lists the loaded rule file under
**Memory files**, `/plugin` shows the marketplace and the installed plugin,
and `/skills` lists the linked skills.

## Removal

```powershell
node scripts/install-claude-target.mjs --remove           # preview
node scripts/install-claude-target.mjs --remove --apply
```

Removal deletes only the files listed in the install receipt whose hashes
still match, removes only AgentChef-created links, and takes back only receipt
entries whose current value is unchanged. It never touches `CLAUDE.md`,
`~/.claude/agents/`, foreign skills, or other keys of `.claude.json`.
