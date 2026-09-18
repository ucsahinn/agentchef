# ADR-002: Compose Brain Content And Windows ACL Status

> **Superseded by [ADR-006](006-agentchef-independent-dual-target-product.md) on 2026-09-18.**
> The built-in Brain workflow was retired in Codex Chef 0.6.0; this record is
> kept as history. See [Brain retirement](../brain-retirement.md).

## Status

Superseded

## Date

2026-07-23

## Context

Brain `status` originally validated only Markdown, configuration, and schema
contracts. A vault could therefore report `ok: true` while the Codex sandbox
group retained write and delete rights across the tree. Root-only ACL checks
would also miss an explicit descendant rule or a descendant owner that can use
implicit `WRITE_DAC` to change its permissions.

Control needs bounded Brain reads, while Brain writes must remain owner-mediated
and approval-gated. Completely removing sandbox access would break the current
read-only Control bridge. Granting read access to the whole vault, however,
does not provide confidentiality from sandbox processes.

## Decision

On Windows, Brain `status` and `doctor` combine two independent results:

- `contentStatus`: deterministic Markdown/schema validation.
- `securityStatus`: a fail-closed, read-only ACL audit of the entire vault tree.

Top-level `ok` requires both results. A standalone `permissions` command returns
the same security report. The audit uses semantic numeric rights and role checks
rather than SDDL string equality, follows no reparse point, verifies one owner
across the tree, and rejects explicit descendant ACLs or unexpected principals.
It exposes no raw SID, SDDL, owner name, or PowerShell diagnostic.

The accepted V1 integrity policy is inheritable FullControl for SYSTEM,
Administrators, and the vault owner, plus ReadAndExecute and Synchronize for
`CodexSandboxUsers`. This is explicitly not a confidentiality boundary.

## Alternatives Considered

### Keep content-only status

Rejected because it produces a security false-green result.

### Remove all sandbox access

Rejected for V1 because the current Control bridge must read bounded Brain
context without an owner service.

### Treat ReadAndExecute as confidential retrieval

Rejected because any sandbox process can bypass application filters and read
files directly. `restricted` remains application metadata only.

### Owner-produced sanitized projection

Deferred as the stronger future confidentiality design. It requires a reviewed
projection lifecycle, freshness/provenance contract, and owner-mediated update
mechanism beyond the current local Foundation.

## Consequences

- Unsafe Windows ACLs now make `status` fail even when Brain content is valid.
- The ACL audit remains deterministic, bounded, dependency-free, and read-only.
- Operators can distinguish content failure from security posture failure.
- Secrets and material that must be hidden from Codex must stay outside this
  vault until a separate projection or stronger isolation model is implemented.
- Changing the real DACL remains a separately approved operation with backup,
  preconditions, rollback, and post-change full-tree verification.

## References

- [FileSystemRights](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.filesystemrights?view=net-10.0)
- [Object owner and WRITE_DAC](https://learn.microsoft.com/en-us/windows/win32/secauthz/owner-of-a-new-object)
- [Security descriptor string format](https://learn.microsoft.com/en-gb/windows/win32/secauthz/security-descriptor-string-format)
