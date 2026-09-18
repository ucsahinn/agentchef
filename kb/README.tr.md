# AgentChef Bilgi Bankası

Bilgi bankası, README'den sonra gelen kısa ve iş odaklı cevaplar içindir.
Tam referans için docs sayfalarını, hızlı karar gereken durumlarda bu
makaleleri kullan.

Dil girişleri:

- [English](README.md)
- [Türkçe](README.tr.md)

## Buradan Başla

| Soru | Makale |
| --- | --- |
| Global Codex state'e dokunmadan kurulumu nasıl ön izlerim? | [Kurulum ön izleme güvenliği](install-preview.tr.md) |
| Kurulu yapının sağlıklı olduğunu nasıl kanıtlarım? | [Runtime doğrulaması](runtime-verification.tr.md) |
| Ajan, skill ve MCP ne zaman kullanılmalı? | [Ajan ve MCP routing](agent-mcp-routing.tr.md) |
| Public release öncesi ne kontrol edilmeli? | [Public release hijyeni](public-release-hygiene.tr.md) |
| PowerShell installer'ı engelliyor. Güvenli yol ne? | [PowerShell policy ve Windows başlatma](powershell-policy.tr.md) |
| Opsiyonel skill kurulumu veya cache çözümü fail ediyor. | [Skills CLI ve npm cache](skills-cli-cache.tr.md) |
| `CODEX_HOME` veya `AGENTS_HOME` sonuçları tutarsız gösteriyor. | [Custom Codex home ve ambient drift](codex-home-drift.tr.md) |
| MCP connector listeleniyor ama tool göstermiyor. | [MCP connector araç göstermiyor](mcp-no-tools.tr.md) |
| Managed dosyalar eksik veya stale görünüyor. | [Managed file drift](managed-file-drift.tr.md) |
| Screenshot veya görsel commit edilmeli mi? | [Public görsel asset'ler](public-visual-assets.tr.md) |

## Çalışma Kuralları

- Installer write öncesi ön izleme komutlarını tercih et.
- Account, database, production ve geniş filesystem connector'larını görev net
  istemedikçe disabled tut.
- Screenshot, log, trace ve diagnostics çıktılarını incelenene kadar private
  kabul et.
- Public handoff öncesi `npm run check` ve `gitleaks detect --redact
  --no-banner --no-git --verbose` çalıştır.
- Installer veya unattended workflow içinden publish, push, tag, release,
  deploy ya da GitHub settings değişikliği yapma.

## İlgili Dokümanlar

- [Kurulum rehberi](../docs/install.tr.md)
- [Security model](../docs/security-model.tr.md)
- [Doğrulama rehberi](../docs/verification.tr.md)
- [Agent kataloğu](../docs/agents.tr.md)
- [Skill kataloğu](../docs/skills.tr.md)
- [MCP kataloğu](../docs/mcp-catalog.tr.md)
- [Public readiness](../docs/public-readiness.tr.md)
- [Sorun giderme](../docs/troubleshooting.tr.md)
