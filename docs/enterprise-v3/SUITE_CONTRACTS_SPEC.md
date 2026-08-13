# Chef Control Kitchen suite contracts

## Status, scope, and authority

This is the implementation contract for the Chef--Control--Kitchen suite. It
consolidates the FND-01 baseline map, the FND-02 screen traceability contract,
and the FND-03 reuse-boundary decision. It deliberately defines interfaces and
acceptance criteria only; it creates no runtime coupling.

The suite has three independently versioned products:

| Product | Current baseline | Owner | Authority |
| --- | --- | --- | --- |
| Codex Chef | `0.5.x` | Chef maintainers | installable routing, role/skill catalogues, safe local operating contract and validation |
| Codex Chef Control | `0.3.x` | Control maintainers | one foreground, read-only Codex execution; explicit approval record and isolated worktree lifecycle |
| Kitchen | `0.1.x` | Kitchen maintainers | disposable, read-optimized projection and operator-facing observation surface |

Chef is the source of truth for routing and agent policy. Control is the source
of truth for an approved foreground run and its worktree. Kitchen is never an
authority for scheduling, spawning, stopping, merging, approving, or mutating.
It must represent absence and uncertainty rather than manufacture state.

## Versioning and compatibility

Each product follows semantic versioning independently. An event or public
schema has its own `schemaVersion` (`major.minor`): a consumer accepts its
supported major and ignores unknown optional minor fields. A producer must not
reuse a field name with a new meaning.

- A breaking wire, permission, or ownership change requires a schema-major and
  coordinated consumer release plan.
- Additive optional fields, new event kinds, and new capabilities are
  schema-minor changes.
- Producers retain the prior major during one published migration window, or
  provide a deterministic adapter fixture and documented upgrade boundary.
- Kitchen must render an unsupported version as an explicit `unsupported`
  projection state, preserving the envelope metadata without interpreting its
  body.
- Chef and Control must reject an unsupported required major before an action is
  started; they must not silently downgrade approval or isolation guarantees.

## Shared envelope and event schemas

All cross-product records use JSON-compatible UTF-8 objects. They are transport
agnostic; no product assumes a shared database, filesystem, process, or
credential store.

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_01J...",
  "eventType": "run.observed",
  "occurredAt": "2026-08-14T00:00:00.000Z",
  "producer": { "product": "control", "version": "0.3.0" },
  "correlation": {
    "suiteId": "suite_01J...",
    "taskId": "TASK-...",
    "runId": "run_01J..."
  },
  "capabilities": ["run.read"],
  "payload": {}
}
```

Required envelope fields are `schemaVersion`, `eventId`, `eventType`,
`occurredAt`, `producer`, `correlation`, and `payload`. IDs are opaque strings;
they are not paths, tokens, emails, prompts, command lines, or user content.
`eventId` is immutable and unique per producer. Consumers deduplicate by
`producer.product + eventId` and order only within an identical `runId` using
`occurredAt` plus producer sequence when one is supplied.

The initial event vocabulary is intentionally observation-only:

| Event type | Producer | Required payload | Consumer rule |
| --- | --- | --- | --- |
| `suite.snapshot` | Chef or Control | `state`, `observedAt`, `sourceRevision` | Kitchen may refresh a projection only |
| `run.observed` | Control | `runState`, `mode`, `worktreeState` | Kitchen displays it; no control action follows |
| `approval.observed` | Control | `decision`, `decisionAt`, `scope` | consumers treat it as a record, never an authorization grant |
| `capability.observed` | Chef or Control | `capability`, `availability`, `reasonCode` | UI exposes available, unavailable, or unknown distinctly |
| `projection.degraded` | Kitchen | `reasonCode`, `lastFreshAt` | does not trigger retries or mutations in another product |

`state`, `runState`, `worktreeState`, `decision`, `availability`, and
`reasonCode` are closed, documented enums at the schema-major level. Payloads
must contain no executable instruction, shell command, approval token,
credential, absolute user path, raw prompt, terminal transcript, or private
memory content.

## Correlation, data minimisation, and redaction

`suiteId` spans a user-visible unit of work. `taskId` identifies the task-board
record when available; it is optional only for work that has no task. `runId`
identifies a single Control foreground execution and is optional before one
exists. A consumer may join only on these opaque values and must not infer
identity from names, paths, or text.

Before a record crosses a product boundary, its producer must remove secrets,
authentication headers, API keys, session/cookie material, private paths,
personal data, raw model input/output, command output, and memory-note bodies.
When a useful diagnostic is needed, expose a stable `reasonCode` and a
human-safe summary; never a raw error body. Redaction is fail-closed: unknown
fields are excluded from an exported projection unless explicitly classified
safe. Logs and fixtures use synthetic IDs and content only.

## Capability and permission parity

Capability is a declared, observable product feature; permission is the
authority granted for a particular action. A projection or UI badge never
confers permission.

| Capability | Chef | Control | Kitchen | Parity rule |
| --- | --- | --- | --- | --- |
| Discover routing/roles | authoritative | may display | may project | Chef remains canonical |
| Observe run/approval state | may emit summary | authoritative producer | read-only consumer | Kitchen cannot act on it |
| Start/stop foreground run | no implicit cross-product action | explicit local authority only | forbidden | no UI shortcut bypasses Control |
| Approve or change worktree | policy surface only | explicit local approval record | forbidden | observations cannot be replayed as approval |
| Mutate repository or publish | only existing guarded workflow | only in explicitly approved scope | forbidden | no event adds authority |

A consumer must show `available`, `unavailable`, `unknown`, or `forbidden`.
It must not represent a missing connector, unconfigured runtime, denied
permission, or unsupported schema as success. A request is allowed only when
the local product already has the required permission; cross-product events are
evidence, not delegation.

## Degraded operation

Each product remains useful independently. If Chef is absent, Control must not
invent routing policy and Kitchen shows policy `unknown`. If Control is absent
or stale, Chef retains its local safe workflow and Kitchen shows the last
observed time plus `unavailable` or `stale`. If Kitchen is absent, Chef and
Control continue without a dashboard.

Network, connector, parsing, or schema failures are bounded to the receiving
product. The receiver records a safe reason code, keeps the last known
projection marked stale when one exists, and requires a deliberate local retry.
There is no automatic spawn, approval, merge, configuration rewrite, or
credential recovery. Empty states must retain the recovery routes captured by
FND-02 without claiming a connection exists.

## Backwards compatibility and fixtures

Every schema-major owns a versioned fixture set with the same envelope shape:

- valid minimum and full envelopes for every event type;
- unknown optional-field and unknown-event fixtures;
- unsupported-major, malformed-envelope, duplicate-event, out-of-order, stale,
  forbidden, and redaction fixtures;
- representative empty/unavailable/unknown/degraded UI projection fixtures.

Fixtures are synthetic and checked into the owning product's test corpus. A
producer change must run its own fixture validation and the consuming contract
tests before release. Consumers must prove that unknown minor fields do not
break rendering, unsupported majors do not cause action, and redacted fields
cannot reappear in logs, UI, or snapshots. FND-02's S01--S25 matrix remains the
interaction acceptance reference for future UI work; source screenshots and
external corpus paths are not fixtures.

## Implementation sequence and acceptance gates

1. **Chef:** publish the canonical capability catalogue and safe event-envelope
   definitions as documentation/schema artifacts; do not add implicit runtime
   connections.
2. **Control:** implement producer-side validation, redaction, opaque
   correlation IDs, and observation events from its existing authoritative run,
   approval, and worktree state.
3. **Kitchen:** add read-only adapters and explicit unavailable/unknown/stale/
   unsupported states; it must not add control-plane actions.
4. **Parity gate:** exercise the capability table with allowed, forbidden, and
   missing-permission cases; prove a Kitchen action cannot authorize Control.
5. **Compatibility gate:** run every shared fixture against supported producer
   and consumer versions, including prior-major migration coverage.
6. **End-to-end gate:** use a real, deliberately approved Control foreground
   run to show Chef routing, Control observation, and Kitchen projection, then
   repeat with Control unavailable and an unsupported schema. Capture safe
   evidence only.

An implementation is complete only when the owner can supply evidence for all
six gates, preserves the FND-01 authority boundaries, honours FND-02 visible
empty/recovery states, and introduces no secret, PII, destructive authority, or
hidden cross-product side effect.
