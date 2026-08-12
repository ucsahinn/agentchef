# TASK-MSP4DJ0KROJR4 — Güvenlik ve veri bütünlüğü denetimi

## Ne yapıldı

- Kurulum/repair/update hedefleri, yedek-journal, MCP varsayımları, Windows Brain ACL sorgusu, external-review ve süreç temizliği güven sınırları incelendi.
- Yol geçişi/reparse, keyfi üzerine yazma, shell çağrısı, yetki ayrımı, secret tarama ve manifest bütünlüğü yüzeyleri kaynakta izlendi.
- Önceki izole external-review fixture çalışmasının iki canlı bulgusu yeniden sınıflandırıldı: Basic `Authorization` değeri tarayıcıdan kaçıyor; `lineCount` manifest kimliğine bağlanmadığı için değiştirilmiş rapor doğrulanabiliyor.

## Kanıt

### Doğrulanan bulgular

| Kimlik | Karar | Şiddet / güven | Kanıt |
| --- | --- | --- | --- |
| SEC-ER-01 | accept | yüksek / yüksek | `TASK-MSP59ZQ1G29HQ-sss.md` içindeki izole fixture’da aynı bundle için manifest `lineCount=999` ve raporda 999. satır, `review verify` akışından `verified: true` döndü. `reviewId` ve snapshot hash eşleşse de satır numarasının kaynak snapshotla kriptografik bağı yok. |
| SEC-ER-02 | accept | orta / yüksek | Aynı izole fixture’da redacted sentetik `Authorization: Basic …` girişi `review pack` taramasından çıkış kodu 0 ile geçti (`NOT_DETECTED`); Bearer kontrolü ise `SECRET_DETECTED`, çıkış kodu 1 verdi. Gerçek sır değeri kullanılmadı veya raporlanmadı. |

`node --test scripts/tests/operation-lock.test.mjs scripts/tests/operation-journal.test.mjs` gerçek çıktı:

```text
✔ operation journal durably records a completed backup before mutation
✔ journal CLI records directory backups and closes only once
✔ journal rollback restores only a target still matching the transaction output
✔ journal track-tree records source-owned files without recording directory extras
✔ operation lock rejects a second acquisition for the same root
✔ operation locks for distinct roots do not contend
✔ operation lock release removes only the lock it owns
ℹ pass 7
ℹ fail 0
```

Kaynak kanıtları:

- `scripts/lib/managed-path-safety.mjs`: yönetilen kökün içinde olma, mevcut segmentlerde link/dizin türü ve canonical path denetimleri; installer ve runtime verifier bunu çağırıyor.
- `scripts/lib/operation-journal.mjs`: backup/çıktı ağaçlarında symlink reddi, tamamlanmış çıktıyla fingerprint eşleşmeden rollback yapmama.
- `scripts/lib/brain-permissions-windows.mjs`: mutlak `powershell.exe`, `shell: false`, temizlenmiş ortam ve stdin ile ACL sorgusu.
- `plugins/codex-chef-workflows/scripts/codex-process-hygiene.mjs`: temizleme planı PID ile birlikte `createdAt` kimliği ve aktif Codex sahibi bakımından yeniden doğrulanıyor; salt ad eşleşmesiyle temizleme yapılmıyor.
- `catalog/mcp-servers.json` ve `scripts/validate-mcp-config.mjs`: varsayılan profilde yalnız loopback Serena etkin, yüksek/kritik servisler prompt-gated veya devre dışı; Windows `npx` launcher notu ve `NoDefaultCurrentDirectoryInExePath` koruması mevcut.

Çalıştırılması denenen geniş kapılar:

```text
node --test scripts/tests/process-hygiene.test.mjs; node --test scripts/tests/external-review.test.mjs
Exit code: 124
command timed out after 64037 milliseconds
```

Bu zaman aşımında test çıktısı alınmadı; dolayısıyla bu iki pakete bu görev için “geçti” denmemiştir. Önceki izole çalışmada `scripts/tests/external-review.test.mjs` 22/22 geçmişti; bu rapor onu tarihsel/ayrı kanıt olarak kullanır.

## Değişen dosyalar

- `docs/agent-results/TASK-MSP4DJ0KROJR4-sss.md` — bu denetim raporu.
- `docs/agent-results/INDEX.md` — sonuç indeksi, sonraki adımda yenilenecek.

## Riskler

- **SEC-ER-01:** İnceleme sonucu satır referansları manifest içindeki saldırgan tarafından değiştirilebilir `lineCount` üzerinden yanlış bağlamla doğrulanabilir. İnceleyene yanlış satır/kanıt ilişkisi sunma riski vardır.
- **SEC-ER-02:** Basic kimlik bilgisi biçimindeki değerler pack preview’de secret filtresinden kaçabilir. Dış inceleme paketine gizli bilgi girme riski taşır.
- Geniş süreç/external-review testleri host yoğunluğu nedeniyle bu koşuda yürütülemedi; yalnız statik korumalar ve dar veri-bütünlüğü testleri kanıtlanmıştır.

## Açık sorular

- `lineCount` için doğrulama sözleşmesi ayrı bir imzalı kaynak konumu/line hash mi kullanmalı, yoksa report satır numarası tamamen snapshot içeriğinden mi türetilmeli? Bu ürün kararı gerektirir.
- Basic şeması yalnız `Authorization` başlığında mı, yoksa URI kullanıcı bilgisi ve yaygın yapılandırma anahtarlarında da mı engellenmeli? Kapsam kararı gerektirir; filtre gevşetilmemelidir.

## Sonraki adım

1. SEC-ER-01 ve SEC-ER-02 için küçük, fail-closed regresyon testleriyle düzeltme görevi açın.
2. Host süreç yoğunluğu giderildiğinde `node --test scripts/tests/process-hygiene.test.mjs` ve `node --test scripts/tests/external-review.test.mjs` kapılarını tekrar çalıştırın.
3. Düzeltmeden sonra `npm run audit:security`, approval/MCP/repair validatorleri ve `npm run validate` ile tam regresyon geçidi uygulayın.
