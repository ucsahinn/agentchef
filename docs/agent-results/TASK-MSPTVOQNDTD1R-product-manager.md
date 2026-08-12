# TASK-MSPTVOQNDTD1R — Koordinatör mimarisi ve çakışmasız sahiplik incelemesi

## Ne yapıldı

Koordinatör kataloğu, rol şablonları, global çalışma anlaşması, routing CLI ve acceptance testleri incelendi. Uygulama değişikliği yapılmadı.

### Definition of Done

- [x] Her uzman worker için tek owner doğrulandı.
- [x] Delegasyon derinliği, worker sınırı ve peer handoff akışı doğrulandı.
- [x] Çok-alanlı bir istekte gerçek CLI ile primary coordinator/handoff kanıtı alındı.
- [x] Yetki, özel bağlam ve coordination riskleri belgelendi.

## Mimari değerlendirme

Karar: Tasarım, koordinatör ile uzman worker sorumluluklarını ayırıyor ve çakışmasız görev dağıtımı için yeterli mekanik korumaya sahip.

| Alan | Sınır | Kanıt |
| --- | --- | --- |
| Worker sahipliği | 11 coordinator, 21 uzmanı tekil olarak sahiplenir | `catalog/agents.json` `agentSpaceRoles`; duplicate owner validator hatası |
| Delegasyon ağacı | En fazla 2 seviye; coordinator başına 1–4 worker | `coordinationPolicy.maxDelegationDepth=2`, `maxWorkersPerCoordinator=4` |
| Worker recursion | Yasak | `workerDelegation=prohibited`; global agreement/TOML guardrail |
| Alanlar arası çalışma | Doğrudan peer spawn değil, parent-routed handoff | `peerCommunication=parent-routed-handoff` |
| Yetki | Coordinator read-only/on-request; worker katalog sandbox’ını kullanır | coordinator TOML + `workerApprovalProfile` |
| Özel bağlam | Memory/auth/session/machine-local bağlam dışarıda | `runtimeInjection=false`, `privateAgentSpaceMemory=excluded` |

Sahiplik dağılımı ayrışıyor: product (`prompt_architect`, `product_strategist`, `spec_author`) ürün çerçevesi/spec’i; leadership mimari/review/release’i; marketing discoverability/docs’u; support onboarding’i; QA doğrulamayı taşıyor. Worker’ların birden çok coordinator’a atanmasını engelleyen validator, çakışma önlemenin temelidir.

Gerçek geniş routing örneğinde `leadership_coordinator` primary seçildi (`release_verifier`, `code_reviewer`, `engineering_planner`). Backend (`code_mapper`), QA (`test_verifier`) ve security (`security_auditor`) için `parent-routed-handoff` verildi. Bu, karar merkezini tek tutarken uzman kanıtını koruyor.

## Kanıt

```text
npm run validate:agents
Agent config validation passed. Checked 11 coordinators and 21 specialist workers across 2 configs.

node --test scripts/tests/agent-worker-routing-acceptance.test.mjs
tests 8; pass 8; fail 0
✓ eleven installed coordinators own bounded worker groups and peer consultation stays parent-routed
✓ real routing CLI returns selected specialist knowledge without private content injection
```

```text
Real routing CLI: broad implementation architecture refactor security review release readiness
primaryCoordinator: leadership_coordinator
primary workers: release_verifier, code_reviewer, engineering_planner
peer handoffs: backend_coordinator(code_mapper), qa_coordinator(test_verifier), security_coordinator(security_auditor)
each handoff via: parent-routed-handoff
```

İncelenen yüzeyler: `catalog/agents.json`, `templates/codex/AGENTS.md`, `templates/codex/agents/*_coordinator.toml`, `scripts/codex-routing-board.mjs`, `scripts/validate-agent-config.mjs`, `scripts/tests/agent-worker-routing-acceptance.test.mjs`, `docs/agents.md`, `docs/agents.tr.md`.

## Değişen dosyalar

- `docs/agent-results/TASK-MSPTVOQNDTD1R-product-manager.md` — inceleme raporu.

## Riskler

- Çoklu coordinator seçimi parent handoff ile sınırlı; ana oturum handoff’ı kısa/karar odaklı tutmazsa coordination overhead oluşur.
- Routing advisory’dir; operatör gereksiz paralellik açmama disiplinini korumalıdır.
- Owner mapping, edit çakışmasını tek başına çözmez: yazan workerlara yine non-overlapping scope atanmalıdır.

## Açık sorular

- Handoff yükü için JSON şeması veya CI zorunluluğu isteniyor mu? Şimdilik sözleşme metinsel.
- Eşit worker sayısında alfabetik tie-break yerine iş etkisi önceliği katalogda ayrıca tanımlanmalı mı?

## Sonraki adım

Koordinatör davranışı genişletilirse katalog, ilgili TOML, global agreement, routing acceptance testi ve iki dilde `docs/agents` aynı değişiklikte güncellenmeli.
