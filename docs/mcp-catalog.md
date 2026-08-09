# MCP Catalog

[English](mcp-catalog.md) | [Türkçe](mcp-catalog.tr.md)

MCP servers give Codex extra tools or live context: current documentation,
browser evidence, semantic code navigation, private account data, or database
access. That makes them useful, but it also means each server needs a clear
boundary.

Codex Chef knows about 16 MCP servers. The balanced starter enables three:
remote `openaiDeveloperDocs` plus local `context7` and `serena`. Five additional
local stdio helpers remain defined but disabled, preserving capability without
eagerly starting their Node/Python trees in every concurrent session. Serena
uses a lightweight bridge instead of a direct `uvx` stdio child, so it creates
no Serena/LSP tree until a semantic tool is actually called. Eight
account, database, or broad-filesystem connectors stay off until you
deliberately need them.

> **Configured is not the same as live.** A server can exist in the template
> and still need a launcher, first-run package download, browser, authorization,
> or Codex restart. `codex mcp list --json` confirms configuration discovery;
> use `/mcp` in a restarted session to confirm live server/tool availability.

[Official Codex MCP guide](https://developers.openai.com/codex/mcp) ·
[MCP specification](https://modelcontextprotocol.io/specification) ·
[Machine-readable catalog](../catalog/mcp-servers.json)

## Balanced Local Defaults

| MCP | Base | What I use it for | What it needs |
| --- | --- | --- | --- |
| [`openaiDeveloperDocs`](https://developers.openai.com/mcp) | On | Current OpenAI developer documentation | Nothing extra |
| [`context7`](https://github.com/upstash/context7) | On | Current library and framework docs | Node/npx and first-run network access |
| [`serena`](https://github.com/oraios/serena) | On | Symbol-aware code navigation in unfamiliar repositories | Lightweight local bridge; `uvx` and the pinned source only on first semantic call |
| [`sequential-thinking`](https://github.com/modelcontextprotocol/servers) | Off | Breaking a complex task into clear steps | Node/npx and first-run network access |
| [`playwright`](https://github.com/microsoft/playwright-mcp) | Off | Browser snapshots, screenshots, console and prompt-gated network evidence in an isolated, non-persistent profile | Node/npx and local browser control |
| [`chrome-devtools`](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Off | Chrome inspection and UI diagnostics | Node/npx and an isolated Chrome bridge |
| [`memory`](https://github.com/modelcontextprotocol/servers) | Off | Small, non-secret local memory graph | Node/npx; never store secrets |
| [`codebase-memory`](https://github.com/DeusData/codebase-memory-mcp) | Off | Architecture, graph search, paths, and change impact | Node/npx; indexing and admin tools stay gated |

Use `codex --profile full` for one primary session that needs every bundled
local MCP. Start secondary concurrent windows with
`codex --profile multi-session`; that profile keeps the lightweight Serena
bridge but parks the other six eager local stdio servers while leaving agents,
skills, remote OpenAI docs, built-in memories, hooks, and apps available. The
bridge shares one loopback-only backend for the same canonical project and
creates a separate backend for a distinct worktree only on demand. Profiles
layer over the base config, so disabling a server does not delete its definition.

Use `codex --profile offline` only when you explicitly want every
Chef-managed MCP transport disabled. It is an optional fallback profile, not a
reduced default: it does not change agents, skills, shell permissions, browser
permissions, or web-search networking.

Browser navigation, memory writes, indexing, symbol edits, and similar actions
are not silently approved just because the server is enabled. The templates
allowlist reviewed read tools and keep the wider actions prompted or disabled.

If `uvx` is missing, the bridge still starts and reports only the first Serena
tool call as unavailable. That is a local prerequisite, not a reason to weaken
the rest of the setup; install it separately or disable Serena until needed.

## Off Until You Need Them

| MCP | What it can open | Why it starts off |
| --- | --- | --- |
| [`filesystem`](https://github.com/modelcontextprotocol/servers) | A local directory tree | The allowed root must be chosen deliberately |
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

For filesystem access, replace the path with the narrowest workspace you mean
to expose:

```toml
[mcp_servers.filesystem]
enabled = true
args = ["/c", "npx", "-y", "@modelcontextprotocol/server-filesystem@2026.1.14", "<NARROW_ABSOLUTE_PATH>"]
default_tools_approval_mode = "prompt"
```

Replace `<NARROW_ABSOLUTE_PATH>` before enabling the connector. Do not use `.`
as a copy-paste default because it exposes the Codex process working directory.

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

## The Boundary I Keep

- Remote documentation plus one library-doc and one semantic-code helper form
  the balanced default; overlapping local helpers stay one profile away.
- Browser interaction, memory writes, code edits, and graph indexing remain
  prompted or narrowly allowlisted.
- Authenticated accounts, databases, production systems, and broad filesystem
  access stay disabled until the task needs them and the user approves.
- Credentials come from environment variables or the connector's own OAuth
  flow, never from committed config.
- After a config change, use `codex mcp list --json` for configuration
  discovery, then restart Codex and use `/mcp` for live server/tool health.

For the bigger picture, see the [agent catalog](agents.md), [skill
catalog](skills.md), and [workflow surface map](workflow-surface-map.md).
