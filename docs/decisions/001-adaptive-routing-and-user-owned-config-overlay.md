# ADR-001: Use conditional agent routing and a user-owned config overlay

## Status

Accepted

## Date

2026-07-21

## Context

Codex Chef ships 11 read-only coordinator role files, 21 specialist worker role files, and a broad set of skills and MCP
definitions. Earlier guidance treated a prompt-to-role match too much like a
spawn requirement and required separate visibility messages for agents, skills,
and MCPs. That increased thread count, startup/context noise, and token use even
when the main thread could complete the task safely.

At the same time, lowering `agents.max_threads` globally would reduce capacity
for users who work in several Codex windows. Pinning models or reasoning effort
inside agent roles would also override the profile the user intentionally
selected. Replacing `~/.codex/config.toml` wholesale would risk losing local
project trust, approvals, custom MCPs, and machine-specific settings.

## Decision

Codex Chef uses adaptive, conditional delegation:

- A role match is a recommendation. Spawn only for genuinely independent
  parallel work, to isolate noisy logs or research from the main thread, or
  when the user explicitly requests delegation.
- Keep `max_threads = 10` as a capacity ceiling for multi-window use. Ordinary
  routing uses one to four focused agents; the ceiling is not the target.
- Select the best role automatically, but do not write per-agent `model` or
  `model_reasoning_effort` pins. The active user profile and Codex runtime
  retain control of model and effort.
- Use one `Routing plan:` line before delegated work and one `Routing result:`
  summary or table before finalizing. Do not emit separate lifecycle chatter
  for every selected agent, skill, or MCP.
- Route compatibility skill names to one canonical owner rather than loading
  duplicates together.

Codex Chef also separates configuration ownership:

- Repository templates are the canonical Chef-managed baseline.
- The installed machine configuration is a user-owned overlay. Normal install,
  update, and repair preserve model/profile choice, approvals, sandboxing,
  project trust, custom MCPs, and unrelated marketplace entries.
- Chef-managed agent and MCP safety tables remain validated. Allowlisted MCP
  tools and their approval entries must have parity.
- Whole-file replacement remains an explicit force operation and is
  backup-backed. Legacy profile pin removal is a separate opt-in migration.

Operational diagnostics follow the same bounded principle:

- Token audit separates always-loaded instructions, discoverability metadata,
  invoked/deferred surfaces, repository maintenance size, tool schema/context,
  measured session telemetry when available, and per-agent cost. Heuristic
  repository totals are not provider billing.
- Runtime probes print progress, use short per-probe timeouts, and support
  `--offline` and `--no-mcp-probe` without skipping managed-file drift checks.
- Programmatic Windows execution resolves `npm.cmd`, `npx.cmd`, and
  `codex.cmd`; Unix keeps the un-suffixed commands.
- `job_max_runtime_seconds` is not used as a normal subagent deadline; current
  Codex documentation scopes it to experimental CSV worker jobs.

## Alternatives Considered

### Spawn every matching specialist

Rejected because it turns discoverability into execution, adds duplicated
context, and makes simple work slower without improving evidence.

### Lower `max_threads` globally

Rejected because a global limit can constrain users running multiple Codex
windows. Conditional routing controls ordinary fan-out without removing
capacity.

### Pin all agents to one model or reasoning effort

Rejected because task shape and the user's active profile are better inputs
than a static role-file default. Pins also make profile changes misleading.

### Replace the entire installed config from the template

Rejected because trust entries and machine-specific controls are user state,
not distributable package defaults. Managed merge plus validation provides a
safer, reversible boundary.

## Consequences

- Simple tasks stay in the main thread, while agents remain available whenever
  delegation materially helps.
- Multi-window capacity is preserved, but normal tasks have bounded fan-out.
- Routing output is auditable with substantially less context noise.
- User model/profile, approval, sandbox, trust, and custom connector choices
  survive normal upgrades and repair.
- Install/repair code and validators must maintain ownership metadata, MCP
  allowlist/approval parity, compatibility aliases, probe timeouts, and the
  documented token-audit layer names.
- Future changes to the three spawn criteria, config ownership boundary, or
  capacity policy require a new ADR that supersedes this one.
