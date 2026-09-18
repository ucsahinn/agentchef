# Harness Compatibility And Import Policy

[English](harness-compatibility.md) | [Türkçe](harness-compatibility.tr.md)

AgentChef targets two terminal agents: **OpenAI Codex CLI**, which the
installer supports today, and **Anthropic Claude Code**, which becomes a second
install target in the 0.9.0 line described by
[ADR-006](decisions/006-agentchef-independent-dual-target-product.md). Other
harnesses (Cursor, OpenCode, Kiro, VS Code, Zed, Gemini, Qwen) are out of scope:
the install plan validator refuses their home directories, and no adapter for
them is planned.

The kit still learns from broad cross-harness starters such as ECC without
becoming one. It stays conservative, Windows-friendly, and safe to preview
before any write.

Date checked: 2026-09-18.

## What Cross-Harness Starters Do Well

ECC is a broad cross-harness agent operating system. It packages many skills,
agents, commands, hooks, MCP conventions, install profiles, target adapters,
tests, and release gates for Codex, Claude Code, Cursor, OpenCode, Gemini, Zed,
and other harnesses.

High-signal ideas worth adapting:

- manifest-driven install planning
- plan/apply separation
- target-specific install adapters behind one manifest
- install-state previews
- manifest and skill-surface validation
- MCP config drift checks
- plugin README honesty about runtime limits
- release gates that check manifests, personal paths, Unicode safety, and
  supply-chain indicators

## What This Kit Must Not Copy

Do not wholesale import another starter's files, config, hooks, MCP catalogs,
skills, agents, or marketplace metadata.

Avoid these patterns:

- installer-triggered dependency installation such as implicit `npm install`
- global `core.hooksPath` changes outside the kit's explicit Git guard flow
- permissive profiles such as `approval_policy = "never"`, `profiles.yolo`, or
  a Claude Code `bypassPermissions` default
- broad active MCP connector catalogs
- account, database, browser, filesystem, or production connectors enabled by
  default
- hook telemetry that records raw prompts, tool inputs, diffs, or outputs
- lifecycle hook runtimes, `SessionStart` prompt injection,
  `hookSpecificOutput.additionalContext`, or learned-skill auto-injection
  shipped as a silent default
- plugin manifests that bundle write-capable interfaces or marketplace
  authentication requirements
- plugin `.mcp.json` files with floating package specs or unpinned git-based
  MCP launchers
- install-plan destinations outside the reviewed target roots declared in
  `manifests/install-plan.json` (today the Codex and Agents homes plus the
  optional Git-guard targets; the Claude Code home only once that target
  ships)
- unversioned or `@latest` npm package specs in generated active config
- imported credential-shaped examples that fail secret scans

## Safe Adaptation Rules

Every externally inspired change must answer these questions before it is
committed:

| Question | Required answer |
| --- | --- |
| What is being adopted? | A small pattern, not a wholesale folder copy. |
| Where does it write? | Repo-scoped by default; global writes require explicit install flags. |
| What can it collide with? | Existing `~/.codex`, `~/.agents`, `~/.claude`, Git config, hooks, MCP, skills, or plugin marketplace state. |
| How is it previewed? | `npm run plan:install`, PowerShell `-WhatIf`, Bash `--dry-run`, or another no-write command. |
| How is it backed up? | Managed global file writes back up before replacement unless explicitly disabled. |
| How is it verified? | `npm run check`, `npm run verify:skills:online` when skill sources change, and Gitleaks before publication. |

## Current Adaptations

This kit adopts the safe subset:

- `manifests/install-plan.json` records the reviewed install surface,
  collision policy, risk, backup behavior, and explicit flags.
- `scripts/plan-install.mjs` prints a no-write install plan in human or JSON
  form.
- `scripts/validate-install-plan.mjs` validates the manifest without adding a
  runtime dependency and refuses destinations under any unsupported harness
  home.
- `schemas/install-state-preview.schema.json` and
  `scripts/validate-install-state-preview.mjs` give the generated JSON preview
  a stable contract.
- `scripts/security-audit.mjs` rejects implicit npm install in installer
  scripts, permissive Codex profiles, `approval_policy = "never"`, unpinned
  npm MCP package specs, lifecycle hook runtimes, and automatic
  additional-context injection patterns.

## Official Codex Alignment

The Codex side follows current official Codex guidance:

- `AGENTS.md` is durable guidance with global, repo, and nested discovery
  order. External repos should own their repo-local instructions.
- Skills use progressive disclosure. Keep descriptions short and scoped.
- Plugins distribute reusable skills, apps, MCP servers, assets, and hooks, but
  a local plugin is not the same as official OpenAI publication.
- MCP servers belong in `config.toml` with `enabled`, approval modes, env-backed
  auth, timeouts, and tool allow/deny lists.
- Hooks are lifecycle guardrails and require trust review; they are not the
  primary security boundary.
- Legacy `sandbox_mode` settings and beta permission profiles should not be
  mixed in one template.

## Official Claude Code Alignment

The planned Claude Code target follows current official Claude Code guidance:

- `CLAUDE.md` is durable guidance with user, project, and local discovery and
  supports `@path` imports; the kit adds one import line instead of replacing
  the user's file.
- Skills are `SKILL.md` folders under `~/.claude/skills/`, project
  `.claude/skills/`, or a plugin's `skills/` directory; symlinked skill folders
  are supported and deduplicated.
- Subagents are Markdown files with frontmatter; plugin subagents are
  namespaced as `plugin:name` and never override the user's own agents.
- Permissions live in `settings.json` (`permissions.allow`, `deny`, `ask`) and
  are merged additively across settings levels; hooks merge additively too.
- MCP servers are added with `claude mcp add` at `user`, `project`, or `local`
  scope; user scope lives in `.claude.json`.
- Plugins are installed only through the `claude plugin` commands; the kit does
  not hand-write Claude Code's plugin cache.

Sources:

- ECC repository: https://github.com/affaan-m/ECC
- Official Codex manual: https://developers.openai.com/codex/codex-manual.md
- Codex Agent Skills: https://developers.openai.com/codex/skills
- Codex plugins: https://developers.openai.com/codex/plugins/build
- Codex MCP: https://developers.openai.com/codex/mcp
- Codex hooks: https://developers.openai.com/codex/hooks
- Codex permissions: https://developers.openai.com/codex/permissions
- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code settings: https://code.claude.com/docs/en/settings
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Claude Code plugins: https://code.claude.com/docs/en/plugins-reference
