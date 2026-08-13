# TASK-MSS5345UKC648 — Kitchen internal-module suite contract

## Ne yapıldı

- Suite sözleşmesini ADR-005 ile hizaladım: Kitchen tek public ürün, installer
  ve release train; Chef, Control ve Brain ise Kitchen içindeki internal
  modüllerdir.
- Yetki yönünü korudum: Kitchen adapter/shell olarak kalır; Control yürütme,
  onay ve worktree/effect otoritesini taşır; Chef capability/routing, Brain
  kullanıcı bilgisi sınırını taşır.
- Cross-product dili cross-module olarak güncellendi; eksik modul görünürlüğü
  safe `unknown`/`unavailable`/`stale`/`unsupported` durumu olur.
- Envelope schema/uygulama arasındaki kalan boşluğu kayda aldım: payload enum
  tanımları JSON Schema, validator ve fixture'larda aynı anda kapatılmalı.

## Kanıt

2026-08-14, Chef kökünde gerçek doğrulama:

```text
> codex-chef@0.5.72 validate
> node scripts/validate-repo.mjs

Validation passed. Checked 397 files.
```

Gerçek envelope testi:

```text
✔ accepts the minimum v1 run observation envelope
✔ rejects an envelope with an unsupported major before an action can start
✔ rejects unclassified envelope fields to keep exports fail-closed
✔ rejects an observation emitted by a product that is not authoritative for it
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

## Değişen dosyalar

- `docs/enterprise-v3/SUITE_CONTRACTS_SPEC.md`
- `docs/agent-results/TASK-MSS5345UKC648-ekip-lideri-d00406.md`

## Riskler

- `packages/contracts` hâlen Chef çalışma ağacında bulunuyor; bu yalnız geçici
  envanter/test kanıtıdır. Kitchen monorepo modülüne taşınmadan public runtime
  veya publish yüzeyi değildir.
- JSON schema'nın payload kısmı henüz event alanlarını enum düzeyinde
  doğrulamıyor. Bu nedenle gerçek Kitchen release kapısı açık değildir.

## Açık sorular

- Kitchen root manifesti, internal modül paket/çalışma zamanı çözümleme
  mekanizması ve Chef/Control/Brain migration sırası henüz uygulanmadı.
- Her event payload alanının kapalı enum sözlüğü Control ve Kitchen tarafındaki
  mevcut iş akışları denetlenerek sabitlenmeli.

## Sonraki adım

Sözleşme paketini Kitchen çalışma alanına taşımaya yönelik non-destructive
migration planı oluşturmak; ardından schema-validator-fixture parity ve gerçek
Windows Workspace E2E kapısını uygulamak.
