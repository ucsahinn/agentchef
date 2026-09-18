# Özel Claude Home Ve Ortam Sapması

`CLAUDE_CONFIG_DIR` veya bir scratch dizini, Claude hedefinin planını,
durumunu ya da doğrulamasını tutarsız gösteriyorsa bu makaleyi kullan.

## İlk Soru

Komutun hangi home dizinlerini kullandığını doğrula:

```bash
node scripts/install-claude-target.mjs --json --redact-paths
npm run dev:assert-scratch
```

`CLAUDE_CONFIG_DIR`, user-scope `.claude.json` dahil tüm Claude config dizinini
taşır; değişken yokken bu dosya `~/.claude` içinde değil, onun yanında
`~/.claude.json` konumundadır. Bir scratch dizinine karşı üretilen plan
`~/.claude` hakkında hiçbir şey söylemez.

## Temiz Karar Akışı

1. Repo durumunu `npm run validate` ile doğrula.
2. Planı redakte edilmiş yollarla yazdır ve `target` bloğunu oku.
3. `AGENTS_HOME` da geçersiz kılınmışsa, Claude home altındaki skill
   bağlantılarının o agents home'a işaret ettiğini unutma; scratch ağacına giden
   bir bağlantı gerçek home'da sapmadır.
4. Bir şeyin bozuk olduğuna karar vermeden önce, gerçekten kastettiğin home'a
   karşı `npm run verify:install:runtime -- --target claude` çalıştır.

## Durma Koşulları

- Geliştirme sırasında installer akışlarını `~/.claude` üzerinde çalıştırma;
  önce `CLAUDE_CONFIG_DIR` değişkenini bir scratch köküne yönlendir.
- `.claude.json` veya `settings.json` dosyalarını home'lar arasında kopyalama.
- Hâlâ ihtiyaç duyabileceğin bir yedeği barındıran scratch home'u silme.
