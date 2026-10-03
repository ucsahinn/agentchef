# Claude Plugin Önbelleği Ve Marketplace

Claude Code içindeki `/plugin` AgentChef marketplace'ini veya plugin'ini
göstermiyorsa ya da plugin listeleniyor ama stale ise bu makaleyi kullan.

## AgentChef Neyi Yönetir?

- Paylaşımlı plugin kaynak ağacına işaret eden Claude tarafı marketplace
  manifesti `~/.agents/plugins/.claude-plugin/marketplace.json`.
- Onu kaydeden iki CLI çağrısı: `claude plugin marketplace add
  <AGENTS_HOME>/plugins` ve `claude plugin install
  agentchef@agentchef --scope user`.

AgentChef, Claude Code'un kendi plugin önbelleğini
(`~/.claude/plugins/known_marketplaces.json`, `installed_plugins.json`,
`cache/`) asla yazmaz. Bu dosyalar Claude Code'a aittir ve sürümler arasında
biçim değiştirir.

## Önerilen Kontroller

```bash
claude --version
claude plugin list
claude plugin validate "$AGENTS_HOME/plugins/sources/agentchef"
node scripts/install-claude-target.mjs --json --redact-paths
```

## Temiz Karar Akışı

1. `claude` `PATH` üzerinde yoksa installer kaydı atlar ve tam komutları basar;
   Claude Code'u kurduktan sonra bunları çalıştır.
2. Marketplace kayıtlı ama plugin stale ise
   `claude plugin update agentchef@agentchef` çalıştır.
3. 1.3.0'dan beri AgentChef'in her skill'i yalnızca plugin'den gelir
   (`/agentchef:seo`; başka bir komut aynı adı taşımıyorsa yalın `/seo` da
   çalışır). Bir skill hâlâ iki kez görünüyorsa 1.0–1.2'den kalma bir skill
   bağlantısı ya da kopyası duruyordur; önce ön izleyerek
   `npm run chef -- --migrate-identity --target both` çalıştır (bkz.
   [Claude skill bağlantıları](claude-skill-links.tr.md)).
4. Her plugin değişikliğinden sonra yeni bir Claude Code oturumu başlat.

## Sürüm Değişmeden Bayatlayan Cache Kopyası

Claude Code bir plugin'i yönetilen marketplace kaynağından değil, kendi cache
kopyasından yükler ve o kopyayı sürüme göre tazeler. AgentChef'in plugin kaynağı
yerel bir dizin olduğu için içeriği sürüm aynı kalırken değişebilir. Bu olduğunda
kurulum temiz doğrulanmasına ve `claude plugin list` doğru sürümü göstermesine
rağmen her oturum önceki rol tanımlarını yüklemeye devam eder.

`npm run verify:install:runtime -- --target claude` sunulan cache kopyasını
yönetilen kaynakla karşılaştırır ve bunu söyler:

```text
Warning: the Claude plugin cache copy 1.0.0 differs from the managed source in
21 of 32 agent files, so sessions load stale definitions
```

Installer bunu kendisi yapar: cache'teki kopya kaynaktan farklıysa (örneğin
pinned skill'ler kaynağa yeni yazıldığında) plugin'i yeniden kurar. Elle
tazelemek için plugin'i yeniden kur, sonra yeni bir oturum başlat:

```bash
claude plugin uninstall agentchef@agentchef
claude plugin install agentchef@agentchef --scope user
```

Cache altında kalan eski sürüm dizinleri sunulmaz ve raporlanmaz. Yalnızca
yönetilen kaynağın kuracağı sürüm karşılaştırılır.

## Durma Koşulları

- Yenilemeyi zorlamak için `~/.claude/plugins/cache` dizinini silme; `claude
  plugin` komutlarını kullan.
- `installed_plugins.json` dosyasını elle düzenleme.
- Marketplace'i bu repo checkout'u içinde `project` kapsamında kaydetme; user
  kapsamı makine başına tek kayıt tutar.
