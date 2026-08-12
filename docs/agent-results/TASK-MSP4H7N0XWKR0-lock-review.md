# TASK-MSP4H7N0XWKR0 — Backup delete lock ve invalid-operation root yan etkisi doğrulaması

## Ne yapıldı

- Backup-delete akışının güncel implementasyonu kaynakta ve gerçek CLI child-process fixture'ında doğrulandı.
- Boş `operation` girdisinin operation-lock API'sinde hiçbir kök dizini oluşturmadan reddedildiği gerçek fixture'la doğrulandı.
- İlgili dar regresyon test paketi çalıştırıldı.

## Kanıt

### Backup delete lock — geçti

`scripts/chef-cli.mjs:2908` içinde `deleteBackupArchive()` artık `acquireOperationLock({ root: codexHome(), operation: "backup-delete" })` alıyor ve `finally` bloğunda bırakıyor. Aktif bir `hold` kilidi altında, gerçek CLI child process çıktısı:

```json
{"exit":1,"archiveExists":true,"lockStillExists":true,"error":false}
```

Çıkış kodu `1`, arşivin mevcut kalması ve önceden var olan lock'un korunması; delete apply işleminin fail-closed davrandığını kanıtlar. `scripts/validate-chef-cli.mjs:1047-1064` ayrıca aktif lock altında delete'ın başarısız olması ve arşivin korunması için kalıcı smoke assertion ekler.

### Invalid operation root yan etkisi — geçti

`scripts/lib/operation-lock.mjs:43` artık `operation` değerini `mkdirSync()` öncesinde `requireText()` ile doğrular. Gerçek API fixture çıktısı:

```json
{"error":"TypeError: operation must be a non-empty string.","rootExists":false}
```

Bu, geçersiz operation değerinin hatayla reddedildiğini ve istenen kök dizininin oluşturulmadığını kanıtlar.

Dar regresyon kapısı gerçek çıktı:

```text
✔ operation lock rejects a second acquisition for the same root
✔ operation locks for distinct roots do not contend
✔ operation lock release removes only the lock it owns
✔ invalid operation is rejected before creating the requested root
ℹ pass 4
ℹ fail 0
```

`node scripts/validate-chef-cli.mjs` geniş smoke seti Node yolu görünür hâle getirildikten sonra 124 saniye komut sınırında zaman aşımına uğradı. Hedef davranış için fail-closed fixture ve dar testler geçti; geniş kapı bu görevde **unverified** olarak sınıflandırıldı.

## Değişen dosyalar

- `docs/agent-results/TASK-MSP4H7N0XWKR0-lock-review.md` — bu doğrulama raporu.
- `docs/agent-results/INDEX.md` — sonuç indeksi.
- `.agentspace/memory/shared/operation-lock-mutation-guard-gaps.md` — tekrar testte kullanılacak kalıcı koruma bilgisi.
- `.agentspace/memory/shared/MEMORY.md` — bellek işaretçisi.

## Riskler

- Geniş CLI smoke seti bu çalışmada zaman aşımına uğradı; diğer CLI yüzeyleri için tam regresyon kanıtı yoktur.
- Bu doğrulama yalnızca geçici fixture kullanır; gerçek kullanıcı backup arşivine dokunulmadı.

## Açık sorular

- Yok.

## Sonraki adım

- Daha uzun süreli doğrulama ortamında `npm run validate:chef-cli` ve ardından `npm run validate` çalıştırın.
