# AgentChef Dokümantasyonu

[English](README.md) | [Türkçe](README.tr.md)

README hızlıca yönünü bulman için var. Kurulum, onarım, inceleme veya yayın sırasında tam olarak hangi sınırın geçerli olduğunu arıyorsan doğru yer burası.

AgentChef’in operatör dokümantasyonu İngilizce ve Türkçe olarak tam paritede tutulur; kısmi çeviri veya yalnızca özet niteliğinde giriş sayfası yoktur.

## Buradan Başla

| Yapmak istediğin iş | Okuman gereken sayfa |
| --- | --- |
| Güvenli ön izleme veya kurulum | [Kurulum rehberi](install.tr.md) |
| Günlük çalışma akışını anlamak | [Kurulum nasıl kullanılır?](how-to.tr.md) |
| Terminal çıktısını karşılaştırmak | [Beklenen çıktı](expected-output.tr.md) |
| Hatalı bir komutu teşhis etmek | [Sorun giderme](troubleshooting.tr.md) |
| Eşzamanlı Codex/MCP süreçlerini sınırlı tutmak | [Çoklu oturum süreç hijyeni](process-hygiene.tr.md) |
| Lokal tercihleri kaybetmeden güncellemek | [Güncelleme rehberi](upgrade.tr.md) |
| Repoyu veya kurulu runtime’ı kanıtlamak | [Doğrulama](verification.tr.md) |

## Kurulumu Tanı

- [Codex kapasite haritası](codex-capability-map.tr.md)
- [Codex yüzeyleri](codex-surfaces.tr.md)
- [CLI flag ve komutları](codex-flags.tr.md)
- [Uzman agent'lar](agents.tr.md)
- [Skill kataloğu](skills.tr.md)
- [MCP kataloğu](mcp-catalog.tr.md)
- [Çoklu oturum süreç hijyeni](process-hygiene.tr.md)
- [Skill, plugin ve agent uyumluluk haritası](skills-and-agents.tr.md)
- [Workflow yüzey haritası](workflow-surface-map.tr.md)
- [Windows notları](windows.tr.md)

## Güven, Bakım Ve Yayın

- [Güvenlik modeli](security-model.tr.md)
- [İyi uygulamalar](best-practices.tr.md)
- [Public hazırlık](public-readiness.tr.md)
- [Yayın kontrol listesi](publish.tr.md)
- [GitHub repo ayarları](github-settings.tr.md)
- [Advisory kaynakları](advisory-sources.tr.md)
- [Araştırma notları](research-notes.tr.md)
- [Harness uyumluluğu](harness-compatibility.tr.md)
- [Taşınabilirlik ve runtime sözleşmesi](portability-contract.tr.md)
- [Brain emekliliği](brain-retirement.tr.md)
- [Güncel sürüm notları](release-notes.tr.md)

## Karar Kayıtları

- [ADR-001: uyarlanabilir yönlendirme ve kullanıcıya ait config katmanı](decisions/001-adaptive-routing-and-user-owned-config-overlay.md)
- [ADR-002: Brain içeriği ve Windows ACL durumu (yerini ADR-006 aldı)](decisions/002-brain-content-and-windows-acl-status.md)
- [ADR-003: yetenek koruyan çoklu oturum süreç hijyeni](decisions/003-capability-preserving-multi-session-process-hygiene.md)
- [ADR-004: birleşik Workspace OS bootstrap (yerini ADR-006 aldı)](decisions/004-workspace-os-unified-bootstrap.md)
- [ADR-005: tek dağıtılabilir workspace olarak Kitchen (yerini ADR-006 aldı)](decisions/005-kitchen-unified-workspace-and-module-boundaries.md)
- [ADR-006: bağımsız, çift hedefli ürün olarak devam](decisions/006-agentchef-independent-dual-target-product.md)

Kısa ve belirti odaklı cevaplar için [bilgi bankasına](../kb/README.tr.md) geçebilirsin.
