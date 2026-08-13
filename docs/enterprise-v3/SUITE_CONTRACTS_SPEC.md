# Chef Control Kitchen suite contracts

## Status, scope, and authority

This is the implementation contract for the Kitchen Agent Workspace and its
Chef, Control, and Brain modules. It consolidates the FND-01 baseline map, the
FND-02 screen traceability contract, and the FND-03 reuse-boundary decision.
It defines module interfaces and acceptance criteria only; it creates no
implicit runtime coupling or source duplication.

[ADR-005](../decisions/005-kitchen-unified-workspace-and-module-boundaries.md)
supersedes the earlier three-independent-product interpretation of this
document. Kitchen is the only public product, installer, and release train.
The module versions below describe compatibility, not standalone publication.

| Surface | Compatibility baseline | Owner | Authority |
| --- | --- | --- | --- |
| Kitchen workspace shell | `0.1.x` root product | Kitchen maintainers | public workspace shell, UI, adapter composition, health presentation |
| Chef module | derived from Chef `0.5.x` | Chef module maintainers | routing, role/skill catalogue, capability policy and validation |
| Control module | derived from Control `0.3.x` | Control module maintainers | foreground local execution, explicit approval record, worktree/effect lifecycle |
| Brain module | version set by Kitchen manifest | Brain module maintainers | user-owned durable knowledge and retrieval/backup boundary |

Chef is canonical for routing and capability policy. Control is canonical for a
foreground run, approval record, and worktree/effect state. Brain is canonical
for its user-owned content. Kitchen composes read-safe projections and reviewed
module API calls, but is never an authority for scheduling, spawning, stopping,
merging, approving, or mutating. It must represent absence and uncertainty
rather than manufacture state.

## Versioning and compatibility

Each internal module can evolve with semantic versioning, while the public
release version is the Kitchen release version. An event or module API schema
has its own `schemaVersion` (`major.minor`): an adapter accepts its supported
major and ignores unknown optional minor fields. A producer must not reuse a
field name with a new meaning.

- A breaking wire, permission, or ownership change requires a schema-major and
  coordinated Kitchen compatibility/release plan.
- Additive optional fields, new event kinds, and new capabilities are
  schema-minor changes.
- Producers retain the prior major during one Kitchen migration window, or
  provide a deterministic adapter fixture and documented upgrade boundary.
- Kitchen must render an unsupported version as an explicit `unsupported`
  projection state, preserving the envelope metadata without interpreting its
  body.
- Chef and Control must reject an unsupported required major before an action is
  started; they must not silently downgrade approval or isolation guarantees.

## Shared envelope and event schemas

All cross-module records use JSON-compatible UTF-8 objects. They are transport
agnostic; no module assumes a shared database, filesystem, process, or
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

Before a record crosses a module boundary, its producer must remove secrets,
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

| Capability | Chef module | Control module | Kitchen shell | Parity rule |
| --- | --- | --- | --- | --- |
| Discover routing/roles | authoritative | may display | may project | Chef remains canonical |
| Observe run/approval state | may emit summary | authoritative producer | read-only consumer | Kitchen cannot act on it |
| Start/stop foreground run | no implicit cross-module action | explicit local authority only | forbidden | no UI shortcut bypasses Control |
| Approve or change worktree | policy surface only | explicit local approval record | forbidden | observations cannot be replayed as approval |
| Mutate repository or publish | only existing guarded workflow | only in explicitly approved scope | forbidden | no event adds authority |

A consumer must show `available`, `unavailable`, `unknown`, or `forbidden`.
It must not represent a missing connector, unconfigured runtime, denied
permission, or unsupported schema as success. A request is allowed only when
the receiving module already has the required permission; cross-module events
are evidence, not delegation.

## Degraded operation

Kitchen can start with an unavailable internal module but must show the module
as `unknown`, `unavailable`, `stale`, or `unsupported`; it cannot substitute
made-up routing, execution, approval, or Brain content. A missing Chef module
leaves routing policy `unknown`. A missing or stale Control module leaves the
last observed state marked `unavailable` or `stale`. A missing Brain module
leaves knowledge retrieval unavailable without falling back to raw local data.

Network, connector, parsing, or schema failures are bounded to the receiving
module. The receiver records a safe reason code, keeps the last known
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

1. **Chef module:** publish the canonical capability catalogue and safe
   event-envelope definitions as internal documentation/schema artifacts; do
   not add implicit runtime connections.
2. **Control module:** implement producer-side validation, redaction, opaque
   correlation IDs, and observation events from its existing authoritative run,
   approval, and worktree state.
3. **Brain module:** expose only reviewed, user-safe knowledge health and
   retrieval contracts; never raw note bodies or user profile state.
4. **Kitchen shell:** add read-only adapters and explicit unavailable/unknown/
   stale/unsupported states; it must not add control-plane actions.
5. **Parity gate:** exercise the capability table with allowed, forbidden, and
   missing-permission cases; prove a Kitchen action cannot authorize Control.
6. **Compatibility gate:** run every shared fixture against supported producer
   and consumer versions, including prior-major migration coverage.
7. **End-to-end gate:** use a real, deliberately approved Control foreground
   run to show Chef routing, Control observation, and Kitchen projection, then
   repeat with Control unavailable and an unsupported schema. Capture safe
   evidence only.

An implementation is complete only when the owner can supply evidence for all
seven gates, preserves the FND-01 authority boundaries, honours FND-02 visible
empty/recovery states, and introduces no secret, PII, destructive authority, or
hidden cross-module side effect. The current v1 schema and implementation
already fail closed on unknown envelope fields and unauthorized producers;
payload enums remain an explicit follow-up: the schema currently accepts a
generic object while the implementation only requires event-specific non-empty
string fields. Before a Kitchen release, each payload enum must be represented
consistently in the JSON schema, validator, and synthetic fixtures.
