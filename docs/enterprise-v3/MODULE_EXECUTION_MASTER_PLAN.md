# Module execution master plan

**Owner:** Chef/Control/Brain module program  
**Kitchen boundary:** Kitchen implementation is user-owned and is supplied a
separate handoff list; it is not modified by this plan.

## Target and invariants

Kitchen is the sole public Agent Workspace product. Chef, Control and Brain
become internal modules behind reviewed contracts, while retaining their domain
authority. Chef owns routing/capability policy; Control owns execution,
worktree/effects and approval enforcement; Brain owns user knowledge. Kitchen
may consume safe module contracts but cannot become a scheduler, generic
executor, worktree/merge manager, approval authority, or private state store.

No workstream may copy or adopt auth, credentials, sessions, caches, raw
prompts/output, Brain notes/indexes/backups, Control SQLite/WAL/leases/
approvals/worktrees, terminal/browser sessions, or Kitchen profile/history.

## Workstreams and dependency order

| Phase | Owner scope | Concrete output | Depends on | Done only with evidence |
| --- | --- | --- | --- | --- |
| M0 | Program baseline | immutable source/revision, dirty-scope and ownership inventory | none | FND-01 + migration inventory reviewed; unrelated user changes untouched |
| M1 | Shared contracts | schema-validator-fixture parity, version/producer/redaction tests | M0 | `TASK-MSS4HE239CF88`; synthetic fail-closed tests and Chef validation |
| M2 | Chef/Brain portability | portable runtime, preview backup/restore, explicit Brain target/ACL/retrieval boundary | M0 | `TASK-MSS4HEAFXNNKI`; Brain test suite + Brain validation |
| M3 | Control security | threat model for renderer/IPC/MCP/Brain/mutable containment/state migration | M0 | `TASK-MSS2GO0MWAF4W`; Control security/validation evidence |
| M4 | Control MCP/approval | narrow capability/proposal parity, no generic execution/approval route | M1, M3 | `TASK-MSS2GOF1XL73I`; targeted MCP/negative tests |
| M5 | Module packaging design | exact internal package boundaries, compatibility matrix, root manifest input contract | M1–M4 | source revisions, lock/hash/runtime/health identities fixed; no source move yet |
| M6 | Provenance-preserving module migration | Chef/Brain then Control source moves into Kitchen workspace packages | M5 + user-owned Kitchen implementation readiness | reviewable commits retain tests; no source duplication or state copy |
| M7 | Cross-module acceptance | old/new schema fixtures, unavailable/stale/unsupported state, redaction and authority parity | M6 | cross-module test matrix passes; Kitchen user provides UI evidence |
| M8 | Release readiness | clean install/upgrade/rollback, package/Electron, security, docs, release notes | M7 | real Windows evidence + clean Git scope + explicit publish approval |

## Chef and Brain stream

1. Keep `catalog/`, templates, routing profiles and safe MCP defaults behind
   the Chef module API; authenticated connectors stay disabled by default.
2. Keep Brain CLI/foundation as the Brain module API: explicit target, preview
   first, project-scoped/bounded retrieval, no raw vault bridge, no automatic
   capture or hosted memory.
3. Preserve backup/restore manifest verification and Windows ACL integrity
   checks. A path/ACL health result is not a license to import vault contents.
4. Before migration, resolve Chef's Node `>=18` compatibility against the
   Kitchen/Control Node 24 runtime policy with a tested adapter; no global PATH
   rewrite or system Node replacement.

**Evidence:** `npm run test:brain`, `npm run validate:brain`, `npm run
validate`, portable synthetic fixtures, redacted diagnostics.  
**Failure posture:** unavailable/blocked module; never copied state or silent
runtime downgrade.

## Control stream

1. Retain the one foreground coordinator, Windows Job Object/native
supervisor, SQLite ownership/fencing, and immutable approval/worktree/effect
rules inside the Control module.
2. Restrict Kitchen-facing communication to explicit, versioned, metadata-only
contracts such as `kitchen.snapshot` and `kitchen.proposal.prepare`. No generic
IPC, browser token, database, native request/session ID or policy route may
cross the boundary.
3. Keep mutable work proof-gated: exact CLI route, containment proof, active
registered project, retained worktree, fencing and explicit approval. It must
not become available through an internal package import.
4. Align MCP capability reporting with the same local permission rules; a
projection/capability badge is never delegation or approval.

**Evidence:** Control preflight/targeted tests, IPC/MCP negative tests,
threat-model review, supervisor/containment verification where applicable.  
**Failure posture:** reject/blocked/forbidden; no fallback executor.

## Shared-contract stream

1. Version event and capability schemas independently from the public Kitchen
release; supported majors are explicit.
2. Require opaque correlation, producer allowlists, closed payload semantics,
redaction and unknown-field rejection.
3. Maintain synthetic fixtures for valid, malformed, unknown, unsupported,
duplicate, stale, forbidden and redaction cases.
4. Do not let the temporary Chef `packages/contracts` location become a public
artifact. It moves only after contract parity and Kitchen workspace layout are
proven.

**Evidence:** schema/validator fixture parity, Node tests, Chef validation.  
**Failure posture:** unsupported/blocked, never coerced into an action.

## User-owned Kitchen handoff boundary

Kitchen must implement its own root manifest resolver, internal package layout,
adapter/UI projection, reference-screen catalog, Electron/package tests and
clean-machine release flow. The module program supplies only versioned
contracts, health semantics, compatibility constraints and safe owner APIs.
Kitchen evidence is a prerequisite for M6–M8, but its code is not edited by
this plan.

## Release prohibition and final gates

No release/tag/publish/deploy is allowed until all M0–M8 evidence exists:

- immutable module baselines and a clean reviewed integration scope;
- root manifest/version/lock/hash compatibility resolution;
- all module + cross-module contract/security tests;
- real visible same-user Windows Electron interaction with safe degraded states
  and a Control-owned proposal/approval round trip;
- clean install, upgrade and rollback without state copying;
- package artifact/security review/release notes; and
- explicit publishing approval.

Each failed or missing gate is reported as `blocked`/`unavailable` with safe
reason codes. It must never be worked around by a hidden installer, auto-start,
state copy, generic MCP/action channel, or loosened test.
