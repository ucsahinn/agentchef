# TASK-MSS62VU2BAF9W — Chef/Brain internal module manifest

## Ne yapıldı

- Kitchen'ın ileride güvenli biçimde tüketebileceği versioned Chef/Brain
  internal-module metadata manifestini ekledim.
- Allowlist tabanlı validator, unknown field/path-shaped/secret-like value,
  unsupported schema, mutable Brain health ve eksik no-copy state girdilerini
  fail-closed reddeder.
- TDD uygulandı: önce validator bulunmadığı için target test beklenen module
  resolution hatasıyla kırmızıydı; minimal validator/manifests sonrası geçti.

## Kanıt

Kırmızı TDD kanıtı:

```text
ERR_MODULE_NOT_FOUND: Cannot find module scripts/validate-chef-module-manifest.mjs
```

Yeşil test ve doğrulama (2026-08-14):

```text
ℹ tests 4
ℹ pass 4
ℹ fail 0

Validation passed. Checked 410 files.
```

## Değişen dosyalar

- `manifests/chef-module.manifest.v1.json`
- `scripts/validate-chef-module-manifest.mjs`
- `scripts/tests/chef-module-manifest.test.mjs`
- `docs/agent-results/TASK-MSS62VU2BAF9W-ekip-lideri-d00406.md`

## Riskler

- Bu metadata contractı Kitchen root resolver/installer uygulamasının yerine
  geçmez; Kitchen uygulaması kullanıcı handoff kapsamındadır.
- Manifestin public release/version resolver'a bağlanması M5 root manifest
  çalışmasında yapılmalıdır.

## Açık sorular

- Chef module internal versioninin public Kitchen release versioninden nasıl
  türetileceği Kitchen root manifest kararıyla kesinleşecek.

## Sonraki adım

Control/contract sprint sonuçlarını bu manifestin events/capabilities major
beğenisiyle eşlemek ve M5 compatibility inputlarını sabitlemek.
