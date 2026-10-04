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
| User-scope MCP and account state | `~/.claude.json` (in the home directory, next to `~/.claude`) | `$CLAUDE_CONFIG_DIR/.claude.json` when `CLAUDE_CONFIG_DIR` is set, or `--claude-json` | AgentChef reads and writes only the `mcpServers` key, and since 1.3.0 only to retire entries (see MCP servers below). |
| Shared plugin source and marketplace | `~/.agents` | `AGENTS_HOME` | Shared with the Codex target; every AgentChef skill lives in the one plugin source `plugins/sources/agentchef/skills`. |

Development and tests must point all three at a scratch root;
`npm run dev:assert-scratch` refuses live homes.

## Managed surfaces

| Surface | Path | Ownership | Collision policy |
| --- | --- | --- | --- |
| Working agreement | `~/.claude/rules/agentchef-working-agreement.md` | AgentChef file, content hash | backup, then refresh when the rendered source changed |
| Serena bridge | `~/.claude/agentchef/serena-pool.mjs` | AgentChef file | backup, then refresh; state lives in `CODEX_HOME/serena-pool` so both agents share one lazy backend |
| Permissions | `~/.claude/settings.json` → `permissions.allow`, `permissions.ask`, `permissions.deny` | sidecar receipt `~/.claude/agentchef/receipts/claude-settings-merge-receipt.json` | additive only; existing rules, `env`, and hooks are never removed or reordered. The fragment carries shell rules from `default.rules` and MCP tool rules from `catalog/mcp-servers.json` (Codex `approve` → `allow`, `prompt` → `ask`; codebase-memory's four admin tools and Playwright's `browser_run_code_unsafe`, `browser_evaluate`, `browser_file_upload` → `deny`). A `deny` rule is only ever added, never taken back |
| Process-hygiene hook | the `agentchef` plugin: a `SessionEnd` hook declared inline in `plugins/agentchef/.claude-plugin/plugin.json` (`node ${CLAUDE_PLUGIN_ROOT}/scripts/codex-process-hygiene.mjs --session-end --runtime claude`, exec form, timeout 15 s, no matcher) | the plugin | nothing is written to `settings.json`. Not in `hooks/hooks.json`, which Claude would load on its own; Codex keeps `hooks/process-hygiene.json` from its own manifest, so neither CLI loads the other's hook. After the Claude process exits, the detached sweep stops only the MCP trees that session started, with the same identity rechecks as the Codex side; see [process hygiene](process-hygiene.md#claude-code-session-end) |
| MCP servers | the `agentchef` plugin: `plugins/agentchef/mcp/claude.mcp.json` ships `context7` and `serena`; tools are named `mcp__plugin_agentchef_<server>__<tool>` | the plugin; receipt `claude-mcp-merge-receipt.json` for what earlier releases wrote | since 1.3.0 nothing is written to `~/.claude.json`. An entry a 1.0–1.2 install wrote there is retired when its value still matches the hash in the receipt, because a user-scope entry outranks a plugin server. Your own entry under one of those names is kept and reported as shadowing the plugin; `-AdoptMcp` / `--adopt-mcp` retires it after a backup. `playwright` and `chrome-devtools` are not in the plugin, because Claude Code cannot disable one plugin server on its own (only `--strict-mcp-config` turns every server off); add them to a project that needs browser evidence (`claude mcp add --scope project`, see [MCP Catalog](mcp-catalog.md)) |
| Skills | `~/.agents/plugins/sources/agentchef/skills/<name>`, loaded by Claude Code from its plugin cache | the `agentchef` plugin | since 1.3.0 nothing is linked into `~/.claude/skills`; links a 1.0–1.2 install recorded in its receipt are retired only after the plugin registered successfully, and foreign links or directories are never touched; `--adopt-skill-links` has no effect |
| Plugin marketplace | `~/.agents/plugins/.claude-plugin/marketplace.json` | AgentChef file | backup, then refresh |
| Plugin installation | Claude's plugin cache | Claude Code (`claude plugin`) | AgentChef runs `claude plugin marketplace add` and `claude plugin install agentchef@agentchef --scope user`; when the cached copy differs from the source (for example right after pinned skills were written), it reinstalls the plugin (uninstall, then install); it never writes the cache directly |
| Install receipt | `~/.claude/agentchef/install-receipt.json` | AgentChef file | lists installed files, links, receipts, and commands for status, repair, and removal |
| Backups, journal, lock | `~/.claude/agentchef/backups/agentchef-*`, `.agentchef-operation-journal.json`, `.agentchef-operation.lock` | AgentChef | same transaction machinery as the Codex target |

## Commands

```powershell
node scripts/install-claude-target.mjs                 # plan only
node scripts/install-claude-target.mjs --apply         # install
node scripts/install-claude-target.mjs --json --redact-paths
.\scripts\install.ps1 -Target both -WhatIf              # both targets, preview
./scripts/install.sh --target=claude --dry-run          # Claude only, preview
```

Interactive installs detect `codex` and `claude` on `PATH` and ask which
targets to manage. Non-interactive installs manage the Codex target unless
`--target claude` or `--target both` is passed; the Claude target is never
selected implicitly.

### Updating

`npm run chef -- --update --apply` refreshes the targets that are installed:
the Claude target when its install receipt exists, the Codex target when its
managed files do. Pass `--target codex|claude|both` to choose explicitly. The
direct form is `.\scripts\install.ps1 -Update -Target both` (Windows) or
`./scripts/install.sh --update --target=both`. An update also moves Claude
Code to the new plugin version. On 1.1.0 itself, `claude plugin install` left
the plugin on its old version; run this once if `claude plugin list` still
shows the previous one:

```text
claude plugin marketplace update agentchef
claude plugin update agentchef@agentchef
```

## Verification

```powershell
npm run verify:install:runtime -- --target claude
claude --version
claude plugin validate "$env:AGENTS_HOME\plugins\sources\agentchef"
claude mcp list
```

Inside a Claude Code session, `/context` lists the loaded rule file under
**Memory files**, `/plugin` shows the marketplace and the installed plugin,
and `/skills` lists the plugin skills once each (`/agentchef:<skill>`).

## Removal

```powershell
node scripts/install-claude-target.mjs --remove           # preview
node scripts/install-claude-target.mjs --remove --apply
```

Removal deletes only the files listed in the install receipt whose hashes
still match, removes only AgentChef-created links recorded by an older install, and takes back only receipt
entries whose current value is unchanged. It never touches `CLAUDE.md`,
`~/.claude/agents/`, foreign skills, or other keys of `.claude.json`.
