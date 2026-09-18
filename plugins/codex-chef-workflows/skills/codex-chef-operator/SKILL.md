---
name: codex-chef-operator
description: Maintain, audit, and improve AgentChef setup repositories. Use for README/docs/template/catalog/installer/validation updates, release-readiness work, and safe Codex starter maintenance without weakening security, leaking local state, or changing external systems.
---

# AgentChef Operator

Use this skill when maintaining the AgentChef repository or a
derived local setup.

## Reference Routing

Read `references/repo-maintenance.md` before broad setup, installer, README,
catalog, docs, verification, release-readiness, or public-repo changes. Keep
`SKILL.md` as the routing entry point and put detailed repo policy in that
reference.

## Workflow

1. Inspect current files before changing anything.
2. Preserve security defaults:
   - sandbox stays enabled
   - approvals stay interactive
   - authenticated connectors stay disabled until needed
   - no secrets, sessions, memories, auth files, or local project paths are
     added to source
3. Keep docs and templates aligned:
   - `AGENTS.md`
   - `README.md`
   - `README.tr.md`
   - `templates/codex/AGENTS.md`
   - `templates/codex/config.windows.toml`
   - `templates/codex/config.unix.toml`
   - `docs/how-to.md`
   - `docs/how-to.tr.md`
   - `docs/skills-and-agents.md`
   - `docs/skills-and-agents.tr.md`
   - `docs/mcp-catalog.md`
   - `docs/mcp-catalog.tr.md`
   - `docs/codex-flags.md`
   - `docs/codex-flags.tr.md`
   - `docs/public-readiness.md`
   - `docs/public-readiness.tr.md`
   - `docs/install.md`
   - `docs/install.tr.md`
   - `docs/security-model.md`
   - every English operator doc in `docs/` should have a matching `.tr.md` pair
   - the six root README entry points should route readers honestly to the
     complete English and Turkish operator docs
   - bundled local skills should stay reference-backed, zero-network unless
     their own script or workflow explicitly says otherwise, and validated by
     repo checks
   - public README visuals under `assets/` should stay purposeful, accessible,
     lightly animated with reduced-motion fallback, and public-safe
4. Validate after edits:
   - `npm run validate`
   - `npm run validate:plugin-skills`
   - `git status --short`
   - Gitleaks when available
5. Do not commit, push, tag, release, deploy, publish, rotate credentials, or
   perform account-level changes unless the user explicitly approves the exact
   action.

## Output

Report:

- changed files
- validation commands and status
- remaining security or publishing risk
