# Chef Control Kitchen suite threat model

## Status, scope, and security objective

This is the security companion to
[the suite contract](SUITE_CONTRACTS_SPEC.md). It describes the threats and
required controls for the Chef--Control--Kitchen boundary; it does not create a
runtime integration, connector, policy rule, credential store, or retention
system.

The security objective is to preserve local authority. Chef remains the
canonical routing and policy source, Control remains the source of truth for a
deliberately approved foreground run and its isolated worktree, and Kitchen is
a disposable, read-only projection. A cross-product record can provide
evidence, never authority.

## Assets and security invariants

The protected assets are approval decisions and their exact scope, Control run
and worktree authority, repository contents, user identity and private local
state, credentials/session material, and the accuracy and availability of
Kitchen projections.

The following invariants apply to every design and release:

- No observation, UI element, or event may start, stop, approve, merge, publish,
  reconfigure, or otherwise mutate another product.
- Only Control's local approval record may authorize a Control action. An
  `approval.observed` event is audit evidence and cannot be replayed as a grant.
- Cross-product data uses a supported schema major, an opaque correlation ID,
  a unique producer event ID, and the minimum classified-safe payload.
- Missing, stale, malformed, unauthorised, or unsupported information remains
  visibly `unknown`, `unavailable`, `stale`, `forbidden`, or `unsupported`; it
  is never normalised into success.
- A failure must fail closed: no automatic spawn, retry that changes state,
  approval, credential recovery, merge, or configuration rewrite follows it.

## Trust zones and allowed flows

| Zone | Authority and assets | Trust boundary | Allowed outbound data | Prohibited consequence |
| --- | --- | --- | --- | --- |
| Chef policy plane | Canonical roles, routing, and safe operating contract | Chef-to-any-product | Versioned capability and safe suite summaries | Another product changing routing or policy by event/UI input |
| Control execution plane | Local approval record, foreground run, and isolated worktree | Control-to-Chef/Kitchen | Validated observation envelopes and safe reason codes | Observations becoming commands or an external approval |
| Kitchen projection plane | Read-only, disposable operator view and cached projections | Kitchen-to-any-product | None required for control; local display only | Scheduling, spawning, stopping, approval, merge, or mutation |
| Local operator and repository | Explicit human intent, repository data, and local process state | Operator-to-local product | Deliberate, locally authorised requests | Implicit consent inferred from task text, events, or a dashboard |
| Optional MCP/connector boundary | External tools, account context, tokens, and remote responses | MCP-to-local product | Only reviewed tool output that has been classified safe | Connector output granting suite authority or leaking tokens/private state |

Each receiver validates schema-major support and envelope shape before use.
It deduplicates on `producer.product + eventId`, orders only within the same
`runId`, and treats producer text as data rather than instruction. No product
assumes shared filesystem, process, database, credential store, or identity
context merely because it can correlate an event.

## Threats and required controls

| Threat | Abuse path | Required control and evidence |
| --- | --- | --- |
| Forged or altered IPC event | A producer identity, event ID, payload, or schema is substituted to make a projection appear trustworthy | Validate required envelope fields, schema-major, producer identity, closed enums, and opaque correlation values before projection. Reject malformed and unsupported-major records without action; retain only a safe reason code. |
| Replay, reordering, or stale state | An old `approval.observed` or `run.observed` event is replayed, duplicated, or delivered out of order | Deduplicate by producer/event ID; scope ordering to one run; display `stale` when freshness is not proven. An observed approval never authorizes a later action. |
| Confused deputy through Kitchen | An operator-facing control, deep link, or recovery affordance is interpreted as Control authority | Kitchen exposes state and recovery routes only. It has no control-plane capability; capability labels do not grant permission and forbidden actions have no shortcut. |
| Proposal-to-approval escalation | A task, prompt, event, or model output is treated as approval for wider worktree, command, publish, or connector access | Keep proposals descriptive and non-executable. Bind Control approval to a local, explicit decision and exact scope; reject scope expansion, approval substitution, and replay. |
| MCP or connector privilege abuse | A tool bypasses shell sandbox assumptions, returns hostile instructions, or exposes account/secret material | Treat MCP as a separate powerful trust zone. Disable authenticated connectors by default; use reviewed, least-privilege allowlists and prompt-gated writes. Tool output is untrusted data and cannot delegate suite authority. |
| Permission confusion | A capability badge, availability event, or another product's state is mistaken for local permission | Evaluate permission locally for every action. Present `available`, `unavailable`, `unknown`, and `forbidden` distinctly; cross-product records are evidence only. |
| Sensitive-data disclosure | Events, diagnostics, logs, fixtures, or UI reveal prompts, paths, credentials, memory, PII, or raw failures | Export only explicitly classified-safe fields. Redact before crossing a boundary, fail closed on unknown fields, use synthetic fixtures, and provide stable reason codes with human-safe summaries. |
| Audit tampering or excessive retention | Records are mutable, contain unsafe bodies, or persist longer than their operational need | Keep event IDs immutable per producer and retain a minimal, redacted audit record. Define owner-specific retention and deletion procedures before implementation; no cross-product archive is assumed by this contract. |
| Degraded-state coercion | Missing Control/connector/schema support is hidden and prompts unsafe fallback behaviour | Bound failures to the receiver, preserve last known data only when marked stale, and require a deliberate local retry. Never manufacture connection, approval, or recovery success. |

## IPC, MCP, proposal, and approval rules

IPC is observation-only in the initial suite contract. Valid event types are
limited to the documented snapshot, run, approval, capability, and degraded
projection vocabulary. Payloads must not contain executable instructions, shell
commands, approval tokens, credentials, absolute user paths, raw prompts,
terminal transcripts, or private memory bodies.

MCP servers and optional connectors sit outside the shell sandbox and therefore
require their own permission boundary. A safe integration must use the
locally granted tool permission, a reviewed allowlist, bounded timeouts, and
redacted output. Missing connector configuration, denied permission, or an
unsupported schema cannot be solved by a silent fallback or by enabling an
account tool.

Proposals may describe requested work but must remain non-authoritative. They
cannot carry a transferable approval token, executable command, or instruction
to broaden a worktree. Control records a human's explicit local decision and
the approved scope before any protected action. Consumers may display that
record but must never turn it into an action or a new decision.

## Permission model

Capability describes what a product can expose; permission is the local
authority needed to perform one action. Both are required, and neither can be
inferred from the other.

- Chef is canonical for routing and policy but does not obtain cross-product
  start/stop authority.
- Control may act only within its explicitly approved local scope; it does not
  gain authority from Chef or Kitchen events.
- Kitchen is permanently read-only at the suite boundary.
- MCP/connector access remains disabled or prompt-gated until the user enables
  it and the local product receives the necessary permission.
- Any permission, ownership, schema, or connector uncertainty is denied for
  mutations and represented honestly to the operator.

## Redaction, audit, and retention

Redaction occurs before data leaves its owner zone. Remove authentication
headers, API keys, session/cookie material, private paths, personal data, raw
model input/output, command output, terminal transcripts, and memory-note
bodies. Unknown fields are excluded unless explicitly classified safe. Logs,
fixtures, and screenshots use synthetic content; a diagnostic exposes only a
stable reason code and human-safe summary.

Audit records are minimal and immutable in identity: producer, event ID,
event type, occurrence time, correlation IDs, local decision metadata where
authoritative, safe outcome, and reason code. They are not a transcript store
and are not an authorization channel. Before runtime implementation, each
owner must document its retention duration, access roles, protected storage,
export path, and approved deletion process. Retention must be no longer than
the demonstrated operational/audit need and must preserve the same redaction
boundary in backups and exports.

## Rollout and release gates

The documentation-only state is not evidence of a functioning integration. No
runtime rollout may proceed until all applicable gates have passed:

1. **Design gate:** the owner maps each data field and action to a trust zone,
   classifier, local authority, and failure state; unknown fields fail closed.
2. **Schema gate:** producer and consumer tests cover valid, malformed,
   duplicate, out-of-order, stale, forbidden, redaction, unknown-event, and
   unsupported-major fixtures using synthetic data.
3. **Permission gate:** evidence proves that Kitchen cannot authorize Control,
   an observed approval cannot be replayed, and a capability/connector status
   cannot substitute for local permission.
4. **MCP gate:** every enabled tool has documented minimum permissions,
   prompt-gated writes, safe timeout/error behaviour, and no secret-bearing
   output path.
5. **Operator gate:** real, deliberately approved Control execution is
   observed end to end; separately prove Control-unavailable, denied-permission,
   and unsupported-schema states without an automatic side effect.
6. **Release gate:** owner supplies redacted evidence for all prior gates,
   confirms retention/access controls, and reviews no secret, PII, destructive
   authority, hidden coupling, or policy bypass was introduced.

## Residual risks and review triggers

This contract cannot itself authenticate a transport, enforce retention, or
prevent a compromised local product from misreporting state. Those controls
belong to the owning implementation and must be assessed before connection.
Re-review this model for any schema-major change, new event type, new
connector/MCP server, new control-plane action, changed approval semantics,
storage/export path, or change to data classification/retention.
