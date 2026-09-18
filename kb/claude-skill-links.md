# Claude Skill Links

Use this article when a skill is missing from `/skills` in Claude Code, when
`~/.claude/skills/<name>` is a real directory instead of a link, or when the
installer reports `foreign` or `adoptable-copy` for a skill.

## What AgentChef Controls

Claude Code reads `~/.claude/skills/`, not `~/.agents/skills/`. AgentChef keeps
one managed copy of every bundled and curated skill under
`~/.agents/skills/<name>` and exposes it to Claude through a directory link
(`~/.claude/skills/<name>`, a junction on Windows and a symlink elsewhere).
Claude Code supports linked skill folders and deduplicates them. Only skills
that are still in `catalog/skills.json` are linked; a managed directory that
left the catalog is reported as `retired` and stays as it is.

## Recommended Checks

```bash
node scripts/install-claude-target.mjs --json --redact-paths
```

Each link reports one decision:

| Decision | Meaning |
| --- | --- |
| `create` | no entry exists; the installer creates the link |
| `current` | the link already points at the managed tree |
| `adoptable-copy` | a real directory carrying an AgentChef marker; rerun with `--adopt-skill-links` to back it up and replace it with a link |
| `foreign` | a real directory without an AgentChef marker, or a link elsewhere; left untouched |
| `retired` | a managed directory under `~/.agents/skills` whose name is no longer in `catalog/skills.json` (for example `codex-chef-brain`, retired in 0.6.0); reported, never linked, adopted, or removed |

## Clean Decision Flow

1. Preview and read the decisions.
2. For `adoptable-copy`, confirm the copy has no local edits you want to keep,
   then rerun with `--adopt-skill-links`; the copy is backed up first.
3. For `foreign`, decide yourself: keep your own skill, or move it aside and
   rerun the installer.
4. Start a new Claude Code session and check `/skills`.

## Stop Conditions

- Do not delete a `foreign` directory from a support pass; it is user content.
- Do not create links by hand with a different target; drift detection expects
  the managed tree.
- On Windows, junctions need no administrator rights; do not enable Developer
  Mode or run elevated just for skill links.
