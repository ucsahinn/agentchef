# Harness Uyumluluğu Ve Import Politikası

[English](harness-compatibility.md) | [Türkçe](harness-compatibility.tr.md)

AgentChef iki terminal ajanını hedefler: installer'ın bugün desteklediği
**OpenAI Codex CLI** ve
[ADR-006](decisions/006-agentchef-independent-dual-target-product.md) ile
tanımlanan 0.9.0 hattında ikinci kurulum hedefi olacak **Anthropic Claude
Code**. Diğer harness'lar (Cursor, OpenCode, Kiro, VS Code, Zed, Gemini, Qwen)
kapsam dışıdır: install plan doğrulayıcısı bu araçların home dizinlerini
reddeder ve onlar için adaptör planlanmamıştır.

Kit, ECC gibi geniş cross-harness starter'lardan öğrenmeye devam eder ama
onlardan birine dönüşmez. Temkinli, Windows dostu ve her yazma öncesinde ön
izlenebilir kalır.

Kontrol tarihi: 2026-09-18.

## Cross-Harness Starter'lar Neyi İyi Yapıyor

ECC geniş bir cross-harness agent operating system'dir. Codex, Claude Code,
Cursor, OpenCode, Gemini, Zed ve diğer harness'lar için çok sayıda skill, ajan,
command, hook, MCP konvansiyonu, install profile, target adapter, test ve
release gate paketler.

Alınabilecek yüksek sinyalli fikirler:

- manifest tabanlı install planlama
- plan/apply ayrımı
- tek manifest arkasında hedefe özel install adapter'ları
- install-state preview
- manifest ve skill surface validation
- MCP config drift kontrolü
- plugin runtime limitlerini açık anlatan README dili
- manifest, kişisel path, Unicode safety ve supply-chain sinyallerini kontrol
  eden release gate'leri

## Bu Kit Neyi Kopyalamamalı

Başka bir starter'ın dosyaları, config'leri, hook'ları, MCP katalogları,
skill'leri, ajanları veya marketplace metadata'sı toptan import edilmemelidir.

Kaçınılacak desenler:

- installer içinde sessiz `npm install` gibi dependency installation
- kitin açık Git guard akışı dışında global `core.hooksPath` değişikliği
- `approval_policy = "never"`, `profiles.yolo` veya Claude Code
  `bypassPermissions` varsayılanı gibi permisif profiller
- geniş aktif MCP connector katalogları
- account, database, browser, filesystem veya production connector'larını
  varsayılan açık yapmak
- ham prompt, tool input, diff veya output kaydeden hook telemetry
- sessiz varsayılan olarak gönderilen lifecycle hook runtime'ları,
  `SessionStart` prompt injection, `hookSpecificOutput.additionalContext` veya
  learned-skill auto-injection
- write-capable interface veya marketplace auth zorunluluğu taşıyan plugin
  manifest'leri
- floating package spec taşıyan plugin `.mcp.json` dosyaları veya unpinned
  git-based MCP launcher'lar
- `manifests/install-plan.json` içinde beyan edilen review edilmiş hedef
  kökleri dışındaki install-plan destination'ları (bugün Codex ve Agents
  home'ları ile opsiyonel Git-guard hedefleri; Claude Code home'u ancak o hedef
  yayınlandığında)
- generated active config içinde unversioned veya `@latest` npm package spec
  kullanmak
- secret scan'i bozan credential şekilli örnekleri import etmek

## Güvenli Adaptasyon Kuralları

Dışarıdan esinlenen her değişiklik commit edilmeden önce şunları yanıtlamalıdır:

| Soru | Zorunlu cevap |
| --- | --- |
| Ne alınıyor? | Toptan klasör kopyası değil, küçük bir desen. |
| Nereye yazar? | Varsayılan repo-scoped; global write için açık install flag gerekir. |
| Neyle çakışır? | Mevcut `~/.codex`, `~/.agents`, `~/.claude`, Git config, hook, MCP, skill veya plugin marketplace state'i. |
| Nasıl preview edilir? | `npm run plan:install`, PowerShell `-WhatIf`, Bash `--dry-run` veya başka no-write komut. |
| Nasıl backup alır? | Managed global file write'ları replace öncesi backup alır, kullanıcı açıkça kapatmadıkça. |
| Nasıl doğrulanır? | `npm run check`, skill kaynağı değişirse `npm run verify:skills:online`, publish öncesi Gitleaks. |

## Mevcut Adaptasyonlar

Bu kit yalnız güvenli alt kümeyi alır:

- `manifests/install-plan.json` review edilmiş install yüzeyini, collision
  policy, risk, backup davranışı ve explicit flag'leri kaydeder.
- `scripts/plan-install.mjs` human veya JSON no-write install plan basar.
- `scripts/validate-install-plan.mjs` runtime dependency eklemeden manifest'i
  doğrular ve desteklenmeyen harness home'ları altındaki destination'ları
  reddeder.
- `schemas/install-state-preview.schema.json` ve
  `scripts/validate-install-state-preview.mjs`, üretilen JSON preview için
  stabil sözleşme sağlar.
- `scripts/security-audit.mjs` installer içinde implicit npm install,
  permisif Codex profile, `approval_policy = "never"`, unpinned npm MCP package
  spec'leri, lifecycle hook runtime'ları ve otomatik additional-context
  injection desenlerini reddeder.

## Resmi Codex Uyumu

Codex tarafı güncel resmi Codex yönlendirmesini izler:

- `AGENTS.md` global, repo ve nested discovery order'a sahip kalıcı talimattır.
  Harici repolar kendi repo-local talimatlarını sahiplenmelidir.
- Skill'ler progressive disclosure kullanır. Description kısa ve scoped
  kalmalıdır.
- Plugin'ler reusable skill, app, MCP server, asset ve hook dağıtır; local
  plugin resmi OpenAI yayını anlamına gelmez.
- MCP server'lar `config.toml` içinde `enabled`, approval mode, env-backed auth,
  timeout ve tool allow/deny listeleriyle tutulur.
- Hook'lar lifecycle guardrail'dir ve trust review ister; primary security
  boundary değildir.
- Legacy `sandbox_mode` ayarları ile beta permission profile'lar aynı template
  içinde karıştırılmamalıdır.

## Resmi Claude Code Uyumu

Planlanan Claude Code hedefi güncel resmi Claude Code yönlendirmesini izler:

- `CLAUDE.md` user, project ve local discovery'ye sahip kalıcı talimattır ve
  `@path` import'larını destekler; kit kullanıcının dosyasını değiştirmek
  yerine tek bir import satırı ekler.
- Skill'ler `~/.claude/skills/`, proje `.claude/skills/` veya bir plugin'in
  `skills/` dizini altındaki `SKILL.md` klasörleridir; symlink'li skill
  klasörleri desteklenir ve tekilleştirilir.
- Subagent'lar frontmatter'lı Markdown dosyalarıdır; plugin subagent'ları
  `plugin:name` ad-alanındadır ve kullanıcının kendi ajanlarını asla ezmez.
- İzinler `settings.json` içinde yaşar (`permissions.allow`, `deny`, `ask`) ve
  ayar seviyeleri arasında toplamsal birleşir; hook'lar da toplamsal birleşir.
- MCP server'lar `claude mcp add` ile `user`, `project` veya `local` kapsamında
  eklenir; user kapsamı `.claude.json` içindedir.
- Plugin'ler yalnız `claude plugin` komutlarıyla kurulur; kit Claude Code'un
  plugin cache'ini elle yazmaz.

Kaynaklar:

- ECC deposu: https://github.com/affaan-m/ECC
- Resmi Codex kılavuzu: https://developers.openai.com/codex/codex-manual.md
- Codex Agent Skills: https://developers.openai.com/codex/skills
- Codex plugin'leri: https://developers.openai.com/codex/plugins/build
- Codex MCP: https://developers.openai.com/codex/mcp
- Codex hook'ları: https://developers.openai.com/codex/hooks
- Codex izinleri: https://developers.openai.com/codex/permissions
- Claude Code skill'leri: https://code.claude.com/docs/en/skills
- Claude Code subagent'ları: https://code.claude.com/docs/en/sub-agents
- Claude Code hook'ları: https://code.claude.com/docs/en/hooks
- Claude Code ayarları: https://code.claude.com/docs/en/settings
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Claude Code plugin'leri: https://code.claude.com/docs/en/plugins-reference
