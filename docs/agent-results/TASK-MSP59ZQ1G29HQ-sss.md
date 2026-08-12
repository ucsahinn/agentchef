# TASK-MSP59ZQ1G29HQ — External review güvenlik bulguları yeniden üretimi

## Ne yapıldı

External-review pack/verify güvenlik adayları kaynak, tam test paketi ve repo dışı geçici Git fixture’larında gerçek CLI ile yeniden üretildi. Repo kaynak, test, şema veya güvenlik filtresi değiştirilmedi.

| Aday | Karar | Severity | Confidence | Sonuç |
| --- | --- | --- | --- | --- |
| Mevcut repo `SECRET_DETECTED` / test fixture false-positive | Needs-decision | Low | Medium | Bu checkout’ta pack, secret taramasına ulaşmadan `MISSING_SOURCE_PATH` ile fail-closed oldu; eski olay doğrudan yeniden üretilemedi. Sentetik Bearer fixture ise `SECRET_DETECTED` ile doğru reddedildi. |
| Basic Authorization kapsamı | Accept | Medium | High | Sentetik, gerçek olmayan Basic authorization fixture’ı pack preview’dan exit `0` ile geçti; eşdeğer Bearer fixture exit `1` / `SECRET_DETECTED` verdi. |
| Eksik `reviewId` | Discard | Info | High | Gerçek `chef review verify` exit `1` verdi; rapor kabul edilmedi. |
| Değiştirilmiş `lineCount` metadata | Accept | High | High | Aynı dış bundle dizinindeki manifestte lineCount şişirildiğinde, dosyada olmayan satıra referanslı report `verified=true`, exit `0` döndü. |

## Kanıt

Zorunlu test:

```text
node --test scripts/tests/external-review.test.mjs
tests 22; pass 22; fail 0
```

Gerçek mevcut-repo pack preview (değerler yazdırılmadı):

```text
PACK_PREVIEW_EXIT=1
code=MISSING_SOURCE_PATH
```

Bu, `SECRET_DETECTED` adayını reddetmez; yalnız çalışma ağacındaki izlenen bir kaynağın eksikliği nedeniyle tarama sırasının daha erken kesildiğini gösterir. Bu koşulda secret sonucu varsayılmadı.

Repo dışı geçici Git fixture sonuçları:

```text
SYNTHETIC_BEARER_PACK_EXIT=1
SYNTHETIC_BEARER_CLASS=SECRET_DETECTED
SYNTHETIC_BASIC_PACK_EXIT=0
SYNTHETIC_BASIC_CLASS=NOT_DETECTED

MISSING_REVIEW_ID_VERIFY_EXIT=1
MISSING_REVIEW_ID_REJECTED=true

SAME_BUNDLE_TAMPERED_LINECOUNT_VERIFY_EXIT=0
SAME_BUNDLE_TAMPERED_LINECOUNT_VERIFIED=true
SAME_BUNDLE_REPORT_FAILURES=0
SAME_BUNDLE_FRESH=true
SAME_BUNDLE_INTEGRITY=true
```

Gerçek kullanıcı giriş noktası (`chef review`) fixture kanıtı:

```text
CHEF_REVIEW_PACK_EXIT=0
CHEF_REVIEW_PACK_NO_UPLOAD=true
CHEF_REVIEW_MISSING_ID_VERIFY_EXIT=1
CHEF_REVIEW_MISSING_ID_REJECTED=true
```

Kaynak bağlamı:

- `scripts/external-review-cli.mjs`: Bearer credential için özel secret pattern var; Basic için eşdeğer özel pattern yok.
- Aynı dosyada `validateReport`, `reviewId` eşleşmesini zorunlu kılıyor.
- `snapshotContentSha256`, yalnız dosya yolu ve SHA-256’dan oluşuyor; `lineCount` bu kimliğe dahil değil.
- `validateReport`, finding satır sınırını manifestteki `lineCount` alanına göre kontrol ediyor.

## Değişen dosyalar

- `docs/agent-results/TASK-MSP59ZQ1G29HQ-sss.md` — kanıt, sınıflandırma ve takip önerileri.
- `.agentspace/memory/agents/sss/external-review-fixture-isolation.md` ve `MEMORY.md` — kalıcı QA gotcha notu; repo kaynağına dahil edilmez.

## Riskler

- Basic açığı gerçek bir credential sızıntısı kanıtlamaz; pack sınırında Basic authorization biçimli sertifikaların kaçırılabildiğini kanıtlar. Filtre gevşetilmemeli, Basic kapsamı dar bir ek pattern ve negatif/pozitif fixture ile eklenmelidir.
- LineCount açığı, manifest bulunduğu yerde değiştirilebiliyorsa dış raporun gerçek olmayan satır kanıtıyla `verified` sayılmasına izin verir. Bu güvenlik/integrity bulgusudur; verified sonucu bulgunun doğruluğunu zaten ispatlamaz.
- Mevcut repo pack preview’ındaki `MISSING_SOURCE_PATH`, external-review akışını bloklar ve bağımsız bir operasyonel bütünlük sorunudur. Eksik tracked kaynağın sahibi tarafından çözülmeden eski SECRET event’i tekrar sınıflandırılmamalı.

## Açık sorular

- Manifest dış bundle dizininde hangi tarafların yazma yetkisi vardır? Aynı kullanıcı/CI dışı bir saldırgan yazabiliyorsa lineCount bulgusunun önceliği yüksektir; yalnız kısa ömürlü, erişim kontrollü yerel dizinse etkisi daha düşüktür.
- Basic tespiti için hangi minimum credential uzunluğu ve whitespace/tab varyantları desteklenmeli? Tasarım, docs örneklerini veya test fixture’larını yanlışlıkla bloklamamalıdır.
- `MISSING_SOURCE_PATH` oluşturan tracked dosya, eşzamanlı çalışma ağacındaki silme/rename mi yoksa kalıcı repository drift’i mi? Önce salt-okunur Git durum kanıtıyla atanmalıdır.

## Sonraki adım

1. Basic authorization için fail-closed scanner pattern’i ve parçalı oluşturulmuş test fixture ekleyin; mevcut Bearer/generic assignment korumalarını gevşetmeyin.
2. `lineCount`/bytes/part metadata’sını canonical snapshot kimliğine bağlayın veya bundle içeriğinden yeniden türetin; aynı-bundle tamper regression testi ekleyin.
3. Eksik tracked source’u restore/commit kararına göre düzeltin; ardından mevcut repo pack preview’ını tekrar çalıştırıp `SECRET_DETECTED` olayını kesin accept/discard olarak sınıflandırın.
