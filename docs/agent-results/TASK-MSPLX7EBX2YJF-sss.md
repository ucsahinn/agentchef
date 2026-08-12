# TASK-MSPLX7EBX2YJF — Routing kabul ve regresyon kapıları

## Ne yapıldı

Routing profil kataloğu, `chef` CLI sarmalayıcısı, ağırlıklı görev önericisi ve mevcut güvenlik/locale/install doğrulayıcıları incelendi. Uygulama koduna dokunulmadan, aşağıdaki kabul matrisi ve kapı sırası tasarlandı; uygulanabilir vakalar gerçek CLI ve mevcut test giriş noktalarıyla çalıştırıldı.

### Definition of Done

- Pozitif ve negatif routing vakaları; giriş, beklenen route, exit code ve kanıtla tanımlı.
- Gerçek `npm run chef -- --routing ...` akışı JSON ve Türkçe/plain modlarında çalıştırılmış.
- Bilinmeyen profil, geçersiz flag bileşimi ve eşleşmeyen görev fail-closed/no-route davranışı doğrulanmış.
- Güvenlik, locale ve install kapıları ayrı komutlar ve geçme ölçütleriyle sıralanmış.
- Geçmeyen veya timeout olan kapılar açık risk olarak raporlanmış; pass varsayılmamış.

### Pozitif/negatif test matrisi

| ID | Tür | Giriş / komut | Beklenen sözleşme | Kapı |
| --- | --- | --- | --- | --- |
| R-P01 | Pozitif katalog | `npm run validate:routing` | 16 profil; tüm agent/skill/MCP referansları çözülür; zorunlu policy alanları vardır; exit `0` | PR |
| R-P02 | Pozitif profil CLI | `npm run chef -- --routing --profile starter-health --json --no-log` | `schemaVersion=codex-chef.routing.v2`, `profileCount=1`, yalnız `starter-health`, exit `0`; log yazılmaz | PR + gerçek CLI |
| R-P03 | Pozitif EN görev önerisi | `node scripts/codex-routing-board.mjs --task "MCP connector OAuth tool allowlist security" --json` | İlk route `mcp-connector-change`; yüksek güven; sonuç advisory; en çok 3 öneri | PR |
| R-P04 | Pozitif TR görev önerisi | Aynı komut, görev `MCP connector OAuth tool allowlist güvenlik` | Diyakritik normalizasyonuna rağmen ilk route `mcp-connector-change`; `security-sensitive` ikincil olabilir | PR |
| R-P05 | Pozitif release önceliği | `GitHub Release tag oluştur ve origin main push` | İlk route `release-or-publish`; yayın eylemleri approval-gated | PR |
| R-P06 | Pozitif TR güvenlik | `kimlik yetki parola güvenlik incelemesi` | İlk route `security-sensitive`; `profile:review` + `sandbox:read-only` | PR |
| R-P07 | Pozitif locale CLI | `npm run chef -- --routing --profile starter-health --lang tr --plain --no-log` | Türkçe sarmalayıcı metni, ASCII durum etiketleri, profil ayrıntısı, exit `0` | PR + gerçek CLI |
| R-P08 | Determinizm | Aynı görev iki kez `--json` | `recommendations` byte-anlamlı eşdeğer; zaman damgası hariç route/sıra/skor değişmez | PR |
| R-N01 | Bilinmeyen profil | `npm run chef -- --routing --profile does-not-exist --json --no-log` | Non-zero; `codex-chef.cli-error.v1`; `invalid-argument`; profil fallback’i yok | PR + gerçek CLI |
| R-N02 | Geçersiz flag bileşimi | `npm run chef -- --status --profile starter-health --no-log` | Exit `2`; `--profile can only be used with --routing`; status çalıştırılmaz | PR + gerçek CLI |
| R-N03 | Eşleşmeyen görev | `... --task "zzzxqv unmatched token" --json` | Exit `0`; `recommendations=[]`, `profiles=[]`; rastgele route uydurulmaz | PR |
| R-N04 | Yetki çelişkisi | Fixture: `sandbox:read-only` + `workspace-write` | Validator non-zero ve profil-id içeren hata | PR güvenlik |
| R-N05 | Review/approval çelişkisi | Fixture: `profile:review` + `approval:on-request` | Validator non-zero; sessiz yetki genişlemesi yok | PR güvenlik |
| R-N06 | MCP unsafe default | Fixture: `enabled`, `destructive_enabled` veya `open_world_enabled=true`; approval=`approve` | Her varyant non-zero; varsayılan kapalı/prompt sınırı korunur | PR güvenlik |
| R-N07 | Bozuk referans | Profilde bilinmeyen agent/skill/MCP | `validate:routing` non-zero ve profil + referans adı görünür | PR |
| R-N08 | Bozuk match şekli | Duplicate normalize signal, boş signal, sıfır/negatif ağırlık veya priority dış aralık | `validate:routing` non-zero; deterministik hata | PR |
| I-P01 | Install plan | `npm run validate:install-plan` | Manifest ve operasyon sözleşmesi geçer; bu çalışmada 29 operasyon | PR install |
| I-P02 | Temp-HOME core smoke | `npm run validate:installer-smoke:core` | Preview, zero-config, existing-config, idempotent, independent-home; yalnız temp hedef; exit `0` | Nightly/merge |
| I-N01 | Kullanıcı-owned collision | Installer smoke fixture | Adopt flag yokken writes-before-fail yok; dosyalar byte-for-byte korunur | Nightly/merge |
| I-N02 | Link traversal | Root/nested/dangling link fixture | Adopt olsa bile non-zero; dış hedef ve diğer HOME değişmez | Nightly/merge |

### Gerçek CLI routing kabul akışı

1. Statik bütünlük: `npm run validate:routing`.
2. Tek profil JSON kabulü: `chef --routing --profile starter-health --json --no-log`; şema, profil sayısı, policy ve privilege delta assert edilir.
3. Task routing: İngilizce ve Türkçe aynı niyet çalıştırılır; ilk route, confidence, advisory ve maksimum öneri sayısı assert edilir.
4. Negatif sınırlar: bilinmeyen profil, `--profile` yanlış action ile ve eşleşmeyen görev ayrı süreçlerde çalıştırılır; exact exit/output sözleşmesi assert edilir.
5. İnsan-okur locale: `--lang tr --plain --no-log`; Türkçe wrapper, ASCII progress ve profil detayları gözlemlenir.
6. Güvenlik fixture’ları: routing/MCP flag çelişkileri temp kopyalarda mutasyona uğratılır ve validator’ın fail-closed olduğu kanıtlanır.

### Regresyon kapıları

| Katman | Komutlar | Geçme ölçütü | Çalıştırma zamanı |
| --- | --- | --- | --- |
| Routing | `validate:routing`, `test:routing-recommendation`, `routing-gptpro.test.mjs` | Tümü exit `0`; deterministik, bounded, advisory | Her PR |
| CLI sözleşmesi | R-P02, R-P07, R-N01, R-N02, R-N03 | Exact schema/exit/error; `--no-log`; yazma yok | Her PR |
| Güvenlik | `test:routing-mcp-policy`, `test:approval-policy`, `validate:workflow`, `validate:content` | Unsafe flag ve mutation policy negatifleri reddedilir; workflow read-only/pinned | Her PR |
| Locale | `validate:doc-locales`, `validate:locales`, `validate:kb-locales`, EN/TR routing intent çiftleri | Belge çiftleri tam; altı README giriş noktası dürüst; TR intent aynı owner’a gider | Her PR |
| Install statik | `validate:install-plan`, `validate:installer` | Plan/alignment geçer; private path veya kaynak-doküman drift’i yok | Her PR |
| Install gerçek smoke | `validate:installer-smoke:core` | Temp HOME’larda tüm 5 senaryo exit `0`; timeout yok | Merge/nightly; 10 dk bütçe |
| Repo final | `npm run validate`, `gitleaks detect --redact --no-banner --no-git --verbose`, `git diff --check` | Tümü temiz veya her pre-existing blocker kaynak dosya ile raporlu | Handoff |

## Kanıt

Gerçek komut çıktıları (2026-08-12):

```text
Routing profile validation passed. Checked 16 profiles.
test:routing-recommendation: tests 3, pass 3, fail 0
routing-gptpro.test.mjs: tests 1, pass 1, fail 0
```

```text
chef --routing --profile starter-health --json --no-log
schemaVersion: codex-chef.routing.v2
profileCount: 1
profiles[0].id: starter-health
exit: 0
```

```text
Task: MCP connector OAuth tool allowlist güvenlik
recommendations[0]: mcp-connector-change, score 71, confidence high, advisory true
recommendations[1]: security-sensitive, score 9, confidence medium, advisory true

Task: zzzxqv unmatched token
recommendations: []
profiles: []
```

```text
BAD_PROFILE_EXIT=1 (npm wrapper ayrıca child exit 2 uyarısı bastı)
schemaVersion: codex-chef.cli-error.v1
code: invalid-argument
message: Unknown routing profile: does-not-exist

BAD_COMBO_EXIT=2
Codex Chef CLI error: --profile can only be used with --routing.
```

```text
test:routing-mcp-policy: tests 6, pass 6, fail 0
test:approval-policy: tests 20, pass 20, fail 0
Workflow security validation passed. Checked 1 workflow file(s).
Content safety validation passed. Checked 391 text files.
Doc locale validation passed for complete English and Turkish operator docs.
README locale validation passed. Checked 6 honest public entry points.
KB locale validation passed.
Install plan validation passed. Checked 29 operations.
```

Başarısız/bloke kanıt:

```text
Installer alignment validation failed:
- docs/agent-results/TASK-MSP4DGPQNCA07-gelistirici.md contains a machine/user-specific absolute path: C:\\Users\\(?!user

validate:installer-smoke:core
Exit code: 124
command timed out after 304024 milliseconds
```

Daha sonraki tam smoke yeniden koşusu timeout olmadı ve önceki install belirsizliğini kapattı:

```text
[installer-smoke] curated user-owned skill preservation
[installer-smoke] approval harmony without Codex CLI
[installer-smoke] full preview
[installer-smoke] post-mutation rollback
[installer-smoke] zero-config install
[installer-smoke] existing-config install
[installer-smoke] idempotent refresh
[installer-smoke] independent-home install
Installer smoke validation passed with temp targets: C:\Users\ulasc\AppData\Local\Temp\Codex Chef Install Smoke [...]
```

Ek birleşik kapı sonucu:

```text
validate:chef-cli: passed
operation lock/journal + repair/runtime: tests 22, pass 22, fail 0
npm run validate: FAIL
Forbidden local state/path pattern in docs/.agent-notifications: C:\Users\...
npm run results:index: FAIL — Missing script: "results:index"
```

## Değişen dosyalar

- `docs/agent-results/TASK-MSPLX7EBX2YJF-sss.md` — bu kabul matrisi, gerçek CLI akışı, kapılar ve kanıt.
- `docs/agent-results/INDEX.md` — görev satırı mevcut biçimde eklendi; zorunlu `npm run results:index` denendi fakat mevcut `package.json` bu script'i tanımlamıyor.
- `.agentspace/memory/agents/sss/qa-gate-evidence-discipline.md` ve `MEMORY.md` — gelecekte yararlı QA kapı disiplini.

Uygulama, katalog, installer, template veya ürün dokümanı değiştirilmedi.

## Riskler

- Install alignment kapısı, başka göreve ait sonuç raporundaki makineye özel yol nedeniyle kırmızı; bu task kapsamında değiştirilmedi.
- İlk core installer smoke 304 saniyede timeout oldu; daha sonraki tam installer smoke tüm sekiz ilerleme aşamasıyla PASS oldu. Yine de CI/nightly’de 10 dakikalık ayrı job ve per-scenario streaming tanı değerini artırır.
- Tam `npm run validate`, görev öncesinden mevcut izlenmeyen `docs/.agent-notifications` içindeki makineye özel yol nedeniyle FAIL; worktree push-ready değildir.
- Sürecin zorunlu tuttuğu `npm run results:index` script'i mevcut `package.json` içinde yoktur; indeks satırı mevcut tek-satır formatında eklenmiştir.
- npm sarmalayıcısı bilinmeyen profil vakasında yakalanan `$LASTEXITCODE=1` ile child-process `exit 2` uyarısını birlikte gösterdi. Otomasyon exact tek sayı yerine CLI JSON error schema + non-zero sözleşmesini temel almalı veya wrapper/child exit uyumu ayrıca sabitlenmeli.
- Çalışma ağacı diğer görevlere ait değişikliklerle kirli; final doğrulama sonuçları yalnız bu task’ın değişikliklerine atfedilemez.

## Açık sorular

- `validate:installer-smoke:core` senaryolarına per-scenario timeout ve anlık stdout flush eklenmeli mi?
- npm wrapper ile child CLI exit code’unun birebir korunması public sözleşme olarak isteniyor mu?
- `docs/agent-results/**` dosyaları installer private-path taramasının kapsamından çıkarılmalı mı, yoksa sonuç raporları da public-safe kalmaya devam mı etmeli? Güvenli varsayılan: public-safe kalmalı.

## Sonraki adım

Owner, makineye özel yol içeren dış-scope artefaktları (`docs/.agent-notifications` dahil) güvenli biçimde repo dışına almalı veya public-safe redact etmeli; ardından `npm run validate` yeniden çalıştırılmalı. `results:index` script'i ayrı ürün kapsamıyla geri getirilmelidir. Bu kapılar yeşil olmadan repo push-ready sayılmamalı.
