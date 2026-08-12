# TASK-MSP59ZML2N3ES — Lock ve status bulgularını yeniden üretme

## Ne yapıldı

- `operation-lock` geçersiz operation girdisinin dizin yan etkisi, repo dışı geçici fixture ile canlı Node çağrısında yeniden üretildi.
- Lock bırakma TOCTOU adayı canlı kod yolunda incelendi; kontrol ile silme arasındaki senkron bariyer/enjeksiyon yüzeyi olmadığı için deterministik bir repro kurulamadı.
- Non-zero `codex doctor --json` sonucu, kontrollü dış fixture ile gerçek child process üzerinden yeniden üretildi.

## Kanıt

Geçici dizindeki gerçek lock çağrısı:

```json
{"error":"TypeError: operation must be a non-empty string.","rootExists":true}
```

Bu, `scripts/lib/operation-lock.mjs:43` içindeki `mkdirSync` çağrısının `operation` doğrulamasından (`:47`) önce çalıştığını doğrular. Sınıflandırma: **accept**.

TOCTOU adayında `releaseOperationLock()` sahipliği `scripts/lib/operation-lock.mjs:32-35` arasında okur ve `:37`'de recursive siler. Ancak public API senkron olduğundan bu iki adımda başka süreci deterministik biçimde yerleştirecek bariyer yoktur. Erişilebilir canlı repro üretilemedi. Sınıflandırma: **needs-decision** (teorik yarış mevcut; güven orta/düşük, önce test seam'i ya da atomik protokol kararı gerekir).

Sahte `codex.cmd`, `doctor --json` için bir `ok` check JSON'u ve exit code `7` döndürdü. Gerçek status çıktısındaki ilgili değerler:

```json
{"status":"attention","doctorStatus":"ok","doctorExitCode":7,"doctorFail":0,"doctorWarnings":0}
```

Genel `attention` yalnız kirli Git çalışma ağacından kaynaklandı; `codexDoctor.status` yanlış biçimde `ok` kaldı. Bu `scripts/codex-status.mjs:1028-1031` kapsamındaki exit-code ihmalini doğrular. Sınıflandırma: **accept**.

İlgili kontroller:

```text
node --test scripts/tests/operation-lock.test.mjs
tests 3
pass 3
fail 0

node scripts/validate-codex-status.mjs
Codex status validation passed.
```

## Değişen dosyalar

- Bu sonuç raporu ve sonuç indeksi. Ürün kodu, testler, config ve repo verisi değiştirilmedi.

## Riskler

- Kabul edilen iki bulgu kullanıcıya yanlış sağlık sinyali veya geçersiz girdide kalıcı yan etki verebilir.
- TOCTOU bulgusu canlı, deterministik repro olmadan doğrudan fix önceliğine çevrilmemeli.

## Açık sorular

- TOCTOU için küçük, test-only bir dosya sistemi adaptörü mü, yoksa atomik release protokolü mü hedeflenmeli?

## Sonraki adım

- Ayrı bir fix görevinde iki kabul edilmiş bulgu için önce başarısız regresyon testi yazın; TOCTOU yalnız karar alındıktan sonra ele alınsın.
