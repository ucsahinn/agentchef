# Claude Skill Links

Use this article when an AgentChef skill is listed twice in Claude Code or
Codex, when `~/.claude/skills/<name>` or `~/.agents/skills/<name>` still holds
an AgentChef skill after an upgrade to 1.3.0, or when the installer or the
migration reports `retire`, `keep-until-plugin`, or `foreign` for a skill.

## What AgentChef Controls

Since 1.3.0 AgentChef creates no skill links and no direct skill copies.
Every AgentChef skill reaches both CLIs only through the `agentchef` plugin,
from `~/.agents/plugins/sources/agentchef/skills/<name>`: Claude Code calls it
`/agentchef:<skill>` and Codex calls it `$agentchef:<skill>`.

Installs from 1.0–1.2 worked differently: they copied skills into
`~/.agents/skills/<name>` and linked them into `~/.claude/skills/<name>` (a
junction on Windows, a symlink elsewhere), so each skill was listed twice.
Two steps retire what those installs left behind:

- `npm run chef -- --migrate-identity --target both --apply` backs up, then
  removes AgentChef's own direct copies in `~/.agents/skills`. A copy counts as
  AgentChef's only through its marker (`.agentchef-managed.json`) or provenance
  record (`.agentchef-source.json`), and it is retired only when the plugin
  source already holds that skill. Claude links that point into a retired copy
  are removed with it and dropped from the install receipt.
- The Claude installer retires the links its previous install receipt
  recorded, but only after the plugin was registered successfully. If
  registration is skipped or fails, the links stay and stay recorded.

Your own skills and links that AgentChef did not make are never touched.
`-AdoptSkillLinks` and `--adopt-skill-links` are still accepted but have no
effect.

## Recommended Checks

```bash
npm run chef -- --migrate-identity --target both
node scripts/install-claude-target.mjs --json --redact-paths
npm run verify:install:runtime -- --expect-skills
```

The migration preview reports one decision per legacy copy or link:

| Decision | Meaning |
| --- | --- |
| `retire` | an AgentChef copy whose skill the plugin source already holds, or a Claude link into such a copy; backed up, then removed on `--apply` |
| `keep-until-plugin` | an AgentChef pinned copy whose skill is not in the plugin source yet; kept until the installer has written it there |
| `foreign` | no AgentChef marker or provenance record, or a link that points elsewhere; left untouched |

`verify-install-runtime --expect-skills` checks the skills inside the plugin
source and warns, without failing, when a skill still has a direct copy outside
the plugin, pointing to the migration command.

## Clean Decision Flow

1. Run the migration preview and read the decisions.
2. If any copy reports `keep-until-plugin`, run the full install first
   (`-All` / `--all`, or `-InstallSkills` / `--install-skills`) so the pinned
   skills are written into the plugin source, then preview the migration again.
3. Apply the migration with `--apply`; every retired copy is backed up first.
4. For `foreign`, decide yourself: it is your content, and AgentChef leaves it.
5. Start a new Claude Code and Codex session and check that each skill is
   listed once.

## Stop Conditions

- Do not delete a `foreign` directory or link from a support pass; it is user
  content.
- Do not recreate skill links by hand; since 1.3.0 skills come from the plugin
  and a link only lists the skill a second time.
- Do not delete AgentChef copies by hand while the migration reports
  `keep-until-plugin`; the plugin does not hold that skill yet.
