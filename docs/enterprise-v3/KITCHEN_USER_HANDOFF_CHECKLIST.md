# Kitchen user implementation handoff checklist

**Status:** user-owned implementation plan — product release is **not ready**.  
**Boundary:** Kitchen is the sole public Agent Workspace product. Chef, Control,
Brain and contracts are internal modules; their source is not copied into UI
screens and their authority is not transferred to the renderer.

## Module inputs already prepared

| Input | Location / evidence | Kitchen uses it as |
| --- | --- | --- |
| Chef/Brain manifest | `codex-chef/manifests/chef-module.manifest.v1.json`, commit `27eb2ed` | versioned metadata: Node compatibility, events/capabilities/proposals major, read-only health IDs, no-copy state |
| Control manifest | `codex-chef-control/releases/control-module.manifest.v1.json`, commit `72c3d76` | Node24/.NET/SDK/native-supervisor metadata, two Kitchen capabilities, read-only health, no-copy state |
| Event contracts | `codex-chef/packages/contracts`, commit `ed5f504` | v1 synthetic fixtures and fail-closed envelope/payload validation |
| Module compatibility | `codex-chef/packages/contracts/src/module-compatibility.mjs`, commit `ee746b3` | event/proposal major, health, capability and no-copy compatibility check |
| Control authority parity | Control commits `261f5ae`, `243b9c5` | only `kitchen.snapshot` and `kitchen.proposal.prepare`; no generic execution/approval/browser authority |

## Non-negotiable architecture rules

- Kitchen is the only installer/package/release train and public support entry.
- Kitchen UI may project state and send an explicitly previewed proposal only
  through Control's allowlisted owner API. It never schedules, runs, stops,
  merges, manages worktrees, grants permission, or stores private module state.
- Chef remains routing/skills/capability policy owner; Control remains
  execution/approval/worktree/effect owner; Brain remains user-owned knowledge
  owner.
- Never copy source into a feature screen. Import/reuse only reviewed internal
  module packages/contracts after immutable revision/hash validation.
- Never copy auth, credentials, sessions, caches, raw prompts/output, Brain
  notes/indexes/backups, Control database/WAL/approvals/worktrees/descriptors,
  terminal/browser sessions, or local Kitchen history/profile state.

## Implementation phases

| Phase | Owner | Concrete work | Dependency | Real verification / DoD |
| --- | --- | --- | --- | --- |
| 0. Baseline isolation | Kitchen owner | Freeze a clean integration branch; inventory all existing dirty/staged files; preserve user changes; select immutable source revisions for module inputs. | none | `git status --short` reviewed path-by-path; no bulk add/clean/reset; approved source SHA ledger exists. |
| 1. Full reference corpus | Kitchen UI owner | Catalog **every** screenshot under the operator-provided `C:\ss` corpus, not only the original 25 seed files. Give each screen an ID, source filename, viewport, UI family, interaction/state, reusable pattern, target route and acceptance screenshot. | phase 0 | Full file-count/ID ledger equals corpus count; contact-sheet/individual visual review evidence; no reference image is silently omitted or copied into product assets without provenance. |
| 2. Product information architecture | Product/UI owner | Turn catalog into routes: Living Kitchen, Workspace shell, Projects, Teams/Agents, Orders/Tasks, Activity, Terminal projection, Research projection, Brain, Skills/MCP, Approvals, Artifacts, Reports, Diagnostics, Setup and empty/error/degraded states. | phase 1 | Route map and keyboard/mobile IA reviewed against every catalog family; each reference requirement traced to a target or explicit reject rationale. |
| 3. Root workspace layout | Kitchen platform owner | Create a root workspace/monorepo layout for `apps/kitchen` plus internal `modules/chef`, `modules/control`, `modules/brain`, `packages/contracts`; do not source-copy by hand. Define dependency direction and public package boundary. | phase 0, module inputs | `npm`/workspace lockfile resolution from immutable inputs; no external standalone installer becomes a customer path. |
| 4. Root manifest resolver | Kitchen platform owner | Implement `kitchen.workspace-manifest.v1` and default zero-write preview resolver from the approved spec. Validate module version/revision/lock/artifact hash/runtime/health and issue fresh plan IDs. | phase 3 | TDD fixtures: unknown/mismatch/path/reparse/unowned collision/stale health/redaction. Preview creates no directory, state, service, download or backup. |
| 5. Module ingestion | Platform + module owner | Consume Chef/Brain/Control manifests and the shared contract package. Verify compatibility before module activation; show ready/unavailable/stale/unsupported/blocked/failed truthfully. | phases 3–4 | Compatibility validator and real module health probes run from fixed command IDs only; no raw paths/tokens/prompts/state enter UI. |
| 6. Event/projection layer | Integration owner | Map normalized envelopes to Kitchen adapters/projections. Preserve opaque correlation, schema major handling, redaction and observed timestamps; use synthetic fixtures first. | phase 5 | Producer/consumer fixture suite validates valid, malformed, stale, duplicate, forbidden, unsupported and redaction cases; unsupported means read-only degraded display. |
| 7. Workspace UI build | UI owner | Implement catalog-traced screens, living pixel Kitchen, command center/deck, project/team/order boards, terminal/research/artifact/report/diagnostic views, responsive/mobile and keyboard-accessible inspector. Use original/reviewed assets only. | phases 1–2, 6 | Real browser/Electron screenshots for each acceptance ID; no nested-card clutter, hidden state, simulated-live data or unactionable authority-looking control. |
| 8. Owner-backed actions | Integration/security owner | Keep browser display-only. In trusted Electron, offer only Control's previewed `task.create`/fixed read-only terminal proposal flow and the narrow paired native decision contract when its owner is available. | phases 5–7 | Negative browser/Electron tests prove no generic run/approve/browser/schedule/worktree API; missing pairing/alias/permission stays unavailable. |
| 9. Security and observability | Security owner | Enforce loopback-only host, renderer sandbox/context isolation, safe diagnostics, source freshness, redacted bounded history, content-security policy and operator-visible degraded/recovery states. | phases 5–8 | Security contract tests plus real Electron smoke; raw module records, tokens, paths, approval credentials and Brain content absent from snapshots/logs/export. |
| 10. Install/migration/release | Release owner | Implement preview-first root installer, staged promotion, owned-target receipt, explicit selected-module apply, backup/rollback and legacy standalone deprecation/migration docs. | phases 3–9 | Real clean Windows install → visible Electron workspace → upgrade → fault/rollback test. Inspect generated package artifact/signature/version; release notes + explicit publish approval. |

## Required UI acceptance matrix

For every catalogued reference screen, record all applicable states: loading,
empty, connected, unavailable, stale, unsupported, permission-denied, pending
operator approval, failed/recovery, historical replay, mobile, keyboard focus
and reduced motion. A screenshot-matching page without these state transitions
is not complete.

Visible module facts must map as follows:

| Surface | May display | Must not display/do |
| --- | --- | --- |
| Chef/Skills/MCP | count-only current capability projection, unknown/unavailable state | invoke/configure credentialed connectors or reveal config/identity |
| Brain | owner-reduced health/topology counts | notes, paths, retrieval bodies, capture/write action |
| Control | opaque run/worktree/approval projection and approved proposal receipt | SQLite, console URL/token, native IDs, generic run/approve/worktree control |
| Terminal/Research | safe session projection and bounded owner-backed proposal status | attach stdin, execute arbitrary command, open arbitrary browser/session |

## Final product release gate

Do not tag, publish, deploy or call the product release-ready until all are
evidenced:

1. Full `C:\ss` catalog traceability and UI/browser/Electron evidence.
2. Root manifest/preview resolver plus module compatibility/hash/health checks.
3. Cross-module contract, redaction, security and degraded-state tests.
4. A real same-user Windows Electron interaction, including a Control-owned
   proposal/approval round trip without renderer authority.
5. Clean-machine install, upgrade and rollback with no state copying.
6. Clean reviewed Git scopes, package artifact inspection, security audit,
   release notes and explicit publish approval.

Until then, existing Chef/Brain/Control green checks are module evidence only;
they do not prove a Kitchen product release.
