# Privacy

AgentChef is a local setup kit. It has no maintainer-operated backend, does not collect telemetry, and does not send your Codex state to this repository’s maintainers.

The installers copy reviewed templates into your local Codex and Agents directories. Optional skills and MCP servers may download third-party packages through your package manager when you choose to install or start them; those projects have their own terms and privacy policies.

When the Claude Code install target ships, the installer will read only the `mcpServers` key of your `.claude.json` and only the `permissions` and `hooks` keys of your `settings.json`, will merge additively, and will redact home paths in any report. It will never read or copy OAuth state, project history, or other keys in those files.

Keep private material out of public support channels. Do not attach real tokens, cookies, auth files, keys, local databases, Codex sessions, memories, logs, browser profiles, or screenshots that expose personal data.
