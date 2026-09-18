# Target capability map

[English](target-capability-map.md) | [Türkçe](target-capability-map.tr.md)

AgentChef keeps one catalog and renders it for two terminal agents. The two
harnesses do not expose the same knobs, so this page states, surface by
surface, what maps cleanly, what maps only partially, and what has no
counterpart. Anything listed as **not mapped** is documented behavior, not a
gap the installer papers over.

Date checked: 2026-09-18 (Codex CLI 0.154, Claude Code 2.1.276).

## Install surfaces

| Surface | OpenAI Codex CLI | Anthropic Claude Code | Status |
| --- | --- | --- | --- |
| Global working agreement | `~/.codex/AGENTS.md` (backup, then replace unless present) | `~/.claude/rules/agentchef-working-agreement.md` (user-level rule; the user's own `~/.claude/CLAUDE.md` is never edited) | mapped, same source text |
| Repository-local precedence | repo `AGENTS.md` overrides global | project `CLAUDE.md` and `.claude/rules/` load after user rules | mapped |
| Settings | `~/.codex/config.toml` (merge missing managed tables) | `~/.claude/settings.json` (additive merge of `permissions`, recorded in a sidecar receipt; `hooks`, `env`, and `deny` lists are never touched) | partial: different ownership model |
| MCP servers | `[mcp_servers.*]` tables in `config.toml` | user-scope `mcpServers` in `.claude.json` (additive merge, receipt) | mapped for `context7` and the Serena bridge; other catalog servers documented with `claude mcp add` commands |
| Runtime MCP profiles (`full`, `multi-session`, `offline`, `token-safe`, ...) | generated `*.config.toml` profiles | no profile concept | **not mapped** |
| Specialist agents | `~/.codex/agents/*.toml` (32 role files) | plugin subagents `agentchef:<role>` under `plugins/agentchef-workflows/agents/*.md`; `~/.claude/agents/` untouched | mapped, namespaced |
| Coordinator to worker enforcement | catalog-bound worker lists in role config | coordinator subagents declare `Agent(agentchef:<worker>, ...)` tool allowlists; enforcement is by tool permission, not by catalog | partial |
| Bundled workflow skills | direct copies under `~/.agents/skills/<name>` plus the plugin | directory links `~/.claude/skills/<name>` to the same managed `~/.agents/skills/<name>` tree, plus the plugin | mapped, single managed copy |
| Curated commit-pinned skills | `~/.agents/skills/<name>` with provenance marker | same tree, exposed to Claude through the same directory links | mapped |
| Plugin distribution | `~/.codex/plugins/agentchef-workflows` copy plus `~/.agents/plugins/marketplace.json` written by AgentChef | `~/.agents/plugins/.claude-plugin/marketplace.json` written by AgentChef; installation only through `claude plugin marketplace add` and `claude plugin install`; Claude's own plugin cache is never hand-written | partial: different ownership model |
| Approval rules | `~/.codex/rules/default.rules` prefix rules (`allow` / `prompt`) | `permissions.allow` and `permissions.ask` rules generated from the same file (`Bash(...)`, `PowerShell(...)`); nothing is emitted as `deny` | mapped (allow, prompt); see below for what does not carry over |
| Session-end process hygiene hook | plugin hook `hooks/process-hygiene.json` trusted by Codex | not published in this release (Claude Code ends its own MCP children at session end) | **not mapped** yet |
| Global Git guards | shared `~/.githooks/pre-commit`, `~/.gitignore_global`, `core.hooksPath`, `core.excludesfile` | identical files; one global slot owned once for both targets | mapped, shared |
| Backups, journal, lock | `~/.codex/backups/<prefix>-*` with journal and lock directories | `~/.claude/agentchef/backups/agentchef-*` with the same journal format; lock on `~/.claude` and `~/.agents` | mapped |
| Runtime verification | `codex doctor`, `codex mcp list`, installed-file drift | `claude --version`, `claude plugin validate`, `claude mcp list`, receipt verification, link verification | mapped |

## Permission and sandbox semantics

| Codex setting | Claude Code counterpart | Status |
| --- | --- | --- |
| `approval_policy = "on-request"` | `permissions.defaultMode = "default"` plus generated `ask` rules | partial |
| `approval_policy = "never"`, `"on-failure"`, `"untrusted"` | no equivalent axis; `bypassPermissions` is never written by AgentChef | **not mapped** |
| `approvals_reviewer = "auto_review"` | `auto` permission mode is a user choice, never installed | **not mapped** |
| `sandbox_mode = "read-only"` on a role | subagent `tools: Read, Grep, Glob` and `disallowedTools: Write, Edit, NotebookEdit, Bash` | partial: tool permission, not an OS sandbox |
| `sandbox_mode = "workspace-write"` | subagent tools include `Edit`, `Write`, `Bash`; workspace confinement comes from Claude's working-directory rules and optional sandboxing | partial |
| `sandbox_workspace_write.network_access` | no counterpart in AgentChef-managed settings | **not mapped** |
| `[projects."path"].trust_level` | folder trust prompt and `.claude/settings.local.json` | **not mapped** by the installer |
| `[features]`, `[memories]`, `[apps]` | no counterpart | **not mapped** |
| `[mcp_servers.X.tools.Y]` approval tables | `mcp__X__Y` rules in `permissions` | mapped where the server is installed |
| Hook trust: Codex reviews the full hook source before enabling it | Claude runs plugin hooks as soon as the plugin is enabled | **security difference**: AgentChef publishes no hook to Claude Code in this release |

## Ownership model differences

- Codex: every managed file carries a marker or a managed table banner, so
  drift and repair are computed from the file itself.
- Claude Code: `settings.json` and `.claude.json` are vendor-owned JSON that
  Claude rewrites. AgentChef records what it added in sidecar receipts under
  `~/.claude/agentchef/receipts/` (JSON pointer plus value hash). Repair,
  status, and removal only ever act on entries whose current value still
  matches the receipt.
- Plugin registration on Claude is delegated to the `claude plugin` CLI. When
  the CLI is missing, the installer prints the exact commands and continues.

## What AgentChef refuses to do on either target

- Write `bypassPermissions`, `dontAsk`, broad `allow` wildcards, HTTP hooks, or
  `disableAllHooks`.
- Replace a foreign real directory under `~/.claude/skills/` with a link; only
  AgentChef-marked copies are adopted, and only with `--adopt-skill-links`.
- Edit `~/.claude/CLAUDE.md`, `~/.claude/agents/`, OAuth state, project
  history, or any key of `.claude.json` other than `mcpServers`.
