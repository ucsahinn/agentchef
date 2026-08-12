# Beklenen Çıktı

Installer başarılı olduğunda kısa, bölümlü ve okunabilir kalır; hata olduğunda
debug için daha fazla detay gösterir. PowerShell varsayılan olarak okunabilir
ikonlar kullanır; eski terminal veya CI logları için `-PlainOutput` ile
ASCII-only çıktı alabilirsin.

## Install Plan Ön İzleme

Discovery ciktisi no-write ve okunabilir kalir:

```text
Codex Chef install profiles
Package: codex-chef@0.5.67
Platform: windows

Profile | Operations | High risk | Optional flags
--- | ---: | ---: | ---
all | 24 | 1 | InstallSkills
default | 23 | 0 | none
```

```text
Codex Chef install plan
Platform: windows
Operations: ...

[file] codex-config
  source: templates/codex/config.windows.toml
  target: .../.codex/config.toml
  collision: merge-missing-blocks-unless-force-backup-before-replace
  backup: yes
  force: no
  risk: medium
```

JSON çıktı `schemaVersion:
codex-chef.install-state-preview.v1` kullanır ve global Codex,
Agents veya Git lokasyonlarına yazmaz.

JSON sozlesmesi `schemas/install-state-preview.schema.json` icinde dokumante
edilir ve `scripts/validate-install-state-preview.mjs` ile dogrulanir.

Publish-safe kanit icin `--redact-paths` ekle; boylece lokal home path'leri
placeholder olarak gorunur:

```bash
node scripts/plan-install.mjs --all --json --redact-paths
```

## Routing Panosu

```text
Codex Chef enterprise routing board
Profiles: 18
Policy: task-shape routing names matching specialists, selects matching skills when applicable, and may spawn bounded local subagents when the current runtime permits delegation; risky actions remain approval-gated.

Subagent visibility contract:
- Agent plan: name each requested agent, scope, reason, expected output, and wait policy before spawning.
- Agent started: show the visible agent name or nickname and assigned task after spawning.
- Agent result: wait for requested subagent results before continuing unless the user explicitly asks for background work.
- Skill selected: name every selected skill and why it matches the task before acting on it.
- MCP selected: name every selected MCP/tool surface, why it is needed, and whether it is read-only or approval-gated.
- Surfaces used: agents=..., skills=..., mcp=..., commands=..., skipped=...
```

Tek profil icin:

```bash
npm run chef -- --routing --profile starter-health --plain --no-log
```

## PowerShell Non-Interactive Dry Run

```text
[*] Codex Chef installer
  - Codex home: ...
  - Agents home: ...
  - Mode: preserve existing files; merge missing config blocks
  - Skills: install reviewed commit-pinned entries by verified native copy
  - Git guards: disabled by default
  - Dry run: no files, Git settings, or skills will be changed
[*] Managed Codex files
What if: Performing the operation ...

[*] Curated skills
  - would install skill: dependency-upgrade from wshobson/agents --skill dependency-upgrade
  - ...
  - Skipped skill installation because -WhatIf is active

[*] Capability board
  - Agents ready (21):
    code_mapper, docs_researcher, ...
  - MCP ready by default (2):
    openaiDeveloperDocs, serena
  - MCP opt-in / disabled by default (14):
    context7, sequential-thinking, playwright, chrome-devtools, memory, codebase-memory, github, figma, ...
  - MCP setup notes (14):
    context7 [tooling]: Ilk acilista npm/npx network erisimi gerekir; credential gerekmez., ...
  - Local plugin skills (9):
    adaptive-agent-routing, codex-chef-brain, codex-chef-operator, context-budget-planner, evidence-research, external-review-workflow, fetch, offline-diagram-triplet, seo
  - Reviewed global skills (15):
    dependency-upgrade, gh-fix-ci, ...
  - Enterprise routing profiles (14):
    repo-map-before-change, current-docs-research, ...
  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.

[*] Next steps
  - completed: Codex Chef dry run
```

## PowerShell Interactive Dry Run

```text
[chef] Guided setup
  - Press Enter to accept the safe default shown in brackets.
  - No tokens, secrets, cookies, sessions, or credentials are requested.
Codex home [...]:
Agents home [...]:
Install or reconcile the 15 reviewed global Codex skills now? [Y/n]:
Replace existing managed Codex Chef files after backup instead of preserving/merging? [y/N]:
Install optional global Git guards for this Windows user? [y/N]:

[chef] Codex Chef installer
  - Codex home: ...
  - Agents home: ...
  - Mode: preserve existing files; merge missing config blocks
  - Skills: install reviewed commit-pinned entries by verified native copy
  - Git guards: disabled by default
  - Dry run: no files, Git settings, or skills will be changed
  - Existing config policy: backup + merge missing Codex Chef blocks unless Force is enabled
  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.
Continue with this plan? [Y/n]:
```

## PowerShell Başarılı Kurulum

```text
[chef] Codex Chef installer
  - Codex home: ...
  - Agents home: ...
  - Mode: preserve existing files; merge missing config blocks

[chef] Managed Codex files
  [ok] installed: ...

[chef] Capability board
  - Agents ready (21):
    code_mapper, docs_researcher, ...
  - MCP ready by default (2):
    openaiDeveloperDocs, serena
  - MCP opt-in / disabled by default (14):
    context7, sequential-thinking, playwright, chrome-devtools, memory, codebase-memory, github, figma, ...
  - MCP setup notes (14):
    context7 [tooling]: Ilk acilista npm/npx network erisimi gerekir; credential gerekmez., ...
  - Local plugin skills (9):
    adaptive-agent-routing, codex-chef-brain, codex-chef-operator, context-budget-planner, evidence-research, external-review-workflow, fetch, offline-diagram-triplet, seo
  - Reviewed global skills (15):
    dependency-upgrade, gh-fix-ci, ...
  - Enterprise routing profiles (14):
    repo-map-before-change, current-docs-research, ...
  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.

[chef] Next steps
  - 28 existing managed target(s) were preserved; use -Force only for a deliberate backup-backed replacement
  [ok] completed: Codex Chef install
  - Restart Codex, then run:
    codex doctor --summary
    npm run codex:routing
    npm run codex:status
    npm run verify:install:runtime
    codex exec --strict-config "Summarize the active Codex setup."
  - Backup: ...
```

Mevcut `config.toml` `-Force` verilmedikçe backup alınıp merge edilir; diğer
mevcut managed dosyalar `-Force` verilmedikçe atlanır.

## Repair On Izleme

```text
Codex Chef repair
Mode: plan
Overall: attention
Codex home: ...
Agents home: ...
Managed files: <current>/<expected> current, <planned> planned, <applied> applied
Config: current
Marketplace: planned
Skills: <installed> unique installed (<managed-expected> managed expected, <missing> missing, <other> non-curated, <duplicates> duplicate names)
Action: planned copy-file .../.codex/rules/default.rules
Action: planned update-marketplace-entry .../.agents/plugins/marketplace.json
Warning: <other> non-curated global skill(s) are installed; repair reports them but does not delete user skills.
```

JSON ciktisi `schemaVersion: codex-chef.repair.v1` kullanir. `-Repair -WhatIf`
ve `npm run repair:install -- --json` no-write kalir. `-Repair` ve
`npm run repair:install -- --apply` managed drift'i duzeltmeden once backup
olusturur.
Bu örnekteki sayılar placeholder'dır; kurulu kullanıcı skill'leri ve güncel
managed-file envanteri makineye ve sürüme göre değişir.

## Status Panosu

```text
Codex Chef durumu
Genel: dikkat
Repo Git: dikkat - git status --short değişen satırlar bildiriyor.
MCP: 16/16 katalog bağlayıcısı yapılandırılmış, 0 eksik, <user-added> kullanıcı kaydı; katalog varsayılanlarında 3 açık/13 kapalı; canlı durum ölçülmedi
Codex CLI: tamam (strict config tamam, login tamam, MCP tamam)
Kurulu ortam: dikkat/güncel (...)
Skill'ler: global köklerde toplam <installed> (<managed> Codex Chef managed, <missing> eksik, <other> diğer/kullanıcı kurulu)
Codex doctor kontrolleri: dikkat (...)
Sonraki adım: Dikkat maddelerini inceleyin; bunlar Codex Chef kurulumunun bozuk olduğu anlamına gelmeyebilir.
Ayrıntılar: npm run chef -- --status --details
```

Hedef/ortam karşılaştırması, MCP kayıtlarının tamamı, yönlendirme kontrolleri,
context bütçesi, kurulum notları ve log bilgileri için `--details` kullanın.

## Bash Dry Run

```text
[*] Codex Chef installer
  - Codex home: ...
  - Agents home: ...
  - Mode: preserve existing files; merge missing config blocks
  - Dry run: no files, Git settings, or skills will be changed

[*] Managed Codex files
Would install file from ...

[*] Capability board
  - Agents ready (21):
    code_mapper, docs_researcher, ...
  - MCP ready by default (2):
    openaiDeveloperDocs, serena
  - MCP opt-in / disabled by default (14):
    context7, sequential-thinking, playwright, chrome-devtools, memory, codebase-memory, github, figma, ...
  - MCP setup notes (14):
    context7 [tooling]: Ilk acilista npm/npx network erisimi gerekir; credential gerekmez., ...
  - Local plugin skills (9):
    adaptive-agent-routing, codex-chef-brain, codex-chef-operator, context-budget-planner, evidence-research, external-review-workflow, fetch, offline-diagram-triplet, seo
  - Reviewed global skills (15):
    dependency-upgrade, gh-fix-ci, ...
  - Enterprise routing profiles (14):
    repo-map-before-change, current-docs-research, ...
  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.

[*] Next steps
  - completed: Codex Chef dry run
```

## Bash Başarılı Kurulum

```text
[*] Codex Chef installer
  - Codex home: ...
  - Agents home: ...
  - Mode: preserve existing files; merge missing config blocks

[*] Managed Codex files
  - installed: ...

[*] Capability board
  - Agents ready (21):
    code_mapper, docs_researcher, ...
  - MCP ready by default (2):
    openaiDeveloperDocs, serena
  - MCP opt-in / disabled by default (14):
    context7, sequential-thinking, playwright, chrome-devtools, memory, codebase-memory, github, figma, ...
  - MCP setup notes (14):
    context7 [tooling]: Ilk acilista npm/npx network erisimi gerekir; credential gerekmez., ...
  - Local plugin skills (9):
    adaptive-agent-routing, codex-chef-brain, codex-chef-operator, context-budget-planner, evidence-research, external-review-workflow, fetch, offline-diagram-triplet, seo
  - Reviewed global skills (15):
    dependency-upgrade, gh-fix-ci, ...
  - Enterprise routing profiles (14):
    repo-map-before-change, current-docs-research, ...
  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.

[*] Next steps
  - 28 existing managed target(s) were preserved; use --force only for a deliberate backup-backed replacement
  - completed: Codex Chef install
  - Restart Codex, then run:
    codex doctor --summary
    npm run codex:routing
    npm run codex:status
    npm run verify:install:runtime
    codex exec --strict-config "Summarize the active Codex setup."
  - Backup: ...
```

## Skill Kurulumu

Başarılı skill kurulumları kısa status satırları basar:

```text
Pinned skill already current: ...
Installed pinned skill ... by native copy from ...@...
Skipped existing user-owned skill ...; rerun this exact command with --adopt-existing only after reviewing that target.
```

Top-level installer'lar helper sonucunu doğru statüye çevirir; korunan hedefi
kurulmuş gibi göstermez:

```text
  - skill already current: ...
  - installed skill: ...
  - upgraded managed skill: ...
  - preserved user-owned skill: ...
```

Hatalar fetch, staging, hash, activation veya rollback aşamasını belirtir.
Kurulum registry kaynaklı bir Skills CLI çalıştırmaz.
