# Public Release Hijyeni

Public commit, tag, GitHub Release veya repo metadata güncellemesi hazırlarken
bu kontrol listesini kullan. AgentChef public-source-first ilerler ve npm
publish yolunu `private: true` ile kapali tutar.

## Release Öncesi Gate

```bash
npm run check
npm run validate:release
npm run verify:skills:online
node scripts/plan-install.mjs --all --json --redact-paths
git diff --check
gitleaks detect --redact --no-banner --no-git --verbose
```

Ayrıca şunları incele:

```bash
git status --short
git diff --cached
```

Sadece net dosyaları stage et. Generated file, log, archive, screenshot veya
local agent state varken geniş add komutu kullanma.

## Source'a Girmemesi Gerekenler

- Auth dosyalari, token, cookie, private key, certificate, signing materyali.
- Local session, Codex memory, local cache, private path iceren diagnostic,
  private data içeren screenshot ve loglar.
- Archive, installer, dependency klasörü, build output, coverage, temporary
  report veya package tarball.
- Database dosyasi, dump, browser profile ve private app connector state.

## Public Metadata

- Repo açıklaması ve topic'ler [GitHub repo ayarları](../docs/github-settings.tr.md)
  rehberiyle uyumlu olmalı.
- GitHub social preview `assets/social-preview.png` kullanmali.
- Release notes tam historical dosya yerine `npm run release:notes` ile
  üretilen current section'i kullanmalı.
- GitHub Actions validation read-only ve pinned kalmali.

## Durma Koşulları

Su durumda publish etme:

- Worktree'de sınıflandırılmamış generated veya private file varsa.
- Gitleaks gercek secret raporluyorsa.
- Package-surface validation untracked, ignored, archive, auth veya local-state
  path iceriyorsa.
- Hedef tag zaten varsa ve intended commit ile uyumu dogrulanmadiysa.
