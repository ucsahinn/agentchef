# Yayın Kontrol Listesi

Yayın, lokal güvenin public bir iddiaya dönüştüğü noktadır. Sıralamayı bozma: önce doğrula, exact diff’i incele, ardından açık onayla commit, tag veya release oluştur.

Yayın adayı temel sürümü: **v0.5.70**.

## Commit Veya Push Öncesi

```bash
npm run check
npm run validate:release
npm run verify:skills:online
node scripts/plan-install.mjs --all --json --redact-paths
npm run validate:install-state
npm run release:notes:check
git status --short
git diff --check
git diff --cached --check
```

`npm run check` geliştirme sırasında dirty worktree ile çalışabilir. Ayrı
`validate:release` kapısı bilerek strict'tir: index ve worktree temiz olmalı,
package version için mevcut bir lokal tag bulunmamalıdır.

Gitleaks varsa:

```bash
gitleaks detect --redact --no-banner --no-git --verbose
```

Stage edilen diff’i dosya dosya incele. Ignored `.serena/`, `tmp/`, log, cache, screenshot, archive, package tarball, auth state, session veya memory dosyalarını stage etme.

## Release Notunu Hazırla

`docs/release-notes.tr.md` kullanıcıların şimdi kurması gereken sürümü anlatır. Tam geçmiş `CHANGELOG.md` içinde kalır. GitHub Release metnini yalnız güncel bölümden üret:

```bash
npm run release:notes
```

Oluşan `tmp/release-notes-current.md` lokal release girdisidir; tracked source değildir.

## Mevcut Repoyu Yayınla

Açık onay ve temiz staged review sonrasında:

```bash
git commit -m "Prepare Codex Chef public docs"
git push origin main
```

Gelecekteki bir sürüm için `<version>` değerini ancak package metadata ve iki release-note dosyası hizalandıktan sonra değiştir:

```bash
git tag -a v<version> -m "Codex Chef v<version>"
git push origin v<version>
gh release create v<version> --title "Codex Chef v<version>" --notes-file tmp/release-notes-current.md
```

## Public Durumu Doğrula

```bash
git rev-parse HEAD
git -c http.sslBackend=openssl ls-remote origin refs/heads/main
gh run list --workflow validate --branch main --limit 1
gh release view v<version>
```

Lokal ve remote commit aynı olmalı, CI tamamen yeşil olmalı ve release tag’i hedeflenen commit’e çözülmeli.

## Asla Yayınlama

- credential, auth dosyası, cookie, private key veya signing materyali
- Codex session, memory, log, browser profile veya lokal database
- makineye özel path veya project trust state
- generated installer, archive, build output, dependency klasörü veya scratch raporu normal source dosyası olarak
