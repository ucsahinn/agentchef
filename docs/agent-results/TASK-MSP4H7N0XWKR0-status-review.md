# TASK-MSP4H7N0XWKR0 — Status / Doctor davranış incelemesi

## Ne yapıldı

- `codex status` içindeki doktor exit-code sınıflandırması, ambient/hedef MCP karşılaştırması ve iki CLI'nin çalışma dizini davranışı hem kaynak hem de çalıştırılmış komutlarla incelendi.
- Mevcut `scripts/validate-codex-status.mjs` doğrulaması çalıştırıldı.
- Gerçek kurulu Codex CLI ile `doctor --json` ve hem ambient hem açık `CODEX_HOME` hedefinde `mcp list --json` çağrıldı.
- Status ve Doctor, depo dışındaki `%TEMP%` çalışma dizininden mutlak script yolu ile çalıştırıldı.

## Kanıt

```text
> C:\Program Files\nodejs\node.exe scripts/validate-codex-status.mjs
Codex status validation passed.
VALIDATE_STATUS_EXIT=0
```

Kurulu Codex CLI (`0.147.0`) doktoru bir terminal genişliği uyarısı üretti, fakat süreç başarılı bitti:

```text
"overallStatus": "warning"
"terminal.env": { "status": "warning", "summary": "width 33 cols - output may wrap (recommended >=80)" }
DOCTOR_EXIT=0
```

Ambient ve açık hedef aynı profile işaret ediyordu; her iki MCP çağrısı da boş dizi ve 0 exit-code üretti:

```text
TARGET_CODEX_HOME=C:\Users\ulasc\.agentdesk\accounts\...\engines\codex\profile-2
[]
[]
AMBIENT_MCP_EXIT=0
TARGET_MCP_EXIT=0
```

Farklı çalışma dizini testi:

```text
> %TEMP%\ ... node C:\Users\ulasc\Desktop\codex-chef\scripts\codex-status.mjs --json --redact-paths --skip-runtime --skip-codex-doctor-checks --skip-codex-cli
"repo": { "root": "${HOME}\\Desktop\\codex-chef", "packageName": "codex-chef" }
OUTSIDE_STATUS_EXIT=0

> %TEMP%\ ... node C:\Users\ulasc\Desktop\codex-chef\scripts\codex-doctor.mjs --json --redact-paths
"repo": { "root": "${HOME}\\AppData\\Local\\Temp" }
"status": "fail"
OUTSIDE_DOCTOR_EXIT=1
```

## Bulgular

1. Orta — `summarizeCodexDoctor()` `result.status` değerini rapora `exitCode` olarak kaydediyor, ancak kendi `status` değerini yalnızca JSON check sayılarından hesaplıyor. Bu nedenle teorik olarak non-zero exit code + tüm check'ler `ok` kombinasyonu `codexDoctor.status: ok` görünür. Bu kombinasyon için regresyon testi yok. Gerçek CLI örneği uyarı/0 olduğundan bu hatalı kombinasyonu doğrudan üretmedi.
2. Orta — ambient/hedef MCP ilişkisinde yalnız sunucu adları ve login durumu eşitlik için kullanılıyor. Aynı isimli sunucunun `enabled`, `disabled_reason` veya `auth_status` değeri farklıysa `relationshipToTarget: same` kalabilir. Mevcut doğrulama yalnız farklı sunucu adı listesini kapsıyor; etkinlik durumu ayrışmasını kapsamıyor.
3. Yüksek — `codex-status` script konumundan repo kökü hesapladığı için farklı cwd'de doğru depoyu denetler. `codex-doctor` ise `process.cwd()` kullanır; mutlak script çağrısında çağıranın dizinini repo sayar ve yanlış negatifle 1 döner.

## Değişen dosyalar

- `docs/agent-results/TASK-MSP4H7N0XWKR0-status-review.md`

## Riskler

- İnceleme salt-okunur komutlar ve mevcut doğrulama ile sınırlıdır; kullanıcı yapılandırması veya MCP durumu değiştirilmedi.
- Doctor exit-code bulgusu kaynak akışıyla doğrulandı; gerçek kurulu CLI'de non-zero + tüm-check-ok kombinasyonu oluşmadığı için bu özel kombinasyon doğrudan uçtan uca yeniden üretilmedi.
- Çalışma ağacı önceden kirliydi; bu rapor yalnız kendi dosyasını ekler.

## Açık sorular

- Non-zero Codex doctor exit-code, JSON checks başarısız değilse de Status için attention sebebi olmalı mı? Bunun için açık bir sözleşme ve test gerekli.
- Ambient/hedef MCP eşitliği yalnız keşfedilebilirlik (ad listesi) mi, yoksa etkinlik/auth durumu da dahil işlevsel eşitlik mi olmalı?
- `codex-doctor` için dış cwd'den mutlak çalıştırma desteklenen kullanım mı? Destekleniyorsa repo kökü script konumuna sabitlenmeli veya açık `--repo` seçeneği eklenmeli.

## Sonraki adım

Önce exit-code ve MCP eşitliği sözleşmesini karara bağlayın. Ardından `codex-status` için non-zero doctor exit-code ve aynı-ad/farklı-state MCP fixture'ları; `codex-doctor` için dış-cwd regresyon testi ekleyen küçük bir düzeltme hazırlayın.

Kalıcı hafıza değerlendirmesi: yeni bilgi yok; bulgular mevcut kod, canlı salt-okunur tanı çıktıları ve bu sonuç raporunda kaydedilmiştir.
