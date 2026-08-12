# TASK-MSP4H7N0XWKR0 — Bulgular sentezi ve düzeltme planı

## Ne yapıldı

Bağımlı uzman raporlarındaki aday bulgular canlı kaynakla yeniden ankrajlandı. Aynı kök nedene ait maddeler tekilleştirildi; canlı kodda zaten düzeltilmiş, yalnız kapsama/ölçüm açığı olan ve hâlâ uygulanabilir olanlar ayrıldı.

## Kanıt

- `scripts/external-review-cli.mjs:28-29` artık Bearer yanında Basic credential'ı da tarıyor; `:49-54` snapshot kimliğine `bytes` ve `lineCount` ekliyor; `:427-539` unknown-property reddi ve tüm policy alanlarını doğruluyor; `:542-606` kaynak bayt/sha256/lineCount'u yeniden hesaplıyor.
- `scripts/chef-cli.mjs:2905-2916` backup delete işlemini `backup-delete` operation lock ile sarıyor; `scripts/lib/operation-lock.mjs:41-44` operation'ı `mkdirSync` öncesinde doğruluyor.
- `scripts/codex-status.mjs:753-785` MCP etkinlik, disabledReason ve authStatus durumlarını karşılaştırıyor; `:1036-1043` non-zero doctor exit'ini attention yapıyor. `scripts/codex-doctor.mjs:11-12` repo kökünü script dizininden türetiyor.
- `docs/security-model.md:291-300` ve `docs/security-model.tr.md:283-292`, update sonrası fresh preview + aynı onaylı oturumda devam sözleşmesinde güncel kodla uyumlu.
- `docs/process-hygiene.tr.md:17-18`, İngilizce eşindeki (`docs/process-hygiene.md:19-20`) tersine, multi-session profilinin yedi yerel stdio MCP'nin tamamını kapattığını söylüyor. Canlı `docs/mcp-catalog.tr.md:40-43` ve İngilizce metin Serena bridge'inin açık kaldığını açıkça belirtiyor.
- Hedefli birleşik test komutu `node --test scripts/tests/external-review.test.mjs scripts/tests/operation-lock.test.mjs; node scripts/validate-codex-status.mjs; node scripts/validate-chef-cli.mjs` 120 saniyeyi aşınca sonlandırıldı; sonuç çıktısı alınmadı. Bu nedenle tam suite için "passed" iddiası yapılmadı.

## Normalize edilmiş bulgular

| ID | Karar | Şiddet / güven | Kök neden | Canlı durum |
| --- | --- | --- | --- | --- |
| ER-01 | kapatıldı (duplicate) | high / high | External-review manifest ve satır kimliğinin eksik doğrulanması | Kod ve regresyon test adları mevcut; temiz koşuda tam suite tekrar kanıtlanmalı. |
| ER-02 | kapatıldı (duplicate) | medium / high | Basic/Proxy-Authorization secret tarama boşluğu | Basic desen ve testler mevcut. |
| LOCK-01 | kapatıldı | high / high | Backup delete'ın operation lock atlaması | `backup-delete` lock'u mevcut. |
| LOCK-02 | kapatıldı | low / high | Geçersiz operation öncesi root oluşturma | Girdi doğrulaması `mkdirSync` öncesinde. |
| STATUS-01 | kapatıldı | high / high | Doctor non-zero exit'inin yanlış başarı olması | `exitIssue` attention'a dahil. |
| STATUS-02 | kapatıldı | medium / high | MCP eşitliğinin durum alanlarını atlaması | state alanları karşılaştırılıyor. |
| DOCTOR-01 | kapatıldı | high / high | Doctor'ın cwd'yi repo kökü sayması | script-temelli root mevcut. |
| UPDATE-01 | kapatıldı | medium / high | Security model / update akışı sözleşme sapması | EN/TR belge ve kod aynı davranışı ifade ediyor. |
| DOC-01 | kabul | medium / high | TR process-hygiene çevirisi stale | Hâlâ canlı metin çelişkisi. |
| LOCK-03 | needs-decision | medium / medium | owner kontrolü ile recursive lock silme arasındaki yerel TOCTOU | Reprodüksiyon monkey-patched silme penceresine dayanıyor; aynı kullanıcı/manual stale-lock müdahalesi tehdit modelinde net değil. |
| PERF-01 | P3 kapsam açığı | medium / medium | Windows gerçek PTY ve fallback p95 bütçesi yok | Doğruluk hatası kanıtlanmadı. |
| REPORT-01 | P3 bakım borcu | low / high | Üç eski sonuç raporu altı zorunlu bölümü taşımıyor | Yayınlanan denetim kanıtının standardizasyonu eksik. |

## Düzeltme planı

### P0 — doğrulama kapısını tamamla (tek commit yok; yalnız kanıt)

**Amaç:** ER-01/ER-02 ve LOCK-01/LOCK-02'nin zaten uygulanmış düzeltmeler olduğunu temiz, bağımsız kanıtla kapatmak.

1. Kirli worktree'den etkilenmeyen bir doğrulama ortamında sırayla çalıştır: `node --test scripts/tests/external-review.test.mjs`, `node --test scripts/tests/operation-lock.test.mjs`, `node scripts/validate-external-review.mjs`, `node scripts/validate-chef-cli.mjs`, `node scripts/validate-codex-status.mjs`.
2. Her komutun exit code ve gerçek özetini sonuç raporuna kaydet; zaman aşımı olursa kapıyı "unverified" bırak, testi gevşetme veya atlama.
3. **DO NOT:** external-review bundle/handoff'u ağda paylaşma; gerçek credential, auth dosyası veya kullanıcı global runtime'ına apply yapma.

**DoD:** Tüm beş kapı exit 0; Basic, lineCount, unknown manifest property, backup-delete lock ve invalid-operation testleri görünür biçimde geçer.

### P1 — Türkçe multi-session doküman parity'si (tek küçük docs commit)

**Dosyalar:** `docs/process-hygiene.tr.md`, gerekiyorsa yalnız ilgili EN/TR doğrulayıcı testi veya yeni dar semantik assertion.

1. `docs/process-hygiene.tr.md:17-18` metnini, `multi-session` profilinin Serena bridge'ini açık tuttuğunu ve diğer altı eager local stdio MCP'yi kapattığını söyleyecek şekilde düzelt.
2. Katalogdaki güncel gerçeği referans al: `catalog/mcp-servers.json`, `templates/codex/config.windows.toml`, `templates/codex/config.unix.toml`, `docs/mcp-catalog.md:40-43`.
3. Yapısal locale kontrolünün kaçırdığı bu sınıf için küçük, deterministik bir assertion ekle: varsayılan enabled sunucuların ad/durumları ve multi-session Serena davranışı katalog/şablon metniyle çelişmemeli.

**Kapılar:** `npm run validate:mcp`, ilgili yeni/dar test, `npm run validate:docs`, `npm run validate:doc-locales`, `npm run validate`.

**DO NOT:** tarihsel `docs/release-notes.*` kaydını güncel-tense metne dönüştürme; Context7'yi varsayılan açık gösterme; MCP'leri etkinleştirme.

**DoD:** TR ve EN açıklama aynı runtime davranışını anlatır; Context7 kapalı, `openaiDeveloperDocs` ve Serena dengeli varsayılan olarak kalır; yeni semantic test stale çeviriyi yakalar.

### P2 — LOCK-03 için tehdit modeli kararı, sonra ayrı hardening commit'i

**Karar gerekli:** Aynı kullanıcının manuel stale-lock recovery/path replacement işlemi, aktif bir Codex Chef operasyonuna karşı güvenlik sınırı mıdır?

- **Hayır:** Bulgu kabul edilmez; `operation-lock` best-effort karşılıklı dışlama olarak belgelenir ve bu dosya değişmez.
- **Evet:** Önce tasarım spike'ı yapılır. Release işlemi owner doğrulaması ile silmeyi tek dosya sistemi nesnesine bağlamalı; yeni owner lock'unu path üzerinden recursive silmeye dayanan bir akışla kaldırmamalı. Windows/Unix semantiklerini kapsayan test tasarımı onaylanmadan kod değişikliği yapılmaz.

**DO NOT:** `rmSync(... recursive)` çağrısını retry/ignore ile maskeleme, stale lock'ları otomatik silme, lock kapsamını per-home sınırının dışına genişletme.

**DoD (karar sonrası):** Seçilen tehdit modeli belgelenir; kabul edilirse deterministic replacement regresyonu yeni owner lock'unun korunduğunu ispatlar; reddedilirse gerekçe ve sınır dokümante edilir.

### P3 — kapsam ve bakım borcu (bağımsız commitler)

1. Windows CI/ayrı runner'da gerçek PTY smoke ekleme spike'ı: `readline` başlangıcı, dil değişimi, geri/iptal ve menü gezintisi. Sentetik pipe transcript yerine gerçek TTY kanıtı gerekir.
2. Process hygiene fallback için normal ve fallback yollarına p95 bütçesi/telemetri tasarla; önce baseline, sonra yalnız bütçe aşımı varsa optimizasyon.
3. `TASK-MSP4DGPQNCA07-probe.md`, `TASK-MSP4DJ0KROJR4-pack.md`, `TASK-MSP4DJ71STG6E-qa-performance.md` eski raporlarını altı zorunlu başlık ve boş olmayan somut Kanıt bölümüyle standardize et.

## Riskler

- Çalışma ağacı önceden kirli ve hedefli birleşik suite zaman aşımına uğradı; plan yalnız kaynakta yeniden ankrajlanmış durumları "kapatıldı" sayar, tam regresyonu değil.
- LOCK-03 için yanlış bir otomatik düzeltme backup/restore karşılıklı dışlama davranışını zayıflatabilir; bu yüzden ürün/threat-model kararı P2 ön koşuludur.

## Açık sorular

- LOCK-03, desteklenen yerel saldırgan/manual-recovery tehdit modelinin içinde mi?
- P3 Windows PTY smoke için kullanılacak runner/simülasyon ortamı hangisi?

## Sonraki adım

P0 kanıt kapılarını temiz doğrulama ortamında tamamlayın; ardından yalnız P1 doküman parity commit'ini yapın. P2'ye geçmeden önce lock tehdit modeli kararını alın.
