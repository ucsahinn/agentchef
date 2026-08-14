# ADR-005: Make Kitchen the single distributable Agent Workspace and retain Chef, Control, and Brain as internal modules

## Status

Accepted

## Date

2026-08-14

## Context

The repository family originally grew as separately installable Chef, Control,
and Kitchen projects. That shape was useful while their capabilities were being
proven, but it leaves the operator with several installers, release trains,
runtime checks, and unclear ownership boundaries. It also encourages a harmful
direction: copying a feature or source tree between products instead of using
one implementation behind a reviewed module boundary.

The product target is now a full Agent Workspace. Its UI is Kitchen, and an
operator installs and publishes **Kitchen only**. Chef supplies routing,
skills, and capability policy; Control supplies local execution and approval
enforcement; Brain supplies durable, user-owned knowledge. They are parts of
the Kitchen product, not separately installed applications once the migration
is complete.

This decision supersedes the following parts of
[ADR-004](004-workspace-os-unified-bootstrap.md): the assumptions that Kitchen
is independently installable, that a user selects Chef/Control/Kitchen as
separate bootstrap components, and that the public release flow coordinates
three independent installed products. ADR-004 remains historical evidence for
safe state migration, preview-first installation, path ownership, backup, and
fail-closed health checks. Those safety constraints remain in force.

## Decision

Kitchen is the sole installed, distributed, and published product. The target
repository layout is a Kitchen-owned workspace/monorepo containing internal,
versioned modules for Chef, Control, and Brain. Modules may have their own
package versions, schema versions, tests, and changelogs, but they do not have
standalone customer installers, public release artifacts, or an independent
production release train.

| Surface | Product status | Authoritative responsibility | Distribution rule |
| --- | --- | --- | --- |
| Kitchen workspace shell | public product | application shell, UI, workspace projection, unified installation and health presentation | the only installable and publishable artifact |
| Chef module | internal module | routing policy, skill/catalog discovery, capability declarations | shipped only through the compatible Kitchen release |
| Control module | internal module | foreground local execution, worktree/effect records, proposal and approval enforcement | shipped only through the compatible Kitchen release |
| Brain module | internal module | user-owned durable knowledge, retrieval boundaries, backup/restore contracts | initialized or attached only through Kitchen's reviewed flow |

### Authority and dependency direction

The dependency direction is one-way:

```text
Kitchen shell/UI -> module adapters -> Chef | Control | Brain
```

- Kitchen renders projections and invokes reviewed module APIs. It must not
  duplicate a scheduler, worktree manager, merge authority, approval authority,
  or hidden state store.
- Chef owns routing and capability policy. It cannot reach Kitchen UI state or
  Control/Brain storage directly.
- Control owns execution and approvals. A Kitchen action may create a proposal
  or display an outcome; it cannot turn the UI into a second approval or
  execution authority.
- Brain owns its user content and retrieval boundary. No module imports raw
  chats, credentials, sessions, or another module's local state.
- Cross-module data uses explicit, versioned contracts. An unsupported schema
  version fails closed or is displayed as a degraded read-only projection; it
  is never silently coerced.

### Migration and packaging

The migration has one public installer and one root release manifest owned by
Kitchen. It resolves compatible internal module versions, validates their
hashes and health contracts, and records only safe installation receipts.
Existing standalone repositories are migration sources and legacy maintenance
surfaces until their code and contracts are absorbed; they are not new public
install targets after the Kitchen migration cutover.

### Standalone release freeze

Codex Chef `0.5.72` is the final standalone maintenance release. It remains a
complete, independently installable product with its existing preview,
backup, repair, and verification guarantees. This decision does not authorize
removing its installers, repointing its documentation to Kitchen, or coupling
its runtime to Kitchen. Those changes happen only in the Kitchen repository
after Kitchen's root installer and module compatibility gates have the
evidence listed below. Until then, the repositories remain isolated so an
unfinished Kitchen integration cannot regress a working Chef installation.

The installer is preview-first. It moves source-controlled code, lockfiles,
reviewed configuration templates, and explicit export/import payloads only. It
does not copy auth, sessions, caches, local memories, Brain content, approval
records, terminal history, worktrees, databases, or machine-specific paths.
Any user data migration is module-owned, explicitly opted in, allowlisted,
backup-safe, and reversible only where ownership can be proved.

### Versioning and release gates

Module versions communicate compatibility to the Kitchen release manifest;
they are not publication permission. The public version is the Kitchen release
version. A module can be internally frozen only when its API/schema, migration
contract, tests, and ownership documentation are reviewed.

This architectural/scheme freeze is distinct from a real release. A Kitchen
publish is blocked until all of these have evidence:

- a clean, reproducible root install/package run with locked dependencies;
- contract and migration tests across all internal modules;
- a real Windows desktop Kitchen interaction test, including visible workspace
  state and an approval-proposal round trip without granting Kitchen authority;
- fresh-machine install, upgrade, backup, and rollback evidence with no
  copied secrets or machine-bound state;
- security review of module boundaries and publish artifacts; and
- a clean, reviewed Git scope with release notes and an explicit publishing
  approval.

The current repository family does not satisfy those gates: the worktrees are
dirty, the integrated module layout and root package are not yet verified, and
there is no demonstrated end-to-end Windows UI/package acceptance evidence.
No actual release, tag, package publish, or production deployment is allowed
on the strength of this ADR.

## Alternatives Considered

### Keep Chef, Control, Brain, and Kitchen as separately installable products

Rejected. It makes the desired Agent Workspace an orchestration layer over
multiple releases and invites version skew, duplicated installers, and
ambiguous support ownership.

### Copy Chef, Control, or Brain source into Kitchen as UI features are needed

Rejected. Source duplication creates divergent behavior and makes security
boundaries impossible to audit. Kitchen consumes module contracts and shared
workspace packages instead.

### Make Kitchen the execution and approval authority

Rejected. A visual workspace must not gain Control's authority merely because
it presents a button or terminal. Proposal and projection remain distinct from
execution and approval decisions.

### Publish internal modules independently while calling Kitchen the main app

Rejected. This preserves the operator confusion and compatibility burden that
the unified product boundary is intended to remove. Internal module artifacts
can exist for build/test provenance, but are not customer releases.

## Consequences

- Kitchen owns the product roadmap, root installer, release manifest,
  compatibility matrix, and public support/documentation surface.
- Chef, Control, and Brain code must move behind stable module boundaries and
  remain independently testable without becoming separately installable.
- Existing standalone setup/release documentation must be marked legacy or
  converted into migration/developer documentation before Kitchen cutover.
- A release dashboard must show module health and compatibility, while release
  approval remains a single Kitchen gate.
- ADR-004 needs a later implementation ADR for the precise migration sequence;
  it must not be treated as authorization to create another multi-product
  installer.

## Implementation Plan and Definition of Done

1. Inventory Chef, Control, and Brain source/config/runtime ownership and
   define their Kitchen module package boundaries without copying source.
2. Introduce the Kitchen root manifest, compatibility matrix, and a
   preview-only installer plan. Keep standalone setup paths maintenance-only
   until the root flow has real evidence.
3. Move or import code through reviewed commits, preserving each module's
   tests and adding contract tests at every adapter boundary.
4. Replace public module release instructions with Kitchen migration and
   developer-module instructions; never delete user state as part of cutover.
5. Run the full clean-machine, interactive desktop, migration, rollback,
   security, and packaging gate before proposing a Kitchen release.

The target is complete only when all of the following are true:

- [ ] Kitchen is the only public installer, package, release train, and support
  entrypoint.
- [ ] Chef, Control, and Brain are internal modules with documented API/schema
  compatibility and no source duplication.
- [ ] Kitchen does not become a second execution, worktree, merge, approval,
  or private-state authority.
- [ ] Legacy standalone paths are explicitly deprecation/migration-only and
  cannot be mistaken for current public installation guidance.
- [ ] Real clean-machine and interactive Windows workspace evidence satisfies
  every release gate before a publish is proposed.
