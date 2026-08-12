# TASK-MSPLX7EBX2YJF — Ajan yapısı kabul ve regresyon tasarımı

## Ne yapıldı

Ürün dosyaları değiştirilmeden ajan kataloğu, rol TOML'ları, iki platform config'i, araştırma corpus'u, routing profilleri, gerçek routing CLI'sı, install planı ve mevcut güvenlik/locale/install doğrulayıcıları incelendi. Aşağıdaki matris hedef ajan yapısının kabul sözleşmesidir: kalıcı AgentSpace kimlikleri ürünün 21 dar uzmanıyla birleştirilmez; installable uzman yüzeyi kendi katalog/config/template/corpus/routing zincirinde doğrulanır; private hafıza ve makine-yerel state zincirin dışında kalır.

### Definition of Done

- Ajan sayısı ve kimlikleri `catalog/agents.json`, `templates/codex/agents/*.toml`, Windows/Unix config tabloları ve `catalog/agent-research-corpus.json` arasında birebir eşleşir.
- Her routing profili yalnız bilinen agent/skill/MCP kimliklerine gider; eşleşme advisory kalır, otomatik spawn veya MCP enablement yapmaz.
- İngilizce ve Türkçe eşdeğer niyetler aynı birincil owner'a deterministik gider; alakasız niyet route uydurmaz.
- Çelişkili yetki bayrakları, bilinmeyen referanslar, bozuk ağırlıklar, duplicate normalize sinyaller ve geçersiz CLI flag bileşimleri fail-closed reddedilir.
- Install planına yeni agent/knowledge operasyonu veya private/makine-yerel hedef eklenmez; temp-HOME smoke mevcut dosya koruması, idempotence ve independent-home davranışını kanıtlar.
- Locale, workflow security, content safety ve repo final kapıları temizdir; scope-dışı blocker varsa dosya ve gerçek hata ile raporlanır, push-ready iddiası yapılmaz.

### Pozitif test matrisi

| ID | Yüzey | Girdi / fixture | Beklenen kabul | Kapı |
| --- | --- | --- | --- | --- |
| A-P01 | Katalog parity | Mevcut katalog + TOML + iki config | 21 benzersiz ajan; 21 TOML; Windows ve Unix'te aynı 21 bildirim; sandbox/web alanları geçerli | `validate:agents` |
| A-P02 | Corpus parity | Ajan katalog kimlikleri ↔ research corpus | Her ajan tam bir corpus kaydına sahip; orphan veya eksik kayıt yok; kaynak metadata'sı talimat olarak yürütülmez | `validate:agent-corpus` |
| A-P03 | Routing referansları | 16 mevcut profil | Tüm agent/skill/MCP referansları çözülür; zorunlu owner, boundary, privilege, validation, rollback alanları vardır | `validate:routing` |
| A-P04 | Config taşınabilirliği | Windows/Unix ajan tabloları | Model/reasoning pin'i yok; aktif kullanıcı profili otoriter; config yolları platformla uyumlu | `validate:agents`, `validate:config-compat` |
| R-P01 | EN bug intent | `Debug a failing CI regression and find the root cause` | Tek birincil route `bug-root-cause`, confidence `high`, advisory `true` | gerçek `codex-routing-board --task --json` |
| R-P02 | TR arayüz intent | `Mobil arayuz tasariminda responsive ekran ve erisilebilirlik denetimi` | Tek birincil route `frontend-ui`, confidence `high` | gerçek `codex-routing-board --task --json` |
| R-P03 | TR güvenlik intent | `Kimlik yetki ve parola guvenlik denetimi yap` | Tek birincil route `security-sensitive`, confidence `high`; salt-okunur review sınırı | gerçek `codex-routing-board --task --json` |
| R-P04 | Wrapper profil | `chef --routing --profile starter-health --plain --no-log` | Exit `0`; tek profil; owner/surface/privilege/validation/rollback görünür; log yazılmaz | gerçek CLI |
| R-P05 | Determinizm | Aynı task iki ayrı süreçte | Zaman damgası hariç route sırası, score, confidence ve matched signals aynıdır; en çok 3 öneri | `test:routing-recommendation` + CLI |
| I-P01 | Install manifest | Mevcut manifest | 29 operasyon geçerli; `codex-agents` glob'u ve config/template kaynakları review edilmiş hedeflerle sınırlı | `validate:install-plan` |
| I-P02 | Gerçek geçici kurulum | Preview, zero-config, existing-config, idempotent, independent-home | Yalnız temp HOME hedefleri; kullanıcı-owned dosyalar korunur; tekrar çalıştırma idempotent; exit `0` | `validate:installer-smoke:core` |

### Negatif test matrisi

| ID | Fixture / komut | Beklenen fail-closed davranış | Kanıt kriteri |
| --- | --- | --- | --- |
| A-N01 | Duplicate ajan adı veya eksik TOML | Non-zero; ajan kimliği ve parity hatası görünür | Temp repo fixture; ürün dosyası mutasyonu yok |
| A-N02 | Config'te katalog dışı ajan ya da eksik platform bildirimi | Non-zero; platform ve ajan adı görünür | Windows ve Unix varyantları ayrı |
| A-N03 | Orphan/eksik corpus kaydı, bozuk source metadata | Non-zero; corpus agent/source kimliği görünür | `validate:agent-corpus` temp fixture |
| A-N04 | Ajan TOML'sine model/reasoning pin'i | Non-zero; kullanıcı profilini override eden alan reddedilir | Config/agent validator fixture |
| R-N01 | Bilinmeyen agent/skill/MCP referansı | Non-zero; profil ve bilinmeyen kimlik görünür | `validate:routing` fixture |
| R-N02 | `sandbox:read-only` + `workspace-write` | Non-zero; çelişkili profil kimliği görünür | Yetki artışı sessizce normalize edilmez |
| R-N03 | `profile:review` + `approval:on-request` | Non-zero; review profilinde yazma onayı genişletilmez | Routing fixture |
| R-N04 | Duplicate normalize sinyal, boş sinyal, ağırlık `<=0`, priority aralık dışı | Non-zero ve deterministik hata | Her varyant ayrı fixture |
| R-N05 | Alakasız task: `Write a haiku about rain` | Exit `0`; `recommendations=[]`, `profiles=[]`; fallback route yok | Gerçek JSON CLI |
| R-N06 | `--profile starter-health --task "install repair"` | Exit `2`; iki seçim modu birlikte reddedilir | Gerçek CLI stderr |
| R-N07 | Bilinmeyen profil | Non-zero; `codex-chef.cli-error.v1` / invalid argument; başka profile fallback yok | Wrapper ve direct child exit birlikte kaydedilir |
| S-N01 | Authenticated/destructive/open-world MCP varsayılan enabled | Non-zero; connector disabled/prompt sınırı korunur | `test:routing-mcp-policy`, `validate:mcp` |
| S-N02 | Secret, auth/session, private path veya AgentSpace memory package/install yüzeyine eklenmiş | Non-zero; içerik dosyası görünür, sırın kendisi rapora basılmaz | `validate:content`, security audit, Gitleaks |
| I-N01 | Foreign/user-owned aynı adlı hedef | Adopt yokken fail/preserve; writes-before-fail yok; byte-for-byte korunur | Temp-HOME installer fixture |
| I-N02 | Root/nested/dangling link traversal | Adopt olsa bile non-zero; dış hedef ve diğer HOME değişmez | Installer smoke fixture |
| I-N03 | Install plan destination `${CODEX_HOME}` / `${AGENTS_HOME}` dışı | Non-zero; traversal veya adjacent harness home reddedilir | `validate:install-plan` fixture |
| L-N01 | EN dokümanın TR eşi yok veya public README rotası yanıltıcı | Non-zero; eksik/uyumsuz dosya görünür | locale validator fixture |

### Gerçek CLI routing kabul akışı

1. Ön koşul: sabit Node yürütücüsü çözülür; Windows `PATH` arızası ürün sonucu sayılmaz. `node --version` ve executable source kanıta eklenir.
2. Statik bütünlük: `validate:agents`, `validate:agent-corpus`, `validate:routing`.
3. Direct JSON task routing: R-P01–R-P03 ve R-N05 ayrı süreçlerde çalıştırılır; schema, first route, confidence, advisory, profile count ve exit code assert edilir.
4. Gerçek wrapper: R-P04 çalıştırılır; görünür routing contract, lifecycle hygiene ve privilege delta insan-okur çıktıda doğrulanır.
5. CLI negatifleri: R-N06 ve bilinmeyen profil ayrı süreçlerde çalıştırılır; stderr ve child/wrapper exit kaydedilir.
6. Locale çifti: aynı task EN/TR varyantlarıyla çalıştırılır; aynı owner beklenir. `--lang tr --plain --no-log` wrapper metni ve ASCII progress ayrıca gözlenir.
7. Güvenlik fixture'ları: routing/MCP yetki çelişkileri temp kopyada mutasyona uğratılır; gerçek kaynak ağacı değişmeden validator non-zero olmalıdır.
8. Install kabulü: önce statik plan/alignment, sonra ayrı ve daha yüksek zaman bütçeli temp-HOME core smoke. Gerçek global install çalıştırılmaz.

### Regresyon kapıları

| Katman | Komut | Geçme ölçütü | Zaman |
| --- | --- | --- | --- |
| Ajan yapısı | `npm run validate:agents`; `npm run validate:agent-corpus` | Parity ve schema temiz | Her PR |
| Routing | `npm run validate:routing`; `npm run test:routing-recommendation`; `node --test scripts/tests/routing-gptpro.test.mjs` | Deterministik, bounded, advisory; tüm ref'ler geçerli | Her PR |
| Gerçek CLI | R-P01–R-P04, R-N05–R-N07 | Exact schema/route/error; `--no-log`; ürün/global write yok | Her PR |
| Güvenlik | `npm run test:routing-mcp-policy`; `npm run test:approval-policy`; `npm run validate:workflow`; `npm run validate:content`; `npm run validate:mcp` | Unsafe default ve yetki çelişkileri reddedilir | Her PR |
| Locale | `npm run validate:doc-locales`; `npm run validate:locales`; `npm run validate:kb-locales`; EN/TR intent çiftleri | Doküman çiftleri ve altı README rotası tam; aynı niyet aynı owner | Her PR |
| Install statik | `npm run validate:install-plan`; `npm run validate:installer` | Manifest/alignment temiz; private path ve doküman drift'i yok | Her PR |
| Install gerçek smoke | `npm run validate:installer-smoke:core` | Tüm temp-HOME senaryoları exit `0`; per-scenario çıktı; 15 dk üst sınır | Merge/nightly, ayrı job |
| Final | `npm run validate`; `gitleaks detect --redact --no-banner --no-git --verbose`; `git diff --check` | Tamamı temiz; scope-dışı blocker varsa push-ready değil | Handoff |

## Kanıt

Gerçek CLI routing çağrılarının çıktısı:

```text
EN-POS-BUG|exit=0|profiles=1|routes=bug-root-cause:high
TR-POS-UI|exit=0|profiles=1|routes=frontend-ui:high
TR-POS-SEC|exit=0|profiles=1|routes=security-sensitive:high
NEG-NOMATCH|exit=0|profiles=0|routes=
WRAPPER-EXIT=0
NEG-CONFLICT-EXIT=2
Codex Chef routing error: Use either --profile or --task, not both.
```

Wrapper çıktısında gerçek gözlenen sözleşme:

```text
Profiles: 1
Routing plan: selected agents, skills, MCPs, commands, and skips in one initial line.
Routing result: completion state and evidence in one final table or line.
Agents: codex_doctor, test_verifier
Privilege delta: read-only diagnostics first; repair writes only after explicit apply.
[ok] DONE routing
```

Dar kapılar:

```text
Agent config validation passed. Checked 21 agents across 2 configs.
Routing profile validation passed. Checked 16 profiles.
README locale validation passed. Checked 6 honest public entry points.
Doc locale validation passed for complete English and Turkish operator docs.
Install plan validation passed. Checked 29 operations.
Workflow security validation passed. Checked 1 workflow file(s).
Content safety validation passed. Checked 391 text files.
Codex Chef CLI validation passed.
```

Normalize edilmiş gerçek temp-HOME smoke (422 saniyelik birleşik tur içinde):

```text
[installer-smoke] curated user-owned skill preservation
[installer-smoke] approval harmony without Codex CLI
[installer-smoke] full preview
[installer-smoke] post-mutation rollback
[installer-smoke] zero-config install
[installer-smoke] existing-config install
[installer-smoke] idempotent refresh
[installer-smoke] independent-home install
Installer core smoke validation passed: preview, zero-config, existing-config, idempotent, and independent-home scenarios.
EXIT=0
```

İlk validator turunda shell `node` adını çözemedi; aynı kapılar sabit Node yolu ve süreç-yerel `PATH` normalizasyonuyla tekrarlandı. İlk tur ürün başarısızlığı sayılmadı. Normalize ikinci turda installer smoke ve CLI geçti.

Mevcut scope-dışı kırmızı kapı:

```text
Installer alignment validation failed:
- mevcut başka ajan sonuç raporlarında machine/user-specific absolute path bulundu
EXIT=1
```

Bu raporda makineye özel mutlak yol kopyalanmadı. Alignment hatası başka görev raporlarına aittir; açık izin olmadan düzeltilmedi.

## Değişen dosyalar

- `docs/agent-results/TASK-MSPLX7EBX2YJF-tasarimci.md`
- `docs/agent-results/INDEX.md`

Ürün, katalog, config, template, corpus, routing, installer ve test dosyalarına dokunulmadı.

## Riskler

- Task Board liste aracı görev başlığı/statü/atamayı gösterdi, zengin description gövdesini döndürmedi. Kullanıcı mesajındaki zorunlu kapsam, repo sözleşmesi ve aynı sprintteki envanter/mimari raporlarıyla eksiksizleştirildi.
- Installer alignment, mevcut başka sonuç raporlarındaki private/makine-yerel yol metinleri nedeniyle kırmızı; repo bu haliyle push-ready değildir.
- Windows child PowerShell süreçleri ortamdan `node` bulamayabilir. Kapı harness'i Node executable yolunu normalize etmeli; ürün regresyonu ancak normalize tekrarında sürerse açılmalıdır.
- Core installer smoke ağırdır; statik kapılarla tek opak adımda birleştirilirse timeout teşhisi zayıflar. Ayrı job, per-scenario streaming ve en az 15 dakikalık üst sınır önerilir.
- `qa_lead` ve `spec_author` katalog/config/template/corpus'ta mevcut olsa da seçili routing profillerinde görünmez. Bu bilinçli manual opt-in ise dokümante edilmeli; değilse hedef routing kararı ayrı ürün değişikliğidir.
- `.agentspace/` private, makine-yerel ve install/package dışı kalmalıdır; geniş staging özel hafıza sızıntısı riski taşır.

## Açık sorular

1. `qa_lead` ve `spec_author` manual opt-in olarak mı kalacak, yoksa yeni/mevcut task-shape profillerine açıkça mı bağlanacak?
2. Installer smoke harness'inde Node executable propagation ve per-scenario timeout/flush public CI sözleşmesi yapılacak mı?
3. Sonuç raporları public-safe content/alignment taramasında kalmalı mı? Güvenli varsayılan: evet; private path'ler redakte edilmelidir.

## Sonraki adım

Uygulama sahibi önce negatif fixture'ları temp repo kopyalarıyla eklemeli; ardından agent/catalog/corpus/routing validator zincirini tek PR'da görünür kılmalıdır. Install manifestine yeni operasyon eklenmemeli. Gerçek EN/TR routing CLI ve ayrı temp-HOME core smoke yeşil olmadan yapı kabul edilmemelidir. Scope-dışı private-path blocker'ları sahipleri tarafından redakte edildikten sonra `npm run validate` yeniden çalıştırılmalıdır.
