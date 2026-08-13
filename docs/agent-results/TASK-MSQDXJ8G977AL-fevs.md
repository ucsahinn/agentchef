---
title: Workspace OS unified bootstrap specification
task: TASK-MSQDXJ8G977AL
agent: fevs
status: complete
type: feature
---

## Ne yapıldı

- `ADR-004` doğrulandı ve Windows-only unified bootstrap'ın Control-owned,
  preview-first, açık `-Apply -PlanId` sözleşmesini koruduğu teyit edildi.
- Control'un tüketici kurulumunda .NET 8 runtime denetlediği; `global.json`
  içindeki SDK `8.0.422`/roll-forward kapalı politikasının yalnız kaynak derleme
  veya native payload yeniden üretiminde zorunlu olması gerektiği ADR'ye
  açıkça eklendi.
- ADR'nin OS/toolchain gates, fresh-state allowlist/denylist, component-scoped
  backup/rollback, redacted health matrix, gerçek temiz Windows profil/VM
  kabul kapısı ve Control'da uygulanacak dört fazlı planı kapsadığı doğrulandı.

## Kanıt

- `codex-chef-control/scripts/setup.ps1:52-92`: Control prerequisite reporter
  Node 24, Codex `0.145.x`, .NET 8 runtime ve Codex login-ready durumunu
  denetliyor; SDK sürümünü tüketici install gate'i olarak denetlemiyor.
- `codex-chef-control/global.json`: kaynak/payload üretim SDK politikası
  `8.0.422`, `rollForward: disable`, `allowPrerelease: false`.
- `codex-chef-kitchen/scripts/setup-kitchen.ps1:8-32`: Kitchen yalnız Windows
  üzerinde Node 24 gerektiriyor, kilitli bağımlılıkları `npm.cmd ci` ile
  kuruyor ve Control bridge'ini opsiyonel/read-only olarak bildiriyor.
- `codex-chef-kitchen/scripts/start-desktop.ps1:6-18`: desktop yolunun
  doğrulanmış Electron runtime gerektirdiği kanıtlandı.
- `docs/decisions/004-workspace-os-unified-bootstrap.md`: owner, CLI,
  plan kimliği, state sınırları, rollback, health matrix ve Phase 0-3
  uygulama planı yerinde.

## Değişen dosyalar

- `docs/decisions/004-workspace-os-unified-bootstrap.md` — binary-release
  runtime gate'i ile source/payload SDK gate'i ayrıştırıldı.
- `docs/agent-results/TASK-MSQDXJ8G977AL-fevs.md` — bu sonuç raporu.

## Riskler

- Bootstrap artefactı henüz Control repository'de uygulanmadı; ADR'deki gerçek
  temiz Windows VM/profil acceptance gate'i Phase 3 uygulama işinin zorunlu
  kanıtıdır.
- Chef, Control ve Kitchen source worktree'leri farklı release/lock kimlikleri
  taşıyabileceğinden `-PlanId` her preview sonrasında yeniden üretilmelidir.

## Açık sorular

- Yok. Binary-release ile source/payload build ayrımı artık açık; manifest
  şeması Phase 0'da bu seçimi taşımalıdır.

## Sonraki adım

Control repository'de ADR Phase 0 ile başlayın: `workspace-os.bootstrap.v1`
şeması, hash-pinned release manifest ve zero-write preview fixture'larını
uygulayın.
