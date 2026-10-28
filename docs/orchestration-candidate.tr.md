# Orkestrasyon adayı

Bu çalışma 1.8.6 takım motorunu genişletir. Paket sürümü 1.9.0 kullanıcı onayıyla
hazırlanmıştır; uzaktan yayın ayrı bir adımdır. İkinci çalıştırıcı
veya brif/handoff sözleşmesi eklenmez.

| Brif maddesi | Uygulama yüzeyi | Kabul |
| --- | --- | --- |
| Y8 | codex-exec işçi override'ları | Yalnız işçide max_depth 1, ölçülen max_threads, tavan 8; rol TOML'ları etkileşimli kapasiteyi korur |
| Y15 / AS-A2 | orchestration-engines kataloğu ve validator | Devam, MCP aktarımı, uygunluk; gerçek adaptör desteği ayrı belirtilir |
| Y16 / AS-C3 | team-run setupJournal | Önerilen plan, tüketilen insan başlatma onayı, uygulama ve başarısız başlatmanın geri alınması |
| Y17 / AS-G1/G2 | skill-lifecycle | Taslak, lint, özete bağlı onay, yayın hazırlığı ve sürüm defteri; motor görünümleri ayrışırsa durur |
| I2 | team-runtime sahiplik, team-run | Her dosyanın tek etkin sahibi; sıralama seçilince çakışan kapsamlar bağımlılık olur |
| Y12 | team-run lead-review | Claude inceleme kanıtı başarılı entegrasyon commit'ine bağlıdır; verify ve merge öncesinde zorunludur |
| H3 | routing-profiles, team-run verify | Varsayılan doğrulayıcı ve seçilmiş autoVerify profillerinin zorunlu doğrulayıcıları |
| H5 | collect, integrate | Collect commit oluşturmadan taranmış, özeti alınmış yama saklar; mevcut işçi commit'leri uyarıyla yamaya katlanır |
| I3 | workerResources, workerEnv, cleanup | Koşu ortak önbelleği, ayrı port aralıkları; temizlik açık onay ister |
| Y6 | agent-brief alan kaydı, üretilen şemalar | Mevcut yedi brif ve altı handoff alanı; mevcut isteğe bağlı alanlar korunur |
| Y7 | evals, run-orchestration-evals | Üç örnek görev, kanıt kayıtları ve ağırlıklı puanlama; yirmi görevlik rubrik şeften beklenir |
| Y5 | adaptive-agent-routing | Sıralı işte tek işçi; bağımsız takım kapsam ve canlı kapasiteye göre boyutlanır |
| AS-E4 | team-worker.config.toml, validator'lar | node_repl ve yönetilen MCP'ler yalnız işçi sürecinde kapalı; genel config'e girmez |

## Mevcut motor girişleri

Takım koşusu = `beyin takim`. Plan ve start mevcut `baslat`, merge ise
`birlestir` onayını kullanır. Motor kataloğu Claude takım işçisi adaptörü
uygulamaz. Etkileşimli Claude şef kararları ve incelemeyi yürütür.

Planlara `routingProfiles: ["release-or-publish"]` eklenebilir. Kaynak
`catalog/routing-profiles.json` dosyasıdır; bilinmeyen kimlik planı durdurur.
Varsayılan test_verifier ve seçilen zorunlu roller uygulamadan bağımsız çalışır.
Salt okunur rapor koşuları mevcut rapor toplama tamamlanmasını korur; bu,
pano görevlerini bağımsız doğrulanmış olarak kapatmaz.

Ortak dosyalarda çalışanları sıralamak için `plan --serialize-overlaps` kullanın.
Bağımsız sahipler birlikte çalışır; bağımlı işçi başlamadan önce önceki sahiplerin
toplanan yamalarını alır. Lease ancak kanıt ve bağlı rapor review durumuna
ulaştığında aktarılır. Başarısız bağımlılık sonraki işi durdurur. Collect yama
özetini kaydeder, integrate commit öncesi kontrol eder. Eski toplanmış kayıtların
entegrasyon yolu korunur. İşçi commit'leri uyarıyla teslim yamasına katlanır;
işçi prompt'u commit yapmayı hâlâ yasaklar.

Entegrasyon, geçici indeksle hedef ağacı hesaplayıp yama uygulanmadan önce aynı
koşu kaydında bekleyen commit niyetini tutar. Git commit'i
başarısızsa yalnız uyguladığı yamayı geri alır ve tekrar denenebilir. Commit
başarılı olup kayıt yazımı başarısızsa tekrar deneme tam parent, ağaç ve konu
eşleşmesiyle işçiyi uzlaştırır; ikinci commit oluşturmaz. Süreç apply sonrasında
kesilirse tekrar deneme yalnız kaydedilmiş tam yamayı, beklenen indeks ağacı
eşleştiğinde ve unstaged/izlenmeyen değişiklik olmadığında geri alır. İlgisiz
değişiklik veya eksik kapsam devri checkpoint'i varsa güvenli biçimde durur,
inceleme için worktree'yi korur.

Entegrasyondan sonra Claude şef JSON inceleme dosyası yazar:

```json
{"engine":"claude","reviewer":"lead-session","verdict":"pass","integrationCommit":"<40-character integration HEAD>","evidence":["review.md:10 - diff inspected against all briefs"]}
```

`node scripts/team-run.mjs lead-review --run R-example --state board.json --review-file review.json`
ile kaydedin. Bu operatörün sağladığı inceleme kanıtıdır; yazılan kimlik alanları
model kimliğinin kriptografik ispatı değildir. Entegrasyon commit'i değişirse
inceleme geçersizdir. Eski verified koşuları, başarılı entegrasyon commit'i kayıtlı
ve entegrasyon worktree HEAD'i ile aynıysa bu kanıtı ekleyebilir. Ardından mevcut
verify ve insan onaylı merge adımları gelir.

İşçiler `npm_config_cache`, `AGENTCHEF_PORT_START`, `AGENTCHEF_PORT_END` alır.
Uygulamalar atanan port aralığını kullanmalıdır. Ortak önbellek paket kurmaz,
node_modules paylaşmaz. Worktree'ler varsayılan olarak tutulur. Yolları gözden
geçirdikten sonra `cleanup --approved` veya `merge --cleanup-approved` açık
temizlik onayıdır; mevcut sahiplik kontrolleri korunur. Skill yayını ve kurulu
ev dizini değişiklikleri ayrı onay kapsamındadır.

## Yapılandırılmış sözleşmeler ve skill hazırlığı

`schemas/agent-brief.schema.json` ve `schemas/agent-handoff.schema.json`,
`scripts/lib/agent-brief.mjs` alanlarından üretilir. Mevcut brief-check ve
handoff-check Markdown yanında bu JSON nesnelerini de kabul eder. Takımın mevcut
katı işçi çıktısı şeması dizileri, needs, verdict ve mutationCheck alanlarını korur.
Codex için dosyayı `codex exec --output-schema` ile; Claude için şema JSON'unu
`claude -p --output-format json --json-schema` ile verin. Kaynaklar:
[Codex CLI referansı](https://developers.openai.com/codex/cli/reference/),
[Claude CLI referansı](https://code.claude.com/docs/en/cli-reference).

`node scripts/skill-lifecycle.mjs draft --source SKILL.md --ledger tmp/skill.json`
yerel defteri açar. `lint`, ardından `{digest, approvedBy:"user", approvedAt}`
içeren dosyayla `approve --approval approval.json` kullanın. Son olarak
`publish --version 1.0.0 --views views.json`, `{codex:digest, claude:digest}`
eşleşmesini kontrol ederek **publish-ready** kaydeder. Dışarı yüklemez, kurmaz,
yayımlamaz. Kaynak değişirse yeni taslak ve onay gerekir. Defterleri commit etmeyin.

## Sürüm kararı ve Beyin arayüzü

Onaylanan 1.9.0 breaking değişiklikleri ve doğrulama kapsamı
[sürüm notlarında](release-notes.tr.md) kayıtlıdır. Sürüm paritesi son sürüm
commit'inde hazırlanır; push, tag ve yayın ayrı işlemlerdir.

Beyin'in paralel kanalı mevcut team-run komutlarını, kapasite dosyası v1'i,
yedi/altı alanlı şemaları, rol TOML'larını ve işçi süreci profilini kullanmalıdır.
Kullanıcı onaylarını üretmeden aktarmalıdır. Seçilen routing profil kimliklerini,
Claude inceleme kanıtını ve motor görünüm özetlerini sağlamalıdır. Şefin bildirdiği gerçek Windows koşusu
R20261027-c1ef entegrasyon, lead-review, verify ve sıralı sahipliği kapsar. Merge
ve merge --as-patch yalnız test kanıtıdır. Yirmi görevlik eval seti ayrıca sağlanır.

## Yerel doğrulama

Check betikleri aynı anda çalışan Node test dosyası sayısını ikiyle sınırlar.
Windows'ta doğrulama bu worktree içinde kalacaksa kısa bir yerel geçici kök ve
`core.longpaths=true` içeren, yalnız teste ait bir Git config kullanın.
`GIT_CEILING_DIRECTORIES` değerini bu geçici köke verin; bilerek Git reposu
oluşturulmayan fixture'lar üst worktree'yi keşfetmemelidir. Üç yönetilen ev
dizinini scratch köklere yönlendirin ve tam `npm run check` ile `npm run validate`
öncesinde `npm run dev:assert-scratch` çalıştırın. [Kurulum güvenliği](install.tr.md)
belgesine bakın. Bu ortam değerleri doğrulama süreci ve çocukları içindir.

Eval duman kanıtı için `node scripts/run-orchestration-evals.mjs run` mevcut Node test koşucusuyla kayıtlı ölçütleri çalıştırır. Model çağırmaz; model görevlerinin kanıtlarını ayrıca `score` ile puanlayın.
