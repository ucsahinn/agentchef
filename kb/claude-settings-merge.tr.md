# Claude Ayar Birleştirme Ve Makbuzlar

`~/.claude/settings.json` veya `.claude.json` dosyası AgentChef'in planladığından
farklı görünüyorsa ya da AgentChef'in tam olarak hangi girdileri eklediğini
bilmen gerekiyorsa bu makaleyi kullan.

## AgentChef Neyi Yönetir?

- `templates/codex/rules/default.rules` dosyasından üretilen `permissions.allow`
  ve `permissions.ask` kuralları ile `catalog/mcp-servers.json` kaynağından
  üretilen `allow`, `ask` ve `deny` MCP araç kuralları (yasaklar
  codebase-memory'nin yönetim araçlarını ve Playwright'ın
  `browser_run_code_unsafe`, `browser_evaluate`, `browser_file_upload`
  araçlarını kapsar). Bir `deny` kuralı yalnızca eklenir; mevcut `deny`
  kuralları asla kaldırılmaz.
- `settings.json` içinde başka hiçbir şey: `hooks`, `env` ve diğer tüm
  anahtarlar senin yazdığın gibi kalır. Bu sürümde Claude Code için hook
  kurulmaz.
- `.claude.json` içine (`~/.claude.json`; `CLAUDE_CONFIG_DIR` ayarlıysa onun
  içinde) AgentChef 1.3.0'dan beri MCP girdisi yazmaz; çünkü `context7`,
  `playwright` ve `serena` sunucularını plugin getirir. Yalnızca önceki bir
  sürümün yazdığı `mcpServers.context7` ve `mcpServers.serena` girdilerini,
  değerleri makbuz hash'i ile hâlâ eşleşiyorsa kaldırır. Aynı adlı kendi
  girdin korunur ve plugin'i gölgelediği bildirilir; `-AdoptMcp` /
  `--adopt-mcp` onu yedekledikten sonra kaldırır.

Bu iki dosyadaki diğer her şey sana veya Claude Code'a aittir. AgentChef
eklediği her girdiyi `~/.claude/agentchef/receipts/` altındaki yan bir makbuza
JSON pointer ve değer hash'i ile kaydeder.

## Önerilen Kontroller

```bash
node scripts/install-claude-target.mjs --json --redact-paths
npm run verify:install:runtime -- --target claude
```

Plan, ekleyeceği her girdiyi ve zaten var olduğu ya da daha katı bir liste
(`allow` üstünde `ask`, onun üstünde `deny`) zaten adlandırdığı için atladığı
her girdiyi listeler.

## Temiz Karar Akışı

1. Önce preview al; plan salt okunurdur.
2. Beklediğin bir girdi eksikse makbuza bak: Claude Code'un veya senin sonradan
   kaldırdığın bir girdi `missing` görünür ve yeniden çalıştırma onu geri ekler.
3. Bir AgentChef girdisini elle değiştirdiysen makbuz `changed` gösterir ve
   kaldırma senin sürümüne dokunmaz.
4. AgentChef'in girdilerini geri almak için kaldırma preview'ını çalıştır,
   sonra uygula.

## Durma Koşulları

- Makbuz dosyalarını elle düzenleme; onlar kanıttır, ayar değildir.
- Bir istemi susturmak için `Bash(*)` gibi `permissions.allow` joker
  karakterleri yapıştırma.
- `.claude.json` dosyasını makineler arasında kopyalama; hesap durumu
  içerir.
