# Multi-Session Process Hygiene

[English](process-hygiene.md) | [Türkçe](process-hygiene.tr.md)

Each Codex session owns its own local stdio MCP bridge. A launcher such as
`npx` or `uvx` can add several Node, Python, shell, or browser helper processes
for one logical MCP instance. With five or six concurrent sessions, enabling
every direct local MCP in every window multiplies those trees even when most
windows do not use the tools. Serena is handled differently: each client gets
a tiny bridge, while one loopback-only manager shares one backend per canonical
project and starts it only after an allowlisted semantic tool call.

AgentChef keeps the capabilities and changes when they start:

- The balanced base enables remote `openaiDeveloperDocs` plus local `context7`
  and `serena`.
- `codex --profile full` enables all seven bundled local stdio MCPs for one
  capability-heavy primary session.
- `codex --profile multi-session` keeps the Serena bridge enabled for a
  secondary session but disables the other six eager local stdio MCPs. Agents,
  skills, remote OpenAI docs, built-in memories, hooks, and apps remain
  available.
- A Serena manager uses a project key derived from the canonical root and the
  pinned source. Same-root clients reuse one backend; different worktrees get
  isolated backends only when used. Calls are serialized per backend, and the
  manager stops only children it launched after 15 minutes of inactivity.
- A disabled MCP block stays configured. You can re-enable it with a profile or
  a deliberate config override; no capability definition is removed.

## Audit Before Cleanup

Run:

```powershell
npm run chef -- --processes --no-log
npm run --silent chef -- --processes --json --no-log
```

The schema-v2 audit reports:

- active Codex sessions;
- logical local MCP instances and their helper-process count;
- MCP trees owned by an active Codex session;
- recently unowned trees still inside the safety grace period;
- old unowned cleanup candidates;
- unrelated Node, Python, Serena, and uvx processes.

When Windows process metadata cannot be read, the audit falls back to
name-level counts and produces no cleanup candidates. It never turns incomplete
evidence into permission to stop a process.

Preview an exact stale cleanup plan:

```powershell
npm run chef -- --processes --cleanup-stale --no-log
```

Execute that plan only after review:

```powershell
npm run chef -- --processes --cleanup-stale --apply --no-log
```

Only old local MCP trees with no active Codex owner are candidates. Active
Codex trees and unrelated runtimes are excluded. Cleanup rechecks process
identity and creation time before stopping the captured tree, so PID reuse fails
closed.

## Session-End Sweep

The bundled plugin registers one reviewed `SessionEnd` hook. On a normal session
end, it captures only the local MCP descendants of that exact Codex owner,
starts a detached 45-second grace timer, and then stops only captured processes
that still have the same PID and creation time after the owner chain is gone.
It does not run for subagent lifecycle events, inject context, read prompt text,
delete files, or scan unrelated Node/Python processes.
The hook command uses Codex's documented three-second `SessionEnd` maximum only
to capture ownership and schedule the detached sweep; missing or slow process
metadata fails closed.

Codex requires plugin hooks to be reviewed and trusted. After installing or
refreshing the plugin, start a new Codex session, open `/hooks`, inspect the
exact source and hash, and trust it only if it matches this repository. Do not
use `--dangerously-bypass-hook-trust` as an installation shortcut.

Official references:

- [Codex hooks](https://developers.openai.com/codex/hooks)
- [Codex configuration and profiles](https://developers.openai.com/codex/config-reference)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp)

## Operational Notes

- New profile defaults affect new sessions; they do not reconfigure MCP trees
  that are already running.
- Use `/ps` and `/stop` for a live Codex background task. Process hygiene is for
  local MCP descendants, not an alternative task manager.
- Keep `agents.max_threads` as a capacity ceiling. Conditional delegation and
  low-process secondary profiles control ordinary fan-out without removing
  multi-window capacity.
- If the audit finds no old unowned candidates, do not stop anything merely
  because the raw Node/Python count is high.
- Claude Code sessions are not covered in this release: the session-end hook
  ships only in the Codex plugin manifest, and the audit recognizes Codex
  session owners only. Claude Code stops its own MCP children when a session
  ends; the Claude branch of this hook is planned for a later release.
