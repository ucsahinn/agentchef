# GitHub Repo Ayarları

Bu ayarlar projenin public ilk izlenimini belirler. Yalnız source tree doğrulandıktan ve account-level değişiklik açıkça onaylandıktan sonra manuel uygula.

Yayın adayı temel sürümü: **v0.5.67**.

2026-07-29 tarihli onaylı hesap yazmalarından sonraki canlı read-back: secret
scanning, push protection, vulnerability alerts, Dependabot security updates ve
private vulnerability reporting açık; Wiki kapalı; topic seti aşağıdaki listeyle
eşleşiyor; `main` dört validation check'ini zorunlu tutarken force-push ve branch
silme kapalı. Onaylı maintainer push'ları mümkün kılmak için repo yöneticileri
kuraldan muaf. Custom social preview tek bekleyen hedeftir: GitHub upload'u
authenticated web session üzerinden sunuyor, mevcut isolated browser session'ı
anonim ve public GraphQL alanı hâlâ GitHub'ın ürettiği görseli döndürüyor.

## Açıklama

```text
A cross-platform Codex setup kit with specialist agents, curated skills, safe MCP defaults, preview-first installation, and clear verification.
```

## Topic’ler

```text
codex
codex-chef
openai
codex-cli
ai-agents
mcp
model-context-protocol
agent-skills
windows
macos
linux
powershell
developer-tools
security
setup
```

## Website Ve Social Preview

Stabil bir public proje sayfası yoksa website alanını boş bırak. Lokal path, geçici preview URL veya private workspace linki kullanma.

GitHub social preview için `assets/social-preview.png` kullan. Düzenlenebilir
kaynak olarak `assets/social-preview.svg` kalsın. PNG lokal olarak hazırlandı ve
doğrulandı fakat account-level ayara henüz yüklenmedi.

## Repo Özellikleri

- Issues: açık kalsın.
- Vulnerability alerts ve Dependabot security updates: açık.
- Private vulnerability reporting: açık; böylece `SECURITY.md` içindeki özel
  bildirim yolu doğrudan kullanılabilir.
- Discussions: maintainer’lar community sorularını gerçekten yanıtlayacaksa aç.
- Wiki: bu repodaki version-controlled docs kanonik olduğu sürece kapalı.
- Projects: opsiyonel.
- Packages ve sponsorships: aktif bakım yapılmayacaksa kapalı.

## Branch Ve Actions

- Default branch: `main`.
- `main` protection; `validate`, `windows-installer`,
  `portability (ubuntu-latest, Node 18)` ve
  `portability (macos-latest, Node 24)` check'lerini strict branch freshness ile
  zorunlu tutuyor.
- Force-push ve branch silme kapalı; açıkça onaylanmış maintainer push'ı mümkün
  kalsın diye repo yöneticileri kuraldan muaf.
- Workflow permission’ları read-only, action referansları full commit SHA ile pinned kalmalı.
- Release yayını manuel kalmalı; validation workflow push, tag veya publish yapmamalı.

## Release Metadata

v0.5.67 için:

```text
Title: Codex Chef v0.5.67
Tag: v0.5.67
Notes: tmp/release-notes-current.md
```

Gelecekteki bir release öncesinde `npm run check`, `npm run verify:skills:online`, `npm run release:notes`, `gitleaks detect --redact --no-banner --no-git --verbose` ve [Yayın kontrol listesinde](publish.tr.md) anlatılan lokal/remote commit eşitliği kontrolünü çalıştır.
