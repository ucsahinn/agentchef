# TASK-MSPMS8AGAX4O5 — Ajan yönlendirmesi ve güvenli worker onay profili

## Ne yapıldı

- AgentSpace'in 8 ofis rolü mevcut 21 Codex Chef uzmanına catalog/agents.json içinde eksiksiz ve tekil bağlandı.
- Knowledge sınırı uzman adıyla aynı knowledgeRef üzerinden agent research corpus metadata'sına bağlandı; private AgentSpace memory/runtime injection kapatıldı.
- Routing CLI seçilen uzman için AgentSpace sahibi, knowledge referansı ve güvenli worker zarfını workers çıktısında üretir.
- 21 agent TOML'üne approval_policy = on-request eklendi; mevcut read-only/workspace-write sandbox değerleri korundu.
- Validator 8→21 tekil sahipliği, unknown/missing specialist, knowledge sınırı ve worker approval drift'ini fail-closed denetler.
- EN/TR ajan dokümantasyonu hizalandı.

## Kanıt

TDD RED — üretim değişikliğinden önce:

    tests 2
    pass 0
    fail 2
    AssertionError: agentSpaceOwner received undefined
    TypeError: profile.workers is undefined

TDD GREEN:

    ✔ all 21 specialists expose AgentSpace ownership, knowledge, and safe worker runtime policy
    ✔ real routing CLI returns selected specialist knowledge without private content injection
    tests 2
    pass 2
    fail 0

Dar validator'lar:

    Agent config validation passed. Checked 21 agents across 2 configs.
    Agent research corpus validation passed.
    Routing profile validation passed. Checked 16 profiles.

Gerçek yeni ephemeral Codex worker E2E (on-request, read-only):

    command_execution: git status --short
    exit_code: 0
    agent_message: SAFE_WORKER_E2E — exit code: 0.

Gerçek execpolicy sınıflandırması:

    git status          -> allow
    git push origin dev -> prompt
    justification: Pushing changes must remain an explicit user decision.

Tam repo ve secret kapıları:

    Validation passed. Checked 367 files.
    gitleaks scanned ~9943190 bytes (9.94 MB)
    gitleaks no leaks found
    git diff --check exit 0

npm run results:index denendi ancak package.json içinde script yok:

    npm error Missing script: results:index

Mevcut indeks formatı korunarak rapor bağlantısı elle eklendi.

## Değişen dosyalar

- catalog/agents.json
- docs/agents.md
- docs/agents.tr.md
- scripts/codex-routing-board.mjs
- scripts/validate-agent-config.mjs
- scripts/tests/TASK-MSPMS8AGAX4O5-agent-worker-routing.test.mjs
- templates/codex/agents/*.toml (21 dosyada yalnız approval_policy)
- docs/agent-results/TASK-MSPMS8AGAX4O5-gelistirici.md
- docs/agent-results/INDEX.md

## Riskler

- workspace-write uzmanlar çalışma alanına yazabilir; on-request, dar kurallar ve görev kapsamı birlikte korunmalıdır.
- Routing önerisi worker başlatma yetkisi değildir; delegasyon koşullu kalır.
- Worktree başka görevlere ait kirli değişiklikler taşır. Commit yalnız yukarıdaki açık kapsamı içerir.
- İlk iki subagent orkestrasyon denemesi gerçek spawn/shell olayı üretmediği için kanıt sayılmadı; kabul kanıtı ayrı ephemeral worker sürecinden alındı.

## Açık sorular

- npm run results:index scriptinin yokluğu ayrı bir repo bakım işi olarak ele alınmalıdır.

## Sonraki adım

Kurulum/repair akışında bu 21 TOML'ün geçici CODEX_HOME'a kopyalandığı smoke kapısı izlenmeye devam etmelidir.
