# Changelog

## Unreleased

- Report a Claude plugin cache copy that no longer matches the managed source.
  Claude Code serves a plugin from its own cache and refreshes it by version,
  while the plugin source is a local directory whose contents can change without
  a version bump. Every session then loads the previous role definitions even
  though the install verifies clean, which is exactly how an agent change can
  land on disk and never reach a session. The runtime verifier now compares the
  served copy with the source and prints the reinstall command; older cache
  directories are not served and are not reported. A served copy with no agent
  definitions at all counts as full drift rather than being skipped.

- Make the repair preflight timeout visible and adjustable. Repair refuses to
  write when a validator cannot run, which is the right posture, but the budget
  was a hardcoded two minutes and the failure said only `spawnSync ETIMEDOUT`,
  so a busy machine looked like a broken install. The message now names the
  timeout and `AGENTCHEF_PREFLIGHT_TIMEOUT_MS`, and troubleshooting explains it
  in both languages.
- Harden the new surface validator against the failure class it exists for: the
  routing-reference check no longer relies on an id-prefix heuristic that let an
  undefined profile pass, and a granted MCP server is now checked against the
  catalog and against the servers AgentChef installs for Claude, so a typo can
  no longer emit an allowlist entry that silently grants nothing.

- Give a Claude specialist the MCP servers its own instructions depend on. A
  subagent `tools:` list is an allowlist, and one that names no `mcp__` entry
  filters MCP out entirely, so every role told to consult Context7 or the Serena
  bridge could not reach it. 21 roles now declare the servers their role file
  actually references, recorded as `claudeMcp` in `catalog/agents.json` so the
  grant is reviewable data rather than a guess in the emitter.
- Add `scripts/validate-agent-surface-consistency.mjs` to `check`. Each of its
  six checks exists because a real defect reached a release past the structural
  validators: an unreachable specialist, two roles in different coordinator
  domains claiming the same work, a routing profile id the catalog never
  defined, a role asked for command output it cannot produce, a bundled skill
  description that only triggers on one target, and a command naming a binary
  this package does not ship.
- Route `spec_author` and `qa_lead`, which no routing profile could reach, and
  give the Core Web Vitals and edge-case overlaps a boundary clause naming the
  other role, the way `design_reviewer` already did.

- Let an update retire a Claude permission rule it added earlier once the
  fragment no longer asks for it. A version bump used to add the new pinned
  package rule and keep the old one forever, which widened the allowed set on
  every bump. A rule is only taken back under the same ownership proof used for
  MCP entries, and `deny` is never changed.

- Point the external-review skill and the CLI usage at a command that resolves.
  Both told people to run `chef review ...`, but the package is private with no
  bin entry and the skill installs into other repositories, so every step failed
  at the first line. The validator now checks for the runnable form.
- Drop `Codex` from three bundled skill descriptions. Those descriptions are the
  trigger text a Claude Code session matches against, so the routing, context
  budget, and diagram skills were unlikely to fire on the Claude target at all.
- Name real routing profiles in the adaptive-agent-routing reference: two ids it
  used are not defined in `catalog/routing-profiles.json`.
- Tell a Claude subagent that has no execution tool to ask the parent for command
  output. Codex read-only still allows commands, so only the Claude rendering
  loses them, and roles such as the reviewer and the security auditor were being
  told to pull evidence from a diff they cannot produce.

- Let an update refresh the Claude Code MCP entries AgentChef wrote, so a
  catalog version bump reaches an installed home instead of stopping at the
  first install. The entry is only rewritten while its value still hashes to
  what the receipt records; an edited entry, or one AgentChef never wrote, is
  reported and left alone. `-Update` (`--update`) passes the new
  `--refresh-managed` flag, mirroring how the Codex side synchronizes its
  managed config tables. Permission rules remain strictly additive.
- Key object and container receipt entries by pointer when merging receipts, so
  a refreshed value replaces the record of the value it replaced instead of
  leaving a stale entry for removal to trip over.

- Refresh the MCP catalog: `@upstash/context7-mcp` 4.1.1,
  `chrome-devtools-mcp` 1.9.0, `@playwright/mcp` 0.0.82, and the three
  `@modelcontextprotocol/*` servers at 2026.8.31. Each pin was verified by
  starting the server over stdio, completing the handshake, and diffing the
  advertised tool names against the allowlist, rather than from release notes.
- Keep `codebase-memory` pinned at 0.8.1: 0.11.0 refuses to start when the
  user cache directory is writable by another local account, and it forces a
  one-time full reindex.
- Drop `navigate_page_history` from the `chrome-devtools` allowlist and
  approval tables. Probing both the old and the new version shows the tool has
  never existed; page history is a parameter of `navigate_page`.
- Read the Context7 pin from the catalog in the approval-harmony matrix instead
  of repeating the version string, so the case cannot go stale on a bump.
- Re-date the agent, skill, and MCP catalogs after re-checking them: skills by
  resolving all 15 pinned sources online, agents by the Codex config
  compatibility validator against the installed CLI.

- Print `AGENTCHEF` in the operator console header; the colour branch still
  carried the pre-rename `CODEX CHEF` wordmark.
- Introduce the Serena bridge to its backend as `agentchef-serena-pool`.
- Extend `--migrate-identity` to `CODEX_HOME/config.toml`: AgentChef's own
  template and merge banners and its plugin-id keys (including the
  `[hooks.state."<plugin id>:…"]` entry) are rewritten, and an emptied legacy
  plugin-cache directory is removed. Foreign tables, project trust entries, and
  other products' plugin, marketplace, and hook state are left untouched.

## 1.0.0 - 2026-09-18

- Rename the on-disk identity from `codex-chef` to `agentchef`: ownership
  markers (`.agentchef-managed.json`, `.agentchef-source.json`), the
  operation journal and lock names, backup-folder prefixes, receipt and report
  schema strings (`agentchef.<name>.vN`), the plugin folder
  (`plugins/agentchef-workflows`), the operator skill
  (`agentchef-operator`, with a `compatibilityAliases` entry for the old
  name), the personal marketplace name and plugin id
  (`agentchef-workflows@agentchef`), the Git hook banner, the config-merge
  banners, the npm cache folder, and the `AGENTCHEF_*` environment variables.
- Read both spellings everywhere (`scripts/lib/identity.mjs`): legacy markers,
  journals, locks, receipts, backup ids, plugin ids, and `CODEX_CHEF_*`
  variables keep working, and the installed plugin id follows the personal
  marketplace's name until it is migrated.
- Add `npm run chef -- --migrate-identity [--target codex|claude|both] [--apply]`
  (`scripts/migrate-identity.mjs`): a preview-first, journaled, backup-backed
  conversion of markers, folders, marketplace entries, plugin registrations, a
  legacy-banner Git hook (only when its bytes match a shipped template), and
  Claude receipts and links.
- Fix where the Claude target finds the user-scope `.claude.json`:
  `~/.claude.json` by default, and `$CLAUDE_CONFIG_DIR/.claude.json` only when
  that variable (or a relocated `--claude-home`) moves the config directory.
  0.9.0 merged MCP entries into `~/.claude/.claude.json`, which Claude Code
  never reads without the variable; the upgrade guide covers the stray file.
- Link only catalog skills into `~/.claude/skills`: a managed directory that
  left `catalog/skills.json` (such as the retired `codex-chef-brain`) is
  reported as `retired` and never linked, adopted, or removed.
- Follow-ups from review: Codex removal deletes every ownership-marker spelling
  present in a direct skill folder, `plan-install --redact-paths` reports the
  real shape of the `.claude.json` path (an explicit `--claude-json` elsewhere
  shows as `${CLAUDE_JSON}`), and the install contract derives the default
  Claude home from `CLAUDE_CONFIG_DIR` itself.
- Raise the runtime verifier probe buffer: `codex plugin list --available
  --json` on a home with many plugins exceeded the 1 MiB default and the
  plugin-state check reported `ENOBUFS` instead of a result.
- Retitle the shipped global Git ignore template (`# AgentChef global Git
  ignore.`); the previous template hash stays in the legacy ownership list, so
  an installed copy is still recognized and refreshed by `--install-git-guards`.

## 0.9.0 - 2026-09-18

- Add Claude Code as a second install target. Every `manifests/install-plan.json`
  operation now names its target (`codex`, `claude`, or `shared`; schema
  `codex-chef.install-plan.v2`), `plan-install`, the safety preflight, the
  install-surface assertion, and both shell installers take
  `--target codex|claude|both` (`-Target` in PowerShell), and
  `npm run chef -- --install` detects the installed CLIs and confirms the
  target. Non-interactive runs keep the Codex default; the Claude target is
  never selected implicitly.
- Install the Claude surface through one transaction helper,
  `scripts/install-claude-target.mjs`: a user-level rule file rendered from
  the shared working agreement, the Serena bridge, additive `settings.json`
  permission rules and `.claude.json` MCP entries recorded in sidecar receipts,
  junction/symlink skill links into the managed `~/.agents/skills` tree, the
  Claude plugin marketplace manifest, and plugin registration through the
  `claude plugin` CLI. Foreign directories and user content are never
  replaced; AgentChef-marked copies are adopted only with `--adopt-skill-links`.
- Generate the Claude artifacts from the Codex catalog with
  `npm run render:targets` (checked by `npm run check`): 32 namespaced plugin
  subagents (`agentchef:<role>`), the `.claude-plugin/plugin.json` manifest,
  `templates/claude/settings.fragment.json` from `default.rules`, and both
  working-agreement renders from `templates/shared/working-agreement.md`.
- Add `npm run chef -- --remove --target <t>` (preview-first): Claude removal
  reverts only receipt-recorded entries, AgentChef-created links, and
  hash-matching files; Codex removal (`scripts/remove-install.mjs`) deletes
  only byte-identical managed files, marker-carrying skills, source-owned
  plugin files, the marketplace entry, and the plugin cache entry.
- Teach `verify-install-runtime`, `codex-status`, and `codex-doctor` the
  Claude target (`--target claude|both`, `--claude-home`): receipt, link, and
  file verification plus `claude --version`, `claude plugin validate --strict`,
  and `claude mcp list` probes; status also relays the read-only Beyin summary
  line when the launcher exists.
- Let the operation journal record link mutations explicitly
  (`prepareMutation({ link: true })`) and prune merge-created containers on
  removal; add a `claude-target` CI job and `npm run check:claude`.
- The session-end process-hygiene hook stays Codex-only; the Claude plugin
  manifest publishes no hook in this release.

## 0.6.0 - 2026-09-18

- Continue the project as an independent product named AgentChef
  ([ADR-006](docs/decisions/006-agentchef-independent-dual-target-product.md));
  Kitchen is neither modified nor depended on. Visible identity (repository,
  documentation, package metadata, assets) is renamed now; on-disk identity
  (plugin id, ownership markers, marketplace root, backup prefixes, schema
  strings, environment variables, Git hook banner) is unchanged until 1.0.0.
- Retire the built-in Markdown Brain workflow in favor of the separate
  `dual-agent-brain` engine: remove the `codex-chef-brain` bundled skill and
  its direct-install step, `scripts/brain-cli.mjs`, the vault template,
  schemas, validators, tests, the `--continuity`/`--control-brain` operator
  screen, the AGENTS.md Control routing section, and `CODEX_CHEF_BRAIN_HOME`.
  Existing vaults and their `.codex-chef-brain.json` markers are never touched
  (see `docs/brain-retirement.md`).
- Remove Kitchen-era artifacts: `packages/contracts`, the Chef module manifest
  and its validator/test, `docs/enterprise-v3` (the portability contract moves
  to `docs/portability-contract.md`), the tracked agent-result reports and
  their indexer. Supersede ADR-002, ADR-004, and ADR-005.
- Drop the German, Spanish, French, and Brazilian Portuguese README summaries;
  English and Turkish remain at full parity. Rewrite `docs/harness-compatibility.md`
  (formerly `ecc-compatibility.md`) for the dual Codex CLI + Claude Code
  target and add the Claude Code alignment sources.
- Raise the Node.js baseline to `>=22.12.0` (Node 18 and 20 are end-of-life);
  the CI portability matrix now runs Node 22 and 24.
- Speed up real installs: directory syncs verify every target with one helper
  process instead of two Node spawns per copied file, and `Ensure-Dir` results
  are memoized. A full PowerShell install on the maintainer's machine dropped
  from over 300 s to about 110 s. Subprocess timeouts in tests and validators
  can be stretched uniformly with `CODEX_CHEF_TEST_TIMEOUT_SCALE` on slow
  machines; CI defaults are unchanged.
- Wire four previously unrun tests into `npm run check` (agent worker routing
  acceptance, token audit, content-safety boundary, repair-validator
  lifecycle) and add `npm run dev:assert-scratch`, which refuses to run
  installer flows against live homes.
- Rename the `agentSpaceRoles` catalog key to `coordinatorDomains`; archive
  the 0.5.x changelog history in `CHANGELOG-0.5.md`.
- Pin `actions/checkout` to v7.0.1 and `actions/setup-node` to v7.0.0 in the
  validate workflow (the two open Dependabot updates).

## 0.5.74 - 2026-08-14

- Finalize the standalone maintenance release with host-correct repair fixtures,
  executable Unix Git-hook fixtures, and an explicit unavailable Brain-health
  projection branch. These changes make the cross-platform test contract match
  its documented platform behavior without weakening installer or repair gates.

Older 0.5.x entries are archived in [CHANGELOG-0.5.md](CHANGELOG-0.5.md).
