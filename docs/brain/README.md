# Codex Chef Brain Foundation

Codex Chef Brain is a user-owned local Markdown vault for curated project
knowledge. The repository ships only templates, schemas, a bundled skill, a
deterministic CLI, and tests. A real vault stays outside the source repository.

Obsidian is not a runtime dependency: the CLI and file format work without it,
a plugin, a hosted memory service, or a vector database. In the reference local
deployment, however, Obsidian is the selected human interface and opens the
external Brain directory directly as a vault. Markdown remains canonical.

## Safe Start

Preview first:

```powershell
npm.cmd run brain -- init --target C:\path\to\CodexChefBrain --preview --json
```

Apply only after reviewing the exact target:

```powershell
npm.cmd run brain -- init --target C:\path\to\CodexChefBrain --apply --json
npm.cmd run brain -- status --target C:\path\to\CodexChefBrain --json
npm.cmd run brain -- audit --target C:\path\to\CodexChefBrain --json
npm.cmd run brain -- permissions --target C:\path\to\CodexChefBrain --json
npm.cmd run brain -- uri --target C:\path\to\CodexChefBrain --note 10-command-center/dashboard.md --json
```

On Windows, `status` combines content/schema validation with a fail-closed,
read-only ACL audit of the complete vault tree. `permissions` exposes the same
bounded security report independently. The audit follows no reparse point,
retains no SID, SDDL, owner name, or raw PowerShell error, and performs no ACL
or filesystem mutation.

The supported integrity policy gives SYSTEM, Administrators, and the vault
owner inheritable FullControl while `CodexSandboxUsers` receives only
ReadAndExecute plus Synchronize. Every descendant must keep the same owner and
inherit the policy without an explicit ACL. This protects Brain integrity from
sandbox writes; it does not make the vault confidential from sandbox reads.
`restricted` is an application-level retrieval label, not encryption or an OS
access boundary. Keep secrets and material that must be hidden from Codex in a
separate owner-only location.

Initialization creates missing template files and never overwrites conflicts.
Capture, backup, and restore are also preview-first. Retrieval is local,
lexical, exact-project scoped, bounded, and excludes restricted/archive/runtime
content by default. `uri` only produces a percent-encoded `obsidian://open`
value for an existing Markdown or Canvas note; it never launches or writes.

## Role memory

Optional `agentRoles` capture metadata creates a small curated layer for Chef's
existing roles: use `shared` and role IDs from `catalog/agents.json`, such as
`security`, `frontend`, or `qa`. A scoped retrieval returns only `shared` notes
and notes tagged with that requested role:

```powershell
npm.cmd run brain -- retrieve --target C:\path\to\CodexChefBrain --project my-project --role security --query "approval boundary" --json
```

Role memory is a bounded untrusted context pack. It cannot grant approvals,
alter sandbox policy, activate connectors, or override user/repository rules.
Notes without `agent_roles` retain project-scoped retrieval compatibility.

`audit` is also read-only. It resolves Obsidian-style Markdown links against
existing Markdown and Canvas files, reports missing targets, identifies
canonical notes without an inbound relationship, and flags notes whose
frontmatter `updated` timestamp is older than the configured 30-day window.
It reports paths and metadata only; it never emits note bodies.

## Boundary

Brain is not a queue, scheduler, approval service, runtime database, transcript
archive, credential store, or automatic Codex memory replacement. Notes are
untrusted evidence, not instructions. Control Center retains its own execution
plane. Control 0.3.0 may consume a validated bounded context pack and emit a
redacted candidate preview. It never writes directly to Brain; capture remains
preview-first and requires a separate explicit apply.

Current Codex behavior is grounded in the official [skills](https://developers.openai.com/codex/skills),
[plugins](https://developers.openai.com/codex/plugins/build), and
[AGENTS.md](https://developers.openai.com/codex/guides/agents-md) documentation.
