# TASK-MSP4H7N0XWKR0 — EN/TR agent-skill-MCP doküman incelemesi

## Ne yapıldı

EN/TR agent, skill ve MCP katalog dokümanlarının yapısal eşleri; makine-okunur MCP kataloğu ve Windows/Unix temel şablonlarıyla karşılaştırıldı.

Sonuç: agent ve skill belgelerinin EN/TR yapıları eşleşiyor. MCP kataloglarının da başlık ve tablo yapıları eşleşiyor; ancak güncel davranış doğruluğu ve metinsel parity tamam değil. Gerçek dengeli varsayılan iki MCP'dir: `openaiDeveloperDocs` ve `serena`. `context7` katalogda ve iki temel şablonda tanımlı, fakat `enabled = false` durumundadır.

Bulunan dokümantasyon sapmaları:

- `README.md`, `README.tr.md`, `docs/mcp-catalog.md`, `docs/mcp-catalog.tr.md`, `docs/process-hygiene.md` ve `docs/process-hygiene.tr.md` dengeli varsayılanı üç sunucu ve `context7` açık olarak anlatıyor.
- `docs/mcp-catalog.md` ve `docs/mcp-catalog.tr.md` içindeki `context7` satırı da yanlışlıkla `On`/`Açık` gösteriyor.
- `docs/process-hygiene.md` çoklu-oturum profilinin Serena köprüsünü açık tuttuğunu doğru anlatırken, Türkçe karşılığı yedi yerel stdio MCP'nin tamamını kapattığını söylüyor. `docs/mcp-catalog.tr.md` de aynı şekilde sapıyor.
- `docs/release-notes.*` içindeki v0.5.59 notu tarihsel bir kayıt olduğundan bu incelemede değiştirilmedi; güncel-tense kopya başka belgelerde düzeltilmelidir.

Bu görev bir inceleme kapsamındaydı; ürün dokümanları değiştirilmedi.

## Kanıt

Temel şablonları doğrudan ayrıştıran komutun çıktısı:

```text
templates/codex/config.windows.toml enabled=2 names=openaiDeveloperDocs,serena
templates/codex/config.unix.toml enabled=2 names=openaiDeveloperDocs,serena
```

Makine-okunur katalog sayımı:

```text
CATALOG_SERVER_COUNT=16
CATALOG_DEFAULT_ENABLED_COUNT=2
CATALOG_DEFAULT_ENABLED_NAMES=openaiDeveloperDocs,serena
```

EN/TR yapısal sayımları:

```text
docs/agents.md <-> docs/agents.tr.md headings=8/8 tableRows=57/57
docs/skills.md <-> docs/skills.tr.md headings=4/4 tableRows=30/30
docs/mcp-catalog.md <-> docs/mcp-catalog.tr.md headings=3/3 tableRows=20/20
```

Çalıştırılan kapılar:

```text
MCP config validation passed. Checked 16 servers across 2 configs.
Doc locale validation passed for complete English and Turkish operator docs.
README locale validation passed. Checked 6 honest public entry points.
KB locale validation passed.
Documentation validation passed.
```

## Değişen dosyalar

- `docs/agent-results/TASK-MSP4H7N0XWKR0-docs-review.md`
- `docs/agent-results/INDEX.md` (indeks yenilemesinden sonra)

## Riskler

- Mevcut locale doğrulayıcıları dosya/eş yapısını denetliyor; varsayılan MCP sayısı veya EN/TR davranış cümlelerinin katalogla semantik uyumunu denetlemiyor. Bu yüzden bütün kapılar geçerken yanlış "üç sunucu" iddiası kalabiliyor.
- Yanlış `context7` varsayılanı, ilk kurulumda beklenmeyen bir MCP'nin canlı olacağı izlenimini verir; süreç/kapasite planlaması ve destek yönlendirmesi etkilenebilir.

## Açık sorular

- Doküman düzeltmesinden sonra, varsayılan MCP adları ve durumlarını katalogdan denetleyen dar bir regresyon doğrulayıcısı eklenmeli mi?
- v0.5.59 release notu tarihsel olay olarak aynen mi korunmalı, yoksa sonradan gelen konfigürasyon değişikliğine bağlayan kısa bir not mu almalı?

## Sonraki adım

Küçük bir dokümantasyon düzeltme göreviyle güncel-tense EN/TR kopyalarda "iki sunucu" ifadesini, `context7` durumunu ve multi-session Serena açıklamasını katalogyla eşitleyin; ardından `npm run validate:mcp`, locale/doğrulama kapıları ve `npm run validate` çalıştırın.
