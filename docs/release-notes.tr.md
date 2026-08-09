# Sürüm Notları

Bu sayfa kullanıcıların şimdi kurması gereken sürümü anlatır. Eski mühendislik geçmişi [CHANGELOG.md](../CHANGELOG.md) içinde korunur; böylece public sürüm rehberi büyüyen bir arşive dönüşmeden güncel kalır.

## v0.5.67 - 2026-08-10

Codex Chef 0.5.67, bir depoyu otomatik yükleme veya çalıştırma yetkisi vermeden, manuel yönetilen bir GPT Pro Project için eksiksiz ve incelemeye bağlı şekilde hazırlayan yolu ekler.

### Neler Değişti?

- Plugin içinden ve Chef-managed doğrudan skill kurulumu ile kullanılabilen `gptpro` ve `gptpro-handoff` workflow'ları eklendi.
- Taze, secret-safe review snapshot'tan deterministik teslim paketleri üretilir: tek convenience ZIP, subsystem ZIP'leri, adlandırılmış metin bundle'ları ve doğrudan yüklenebilir metin fallback'i.
- Eski kaynak, değiştirilmiş Project talimatı, review-ID yeniden bağlama, ZIP değişikliği, beklenmeyen arşiv, kaynak kaçışı ve güvenilmeyen dönen rapor durumlarında fail-closed davranır.
- İngilizce ve Türkçe GPT Pro context/returned-report istekleri en dar owner'a yönlendirilir; installer, runtime, CLI, paketleme ve dokümantasyon sözleşmeleri uçtan uca doğrulanır.

## v0.5.66 - 2026-08-08

Codex Chef 0.5.66, buyuk yerel Codex rollout gecmisi olan makinelerde rutin Update akisini daha guvenilir hale getirir.

### Neler Degisti?

- Rutin Update icindeki tam CI paketi sinirli bir butunluk kapisiyla degisir; kapsamli installer smoke kontrolleri CI ve release dogrulamasinda kalir.
- Managed profil ve plugin yenilemesi, ilgisiz cok-platformlu fixture senaryolari icin beklemez.
- Hedef MCP ve plugin problari tamamlanirken yavas `codex doctor --json`, gecerli managed refresh'i bloklamak yerine gorunur attention olarak raporlanir.
- Bu slow-doctor yolu icin regression testi eklenir.

## v0.5.65 - 2026-08-08

Codex Chef 0.5.65, normal yetenek setini azaltmadan farkli bilgisayarlardaki guncelleme ve route onerilerini daha guvenilir hale getirir.

### Neler Degisti?

- Update, ilgisiz untracked yerel notlari korur; uzerine yazilabilecek tracked veya staged degisikliklerde ise fail-closed kalir.
- Istege bagli `offline` MCP profili eklenir; balanced, `full` ve `multi-session` varsayilan davranislari degismez.
- Base ve paketli profil soz dizimi kurulu Codex CLI ile dogrulanir; ayni durumlar installer smoke testlerinde de kapsanir.
- Alt-dize route eslesmesi; Turkce karakter normalizasyonu, agirlikli katalog ifadeleri ve tum-kelime terimleri kullanan aciklanabilir mantikla degisir.
- Operator durum panosu, yanlis bir canli saglik iddiasi olmadan capability tier, katalog ve runtime kanitlarini ayri gosterir.

## v0.5.64 - 2026-08-07

Codex Chef 0.5.64, yerel kaynak zaten güncel olsa bile update akışını tamamlar.

### Neler Degisti?

- Uygun sürüm yerel sürümle aynı olduğunda update action artık validation ve managed refresh öncesinde çıkmaz.
- Aynı onaylı akış backup'lı managed refresh ve kurulu runtime doğrulamasıyla tamamlanır.

## v0.5.63 - 2026-08-07

Codex Chef 0.5.63, Gitleaks push taramasında kullanılan CI Git geçmişi
sınırını düzeltir.

### Neler Degisti?

- Validation workflow'u artık tam Git geçmişini çeker; böylece çok commit'li
  push'lar, önceki commit'ten başlayan taramada unknown-revision hatası vermez.

## v0.5.62 - 2026-08-07

Codex Chef 0.5.62, ilgisiz untracked lokal dosyalar varken normal update
akışını tek onaylı çalışmada tamamlar.

### Neler Degisti?

- İlgisiz untracked dosyalar update sırasında korunur; üzerine yazılabilecek
  tracked veya staged worktree değişiklikleri ise hâlâ engellenir.
- Progress bar, kaynak fast-forward, tam validation, backup'lı managed refresh
  ve kurulu runtime doğrulaması aynı akışta kalır.
- Worktree kararı için regression testi eklenir ve repo check zincirine alınır.

## v0.5.61 - 2026-08-07

Codex Chef 0.5.61, tasinabilir profil baslaticisi test fixture'inin Linux
dogrulama yolunu geri yukler.

### Neler Degisti?

- Unix sahte launcher fixture'inda Codex config override'larini Node option
  terminator'undan sonra iletir; boylece GitHub Actions dogrulamasinda `-c`,
  Node `--check` bayragi olarak yorumlanmaz.

## v0.5.60 - 2026-08-07

Codex Chef 0.5.60, yerel connector veya surec kontrol yetkisini genisletmeden
farkli PC'lerdeki runtime yolunu guclendirir.

### Neler Degisti?

- Codebase Memory baslangicini ayrilmis cache ile onarir; full ve multi-session
  MCP durumlari icin allowlist kullanan tasinabilir profil baslaticisi ekler.
- Codebase Memory paketi dogrudan calistirilsa bile prompt-gated sinirini korur;
  beklenmeyen Chef CLI hatalarini ortak redakte hata sozlesmesine yonlendirir.
- Forge edilebilir SessionEnd worker snapshotlarini tek kullanimlik yerel state
  dosyalariyla degistirir; tam kimlik ve owner-chain kontrollerini korur.
- Control-managed routing icin ayri kurulu router skill'i ve etkin Control MCP'yi
  birlikte zorunlu tutar.

### Uyumluluk

- Node.js 18 veya yeni
- Windows PowerShell, macOS, Linux ve WSL
- Kullaniciya ait config, skill, connector ve plugin dosyalari normal prune
  davranisinin disinda kalir.

## v0.5.59 - 2026-07-29

Codex Chef 0.5.59, yetenekleri kaldırmadan gereksiz lokal MCP başlangıçlarını
azaltır; böylece beş veya altı eşzamanlı Codex oturumu daha kontrollü çalışır.
Ayrıca stale MCP ağaçları için sahiplik farkındalıklı denetim ve fail-closed
temizlik yolu ekler.

### Neler Değişti?

- Dengeli ana config'i üç tamamlayıcı MCP'ye indirir:
  `openaiDeveloperDocs`, `context7` ve `serena`. Örtüşen beş lokal stdio
  yardımcısı tanımlı ama kapalı kalır.
- Yetenek ağırlıklı tek ana oturum için `full.config.toml`, düşük süreçli ikincil
  oturumlar için `multi-session.config.toml` ekler. Agent, skill, uzak OpenAI
  docs, built-in memory, hook ve app yüzeyleri kullanılabilir kalır.
- Düz Node/Python sayımı yerine aktif Codex sahibini, mantıksal MCP
  instance'ını, yardımcı ağacı, bekleme süresini, eski sahipsiz adayı ve ilgisiz
  runtime'ı ayıran schema-v2 denetim getirir.
- Ön izleme öncelikli stale cleanup ekler. Durdurmadan hemen önce tam PID,
  oluşturulma zamanı, MCP imzası ve aktif Codex sahibi bulunmadığını yeniden
  doğrular; eksik metadata ve PID yeniden kullanımı fail-closed kalır.
- Trust-gated tek bir plugin `SessionEnd` hook'u ekler. Yalnız biten Codex
  sahibinin MCP alt süreçlerini yakalar, 45 saniye bekler ve sahip zinciri
  kaybolduktan sonra tam eşleşen süreçleri durdurur.
- Yeni sınır için odaklı regresyon testleri, security allowlist'leri,
  installer/package kontrolleri, ADR-003 ve eksiksiz İngilizce/Türkçe operatör
  rehberi ekler.

### Kurulum Veya Güncelleme

İlk kurulum:

```bash
npm run chef -- --install
npm run chef -- --install --apply
```

Mevcut kurulum:

```bash
npm run chef -- --update --plain --no-log
npm run chef -- --update --apply
```

Kurulumdan önce ve sonra durumu dikkate alan ekranları kullan:

```bash
npm run chef -- --skills
npm run chef -- --mcp
npm run chef -- --processes --no-log
npm run chef -- --status --details
```

Ardından Codex'i yeniden başlat, `/hooks` ekranında tam process-hygiene
kaynağını inceleyip güven ve kurulu runtime'ı doğrula:

```bash
npm run verify:install:runtime
npm run codex:status
```

Eşzamanlı çalışmada tek normal veya `full` ana oturum bırak; ikincil pencereleri
şöyle başlat:

```bash
codex --profile multi-session
```

### Uyumluluk

- Node.js 18 veya üzeri
- Windows PowerShell, macOS, Linux ve WSL
- Kullanıcıya ait mevcut skill, MCP, profil tercihi, özel config tablosu ve ilgisiz plugin dosyaları normal prune davranışının dışında kalır
