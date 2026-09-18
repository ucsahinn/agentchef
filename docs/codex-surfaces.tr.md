# Codex Yüzeyleri

Doğru kural: ihtiyacın kalıcılığı ve kapsamı neyse en küçük uygun yüzeyi seç.

| İhtiyaç | Yüzey | Neden |
| --- | --- | --- |
| Tek seferlik kısıt | Mevcut prompt | En düşük kalıcılık |
| Repo kuralları | `AGENTS.md` | Scope'a göre otomatik yüklenir |
| Kullanıcı geneli varsayılan | `~/.codex/AGENTS.md` | Tüm repolara uygulanır |
| Model, sandbox, MCP, profile | `config.toml` | Makine tarafından okunur runtime config |
| Tekrarlanabilir workflow | Skill | Açık veya implicit tetiklenebilir |
| Paylaşılabilir paket | Plugin | Skill, MCP config ve app entegrasyonlarını paketler |
| Canlı dış context | MCP veya app connector | Tool/context sınırı sağlar |
| Komut onay istisnası | Rule | Dar sandbox escalation politikası |
| Lifecycle otomasyon | Hook | Review/trust gerektiren event otomasyonu |
| Paralel uzman iş | Subagent | Büyük/dağınık işleri bölmek için |
| Geçici override | `AGENTS.override.md` | İş bitince kaldırılması gereken lokal override |

Routing kaniti ayrica `catalog/routing-profiles.json` ve
`npm run chef -- --routing` ile gorulur. Bu permission vermez; sadece beklenen
ajan, skill, MCP, validation gate ve final raporlama sozlesmesini gosterir.

Bu yüzeylerin Claude Code karşılıkları [Claude Code yüzeyleri](claude-surfaces.tr.md)
sayfasında; iki hedef arasındaki eşleme [hedef yetenek haritasında](target-capability-map.tr.md).

Resmi kaynaklar:

- AGENTS.md: https://developers.openai.com/codex/guides/agents-md
- Skills: https://developers.openai.com/codex/skills
- MCP: https://developers.openai.com/codex/mcp
- Rules: https://developers.openai.com/codex/rules
- Hooks: https://developers.openai.com/codex/hooks
- Plugins: https://developers.openai.com/codex/plugins
- Subagents: https://developers.openai.com/codex/subagents

## Bu Starter'ın Yorumu

- Gözden geçirilebilir kullanıcı geneli davranış, routing, tasarım ve
  doğrulama varsayılanları: [`templates/codex/AGENTS.md`](../templates/codex/AGENTS.md),
  kurulumdan sonra `~/.codex/AGENTS.md`. Repo-içi `AGENTS.md` daha spesifiktir
  ve önceliklidir.
- Runtime ayarları: `config.toml`
- Tekrarlı workflow: skills
- Paylaşılabilir dağıtım: plugin
- Güncel doküman ve browser doğrulama: MCP
- Komut onay sınırları: rules
- Lifecycle guardrail: hooks
