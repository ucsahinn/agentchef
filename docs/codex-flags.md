# Codex CLI Flags And Commands

This is a practical quick reference for the flags most relevant to this setup.
Use the official CLI reference as the source of truth:

https://developers.openai.com/codex/cli/reference

## Global Flags

| Flag | Use |
| --- | --- |
| `--cd`, `-C` | Start Codex in a specific working directory. |
| `--model`, `-m` | Override the configured model for one run. |
| `--ask-for-approval`, `-a` | Choose approval behavior such as `on-request` or `never`. |
| `--sandbox`, `-s` | Choose `read-only`, `workspace-write`, or `danger-full-access`. |
| `--config`, `-c` | Override a config key for one invocation. |
| `--profile`, `-p` | Layer `~/.codex/<profile>.config.toml` on top of the base config. |
| `--add-dir` | Grant an additional directory write access alongside the workspace. |
| `--image`, `-i` | Attach images to the initial prompt. |
| `--search` | Enable live web search for the run. |
| `--strict-config` | Fail on unrecognized config fields. Useful after template edits. |
| `--enable` / `--disable` | Toggle feature flags for one run. |
| `--oss` | Use the local open source model provider when configured. |
| `--remote` | Connect the TUI to an app-server endpoint. |
| `--remote-auth-token-env` | Read the remote bearer token from an environment variable. |
| `--dangerously-bypass-approvals-and-sandbox` | Do not use for normal local development. Use only inside a hardened throwaway environment. |
| `--dangerously-bypass-hook-trust` | Only for automation that already vets hook sources. |

AgentChef installs three optional MCP-cost profiles. They never change the balanced default unless you explicitly select one:

```bash
codex --profile full
codex --profile multi-session
codex --profile offline
```

`full` enables every bundled local stdio MCP for one primary session.
`multi-session` disables local stdio MCPs for secondary concurrent sessions
while preserving agents, skills, remote OpenAI docs, built-in memories, hooks,
and apps. `offline` disables every Chef-managed MCP transport for an isolated
session; it does not change shell, browser, or web-search network permissions.

For deterministic route advice without activating an agent or MCP, run:

```bash
npm run codex:routing -- --task "offline MCP profile"
```

The result is advisory-only and returns at most three catalog routes. It uses
catalog-owned weighted phrases and whole-word terms, normalizes Turkish
characters, reports its matched signals and confidence, and resolves ties by
documented profile priority then catalog order. It is deterministic—not a
hidden model call—and never spawns an agent, enables an MCP, or changes an
approval setting. Use an explicit `--profile <id>` when you already know the
route you want.

## Common Commands

| Command | Use |
| --- | --- |
| `codex` | Launch the terminal UI. |
| `codex app` | Launch the desktop app. |
| `codex doctor --summary` | Diagnose install, config, auth, runtime, Git, and thread health. |
| `codex exec` | Run Codex non-interactively. |
| `codex features` | List and persist feature flags. |
| `codex mcp` | Manage MCP servers. |
| `codex plugin` | Install, list, and remove plugins. |
| `codex plugin marketplace` | Add, list, update, or remove plugin marketplaces. |
| `codex completion power-shell` | Generate PowerShell completions. |
| `codex debug models` | Inspect the model catalog Codex sees. |
| `codex execpolicy check` | Test rules against a command. |

AgentChef's ownership-aware process commands are:

```bash
npm run chef -- --processes --no-log
npm run chef -- --processes --cleanup-stale --no-log
npm run chef -- --processes --cleanup-stale --apply --no-log
```

The first two are read-only. The last command is the separately gated exact
cleanup path; see [multi-session process hygiene](process-hygiene.md).

## Runtime Verification Behavior

`npm run verify:install:runtime` checks managed-file parity first, then probes
the installed Codex home, MCP inventory, and plugin state. A large local
rollout history can make `codex doctor --json` slow; its bounded timeout is an
`attention` warning, not a false install failure, when the target MCP and
plugin probes still complete. Use `--ambient-doctor` only when comparing a
different ambient `CODEX_HOME` is specifically useful.

## MCP Config Fields

Codex MCP behavior is usually controlled in `config.toml`, not by one-off CLI
flags.
When a task shape maps to one of these fields, use the field deliberately. Do
not rely on prose alone for approval policy, tool exposure, timeouts, or auth
source.

| Field | Use |
| --- | --- |
| `enabled` | Turn a server on or off without deleting its block. |
| `default_tools_approval_mode` | Set server-wide tool approval: `approve`, `prompt`, or `auto`. |
| `enabled_tools` / `disabled_tools` | Allow-list or deny-list tools for a specific server. |
| `startup_timeout_sec` | Bound server startup time. |
| `tool_timeout_sec` | Bound individual tool-call runtime. |
| `required` | Fail startup if an enabled server cannot initialize; avoid for optional local tools. |
| `bearer_token_env_var`, `env_vars`, `env_http_headers` | Read secrets from environment variables instead of files. |
| `mcp_oauth_callback_port`, `mcp_oauth_callback_url` | Configure OAuth callbacks only when a provider requires it. |

## App And Connector Defaults

ChatGPT Apps/connectors use their own `apps.*` config surface. Keep this
separate from MCP server settings so connector tool exposure is reviewable.

| Field | Starter default | Use |
| --- | --- | --- |
| `apps._default.enabled` | `false` | Keep app/connectors parked until a specific connector is explicitly reviewed and enabled. |
| `apps._default.destructive_enabled` | `false` | Block tools that advertise destructive behavior by default. |
| `apps._default.open_world_enabled` | `false` | Block tools that advertise broad open-world behavior by default. |
| `apps.<id>.tools.<tool>.approval_mode` | unset | Use only when a specific connector tool has been reviewed. |

## Recommended Local Defaults

Interactive work:

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

Review-only work:

```bash
codex --sandbox read-only --ask-for-approval never
```

Config validation:

```bash
codex exec --strict-config "Summarize the active setup."
```

Avoid `danger-full-access` and bypass flags unless the environment is
externally sandboxed and disposable.

## Advanced Features To Keep Explicit

- `approval_policy = { granular = { ... } }` is useful for advanced operators,
  but this starter keeps `on-request` because it is easier to explain and audit.
- `default_permissions` and `[permissions.*]` are beta permission-profile
  surfaces. Do not mix them with `sandbox_mode` and
  `[sandbox_workspace_write]` in the same starter template.
- `[features].network_proxy` can create scoped sandbox networking, but the
  default remains network-off; add allowlisted domains only for a reviewed
  profile.
- `[features].undo` is available as an opt-in convenience, not a replacement
  for backups, dry runs, and Git review.
