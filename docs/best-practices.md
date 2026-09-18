# Senior Codex Best Practices

The first install is the easy part. Keeping the setup understandable six months
later takes a shared standard. The practices below connect the official Codex
surface model with this repository's validation gates and the useful lessons
learned from adjacent agent-tooling projects.

Come here before adding a skill, MCP, agent, profile, hook, installer option,
or public-facing document.

## Start Fast

| Goal | Use |
| --- | --- |
| Install the full starter | Preview first, then run `./scripts/install.sh --all --interactive` or `.\scripts\install.ps1 -All -Interactive` |
| Understand what belongs where | The surface map below and [docs/codex-surfaces.md](codex-surfaces.md) |
| Add a reusable workflow | A skill first; package it as a plugin only when it should be installed as a bundle |
| Add live external context | An MCP server or connector, disabled by default when it needs auth |
| Add mechanical enforcement | A hook or validation script, not prose alone |
| Inspect the managed install surface | `node scripts/plan-install.mjs --all --json --redact-paths` |
| Prepare for push or release | [docs/verification.md](verification.md), then the release gate |

## Source Quality

Prefer sources in this order:

1. Current official Codex documentation or the fetched Codex manual.
2. Repository evidence: scripts, templates, catalogs, CI, and installer output.
3. Closely related local repositories that already solved the same packaging or
   prompt-architecture problem.
4. External articles only for general engineering context, never as authority for
   Codex product behavior.

If a claim changes install behavior, security posture, connector access, or
release flow, it needs a repo-level verification step.

## Surface Map

| Need | Put it in |
| --- | --- |
| One-off task constraint | Current prompt |
| Durable repo convention | `AGENTS.md` |
| Personal/global Codex default | `~/.codex/AGENTS.md` or global config |
| Project sandbox, model, MCP, profile, hook, or tool default | `templates/codex/config.*.toml` |
| Repeatable task workflow | A skill with `SKILL.md`, optional scripts, references, and assets |
| Installable bundle | A plugin with `.codex-plugin/plugin.json` |
| Live private or external data | MCP server or app connector |
| Deterministic lifecycle check | Hook, validation script, or CI workflow |
| Push, release, package, or deploy proof | Verification docs, changelog, and release gate output |

Do not force every behavior into `AGENTS.md`. If a rule needs deterministic
enforcement, encode it in a script or hook. If a workflow needs reusable context,
make it a skill. If it needs tools or distribution, package it as a plugin.

## Senior Operating Loop

1. Inspect the real repository state before changing files.
2. Map unfamiliar areas before broad implementation.
3. Verify current APIs and product behavior from official or primary sources.
4. Implement the smallest coherent change that fixes the root problem.
5. Run the narrowest meaningful check first, then broader gates when the blast
   radius justifies it.
6. Review the diff for secrets, local state, generated artifacts, and unrelated
   churn.
7. Commit, push, publish, deploy, or tag only when the user explicitly asked.

## Skill And Package Rules

- `catalog/skills.json` is not a wishlist. Installable entries must be known
  package/skill pairs.
- Every installable skill must declare `package`, `skill`, and
  `source = package@skill`.
- `catalog/skills-lock.json` pins every installable source to a full upstream
  commit SHA. The Skills CLI version and registry integrity remain dated
  compatibility and discovery metadata.
- The installer must use `scripts/install-pinned-skill.mjs`; that helper fetches
  only the locked commit, verifies `HEAD` and the selected skill, stages and
  hashes an exact native copy, then activates it without executing fetched
  repository code or a registry-delivered installer.
- Default checks stay offline and deterministic. Network checks are explicit:
  `npm run verify:skills:online`.
- Skills that are already local and not safely installable from a public package
  should remain `install: false` with a clear reason.

## Specialist Agent Rules

- `catalog/agents.json` is the reviewed source of truth for bundled specialist
  agents.
- `catalog/agent-research-corpus.json` is the reviewed source index for each
  agent's research domains, source types, refresh triggers, handoffs, and
  authority-reference metadata.
- Every authority reference must declare a source freshness cadence. The corpus
  `dateChecked` value must remain inside the strictest cadence so stale official
  docs, standards, or vendor guidance fail local validation before release.
- Every agent must have reviewed expertise signals for decision heuristics,
  failure modes, and verification evidence. These signals keep the corpus
  operational instead of turning it into a bibliography.
- Supplemental repo, skill, command-snapshot, and research-paper sources belong
  in `supplementalResearchRefs` until they are promoted into agent
  `authorityRefs`; they may shape heuristics, but they are not default runtime
  authority.
- Every role file must carry the `Authority metadata contract` and
  `Expertise signal contract` runtime blocks so catalog metadata affects
  invoked-agent behavior, not only offline validation.
- Every cataloged agent must have matching `[agents.<name>]` blocks in both
  Windows and Unix Codex config templates.
- Every `config_file` must point at a reviewed
  `templates/codex/agents/*.toml` role file.
- Every role file must keep one copy of each required runtime contract and
  guardrail block, plus at least 100 source-backed instruction items and 20
  distinct source markers.
- Agent templates must not use `danger-full-access`,
  `approval_policy = "never"`, or embedded token variable names.
- Keep write-heavy implementation in the main thread unless the user explicitly
  asks to split write scopes.

## External Starter And ECC Import Rules

Large agent starter repos can provide useful patterns, but they should not be
imported wholesale. The current ECC-informed policy is in
[docs/harness-compatibility.md](harness-compatibility.md).

Allowed adaptations:

- manifest-backed planning
- dependency-free validation
- target/collision metadata
- plugin and MCP documentation honesty
- personal-path and permissive-config checks

Blocked adaptations:

- implicit installer dependency installation
- broad global hook or Git config mutations outside explicit flags
- permissive `approval_policy = "never"` or `profiles.yolo` defaults
- active authenticated MCP connector catalogs
- raw prompt/tool telemetry hooks
- imported credential-shaped examples

## Verification Gate

Before a maintainer tells another user that the setup is ready:

```bash
npm run check
node scripts/plan-install.mjs --all --json --redact-paths
git status --short
git diff --cached --check
gitleaks detect --redact --no-banner --no-git --verbose
```

Before changing installable skill sources:

```bash
npm run verify:skills
npm run verify:skills:online
```

`verify:skills` is offline and safe for CI. `verify:skills:online` asks the
Skills CLI to resolve each installable package/skill pair without relying on
plain skill names that can be mistaken for repositories.

## Public-Safe Rules

- Never publish tokens, auth files, cookies, private keys, memories, sessions,
  machine-specific paths, local trust state, installers, archives, or build
  outputs.
- Keep authenticated MCPs disabled by default.
- Keep `package.json` private unless the repo is intentionally turned into an npm
  package.
- Public docs must say this is a community starter, not an official OpenAI
  product.
- English and Turkish docs stay paired.

## UI And Frontend Quality

When a task involves a website, app, dashboard, visual asset, or screenshot:

- Preserve existing content and brand first; improve hierarchy, spacing,
  responsiveness, states, and conversion clarity before adding new copy.
- Verify in a real browser or screenshot-capable flow when available.
- Check mobile width, long text, focus states, loading/empty/error states, and
  console errors.
- Use purposeful motion: short transform/opacity transitions, reduced-motion
  fallback, and no blocking decorative animation.

## Maintenance Checklist

- New docs have English and Turkish pairs.
- README first screen links to the correct operating docs.
- New catalog entries are validated by script, not just manually reviewed.
- Installer behavior is smoke-tested with temporary `CODEX_HOME` and
  `AGENTS_HOME`.
- Changelog records user-facing changes.
- Git status is inspected before staging, and only intentional files are staged.
