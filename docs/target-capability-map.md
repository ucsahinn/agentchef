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
| Settings | `~/.codex/config.toml` (merge missing managed tables) | `~/.claude/settings.json` (additive merge of `permissions`, recorded in a sidecar receipt; `hooks` and `env` are never touched, and existing `deny` rules are never removed) | partial: different ownership model |
| MCP tools inside a specialist | every declared server, subject to the role's approval rules | a subagent `tools:` list is an allowlist, so a role reaches only the MCP entries it declares; each role declares the servers its own instructions use: Context7 for the documentation-reading roles, the Serena bridge for `code-mapper`, and Playwright plus Chrome DevTools (which a project adds from the catalog) for `frontend-verifier`; for a server the plugin ships the grant carries both `mcp__plugin_agentchef_<server>` and the plain `mcp__<server>` form, so a role keeps working while your own entry shadows the plugin's; nothing else is granted | mapped, narrower on Claude by design |
| MCP servers | `[mcp_servers.*]` tables in `config.toml` | shipped by the `agentchef` plugin (`plugins/agentchef/mcp/claude.mcp.json`); `.claude.json` entries a 1.0–1.2 install wrote are retired by receipt hash | mapped for `context7` and the Serena bridge; a same-name entry of yours in `.claude.json` is kept, outranks the plugin's, and the installer and verifier report it (`-AdoptMcp` / `--adopt-mcp` retires it with a backup). Claude Code cannot disable one plugin server, so `playwright` and `chrome-devtools` are not in the plugin: add them to a project with `claude mcp add --scope project` when a task needs browser evidence (the Codex `full` profile turns them on). Add other catalog servers yourself with `claude mcp add --scope user`, using the command and args from `catalog/mcp-servers.json` |
| Runtime MCP profiles (`full`, `multi-session`, `offline`, `token-safe`, ...) | generated `*.config.toml` profiles | no profile concept | **not mapped** |
| Specialist agents | `~/.codex/agents/*.toml` (28 role files) | plugin subagents `agentchef:<role>` under `plugins/agentchef/agents/*.md`; `~/.claude/agents/` untouched | mapped, namespaced |
| Coordinator to worker enforcement | catalog-bound worker lists in role config | coordinator subagents declare `Agent(agentchef:<worker>, ...)` tool allowlists; enforcement is by tool permission, not by catalog | partial |
| Bundled workflow skills | plugin skills `$agentchef:<skill>` from `~/.agents/plugins/sources/agentchef/skills/<name>`; no direct copy in `~/.agents/skills` | plugin skills `/agentchef:<skill>` from the same plugin source; nothing linked into `~/.claude/skills` | mapped, plugin is the single source |
| Curated commit-pinned skills | written into `~/.agents/plugins/sources/agentchef/skills/<name>` with a provenance record | same plugin source, so they reach Claude through the plugin too | mapped |
| Plugin distribution | `~/.codex/plugins/agentchef` copy plus `~/.agents/plugins/marketplace.json` written by AgentChef | `~/.agents/plugins/.claude-plugin/marketplace.json` written by AgentChef; installation only through `claude plugin marketplace add` and `claude plugin install --scope user` (reinstalled when the cached copy differs from the source); Claude's own plugin cache is never hand-written | partial: different ownership model |
| Approval rules | `~/.codex/rules/default.rules` prefix rules (`allow` / `prompt`) | `permissions.allow` and `permissions.ask` rules generated from the same file (`Bash(...)`, `PowerShell(...)`); shell rules are never emitted as `deny` | mapped (allow, prompt); see below for what does not carry over |
| Session-end process hygiene hook | plugin hook `hooks/process-hygiene.json` trusted by Codex | `SessionEnd` hook declared inline in `plugins/agentchef/.claude-plugin/plugin.json`, running the same script with `--runtime claude` (exec form, timeout 15 s); neither CLI loads the other's hook | mapped |
| Prompt-submit routing hint | plugin hook `hooks/routing-hint.json` trusted by Codex; from 1.3.4 | `UserPromptSubmit` hook declared inline in `plugins/agentchef/.claude-plugin/plugin.json` (exec form, timeout 10 s); neither CLI loads the other's hook | mapped |
| Global Git guards | shared `~/.githooks/pre-commit`, `~/.gitignore_global`, `core.hooksPath`, `core.excludesfile` | identical files; one global slot owned once for both targets | mapped, shared |
| Backups, journal, lock | `~/.codex/backups/<prefix>-*` with journal and lock directories | `~/.claude/agentchef/backups/agentchef-*` with the same journal format; lock on `~/.claude` and `~/.agents` | mapped |
| Runtime verification | `codex doctor`, `codex mcp list`, installed-file drift | `claude --version`, `claude plugin validate`, `claude mcp list`, receipt verification, plugin-source skill verification | mapped |

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
| `[mcp_servers.X.tools.Y]` approval tables and `disabled_tools` | generated from `catalog/mcp-servers.json`: `approve` → `allow`, `prompt` → `ask`, codebase-memory's admin tools and Playwright's `browser_run_code_unsafe`, `browser_evaluate`, `browser_file_upload` → `deny` | mapped as permission rules; Claude Code has no per-server tool allowlist, so a tool with no rule still asks |
| An `allow` prefix rule runs inside the Codex OS sandbox | Claude Code has no OS sandbox by default, and an explicit `allow` rule also skips its own read-only flag analysis | **narrowed**: Claude-only `ask` rules guard `rg --pre` anywhere in the command, `git diff/log/show --output` and `--ext-diff`, and `gitleaks --report-path` (Codex prompts on `rg --pre` and `rg --pre-glob` only as the first argument, because a prefix rule sees nothing later); `node --check` and `git ls-remote` ask on both targets |
| Hook trust: Codex reviews the full hook source before enabling it | Claude runs plugin hooks as soon as the plugin is enabled | **security difference**: the hooks AgentChef publishes to Claude Code (the spawn guard, the process-hygiene `SessionEnd` sweep, and from 1.3.4 the `UserPromptSubmit` routing hint) run without a hash review; inspect them with `/hooks`, and `npm run check` fails if the generated manifest drifts. On Codex the trust hash covers only a hook's command line, not the script it runs |

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
- Write, link, or remove anything of yours under `~/.claude/skills/` or
  `~/.agents/skills/`; only links and copies AgentChef can prove it made in
  1.0–1.2 are retired (see [Claude skill links](../kb/claude-skill-links.md)).
- Edit `~/.claude/CLAUDE.md`, `~/.claude/agents/`, OAuth state, project
  history, or any key of `.claude.json` other than `mcpServers`.
