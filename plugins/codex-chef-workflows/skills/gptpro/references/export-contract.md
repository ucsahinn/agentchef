# GPT Pro Project export contract

OpenAI's currently documented Project workflow supports text and document files;
it does not promise ZIP archive extraction or indexing. This skill therefore
creates named `.txt` files as the primary upload surface. The current operational
limits are: at most 40 files in a Pro Project, 10 files per upload batch, 512 MB
per file, and a 2M-token cap per text/document file. The exporter deliberately
stays below those limits with at most 38 source bundles plus an index; Project
instructions are pasted into settings rather than uploaded.

## 1. Create the safe source manifest

Run from the target Git worktree in PowerShell:

```powershell
$reviewTarget = (Resolve-Path -LiteralPath '.').Path
$chefRoot = Join-Path $env:USERPROFILE 'Desktop\codex-chef'
npm.cmd --prefix $chefRoot run chef -- review pack --target $reviewTarget
npm.cmd --prefix $chefRoot run chef -- review pack --target $reviewTarget --apply
```

Set the reported manifest path and confirm it is fresh. All output remains outside
the repository and no command uploads anything:

```powershell
$reviewManifest = 'C:\path\outside-the-repo\external-review-manifest.json'
npm.cmd --prefix $chefRoot run chef -- review status --target $reviewTarget --manifest $reviewManifest
```

## 2. Preview and create Project text bundles

```powershell
$agentsHome = if ($env:AGENTS_HOME) { $env:AGENTS_HOME } else { Join-Path $env:USERPROFILE '.agents' }
$gptproScript = Join-Path $agentsHome 'skills\gptpro\scripts\project-export.mjs'
$gptproOut = Join-Path (Split-Path -Parent $reviewManifest) 'gptpro-project-context'
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --apply
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --status
```

The default groups workspace packages, root application code, database schema and
migrations, docs/ADRs, and remaining verified root context. If any verified nested
surface is not assigned by the default, the exporter stops rather than silently
omitting it.

## 3. Optional custom split

Copy the bundled JSON example to an ignored local file, edit it, and pass the same
path on preview, apply, and status:

```powershell
$bundleConfig = Join-Path $reviewTarget 'gptpro-bundles.json'
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --config $bundleConfig
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --config $bundleConfig --apply
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --config $bundleConfig --status
```

## 4. Manual Project handoff

1. In ChatGPT, create or open the intended Project.
2. Paste `gptpro-project-instructions.md` into Project settings.
3. Upload `gptpro-context-index.md` and the matching named `.txt` bundles, ten or
   fewer at a time. Do not reuse files from a different review ID or commit.
4. Use `gptpro-handoff` to write a bounded prompt that repeats the exact review ID
   and snapshot commit.

Project instructions apply only inside that Project and can override global custom
instructions. A Project is not proof that all uploaded files enter every answer;
ask file-path-anchored questions and retain the context index.
