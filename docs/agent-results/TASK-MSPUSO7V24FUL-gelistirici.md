# TASK-MSPUSO7V24FUL — Data ve Support routing kapsamı hizalaması

## Ne yapıldı

- Mevcut 11 coordinator / 21 tekil uzman tasarımı doğrulandı.
- `data-information-quality` profili `data_coordinator` / `docs_researcher` için; `support-onboarding` profili de `support_coordinator` / `devex_auditor` için doğrudan birincil routing sağlıyor.
- Data coordinator açıklaması katalog, Windows ve Unix template'lerinde read-only data mimarisi, şema, kalite ve kaynak kanıtı ile uyumlu. DevOps açıklaması yalnız operasyonel performans, runtime health ve setup diagnostics kapsamını tanımlıyor.

## Kanıt

```text
node scripts/validate-agent-config.mjs
Agent config validation passed. Checked 11 coordinators and 21 specialist workers across 2 configs.

node scripts/validate-routing-profiles.mjs
Routing profile validation passed. Checked 18 profiles.

node --test scripts/tests/agent-worker-routing-acceptance.test.mjs
tests 9
pass 9
fail 0
```

Canlı CLI çağrısında `data quality source lineage metadata schema review`, `data-information-quality` için yüksek güvenle eşleşti ve birincil coordinator `data_coordinator` oldu. `customer support onboarding first run setup friction`, `support-onboarding` için eşleşti ve birincil coordinator `support_coordinator` oldu. Kabul testi bu iki sonucu doğrudan zorlar.

## Değişen dosyalar

- `catalog/agents.json`
- `catalog/routing-profiles.json`
- `templates/codex/agents/data_coordinator.toml`
- `templates/codex/agents/devops_coordinator.toml`
- `templates/codex/config.windows.toml`
- `templates/codex/config.unix.toml`
- `docs/agents.md`
- `docs/agents.tr.md`
- `scripts/tests/agent-worker-routing-acceptance.test.mjs`
- Bu sonuç raporu ve sonuç indeksi

## Riskler

- Data ve Support rotaları öneri niteliğindedir; cross-domain çalışma sadece ana oturumun parent-routed handoff kararıyla ilerler.
- Bu task'ın dışındaki çalışma ağacı değişiklikleri korunmuştur.

## Açık sorular

- Yok.

## Sonraki adım

- Değişiklikleri ilgili mevcut dev çalışma setiyle gözden geçirip tek niyetli commit'e dahil edin.
