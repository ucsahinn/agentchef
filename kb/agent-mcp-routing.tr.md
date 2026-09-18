# Ajan Ve MCP Routing

AgentChef routing rehberi, agent role dosyalari, secilmis skill'ler ve MCP
varsayilanlari kurar. Bunlar ayni sey degildir; hepsini tek bir genel
automation kutusuna koyma.

## En Küçük Yüzeyi Kullan

| İhtiyaç | Yüzey |
| --- | --- |
| Tek seferlik görev sınırı | Mevcut prompt |
| Kalıcı repo davranışı | `AGENTS.md` |
| Yeniden kullanılabilir workflow | Skill |
| Kurulabilir workflow paketi | Plugin |
| Canli external veya private context | MCP veya app connector |
| Sınırlı uzman kanıt işi | Subagent |
| Dar command istisnasi | Rule |
| Incelenmis lifecycle enforcement | Hook |

## Varsayilan Ajan Siniri

Subagent'ler görünür delegasyon için role dosyalarıdır. Mapping, docs review,
security review, release verification, QA, browser evidence ve benzeri sınırlı
kanıt işlerinde faydalıdır. Always-on servis değildir ve approval sınırlarını
atlamak için kullanılmamalıdır.

Büyük işlerde az sayıda odaklı ajan kullan ve write scope'larını ayır.
Delegasyon denetlenebilir olsun diye `Agent plan`, `Agent started` ve
`Agent result` bilgisini raporla.

## Varsayilan MCP Siniri

AgentChef read-heavy destek yüzeylerini varsayılan olarak kullanışlı tutar:
resmi docs, Context7, reasoning, browser evidence, semantic code navigation,
secret icermeyen memory reads ve lokal codebase graph reads. Interaction, symbol
edit, graph indexing, account access, database access, production telemetry,
deployment operasyonları ve geniş filesystem access prompt-gated veya disabled
kalır.

## İlgili Dokümanlar

- [Codex capability map](../docs/codex-capability-map.tr.md)
- [Agent kataloğu](../docs/agents.tr.md)
- [Skill kataloğu](../docs/skills.tr.md)
- [MCP kataloğu](../docs/mcp-catalog.tr.md)
- [Workflow surface map](../docs/workflow-surface-map.tr.md)
