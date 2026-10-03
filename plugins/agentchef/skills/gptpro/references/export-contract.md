# GPT Pro Project export contract

Contents: limits · 1 manifest · 2 export · 3 options · 4 custom split ·
5 manual handoff · 6 what each layer enforces · 7 troubleshooting.

## Documented Project limits (OpenAI help center, checked 2026-10-02)

- Files per Project: 40 on Pro, Business, Enterprise, and Edu (25 on Plus, 5 on
  Free). Only 10 files can be uploaded in one batch.
- Per file: 512 MB hard limit; text and document files are capped at 2M tokens.
- Project instructions apply only inside that Project and override global custom
  instructions. ZIP extraction or indexing inside a Project is not documented, so
  named `.txt` files are the primary upload surface and the ZIP is a convenience.
- Uploaded files are read through text retrieval, not as one continuous context.
  A Project is therefore not proof that every file enters every answer: keep the
  context index uploaded and ask file-path-anchored questions.
- Projects can be set to project-only memory; use it for client or confidential
  code so chats cannot pull context from unrelated conversations.
- Reasoning depth for Pro models is a picker in the ChatGPT UI, not prompt text.

The exporter stays below those limits with at most 38 source bundles plus the
index; Project instructions are pasted into settings rather than uploaded.

## 1. Create the safe source manifest

`$chefRoot` is your AgentChef checkout (the folder that holds `package.json` and
`scripts/external-review-cli.mjs`); there is no installed `chef` binary, and
`npm run chef -- review …` only dispatches to that script. Run from the target
Git worktree in PowerShell:

```powershell
$reviewTarget = (Resolve-Path -LiteralPath '.').Path
$chefRoot = 'C:\path\to\your\agentchef-checkout'
$reviewOut = Join-Path (Split-Path -Parent $reviewTarget) ((Split-Path -Leaf $reviewTarget) + '-external-review')
npm.cmd --prefix $chefRoot run chef -- review pack --target $reviewTarget --out $reviewOut
npm.cmd --prefix $chefRoot run chef -- review pack --target $reviewTarget --out $reviewOut --apply
```

(`node "$chefRoot\scripts\external-review-cli.mjs" review pack …` is the same
command without npm.) The preview prints the planned `out` folder and file list
and writes nothing; `--apply` creates that folder with
`external-review-manifest.json` and the bundle parts. Without `--out` the pack
lands in a sibling folder named `<repo>-external-review\<reviewId>`. Never save
the preview's stdout as a manifest. Set the written manifest path and confirm it
is fresh; no command uploads anything:

```powershell
$reviewManifest = Join-Path $reviewOut 'external-review-manifest.json'
npm.cmd --prefix $chefRoot run chef -- review status --target $reviewTarget --manifest $reviewManifest
```

## 2. Preview and create Project text bundles

```powershell
$gptproScript = Join-Path $chefRoot 'plugins\agentchef\skills\gptpro\scripts\project-export.mjs'
$gptproOut = Join-Path (Split-Path -Parent $reviewManifest) 'gptpro-project-context'
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --apply
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --status
```

The script in the checkout is the source of truth; the installed copy under
`$env:AGENTS_HOME\skills\gptpro` (default `~\.agents\skills\gptpro`) is the same
file only after `npm run chef -- --repair --apply` or `--update --apply` has
synced it. The default groups workspace packages, root application code, database
schema and migrations, docs/ADRs, and remaining verified root context. Preview
prints the bundle names, file counts, and byte sizes; nothing is written. `--out`
must be a new directory outside the worktree; an existing directory is never
overwritten.

## 3. Options

| Flag | Default | Use |
| --- | --- | --- |
| `--prefix <name>` | target folder name | Prefix for every bundle and ZIP name (`[A-Za-z0-9][A-Za-z0-9._-]*`). Use a stable, short prefix when the folder name is long or ambiguous. |
| `--max-bundles <n>` | 38 | Lower cap (1–38) when the Project already holds other files; the export fails if the split needs more. |
| `--max-bundle-bytes <n>` | 4000000 | Per-bundle text limit (10000–4000000); larger bundles split into `-01`, `-02`, … parts. Lower it only to make bundles smaller, never to fit a single oversized file. |
| `--config <json>` | none | Custom architecture map (section 4). Pass the same path on preview, apply, and status. |
| `--help` | | Usage text, including these options. |

Pass the same flags on preview, apply, and status; status recomputes the plan and
reports `fresh: false` when the plan no longer matches the written artifacts.

## 4. Optional custom split

Copy the bundled JSON example to an ignored local file, edit it, and pass the same
path on preview, apply, and status:

```powershell
$bundleConfig = Join-Path $reviewTarget 'gptpro-bundles.json'
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --config $bundleConfig
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --config $bundleConfig --apply
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --config $bundleConfig --status
```

Rules: bundle names are lowercase kebab-case, unique, and at most 63 characters; patterns are
repository-relative globs (`**`, `*`) with no `..` or absolute paths; the first
bundle that matches a file owns it; every verified file must be matched by some
bundle. The preview fails and lists the unassigned files otherwise. A final
`{"name": "root-context", "include": ["**"]}` bundle is the usual catch-all.

## 5. Manual Project handoff

1. In ChatGPT, create or open the intended Project. For confidential code, switch
   the Project to project-only memory before uploading.
2. Paste `gptpro-project-instructions.md` into Project settings (instructions, not
   a file upload).
3. Upload `gptpro-context-index.md` and the matching named `.txt` bundles, ten or
   fewer at a time. Do not reuse files from a different review ID or commit, and
   remove files from an older review before adding the new set.
4. Choose the reasoning depth from the model picker in the UI.
5. Use `gptpro-handoff` to write a bounded prompt that repeats the exact review ID
   and snapshot commit.

## 6. What each layer enforces

| Guarantee | `review pack` / `review status` | `project-export.mjs` |
| --- | --- | --- |
| Tracked regular text only (no untracked files) | yes | relies on the manifest; re-run `review status` right before export |
| Secret-like content scan | yes | no (content is not rescanned) |
| Sensitive path deny-list (`.env`, keys, agent state, sessions, databases, logs, …) | yes | yes, same list, independently |
| Binary content rejected | yes | yes |
| Symlinks and path escapes rejected | yes | yes |
| Hash + byte pinning of every source | creates | verifies on preview, apply, and status |
| Output outside the worktree, never overwritten | yes | yes (atomic staging + rename) |
| Bundle count ≤ 38 | — | yes |

Because the content scan runs only in `review pack`, the manifest must come from a
successful `review pack --apply` and a fresh `review status`; never hand-edit it.

## 7. Troubleshooting

| Message (abridged) | Cause | Action |
| --- | --- | --- |
| `External-review manifest must be a regular non-linked file` | The manifest path does not exist yet (a pack preview writes nothing) or points at a link | Run `review pack --apply` first, then pass `<out>\external-review-manifest.json`. |
| `Output already exists; refusing to overwrite` | `--out` directory exists | Choose a new `--out` (for example add the review ID). Prior exports are never replaced. |
| `Source changed; snapshot is stale` / `Source is missing` | Worktree edited after `review pack` | Commit or stash, re-run `review pack --apply`, then export with the new manifest. |
| `Manifest lists a sensitive path` / `lists a binary file` | Manifest edited by hand or produced by an older pack | Regenerate with `review pack`; do not edit the manifest. |
| `… left N verified file(s) unassigned: …` | Custom map misses files | Add include patterns or a final `**` catch-all bundle. |
| `Export would create N text bundles; the Project-safe maximum is 38` | Too many workspace packages or oversized bundles | Merge surfaces with `--config`, or narrow the pack to the relevant subsystems. |
| `File exceeds the per-bundle text limit` | One file > 4 MB of text | Exclude it from the review pack (generated or vendored file); do not raise the limit. |
| `Output must remain outside the target repository` | `--out` inside the worktree (or aliased into it) | Use a sibling directory such as `<repo>-external-review\<reviewId>\gptpro-project-context`. |
| `Output must not traverse a linked path` / `Output ancestor does not exist or is unreachable` | `--out` goes through a junction/symlink, or its drive/share is missing | Use a real local directory whose parent exists. |
| `--status` prints `fresh: false` with `unexpected` entries | Old artifacts or edits in the output folder | Do not upload; export again to a clean `--out`. |
| `--status` prints `identityMatches: false` | Manifest replaced after export | Export again from the current manifest; never mix review IDs. |
