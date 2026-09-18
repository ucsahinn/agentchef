# Sürüm Notları

Bu sayfa kullanıcıların şimdi kurması gereken sürümü anlatır. Eski mühendislik geçmişi [CHANGELOG.md](../CHANGELOG.md) ve [CHANGELOG-0.5.md](../CHANGELOG-0.5.md) içinde korunur; böylece public sürüm rehberi büyüyen bir arşive dönüşmeden güncel kalır.

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
