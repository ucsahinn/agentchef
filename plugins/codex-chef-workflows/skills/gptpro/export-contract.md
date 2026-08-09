# GPT Pro Project export contract

The exporter creates one hash-bound hybrid delivery from a Git-pinned, secret-safe
source snapshot:

```text
<output>/
  <prefix>-gptpro-context.zip       # one portable convenience package
  subsystem-zips/<prefix>-*.zip     # original-style focused architecture slices
  <prefix>-*.txt                    # direct Project upload fallback
  gptpro-context-index.md
  gptpro-project-instructions.md
  README-UPLOAD.md
  SHA256SUMS
  gptpro-context-manifest.json
  gptpro-delivery-manifest.json
```

The ZIPs are generated only from the verified semantic bundle plan; they never walk
the worktree or recursively package the output directory. Every text bundle, ZIP,
checksum and manifest is bound to the same review ID and snapshot commit.

A ZIP is convenient for carrying one complete review package, but ChatGPT Project
ZIP extraction/indexing is not officially guaranteed. Treat the named `.txt`
bundles as the deterministic fallback: if the Project does not enumerate ZIP
contents, extract the package, paste the Project instructions into Project settings,
and upload the index plus text bundles.

## 1. Create the safe source manifest

Run from the target Git worktree in PowerShell:

```powershell
$reviewTarget = (Resolve-Path -LiteralPath '.').Path
$chefRoot = Join-Path $env:USERPROFILE 'Desktop\codex-chef'
npm.cmd --prefix $chefRoot run chef -- review pack --target $reviewTarget
npm.cmd --prefix $chefRoot run chef -- review pack --target $reviewTarget --apply
```

Set the reported manifest path and confirm it is fresh:

```powershell
$reviewManifest = 'C:\path\outside-the-repo\external-review-manifest.json'
npm.cmd --prefix $chefRoot run chef -- review status --target $reviewTarget --manifest $reviewManifest
```

## 2. Preview, create and verify the delivery

```powershell
$gptproScript = Join-Path $env:USERPROFILE '.codex\skills\gptpro\scripts\project-export.mjs'
$gptproOut = Join-Path (Split-Path -Parent $reviewManifest) 'gptpro-project-context'
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --apply
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --status
```

Default grouping creates one bundle per workspace package under `apps`, `packages`,
`services` and `libs`, plus application, schema/migrations, docs/ADRs and remaining
root context. Every verified source file must have exactly one bundle owner; missing
or duplicate ownership stops the export.

`--apply` always requires a new output folder. It never overwrites a prior delivery.
`--status` rejects a changed source, changed text bundle, changed index/instructions,
changed subsystem or delivery ZIP, manifest mismatch, or unexpected stale artifact.

## 3. Optional custom split

Copy the bundled JSON example to an ignored local file, edit it, and use the exact
same path for preview, apply and status:

```powershell
$bundleConfig = Join-Path $reviewTarget 'gptpro-bundles.json'
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --config $bundleConfig
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --config $bundleConfig --apply
node $gptproScript --target $reviewTarget --manifest $reviewManifest --out $gptproOut --config $bundleConfig --status
```

## 4. Manual GPT Pro handoff

1. Run both Chef review status and gptpro status successfully.
2. Upload `<prefix>-gptpro-context.zip` if you want to try a one-file handoff.
3. If ChatGPT does not clearly expose the archive contents, extract it and upload
   `gptpro-context-index.md` plus the matching named `.txt` bundles in batches of
   ten or fewer; paste `gptpro-project-instructions.md` into Project settings.
4. For a focused subsystem review, use the matching file from `subsystem-zips/`.
5. Use `gptpro-handoff` to create the bounded task prompt and validate GPT Pro's
   returned report against the live repository.