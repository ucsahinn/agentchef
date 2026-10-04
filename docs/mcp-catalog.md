# MCP Catalog

[English](mcp-catalog.md) | [Türkçe](mcp-catalog.tr.md)

MCP servers give Codex extra tools or live context: current documentation,
browser evidence, semantic code navigation, private account data, or database
access. That makes them useful, but it also means each server needs a clear
boundary.

AgentChef knows about 14 MCP servers. The balanced Codex starter enables
two: remote `openaiDeveloperDocs` and the local lazy `serena` bridge. Five
additional local stdio helpers, the `playwright` and `chrome-devtools` browser
servers among them, remain defined but disabled, preserving capability without eagerly starting their
Node/Python trees in every concurrent session. Serena uses a lightweight bridge
instead of a direct `uvx` stdio child, so it creates no Serena/LSP tree until a
semantic tool is actually called. Seven account or database connectors stay
off until you deliberately need them. The former `memory` and `filesystem`
entries were removed in 1.3.0; see [Upgrade](upgrade.md) for how an existing
config is cleaned up.

On the Claude Code target, the `agentchef` plugin ships `context7` and
`serena` itself
([plugins/agentchef/mcp/claude.mcp.json](../plugins/agentchef/mcp/claude.mcp.json),
referenced from the plugin manifest's `mcpServers`). The npx servers start
through `plugins/agentchef/scripts/mcp-launch.mjs`, which accepts only an exact
pinned version and, once npx has fetched it, runs the server in its own node
process (2 processes per server instead of 6 on Windows); Serena runs the
plugin's copy of the shared pool bridge with
`--project-root ${CLAUDE_PROJECT_DIR}`. Their tools are named
`mcp__plugin_agentchef_<server>__<tool>`. The installer no longer writes these
servers into `.claude.json`: an entry AgentChef 1.0–1.2 wrote there is retired,
because a user-scope entry outranks the plugin's server. Your own entry under
the same name is kept and reported as shadowing the plugin; see
[Install](install.md) for `-AdoptMcp` / `--adopt-mcp`. The Codex-specific
`openaiDeveloperDocs` entry is not added there. Add any other catalog server
yourself with `claude mcp add --scope user`, using the command and args from
[catalog/mcp-servers.json](../catalog/mcp-servers.json). GitHub's remote MCP
endpoint does not support OAuth dynamic client registration, so
`claude mcp add` for it needs a personal access token header instead of
`/mcp` login (measured: "Incompatible auth server").

### Browser servers are added per project

`playwright` and `chrome-devtools` are off by default on both CLIs (catalog
`scope: "project"`). Measured on one machine, every Claude Code session
started every configured MCP server: 11 sessions with about 41 child
processes each. A browser server that only some tasks need should not start
in every session, and Claude Code cannot turn off a single plugin MCP server
(only `--strict-mcp-config` disables every server), so the browser servers
are not in the plugin.

On Codex, `codex --profile full` turns both on. On Claude Code, add them to
the project that needs browser evidence:

```bash
claude mcp add --scope project playwright -- npx -y @playwright/mcp@0.0.83 --isolated --block-service-workers
claude mcp add --scope project chrome-devtools -- npx -y chrome-devtools-mcp@1.10.1
```

On Windows, put `cmd /c` before `npx`:

```bash
claude mcp add --scope project playwright -- cmd /c npx -y @playwright/mcp@0.0.83 --isolated --block-service-workers
claude mcp add --scope project chrome-devtools -- cmd /c npx -y chrome-devtools-mcp@1.10.1
```

Both commands write the project's `.mcp.json`, which you can also write by
hand:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@0.0.83", "--isolated", "--block-service-workers"]
    }
  }
}
```

The settings fragment already carries Playwright's rules under the plain
`mcp__playwright__<tool>` names, so they apply as soon as a project adds the
server, and `frontend-verifier` keeps its `mcp__playwright` and
`mcp__chrome-devtools` grants.

> **Configured is not the same as live.** A server can exist in the template
> and still need a launcher, first-run package download, browser, authorization,
> or Codex restart. `codex mcp list --json` confirms configuration discovery;
> use `/mcp` in a restarted session to confirm live server/tool availability.

[Official Codex MCP guide](https://developers.openai.com/codex/mcp) ·
[MCP specification](https://modelcontextprotocol.io/specification) ·
[Machine-readable catalog](../catalog/mcp-servers.json)

## Balanced Local Defaults

| MCP | Codex base | Claude plugin | What I use it for | What it needs |
| --- | --- | --- | --- | --- |
| [`openaiDeveloperDocs`](https://developers.openai.com/mcp) | On | No | Current OpenAI developer documentation | Nothing extra |
| [`context7`](https://github.com/upstash/context7) | Off | Yes | Opt-in current library and framework docs | Node/npx and first-run network access |
| [`serena`](https://github.com/oraios/serena) | On | Yes | Symbol-aware code navigation in unfamiliar repositories | Lightweight local bridge; `uvx` and the pinned source only on first semantic call |
| [`sequential-thinking`](https://github.com/modelcontextprotocol/servers) | Off | No | Breaking a complex task into clear steps | Node/npx and first-run network access |
| [`playwright`](https://github.com/microsoft/playwright-mcp) | Off (`full` on) | No (add per project) | Browser snapshots, screenshots, console and prompt-gated network evidence in an isolated, non-persistent profile | Node/npx and local browser control |
| [`chrome-devtools`](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Off (`full` on) | No (add per project) | Chrome inspection and UI diagnostics | Node/npx and an isolated Chrome bridge |
| [`codebase-memory`](https://github.com/DeusData/codebase-memory-mcp) | Off | No | Architecture, graph search, paths, and change impact | Node/npx; indexing and admin tools stay gated |

Use `codex --profile full` for one primary session that needs every bundled
local MCP. Start secondary concurrent windows with
`codex --profile multi-session`; that profile keeps the lightweight Serena
bridge and keeps the other five local stdio servers, the browser servers
included, off while leaving agents,
skills, remote OpenAI docs, built-in memories, hooks, and apps available. The
bridge shares one loopback-only backend for the same canonical project and
creates a separate backend for a distinct worktree only on demand. Profiles
layer over the base config, so disabling a server does not delete its definition.

Use `codex --profile offline` only when you explicitly want every
Chef-managed MCP transport disabled. It is an optional fallback profile, not a
reduced default: it does not change agents, skills, shell permissions, browser
permissions, or web-search networking.

Browser navigation, indexing, symbol edits, and similar actions
are not silently approved just because the server is enabled. The templates
allowlist reviewed read tools and keep the wider actions prompted or disabled.
Claude Code gets the same decisions as permission rules generated from the
catalog: a tool Codex approves is `allow`, a prompted one is `ask`, and
codebase-memory's four admin tools plus Playwright's `browser_run_code_unsafe`,
`browser_evaluate`, and `browser_file_upload` are `deny`.

If `uvx` is missing, the bridge still starts and reports only the first Serena
tool call as unavailable. That is a local prerequisite, not a reason to weaken
the rest of the setup; install it separately or disable Serena until needed.

## Off Until You Need Them

| MCP | What it can open | Why it starts off |
| --- | --- | --- |
| [`github`](https://docs.github.com/en/copilot) | Repository, issue, and PR context | Requires GitHub/Copilot authorization |
| [`figma`](https://help.figma.com) | Private design files and workspace context | Requires Figma authorization |
| [`linear`](https://linear.app/docs) | Private issues and projects | Requires Linear workspace authorization |
| [`notion`](https://developers.notion.com) | Private docs and databases | Requires Notion workspace authorization |
| [`sentry`](https://docs.sentry.io) | Production error and telemetry data | Requires Sentry organization authorization |
| [`vercel`](https://vercel.com/docs) | Project and deployment data | Requires Vercel account or team authorization |
| [`supabase`](https://github.com/supabase/mcp) | Authenticated Supabase project data | Needs project scoping, read-only mode, OAuth, and explicit approval |

Enable only the connector the task actually needs. For example:

```toml
[mcp_servers.github]
enabled = true
default_tools_approval_mode = "prompt"
```

Supabase uses the official hosted OAuth server. Before enabling it, add the
exact project reference, keep read-only mode, and retain only the feature groups
the task needs:

```toml
[mcp_servers.supabase]
enabled = true
url = "https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>&read_only=true&features=database,docs"
default_tools_approval_mode = "prompt"
```

Replace `<PROJECT_REF>` before enabling. Authentication belongs to the
connector's OAuth flow; never put a database URL, access token, or password in
the repository.

## Why one server stays on an older pin

`codebase-memory` remains pinned at `0.8.1` while every other server moved to
its current release. `0.11.0` adds an executable-identity check that refuses to
start when the user cache directory grants write rights to another local
account, and upgrading also forces a one-time full reindex of every project
graph. Both are reasonable choices by that project, but they turn a version
bump into an environment prerequisite, so the pin only moves once the newer
build has been started successfully on a reviewed machine.

Every other pin in this catalog was verified by starting the server over stdio,
completing the MCP handshake, and comparing the tool names it advertises with
the allowlist recorded here.

## Known Limit: Codex Keeps Every Thread's MCP Servers Running

Codex starts a full set of the enabled MCP servers for each thread and does
not stop the set of an earlier thread until the app exits. Long sessions with many threads therefore pile up MCP processes.
This is an upstream Codex issue,
[openai/codex#30408](https://github.com/openai/codex/issues/30408) (open when
checked on 2026-10-04). Codex has no config key that limits it: an MCP table
offers only `enabled`, `required`, `startup_timeout_sec`,
`tool_timeout_sec`, and `enabled_tools`/`disabled_tools`.

Until it is fixed upstream:

- Keep few servers enabled. The Codex base turns on only
  `openaiDeveloperDocs` and `serena`; enable others for the task that needs
  them.
- Start sessions that will open many threads with
  `codex --profile multi-session`, which leaves only the Serena bridge among
  the local stdio servers.
- Restart the Codex app from time to time; exiting the app closes the sets it
  kept.
- `npm run chef -- --processes --no-log` shows what is running; see
  [multi-session process hygiene](process-hygiene.md).

## The Boundary I Keep

- Remote documentation, browser evidence, and one semantic-code helper form
  the balanced Codex default; overlapping local helpers stay one profile away.
- Browser interaction, code edits, and graph indexing remain
  prompted or narrowly allowlisted.
- Authenticated accounts, databases, and production systems stay disabled until the task needs them and the user approves.
- Credentials come from environment variables or the connector's own OAuth
  flow, never from committed config.
- After a config change, use `codex mcp list --json` for configuration
  discovery, then restart Codex and use `/mcp` for live server/tool health.

For the bigger picture, see the [agent catalog](agents.md), [skill
catalog](skills.md), and [workflow surface map](workflow-surface-map.md).
