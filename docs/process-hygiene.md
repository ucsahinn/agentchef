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

- The balanced base enables remote `openaiDeveloperDocs` plus the local
  `serena` bridge.
- `codex --profile full` enables all six bundled local stdio MCPs for one
  capability-heavy primary session.
- `codex --profile multi-session` keeps the Serena bridge enabled for a
  secondary session but disables the other five local stdio MCPs. Agents,
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

- active Codex and Claude Code sessions;
- logical local MCP instances and their helper-process count;
- MCP trees owned by an active Codex or Claude Code session;
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

Only old local MCP trees with no live owner (a Codex or Claude Code session, or the Serena pool manager) are candidates. Active
Codex trees and unrelated runtimes are excluded. Right before the stop, each
candidate is checked again against a fresh process table: the same PID and
creation time, still without a live owner, still past the grace period. A tree
that fails the recheck is skipped, so PID reuse fails closed. When candidates
existed and none was stopped, the command exits non-zero.

## Session-End Sweep

The bundled plugin registers one reviewed `SessionEnd` hook for each CLI: Codex
reads it from `hooks/process-hygiene.json`, Claude Code from its own manifest
(see [Claude Code session end](#claude-code-session-end)). On a normal session
end, it records only the session owner: the nearest Codex or Claude Code
process above the hook, by PID and creation time. It then starts a detached
45-second grace timer. After the owner has exited, the sweep reads the process
table and stops only MCP trees the owner started: a direct child of the
owner's PID with an MCP signature, created after the owner started, and older
than any process that later reused the owner's PID. On Windows the stop is
`taskkill /T /F`; a hidden Node process refuses a stop without `/F`.
It does not run for subagent lifecycle events, inject context, read prompt text,
delete files, or scan unrelated Node/Python processes.
Codex documents a three-second `SessionEnd` maximum. Reading every process with
its command line takes longer than that on Windows, so the hook reads only
process IDs, parents, names, and creation times (one query) and leaves the
command lines to the detached sweep. On a heavily loaded machine even that
can pass three seconds; Codex then stops the hook and no sweep is scheduled
(fails closed), and `--cleanup-stale --apply` removes what is left.

Codex requires plugin hooks to be reviewed and trusted. After installing or
refreshing the plugin, start a new Codex session, open `/hooks`, inspect the
exact source and hash, and trust it only if it matches this repository. Do not
use `--dangerously-bypass-hook-trust` as an installation shortcut.

From 1.3.4, the plugin also registers a prompt-submit routing
hint for each CLI (`hooks/routing-hint.json` on Codex). It is not part of
process hygiene and is trusted separately in `/hooks`; what it reads, stores,
and prints is in the [security model](security-model.md#hooks).

Official references:

- [Codex hooks](https://developers.openai.com/codex/hooks)
- [Codex configuration and profiles](https://developers.openai.com/codex/config-reference)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp)

## Claude Code Session End

The Claude Code plugin manifest
(`plugins/agentchef/.claude-plugin/plugin.json`) declares the same sweep inline
as a `SessionEnd` hook with no matcher and a 15-second timeout:

```text
node ${CLAUDE_PLUGIN_ROOT}/scripts/codex-process-hygiene.mjs --session-end --runtime claude
```

- The hook lives in the manifest, not in `hooks/hooks.json`: Claude Code would
  load a `hooks/hooks.json` on its own, and Codex reads its hook from
  `hooks/process-hygiene.json` through its own manifest. Neither CLI loads the
  other's hook.
- The hook uses the exec form (`command` plus `args`, no shell), so the parent
  of `node` is the Claude Code process itself and the owner lookup ends at its
  first step.
- The detached sweep is the same one Codex uses: it waits 45 seconds, then
  stops only MCP trees that Claude session started, and only after that
  process has exited. The PID, creation time, and MCP signature rechecks are
  the same as on the Codex side.
- Claude Code also fires `SessionEnd` for `/clear`. The Claude process is
  still running then, so the sweep finds a live owner and stops nothing.
- Claude Code has no per-hash hook trust step. The hook runs once the
  `agentchef` plugin is enabled; inspect it with `/hooks`. The manifest is
  generated by `scripts/render-target-artifacts.mjs`, and `npm run check`
  fails when the committed copy drifts.

Official reference:
[Claude Code hooks](https://code.claude.com/docs/en/hooks).

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
- The audit recognizes a live Claude Code session as an MCP owner, exactly
  like a Codex session, so the MCP servers a running Claude session started
  are active and are never cleanup candidates. Before this, those trees had no
  Codex ancestor, were reported as orphans, and a manual cleanup would have
  terminated the MCP servers of every open Claude Code session.
- The AgentChef Serena pool manager owns the backends it starts. It is
  detached on purpose and stops them itself after an idle TTL, so a backend
  whose ancestor is `serena-pool.mjs manager` is never a cleanup candidate.
  Before this, a live pooled Serena backend (22 processes, about 1 GB here)
  was listed as an orphan.
- Both plugin manifests ship the session-end hook. Claude Code normally stops
  its own MCP children when a session ends; the hook catches trees that
  survive it.
