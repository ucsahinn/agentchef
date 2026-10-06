# Privacy

AgentChef is a local setup kit. It has no maintainer-operated backend, does not collect telemetry, and does not send your Codex state to this repository’s maintainers.

The installers copy reviewed templates into your local Codex and Agents directories. Optional skills and MCP servers may download third-party packages through your package manager when you choose to install or start them; those projects have their own terms and privacy policies.

The Claude Code install target reads only the `mcpServers` key of your `.claude.json` and only the `permissions` and `hooks` keys of your `settings.json`, merges additively, and redacts home paths in any report. It never reads or copies OAuth state, project history, or other keys in those files.

## Plugin hooks

The bundled `agentchef` plugin runs three reviewed hooks on your machine. None of them sends data anywhere: they contain no network code, run only the plugin's own Node scripts, and keep their state in files that only your user account can read. The routing-hint hook runs when you submit a prompt. It receives the prompt text from the CLI on standard input, scores it in memory against the AgentChef routing catalog, and discards it when the process exits. It never writes prompt text, matched words, or your working directory to disk or to its output. When a profile matches with high confidence it adds one line of context for the model that contains only AgentChef profile, skill, and role identifiers. Its only state is a small file in your user data or temporary directory, named by a SHA-256 hash of the session id, holding the identifiers of profiles already hinted in that session and skip counters; the hook removes only its own files. Claude Code and Codex may record that one line in their own debug logs or transcripts under their own terms. The spawn-guard hook sees only the name of the agent being started. The session-end hook reads process ids, names, parent ids, and creation times, never prompt or transcript text.

Keep private material out of public support channels. Do not attach real tokens, cookies, auth files, keys, local databases, Codex sessions, memories, logs, browser profiles, or screenshots that expose personal data.
