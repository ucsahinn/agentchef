# Changelog

## Unreleased

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
