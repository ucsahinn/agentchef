# Sürüm Notları

Bu sayfa kullanıcıların şimdi kurması gereken sürümü anlatır. Eski mühendislik geçmişi [CHANGELOG.md](../CHANGELOG.md) ve [CHANGELOG-0.5.md](../CHANGELOG-0.5.md) içinde korunur; böylece public sürüm rehberi büyüyen bir arşive dönüşmeden güncel kalır.

## v1.0.0 - yayınlanmadı

AgentChef 1.0.0 yeniden adlandırmayı tamamlar: installer'ın yazdığı her şey
artık `agentchef` yazımını taşır ve mevcut bir home tek bir açık komutla göç
eder. Onu çalıştırana kadar her okuyucu 1.0.0 öncesi `codex-chef` adlarını
kabul etmeye devam eder; güncelleme günü hiçbir şey bozulmaz.

### Neler Değişti?

- İşaretçiler, günlük, kilit, yedek önekleri, şema stringleri, plugin klasörü,
  operator skill'i, marketplace adı, plugin id'si, hook banner'ı ve ortam
  değişkenleri yeniden adlandırıldı; bkz. [güncelleme rehberi](upgrade.tr.md).
- `npm run chef -- --migrate-identity --target both` dönüşümü ön izler;
  `--apply` ile `CODEX_HOME/backups/agentchef-migrate-*` altına yedek alarak
  çalıştırır.
- Claude hedefi MCP girdilerini artık Claude Code'un okuduğu dosyaya
  birleştirir: `~/.claude.json`, ya da yalnızca değişken ayarlıysa
  `$CLAUDE_CONFIG_DIR/.claude.json`. 0.9.0 bunun yerine
  `~/.claude/.claude.json` yazıyordu; bu dosya makinende varsa
  [güncelleme rehberine](upgrade.tr.md) bak.
- Skill bağlantıları yalnızca hâlâ katalogda olan skill'leri kapsar;
  katalogdan çıkmış yönetilen bir dizin (örneğin emekli `codex-chef-brain`)
  `retired` olarak raporlanır ve dokunulmaz.

### Ürün Sınırı

Göç yalnızca bilinen bir eski yazım taşıyan dosyalara dokunur. Kullanıcı
içeriği, yabancı skill'ler, eski yedek klasörleri, `config.toml` blokları ve
Beyin verisi asla yeniden yazılmaz; eski ortam değişkenleri raporlanır,
değiştirilmez.

## v0.9.0 - 2026-09-18

AgentChef 0.9.0, OpenAI Codex CLI'nin yanına ikinci kurulum hedefi olarak
Claude Code'u ekler. Mevcut Codex kurulumları varsayılan olarak etkilenmez:
Codex hedefi varsayılan kalır; Claude Code hedefi yalnızca açık bir
`--target claude` ya da `--target both` veya etkileşimli onayın ardından
yönetilir.

### Neler Değişti?

- Tek katalog, iki hedef. Her kurulum işlemi hedefini adlandırır (`codex`,
  `claude` veya `shared`); yönetilen skill ağacı, plugin kaynak ağacı, Git
  guard'ları ve curated skill'ler gibi paylaşılan işlemler bir kez koşar.
- Claude Code yüzeyi tek bir transaction yardımcısıyla kurulur: `AGENTS.md`
  ile aynı çalışma sözleşmesinden üretilen kullanıcı seviyesi kural dosyası,
  yan makbuzlarla kaydedilen eklemeli `settings.json` izin kuralları ve
  `.claude.json` MCP girdileri, yönetilen `~/.agents/skills` ağacına skill
  bağlantıları, Claude plugin marketplace'i, ad-alanlı 32 `agentchef:<rol>`
  subagent'ı ve `claude plugin` CLI üzerinden plugin kaydı. Bkz.
  [Claude Code yüzeyleri](claude-surfaces.tr.md) ve
  [hedef yetenek haritası](target-capability-map.tr.md).
- `npm run chef -- --remove --target <t>`, iki hedefte de yalnızca AgentChef'e
  ait dosyaları, bağlantıları, marketplace girdilerini ve makbuza kayıtlı
  ayarları kaldırır.
- `verify-install-runtime`, `codex:status` ve `codex:doctor` Claude hedefini
  doğrular (`--target claude|both`); durum ekranı, ayrı hafıza motoru
  kuruluysa salt-okunur Beyin özet satırını da aktarır.
- Oturum sonu süreç hijyeni hook'u bu sürümde yalnızca Codex'te kalır.

### Ürün Sınırı

Diskteki kimlik hâlâ `codex-chef` önekidir (plugin id'si, sahiplik
işaretçileri, marketplace kökü, yedek klasörleri, şema stringleri, ortam
değişkenleri); önce-ön-izle kimlik göçü 1.0.0 ile gelir. AgentChef
`~/.claude/CLAUDE.md`, `~/.claude/agents/`, OAuth durumu veya `.claude.json`
içinde `mcpServers` dışındaki hiçbir anahtarı düzenlemez ve Claude'un plugin
önbelleğini asla elle yazmaz. 0.6.0'dan 0.9.0'a notlar için
[güncelleme rehberine](upgrade.tr.md) bakın.

## v0.6.0 - 2026-09-18

AgentChef 0.6.0, yeni adla çıkan ilk sürümdür. Yerleşik Brain workflow'unu
emekli eder, Kitchen dönemi kalıntılarını kaldırır ve projenin görünür
kimliğini yeniden adlandırır; installer hâlâ yalnızca Codex CLI yüzeyini
yönetir.

### Neler Değişti?

- Yerleşik Markdown Brain workflow'u kaldırıldı. Kalıcı hafıza ayrı
  `dual-agent-brain` motorunun işidir; mevcut vault'lara asla dokunulmaz.
  Bkz. [Brain emekliliği](brain-retirement.tr.md).
- `packages/contracts`, Chef modül manifesti, `docs/enterprise-v3` ve izlenen
  agent-result raporları kaldırıldı; ADR-002, ADR-004 ve ADR-005'in yerini
  [ADR-006](decisions/006-agentchef-independent-dual-target-product.md) aldı.
- README ve dokümantasyon yalnızca İngilizce ve Türkçe; Almanca, İspanyolca,
  Fransızca ve Brezilya Portekizcesi özetleri kaldırıldı.
- Node.js 22.12 veya üzeri gerekir; CI taşınabilirlik matrisi Node 22 ve 24
  ile koşar.
- Gerçek kurulumlar daha hızlı: dizin senkronları her hedefi tek yardımcı
  süreçle doğrular; testlerdeki alt süreç zaman aşımları yavaş makinelerde
  `CODEX_CHEF_TEST_TIMEOUT_SCALE` ile ölçeklenebilir.

### Ürün Sınırı

Installer, Codex CLI yüzeyini (`~/.codex`, `~/.agents`) tam olarak 0.5.74'teki
gibi yönetir. Diskteki kimlik değişmedi: plugin id'si, sahiplik işaretçileri,
marketplace kökü, yedek klasörü adları, şema stringleri, ortam değişkenleri ve
Git hook banner'ı hâlâ `codex-chef` önekini kullanır; göç gerekmez. Claude
Code kurulum hedefi bir sonraki sürüm hattındadır (0.9.0); kimlik yeniden
adlandırması özel, önce-ön-izle bir göç komutuyla 1.0.0'da çıkar. 0.5.74'ten
0.6.0'a notlar için [güncelleme rehberine](upgrade.tr.md) bakın.

## v0.5.74 - 2026-08-14

Codex Chef 0.5.74, yalnızca Codex hedefleyen son bağımsız sürümdür. Bağımsız
kurulum sözleşmesini korurken, bu sözleşmeyi her desteklenen CI hostunda
kanıtlamak için gereken platformlar arası test fixture'larını düzeltir.

### Neler Değişti?

- Platformlar arası fixture'larda POSIX geçici home'lara Windows yol kuralları
  uygulamak yerine, çalışan hostun repair sözleşmesini kullanır.
- Tam yönetilen durum assertion'ından önce Unix Git-hook fixture'ını
  çalıştırılabilir yapar ve Windows ACL denetiminin desteklenmediği
  platformlardaki belgelenmiş unavailable Brain-health projeksiyonunu kabul
  eder.

### Ürün Sınırı

Bu sürüm bağımsız kurulabilir ve bu repoda belgelenen uyumluluk taahhütlerini
taşır. Kitchen'ı **kurmaz**; global Codex, Agents, Git, oturum, credential veya
cache durumunu hiçbir yere taşımaz.

Bu sürümden sonraki yön
[ADR-006](decisions/006-agentchef-independent-dual-target-product.md) içinde
kayıtlıdır: proje bağımsız bir ürün olarak devam eder, Kitchen'a katılmaz,
yerleşik Brain workflow'u ayrı `dual-agent-brain` motoru lehine emekli edilir
(bkz. [Brain emekliliği](brain-retirement.tr.md)) ve bir sonraki sürüm hattı
Claude Code'u ikinci kurulum hedefi olarak ekler. Aksini söyleyen bir sürüm
yayınlanana kadar installer yalnızca Codex'i hedefler.
