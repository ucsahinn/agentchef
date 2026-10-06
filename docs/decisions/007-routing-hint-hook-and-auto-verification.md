# ADR-007: Route requests by catalog, hint the model once per prompt, and require a verifier for high-risk work

## Status

Accepted

## Date

2026-10-06

## Context

AgentChef 1.3.3 shipped 29 skills and 28 agent roles, but a request used them
only when the model happened to match a skill or role description, or when the
user named one. The routing catalog (`catalog/routing-profiles.json`) already
scored requests against weighted signals, yet nothing at runtime called it: it
ran only from `npm run codex:routing`. The working agreement also told the
model to spawn agents only for parallel work, noisy research, or an explicit
request, which kept a needed verifier from running after a risky change.

The user asked that a skill or agent be used when a request genuinely needs
it, without guessing, and decided on 2026-10-06: a per-prompt routing hint
shipped by the AgentChef plugin (not by the separate Beyin engine), an
automatic verifier only for five high-risk profiles, both CLIs in one release,
and at most two agents started per task without the user naming them.

Official documentation checked the same day: Claude Code adds a
`UserPromptSubmit` command hook's plain stdout to the model's context and
blocks the prompt on exit code 2; Codex does the same for its prompt-submit
hook and runs it inside subagents too; neither CLI offers a setting that
routes to a skill or agent deterministically, so a hook is the only
deterministic injection point. Claude Code enforces a coordinator's
`Agent(...)` list only under `claude --agent`; Codex trusts a hook by the hash
of its definition, not of the script it runs.

## Decision

1. The catalog is the single source of routing. Each profile names its
   verifier, whether that verifier is required after file changes
   (`autoVerify`: security-sensitive, release-or-publish,
   mcp-connector-change, frontend-ui, data-systems), and the one skill to load
   first (`autoSkill`); skills marked `implicitInvocation: false` are
   suggested, never loaded. The working agreement's spawn conditions, skip
   conditions, auto-spawn cap, and worker models are rendered from the
   catalogs, and the profile list in the routing skill's reference is rendered
   between markers. Each role has one trigger-style description and at most one
   preloaded skill.
2. The scorer folds the Turkish dotless ı, matches multi-word exclude terms,
   judges confidence against the whole ranking, and lets one decisive term
   reach "high", so natural short requests in Turkish and English route.
3. The plugin ships a prompt-submit hook for both CLIs
   (`plugins/agentchef/scripts/routing-hint.mjs`). It reads the prompt from
   standard input, scores it in memory against a rendered copy of the catalog,
   and on a high-confidence match prints exactly one line of catalog
   identifiers. The line is advice; the model still judges necessity.
4. The security promise changes in one named place: this hook is the only
   context-injecting hook, and it is reviewed, exact-matched, and inert.

## Consequences

Invariants the hook keeps, pinned by `scripts/security-audit.mjs` and
`scripts/tests/routing-hint.test.mjs`:

- Exit code is always 0 and the output is never JSON, so the hook cannot block
  a prompt; nothing is written to standard error.
- Prompt text and matched words are never written to disk, to the output, to
  arguments, or to the environment; the only output is a fixed template filled
  with regex-validated identifiers, at most 300 characters.
- The index it reads holds identifiers and match words only and is validated
  for its exact shape; any violation prints nothing.
- Its only state is a per-session file under the user's plugin-data or
  temporary directory, named by the SHA-256 of the session id, holding hinted
  profile identifiers and skip counters. The directory is checked for
  symlinks and foreign ownership before use, the file is written by
  exclusive-create and rename, and the hook removes only its own files older
  than seven days.
- It prints nothing on low confidence, short or synthetic turns, inside
  subagents, when disabled with `AGENTCHEF_ROUTING_HINT=off`, or on any error.
- It imports only `node:fs`, `node:path`, `node:os`, `node:crypto`,
  `node:url`, and the engine copy; no child processes, no network.
- The Codex hook file and the Claude manifest are compared to the renderer's
  definitions exactly; `plugins/agentchef/hooks` must hold exactly the two
  reviewed files; each hook event name may appear only in the files reviewed
  for it.

Threats considered: a shared temporary directory on a multi-user host
(symlink and pre-created-directory attacks), an error path echoing prompt text,
a tampered installed copy (bounded to changing which identifiers are hinted,
since the index carries no free text), a forged hint line pasted into a prompt
(bounded by the advisory wording, the auto-spawn cap, and the permission
system), and a second hook developer copying the spawn guard's exit-code-2
pattern.

Costs: one Node process per prompt (tens of milliseconds, 10-second timeout,
never blocking), up to two more agents per task, and a Codex `/hooks` trust
step after the update.

Rejected alternatives: rule and descriptions only (left routing to the model's
guess); placing the hint in the Beyin engine's prompt hook (would not reach
AgentChef users without Beyin); a static `coordinator` field per profile (the
routing board already derives it and static values contradicted it);
enforcing the auto-spawn cap in code (a hook cannot tell a user-named agent
from an automatic one).

ADR-001 is partly superseded: routing is still conditional, but the catalog
now states when a verifier is mandatory.
