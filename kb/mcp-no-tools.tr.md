# MCP Connector Araç Göstermiyor

Bir MCP server listeleniyor ama Codex içinde işe yarar tool görünmüyorsa veya
connector unavailable kalıyorsa bu makaleyi kullan.

## Önce Sınırı Oku

AgentChef varsayılanları konservatiftir. Dokümantasyon, reasoning, browser
evidence, semantic code navigation, memory read ve lokal graph read yüzeyleri
rutin iş için daraltılmıştır. Account, database, production, geniş filesystem
ve mutating connector tool'ları disabled veya prompt-gated kalır.

## Lokal Kontroller

```bash
npm run validate:mcp
npm run codex:status -- --plain --no-log
```

Sonra Codex içinde kontrol et:

```text
/mcp
```

## Yaygın Nedenler

| Belirti | Muhtemel Neden |
| --- | --- |
| Server listeleniyor, tool yok | Tool allowlist bilinçli olarak dar. |
| Serena unavailable | `uvx` veya pinned launcher source eksik. |
| Account connector disabled | Connector açık opt-in ve auth ister. |
| Browser tool unavailable | Browser MCP başlamadı veya tool prompt-gated. |

## Yapma

- Status board dolu görünsün diye account veya database connector açma.
- Somut görev yokken filesystem veya graph-indexing tool'larını genişletme.
- Token'ları config dosyalarına paste etme; dokümante auth yolunu kullan.
