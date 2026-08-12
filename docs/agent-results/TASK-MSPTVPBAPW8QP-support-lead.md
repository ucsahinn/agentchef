# TASK-MSPTVPBAPW8QP — Customer Support onboarding ve ajan çağrı akışı

## Ne yapıldı

Kurulum/onboarding ve “hangi ajan ne zaman çağrılır?” kullanıcı akışı, README, install/how-to/agents belgeleri, install-plan önizlemesi, support coordinator rolü ve CLI routing board üzerinden incelendi.

- İlk kullanım yolu preview-first: prerequisites → yazmayan `-WhatIf`/`--dry-run` veya manifest planı → interactive apply → Codex restart → doctor ve `/mcp`, `/skills`, `/plugins`, `/hooks` incelemesi.
- Kullanıcıya açık seçim tablosu 21 specialist için “Bring it in when…” yönlendirmesi veriyor; seçim match'i worker spawn etmeye zorlamaz, ana oturum rol rehberliğini doğrudan kullanabilir.
- Support ownership config ve katalogda `support_coordinator → devex_auditor` olarak tanımlı. `devex_auditor`, onboarding, doküman ve first-run friction için doğru dar uzmanlık sınırını koruyor.
- Onboarding güvenlik çizgisi korunuyor: preview write yapmaz; global Git guards opt-in; authentication/connector/güvenlik sınırları otomatik açılmaz.

## Kanıt

Yazmayan gerçek install-plan önizlemesi:

```text
Codex Chef install plan summary
Platform: windows
Selected components (24): codex-agents-md, codex-config, ... , curated-skills
Skipped components (5): git-ignore-global, git-pre-commit-hook, ... , git-config-hooks-path
Operations: 85; high risk: 15; backup-backed: 84; force: no
No files are changed by this plan command.
```

Focused runtime/config doğrulaması:

```text
Agent config validation passed. Checked 11 coordinators and 21 specialist workers across 2 configs.
Routing profile validation passed. Checked 16 profiles.
Codex config compatibility passed: base plus full, multi-session, and offline profiles.
```

`npm run validate:docs` ayrıca denendi; bu raporlardan bağımsız mevcut `docs/agent-results/TASK-MSP4DGPQNCA07-gelistirici.md` içindeki kırık Markdown link nedeniyle başarısız oldu. Bu görev o dosyayı değiştirmedi.

Belge/role korelasyonu:

```text
docs/agents.md:33  devex_auditor: Onboarding, documentation, or the first run feels harder than it should.
docs/agents.md:86  support_coordinator | devex_auditor
docs/how-to.md:47  Restart Codex after installing, then run doctor and inspect /mcp, /skills, /plugins, /hooks.
docs/how-to.md:68-87  ordered specialist-selection flow and release boundary.
```

## Değişen dosyalar

- `docs/agent-results/TASK-MSPTVPBAPW8QP-support-lead.md` — bu onboarding ve çağrı-akışı raporu.
- `docs/agent-results/INDEX.md` — rapor bağlantısı, mevcut alfabetik biçim korunarak eklendi.

## Riskler

- Support coordinator katalog/config/docs yüzeyinde tanımlı olsa da 16 routing profili içinde support/onboarding adına özel bir task-shape profili yoktur. Kullanıcı bugün `docs/agents.md` ile `devex_auditor`'ı seçebilir; CLI `--routing` ise bu tek use case'i doğrudan filtrelemez.
- Dokümantasyon bir rol match'ini spawn talimatı gibi algılanmaması için açık olsa da kullanıcı eğitiminde “rehberlik kullanımı” ile “bağımsız subagent” farkı vurgulanmaya devam etmeli.
- Canlı global install veya authenticated connector kontrolü yapılmadı; bu rapor preview/static/validator kanıtıdır.

## Açık sorular

- `onboarding-support` adlı bir routing profili, `support_coordinator` ve `devex_auditor` için daha keşfedilebilir bir CLI yolu sağlamalı mı?
- Support rolü `devex_auditor` ile sınırlı mı kalmalı, yoksa troubleshoot/health talep türleri için parent-routed `codex_doctor` handoff örneği de belgelenmeli mi?

## Sonraki adım

Keşfedilebilirlik istenirse önce küçük bir `onboarding-support` routing profili tasarlanmalı; catalog ownership, docs/agents, `docs/how-to`, Türkçe eşleri ve `validate:routing` eşzamanlı güncellenmelidir. Bu değişiklik approval/sandbox veya install default'larını genişletmemelidir.

## sss doğrulama eki — 2026-08-12

### Kullanıcı gözüyle akış

| Kullanıcı ihtiyacı | Mevcut ilk yüzey | Gerçek routing sonucu | Kullanıcı etkisi |
| --- | --- | --- | --- |
| İlk kurulumun güvenli olup olmadığını anlamak | README → preview-first install | `npm run plan:install` 24 seçili component, 70 operasyon, backup/collision politikasını gösterdi | Güçlü: apply öncesi görünürlük var. |
| “İlk çalıştırmada takıldım” | `docs/agents.md` → `devex_auditor` satırı | `devex_auditor`, `support_coordinator`ın tek worker’ı | Dokümantasyon yolu anlaşılır, fakat CLI ilk owner’ı doğrudan söylemez. |
| “Onboarding documentation first run setup help” | `--routing --task` | Primary: `data_coordinator`/`docs_researcher`; `support_coordinator`/`devex_auditor` peer handoff | Risk doğrulandı: literal onboarding intent support’a doğrudan route olmuyor. |
| Kurulum sonrası doğrulama | Docs’ta restart + doctor + `/mcp`, `/skills`, `/plugins`, `/hooks` | Agent/routing/locale validators geçti | Rehber güvenlik sınırlarını koruyor. |

### Güncel kanıt

```text
npm run plan:install
Selected components: 24
Skipped components: git guards ve curated skills
Operations: 70
Plan yalnız gösterimdir; apply çalıştırılmadı.

Task: onboarding documentation first run setup help
primaryCoordinator: data_coordinator (docs_researcher)
peerHandoff: support_coordinator (devex_auditor), via parent-routed-handoff
```

```text
npm run validate:agents
Agent config validation passed. Checked 11 coordinators and 21 specialist workers across 2 configs.
npm run validate:routing
Routing profile validation passed. Checked 16 profiles.
npm run validate:doc-locales
Doc locale validation passed for complete English and Turkish operator docs.
npm run validate:locales
README locale validation passed. Checked 6 honest public entry points.
```

### Kullanıcı odaklı karar

Support/onboarding talebi doküman güncellemesinden farklı bir niyettir. Bu yüzden önerilen `onboarding-support` profili, şu iki yolu ayırmalıdır:

1. **Kurulum veya ilk kullanım sürtünmesi:** primary `support_coordinator` → `devex_auditor`; gerekirse parent-routed `codex_doctor` handoff.
2. **Doküman içeriği veya guide değişikliği:** mevcut `docs-and-adrs` → `docs_author` + `devex_auditor` akışı.

Bu ayrım, support coordinator’ı geniş yetkili bir troubleshoot agent’a dönüştürmeden kullanıcı niyetini doğru ilk owner’a götürür.
