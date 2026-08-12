# ADR-004: Keep unified Workspace OS bootstrap Windows-owned, preview-first, and state-free

## Status

Proposed

## Date

2026-08-12

## Context

Codex Chef, Codex Chef Control, and Codex Chef Kitchen are separate authority
layers, but a new Windows PC needs a coherent way to prepare all three. The
portability investigation in
[TASK-MSQCTM8VXR3HL](../agent-results/TASK-MSQCTM8VXR3HL-portability-matrix.md)
established that they have incompatible runtime and state contracts:

- Chef is cross-platform and supports Node.js 18 or later. It owns reviewed
  Codex templates and its existing installer already previews and backs up
  Chef-managed targets.
- Control is the Windows local execution/control plane. Its `0.3.0` package
  accepts Node.js `>=24 <25`; its current setup gate also requires a 64-bit
  Windows host, Codex CLI `0.145.x`, a .NET 8 runtime, and an authenticated
  Codex CLI. `global.json` pins SDK `8.0.422` with roll-forward disabled.
- Kitchen is a Windows Electron observer. It requires Node.js `>=24 <25` and
  its desktop entrypoint requires a locally installed Electron runtime. It
  must remain a read-only projection, not a second execution or approval
  authority.

Copying a user profile or the mutable state of any layer would merge authority
and leak private or machine-bound data. In particular, that includes Control
SQLite data, pipe descriptors, browser tokens, leases and approvals; Kitchen
history; Codex auth/sessions; and every Brain vault or authentication surface.
There is no unified installer today, so this ADR is a technical specification
and executable implementation plan, not an installer implementation.

## Decision

Create a new **Windows-only Workspace OS bootstrap artifact in the Control
repository**. Control owns the artifact because it alone is the local Windows
control plane and already owns transactional Windows setup. Chef remains the
owner of its install plan/templates, and Kitchen remains an independently
installable read-only desktop component. The artifact must call their reviewed
install surfaces; it must not reimplement them or merge their state.

Until Control ships that artifact, Chef's existing Portable Workspace OS flow
remains Chef-only. This ADR does not change the contract in
[`docs/install.md`](../install.md).

### Target CLI contract

The proposed entrypoint is
`codex-workspace-bootstrap.ps1`, distributed by Control. It must have this
contract before implementation starts:

```powershell
# Default: no writes; emits a human plan and a redacted JSON plan.
./scripts/codex-workspace-bootstrap.ps1 \
  -Component Chef,Control,Kitchen -Preview -Json

# The only write route: explicit component list, reviewed plan identity, apply.
./scripts/codex-workspace-bootstrap.ps1 \
  -Component Chef,Control,Kitchen -PlanId <plan-id> -Apply
```

- `-Preview` is the default when `-Apply` is absent. A preview performs only
  path, manifest, hash, version, and health probes; it never creates target
  directories, writes state, installs dependencies, initializes Brain, or
  starts a long-lived service.
- `-Component` is required for `-Apply`; valid values are `Chef`, `Control`,
  and `Kitchen`. The default preview may show all components but must state
  which are selected. There is no implicit `All` apply route.
- `-PlanId` binds apply to the immediately reviewed, canonical/redacted plan.
  A source revision, component/version pin, package-lock hash, tool hash,
  target path, or ownership-state change invalidates it and requires a fresh
  preview.
- `-Json` uses a documented `workspace-os.bootstrap.v1` result schema with
  `mode`, `planId`, `selectedComponents`, `mutated`, `gates`, `operations`,
  `backups`, `rollback`, and `health`. Paths and error output are redacted by
  default; no token, prompt, auth status detail, database row, or Brain content
  is emitted.
- Component source paths, target roots, and `-BackupRoot` are absolute,
  canonical paths. Reparse points, symlinks, path escapes, and target overlap
  fail closed. User-home defaults may be offered only after the preview names
  their exact managed targets.

### OS and toolchain gates

All selected components must satisfy gates before the first write. The plan
must distinguish a blocking failure from an optional capability warning.

| Gate | Chef | Control | Kitchen |
| --- | --- | --- | --- |
| Host | Windows, macOS, Linux, or WSL | 64-bit Windows, current user | Windows desktop, current user |
| Node runtime | Node 18 major line, component-scoped | Node 24 major line, component-scoped | Node 24 major line, component-scoped |
| Native prerequisites | Git, npm/npx, Codex as required by selected Chef mode | .NET SDK `8.0.422` exactly; .NET 8 runtime; Codex CLI `0.145.x`; Control prerequisites | Electron payload and locked npm dependencies |
| Version evidence | source revision and Chef manifest/package-lock digest | `package.json`, `package-lock.json`, `global.json`, Node executable SHA-256, and setup payload identity | `package.json`, `package-lock.json`, Electron/package identity, and Node executable SHA-256 |
| Runtime isolation | no global PATH rewrite | no global PATH rewrite; use Control's copied/integrated Node runtime only after verification | invoke only Kitchen's verified Node 24/Electron runtime |

The release manifest must pin exact Node binaries by architecture, source URL,
size, and SHA-256. `>=18` and `>=24 <25` are compatibility ranges, not
download authorization. The bootstrap verifies a pinned binary before use and
never silently upgrades or replaces a system-wide Node installation. A missing
or mismatched pin blocks apply. Chef may use a compatible preinstalled Node 18
runtime, but the manifest must record the resolved executable and version.

The Control gate must not claim that `codex login status` proves authorization
for a user or reveals account information. It reports only the existing
machine-readable ready/not-ready outcome required by Control setup.

### Fresh-state and ownership policy

The bootstrap moves **only source-controlled code, release manifests, locked
dependency metadata, and reviewed configuration templates**. It initializes
fresh local state through the owning component's supported initializer.

| Surface | Allowed input | Explicitly forbidden from copy/import |
| --- | --- | --- |
| Chef | reviewed templates and manifest-selected source; the existing backup-safe Chef install/repair surface | `auth.json`, config secrets, sessions, caches, local memory, user-created skills, or an existing `CODEX_HOME` tree wholesale |
| Control | release payload plus its supported fresh setup/migration path | SQLite databases and WAL/SHM files, named-pipe descriptors, browser tokens/URLs, coordinator leases/fences, approvals, worktree/effect records, logs, and Control installation state |
| Kitchen | release payload, package lock, and read-only bridge configuration template | history/task stores, Control descriptors/tokens, raw terminal/project session data, caches, Electron profile state, and local approval data |
| Brain | reviewed empty-vault template, only when an explicit `-InitializeBrain` component option is selected | vault notes, indexes, auth, sessions, memory, or any user/export archive |

The bootstrap may create a new, minimal ownership receipt containing only
schema version, selected component/release identities, canonical target roots,
timestamps, safe backup IDs, and hashes. It must be separate from component
state and must never contain a credential, mutable task/history data, or a
pointer that grants access to another component's state.

### Backup, transaction, and rollback semantics

Before an apply operation, the bootstrap resolves every managed target and
records whether it is missing, an owned matching target, an owned repairable
target, or an unowned collision. Unowned collisions and unsafe links fail
closed; the bootstrap never adopts a target merely because its name matches.

It delegates Chef backup/restore behavior to Chef and Control setup transactions
to Control. Kitchen's dependency install is staged under a new
bootstrap-owned component root and is promoted only after lockfile and health
verification. For targets that the bootstrap itself may overwrite, it creates a
hash manifest and a scoped backup before the write. Backup archives must be
allowlisted, integrity-checked, and include no forbidden fresh-state surface.

Rollback is per component in reverse apply order. A failed component restores
only its own verified backup or removes only a directory proved to have been
created in the current transaction. It does not delete a pre-existing tree,
global runtime, Brain vault, user configuration, or another component's data.
If rollback cannot prove ownership or integrity, it stops and reports a manual
recovery state rather than continuing.

### Unified health matrix

Preview reports intended gates; apply reports the same matrix with actual
post-install evidence. A component is `ready` only if its own supported health
command succeeds. `skipped`, `blocked`, `failed`, and `rolledBack` are terminal
statuses; no aggregate success may hide a failed selected component.

| Component | Required post-apply evidence | Must not do |
| --- | --- | --- |
| Chef | manifest/install-runtime status reports its selected managed surface healthy | access auth, mutate user-owned extras, or enable authenticated MCPs by default |
| Control | setup `Doctor -Json` passes its prerequisite and installation-state gates | start a coordinator, schedule work, run a mutable task, or consume approval |
| Kitchen | verified Node 24/Electron desktop smoke or its owned non-interactive health command passes; Control bridge is reported optional/read-only | perform task execution, approval forwarding, or assume Control is installed |
| Brain (if selected) | empty-vault initializer returns created/healthy with no imported user content | capture, sync, retrieve, or copy content automatically |

The release acceptance test is an actual clean Windows VM or disposable local
Windows user profile: run preview, inspect its plan, run explicit apply with
selected components, capture the JSON health matrix and the Kitchen desktop
smoke, then verify a second preview reports idempotent owned state. Unit tests
and mocked PowerShell output do not substitute for that end-to-end gate.

## Alternatives Considered

### Put the unified installer in Chef

Rejected. Chef is intentionally cross-platform and owns capability distribution;
making it own Control's Windows native/toolchain/state transaction would merge
authority and weaken its portable install boundary.

### Put all three products under one Node version and one shared runtime

Rejected. It would either break Chef's Node 18 compatibility or make Chef
require Control/Kitchen's Windows-only Node 24 stack. Component-scoped
resolvers preserve both contracts without rewriting global PATH.

### Copy the old PC profile, then repair it

Rejected. Profile copying would import secrets and machine/session-bound state
that cannot be safely attributed, rolled back, or audited.

### Let Kitchen bootstrap Control or infer Control readiness from its bridge

Rejected. Kitchen is an observer. Giving it control-plane ownership would
create a second authority and blur its read-only boundary.

## Consequences

- The implementation is a Control-repository Windows release feature; Chef
  changes are limited to an optional invocation/documentation adapter after the
  Control bootstrap schema is stable.
- The first release needs a signed-or-hash-pinned, reviewable manifest and a
  schema contract before installer code is written.
- Cross-platform support remains explicitly degraded: on macOS/Linux/WSL,
  Chef can be installed through its own documented flow; Control/Kitchen are
  `blocked` rather than emulated.
- Operators receive one health matrix without receiving one shared state store
  or a broader approval authority.

## Implementation Plan and Definition of Done

### Phase 0 — contract and fixtures (Control owner)

1. Add a versioned `workspace-os.bootstrap.v1` JSON schema and fixture plans
   to `codex-chef-control`; document fields, redaction, plan invalidation, and
   terminal status semantics.
2. Add a release manifest listing each component source revision, package-lock
   digest, exact Node binary, .NET SDK policy, expected Codex compatibility,
   and Kitchen Electron identity. Validate canonical paths and every hash
   before the apply code can be reached.
3. Add deterministic fixtures for missing/mismatched OS, architecture, Node,
   .NET, Codex, source revision, lockfile, executable hash, reparse point, and
   unowned collision cases.

### Phase 1 — preview-only planner (Control owner)

1. Implement `codex-workspace-bootstrap.ps1` as a preview-only planner with
   explicit components, no writes, no service launch, and redacted JSON/human
   output.
2. Reuse, do not fork, Chef's existing plan/install interface, Control's
   setup prerequisite reporter, and Kitchen's setup/runtime contract.
3. Add an idempotent planner test and a clean-user-profile preview test that
   proves no target directory, Brain vault, database, or dependency directory
   was created.

### Phase 2 — explicitly applied component transactions (Control owner)

1. Add `-Apply -PlanId` and scoped backup receipts. Invoke the owners' setup
   APIs in the order Chef, Control, Kitchen; stop at the first failure and
   roll back only completed bootstrap-owned operations.
2. Require an explicit `-InitializeBrain` opt-in. It must create an empty
   vault from a reviewed template; it has no import option.
3. Add fault-injection tests at every promotion/integration boundary and prove
   no forbidden state was copied, printed, deleted, or adopted.

### Phase 3 — health, release evidence, and Chef adapter (Control + Chef)

1. Emit the unified health matrix and run the real disposable-profile/clean-VM
   acceptance flow, including Kitchen desktop smoke evidence.
2. Add a Chef documentation/invocation adapter only after the Control schema
   and release manifest are stable; it must describe Control/Kitchen as
   separate authority layers and preserve Chef's existing standalone flow.
3. Publish a support recovery guide for failed rollback and blocked gates; it
   must name evidence and safe manual next steps without suggesting profile or
   vault copying.

The implementation is complete only when all of the following are true:

- [ ] Preview is the default and has a demonstrated zero-write clean-profile run.
- [ ] Apply requires selected components and a fresh matching `PlanId`.
- [ ] Every selected runtime/version/hash gate fails closed before writes.
- [ ] Chef, Control, Kitchen, and Brain state boundaries above are enforced by
  allowlists and tested against forbidden-copy fixtures.
- [ ] Backup/rollback restores only verified bootstrap-owned targets; an
  injected failure leaves pre-existing user state intact.
- [ ] Each selected component has evidence in a unified health matrix, and a
  Kitchen desktop smoke ran on a real Windows desktop host/VM.
- [ ] Control remains the only execution/approval authority; Kitchen remains
  read-only and Chef remains independently cross-platform.
