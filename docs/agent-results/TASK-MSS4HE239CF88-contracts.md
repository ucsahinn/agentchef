# TASK-MSS4HE239CF88 — Contracts TDD recovery

## Ne yapıldı

- `packages/contracts` olay zarfı doğrulayıcısındaki tarih denetimi takvim gününü de fail-closed doğrulayacak biçimde sıkılaştırıldı. Önceden JavaScript tarih ayrıştırıcısının düzelttiği imkânsız günler kabul edilebiliyordu.
- `suite.snapshot` payload'ı için yalnız sentetik tanımlayıcılar içeren, takvim açısından geçersiz `observedAt` fixture'ı eklendi.
- Yeni test, bu fixture'ın `malformed-payload` ile reddedildiğini doğruluyor. Mevcut enum, bilinmeyen/redaction alanı, yetkisiz üretici ve sürüm negatifleri ile tüm geçerli event fixture'ları aynı sözleşme testinde korunuyor.

## Kanıt

TDD kırmızı aşaması:

```text
✖ rejects a calendar-invalid date-time in a documented event payload fixture
Expected: { ok: false, code: 'malformed-payload' }
Actual:   { ok: true, value: ... }
ℹ tests 14
ℹ pass 13
ℹ fail 1
```

Yeşil aşama ve dar paket kapısı:

```text
node --test packages/contracts/test/envelope.test.mjs
ℹ tests 14
ℹ pass 14
ℹ fail 0

node --test packages/contracts/test/*.test.mjs
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

Depo doğrulama kapısı:

```text
> codex-chef@0.5.72 validate
> node scripts/validate-repo.mjs

Validation passed. Checked 422 files.
```

## Değişen dosyalar

- `packages/contracts/src/index.mjs`
- `packages/contracts/test/envelope.test.mjs`
- `packages/contracts/test/fixtures/suite.snapshot.malformed-observed-at.json`
- `docs/agent-results/TASK-MSS4HE239CF88-contracts.md`

## Riskler

- Tarih denetimi yalnız RFC 3339 biçimi içindeki takvim günü geçerliliğini ekler; yeni event türü, yetki veya payload alanı tanımlamaz.
- Gitleaks bu çalışma ortamında bulunmadı. Değişiklikler yalnız sabit doğrulama kodu ve açıkça sentetik fixture içeriyor; gizli veri veya kullanıcı yolu eklenmedi.

## Açık sorular

- Yok.

## Sonraki adım

- Sonuç indeksini yenileyip yalnız bu göreve ait dört dosyayı `dev` üzerinde tek, kapsamı açık bir commit ile kaydetmek.
