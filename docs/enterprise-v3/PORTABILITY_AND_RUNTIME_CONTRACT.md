# Chef portability and runtime contract

## Status, scope, and authority

This contract defines how Codex Chef can be installed and verified on another
PC without treating any machine's private state as distributable product data.
It extends the Chef--Control--Kitchen suite boundary in
[SUITE_CONTRACTS_SPEC.md](SUITE_CONTRACTS_SPEC.md); it does not add a shared
runtime, credentials, background service, or authority between the products.

Chef is authoritative only for its versioned distribution assets, routing, and
safe local operating contract. The destination PC and its operator remain
authoritative for its home directories, login, access approvals, repositories,
and any separately installed Control, Brain, or Kitchen service.

## PC-independent discovery

No tracked configuration, report, fixture, or command example may require a
particular username, drive letter, home directory, or checkout location. At
execution time, Chef resolves the following roots in this order:

| Concern | Runtime source | Default | Contract |
| --- | --- | --- | --- |
| Codex managed files | `CODEX_HOME` | platform user's `.codex` directory | The selected home is explicit in install/verify output; it is never inferred from another PC's path. |
| Global skills and plugin marketplace | `AGENTS_HOME` | platform user's `.agents` directory | The selected root is inspected before a managed write; foreign content is preserved unless explicitly adopted. |
| Repository assets | current checkout, resolved relative to the executing script | current checkout | The checkout may move; generated reports must use redacted or repository-relative paths. |
| Temporary verification state | a bounded temporary root chosen for the run | none | It is suitable for preview/smoke checks only and is not an installation target or portable state store. |

Environment overrides select a destination; they do not copy, merge, or grant
access to the origin machine. A verifier must test the selected `CODEX_HOME`,
not assume that an ambient Codex process or a different account profile uses
the same one. A profile/configuration change takes effect only in a newly
started session.

Use redacted, read-only discovery before a transfer or repair:

```powershell
npm run plan:install -- --all --summary --redact-paths
npm run verify:install:runtime -- --redact-paths
npm run codex:status -- --redact-paths
```

The first command is a plan, not an install. The runtime verifier can be run
offline when live Codex probes are unavailable; an unavailable live probe is a
warning unless the operator explicitly requires live-runtime evidence.

## Local state boundary

The portable unit is the Chef source plus its reviewed, installable assets. It
excludes machine- and identity-bound state, including:

- authentication files, tokens, API keys, cookies, browser/session storage,
  credential helpers, and OAuth callback material;
- conversation, terminal, task-board, private-memory, cache, log, telemetry,
  lock, process, and code-index state;
- another product's Control worktree/run/approval records, Brain notes, and
  Kitchen database or projection state;
- unreviewed global configuration, user-owned skills, and foreign plugin
  content.

An installer may create or update only its documented managed targets. It must
not adopt a foreign target, recreate an active session, or use a copied local
state file as proof of a valid destination runtime. State that needs to move
between products must use the separately versioned, least-privilege envelope
contract; opaque identifiers are not usernames, paths, tokens, prompts, or
approval grants.

## Backup and restore contract

Before replacing an existing Chef-managed target, the install, update, or
repair flow creates a backup unless the complete operation creates new targets
only and the operator chose the documented compatibility exception. A backup
is a rollback artifact for that selected destination, not a migration archive
for a different PC and not a vehicle for private local state.

```powershell
npm run chef -- --backups
npm run chef -- --backups --backup <id> --restore
npm run chef -- --backups --backup <id> --restore --apply
```

List and inspect are metadata-only. Restore is preview-first; `--apply` is the
explicit write boundary. Before any restore, Chef validates the backup manifest,
target allowlist, paths, link safety, sizes, and SHA-256 inventory; malformed,
altered, extra, or unsupported control-plane content fails closed. Applying a
valid archive first creates a fresh rollback backup of the current targets and
rolls back already-written targets if a later write fails. Backup deletion is a
separate, manual, reviewed action.

## Secrets, redaction, and evidence

Portable documentation and evidence must redact home/repository paths and must
not contain raw secrets, authorization headers, API keys, cookies, session
material, private prompts, terminal transcripts, or private memory. Use
synthetic fixtures for portability tests; never check in a real absolute user
path merely to exercise a redactor.

Use `--redact-paths` for shareable diagnostics and
`gitleaks detect --redact --no-banner --no-git --verbose` before a
release-sensitive handoff. A redacted report is evidence of the inspected
surface, not permission to read a user's unredacted state. Secret handling and
approval behavior remain subject to the current [OpenAI Codex guidance](https://developers.openai.com/).

## Control-disconnected degraded behavior

Control is optional to a Chef installation. If Control is absent, unavailable,
stale, unauthenticated, incompatible, or deliberately disconnected:

| Surface | Required behavior | Forbidden behavior |
| --- | --- | --- |
| Chef | Continue the local preview-first workflow, routing, inspection, and approved local commands. | Invent Control run/approval/worktree state, change configuration, or create a Control connection. |
| Control-dependent status | Show `unavailable`, `unknown`, or `stale` with a safe reason and last-observed time when available. | Present cached state as current or treat an observation as an approval. |
| Kitchen/projection | Keep a marked stale projection when one exists; otherwise render an explicit unavailable/empty state. | Retry by spawning work, merging, publishing, or changing another product. |
| Recovery | Require a deliberate local retry after the operator restores the separately owned Control connection. | Auto-start Control, transfer credentials, or silently broaden permissions. |

Connectivity, parsing, schema, and permission failures are contained by the
receiving product. They do not weaken Chef's approval gates and do not block
the independent local workflow. A disconnected state is a safety posture, not
proof of failed installation.

## Verification and definition of done

- [ ] A destination can resolve its own homes without a source-machine path.
- [ ] Shareable diagnostics redact paths and do not expose credential or session state.
- [ ] Backup inspection is non-mutating; restore validates its manifest and requires explicit apply.
- [ ] Chef remains usable with Control disconnected, while all Control-derived state is explicitly unavailable, unknown, or stale.
- [ ] No step grants cross-product authority or performs a destructive recovery automatically.

## Related material

- [Security model: portable workspace boundary and backup restore](../security-model.md)
- [Install guide: runtime verification and backup commands](../install.md)
- [Suite contracts: authority, redaction, and degraded operation](SUITE_CONTRACTS_SPEC.md)
