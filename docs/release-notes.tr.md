# Sürüm Notları

Bu sayfa kullanıcıların şimdi kurması gereken sürümü anlatır. Eski mühendislik geçmişi [CHANGELOG.md](../CHANGELOG.md) ve [CHANGELOG-0.5.md](../CHANGELOG-0.5.md) içinde korunur; böylece public sürüm rehberi büyüyen bir arşive dönüşmeden güncel kalır.

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
