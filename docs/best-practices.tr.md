# Senior Codex Best Practices

İlk kurulumu yapmak kolaydır; altı ay sonra hâlâ anlaşılır bir sistem bırakmak
ise ortak bir çalışma standardı ister. Buradaki kurallar resmi Codex yüzey
modelini, reponun doğrulama kapılarını ve benzer agent-tooling projelerinden
çıkan işe yarar dersleri bir araya getirir.

Yeni bir skill, MCP, ajan, profil, hook, installer seçeneği veya public doküman
eklemeden önce buraya dön.

## Hızlı Başla

| Hedef | Kullan |
| --- | --- |
| Tüm starter'i kur | Önce preview al, sonra `./scripts/install.sh --all --interactive` veya `.\scripts\install.ps1 -All -Interactive` çalıştır |
| Neyin nereye ait olduğunu anla | Aşağıdaki yüzey haritası ve [docs/codex-surfaces.tr.md](codex-surfaces.tr.md) |
| Tekrar kullanılabilir workflow ekle | Önce skill; bundle olarak dağıtılacaksa plugin |
| Canlı dış bağlam ekle | Auth gerekiyorsa varsayılan disabled MCP veya connector |
| Mekanik zorunluluk ekle | Sadece prose değil; hook veya validation script |
| Managed install yüzeyini incele | `node scripts/plan-install.mjs --all --json --redact-paths` |
| Push ya da release hazırla | [docs/verification.tr.md](verification.tr.md), sonra release gate |

## Kaynak Kalitesi

Kaynak sırası:

1. Güncel resmi Codex dokümantasyonu veya fetch edilmiş Codex manual.
2. Repo kanıtı: scriptler, template'ler, kataloglar, CI ve installer çıktısı.
3. Aynı paketleme veya prompt mimarisi problemini çözmüş yakın yerel repolar.
4. Dış makaleler sadece genel mühendislik bağlamı içindir; Codex ürün davranışı
   için otorite değildir.

Bir iddia kurulum davranışını, güvenlik duruşunu, connector erişimini veya
release akışlarını değiştiriyorsa repo seviyesinde doğrulama adımı gerekir.

## Yüzey Haritası

| İhtiyaç | Nereye konur |
| --- | --- |
| Tek seferlik görev kısıtı | Mevcut prompt |
| Kalıcı repo konvansiyonu | `AGENTS.md` |
| Kişisel/global Codex varsayılanı | `~/.codex/AGENTS.md` veya global config |
| Proje sandbox, model, MCP, profil, hook veya tool varsayılanı | `templates/codex/config.*.toml` |
| Tekrar kullanılabilir görev workflow'u | `SKILL.md`, opsiyonel script, reference ve asset içeren skill |
| Kurulabilir bundle | `.codex-plugin/plugin.json` içeren plugin |
| Canlı private veya harici veri | MCP server veya app connector |
| Deterministik lifecycle kontrolü | Hook, validation script veya CI workflow |
| Push, release, package veya deploy kanıtı | Verification docs, changelog ve release gate çıktısı |

Her davranışı `AGENTS.md` içine zorla koyma. Kural mekanik enforcement
gerektiriyorsa script veya hook yap. Workflow tekrar kullanılabilir bağlam
gerektiriyorsa skill yap. Tool veya dağıtım gerekiyorsa plugin olarak paketle.

## Senior Çalışma Döngüsü

1. Dosya değiştirmeden önce gerçek repo durumunu incele.
2. Geniş uygulama öncesi bilinmeyen alanları haritala.
3. Güncel API ve ürün davranışını resmi veya birincil kaynaklardan doğrula.
4. Kök problemi çözen en küçük tutarlı değişikliği uygula.
5. Önce en dar anlamlı kontrolü, sonra risk büyüdükçe geniş gate'leri çalıştır.
6. Diff'i secret, lokal state, üretilmiş artifact ve alakasız churn için incele.
7. Commit, push, publish, deploy veya tag sadece kullanıcı açıkça istediyse yap.

## Skill Ve Package Kuralları

- `catalog/skills.json` istek listesi degildir. Kurulabilir kayitlar bilinen
  package/skill ciftleri olmalidir.
- Her kurulabilir skill `package`, `skill` ve `source = package@skill` tanimlar.
- `catalog/skills-lock.json` her kurulabilir kaynagi tam upstream commit SHA'sina
  pinler. Skills CLI surumu ve registry integrity degeri tarihli uyumluluk ve
  kesif metadatasi olarak korunur.
- Installer `scripts/install-pinned-skill.mjs` kullanir; helper yalniz kilitli
  commit'i fetch eder, `HEAD` ve secilen skill'i dogrular, exact native copy'yi
  stage edip hash'ler ve fetch edilen repo kodunu ya da registry kaynakli bir
  installer'i calistirmadan etkinlestirir.
- Varsayilan kontroller offline ve deterministik kalir. Network kontrolleri
  aciktir: `npm run verify:skills:online`.
- Zaten lokal olan veya public package'tan guvenle kurulamayan skill'ler
  `install: false` kalmali ve nedeni yazmalidir.

## Uzman Ajan Kuralları

- `catalog/agents.json`, paketlenen uzman ajanlar icin incelenmis source of
  truth'tur.
- `catalog/agent-research-corpus.json`, her ajanin research domain, source
  type, refresh trigger, handoff ve authority-reference metadata kaydi icin
  incelenmis source index'tir.
- Her authority reference bir source freshness cadence tasimalidir. Corpus
  `dateChecked` degeri en siki cadence icinde kalmali; stale resmi docs,
  standart veya vendor guidance release oncesi lokal validation'da fail etmelidir.
- Her ajan decision heuristic, failure mode ve verification evidence icin
  reviewed expertise signal tasimalidir. Bu sinyaller corpus'u bibliyografya
  degil operasyonel calisma rehberi olarak tutar.
- Supplemental repo, skill, command-snapshot ve research-paper kaynaklari,
  agent `authorityRefs` icine terfi edene kadar `supplementalResearchRefs`
  altinda kalir; heuristic'leri guclendirebilirler ama default runtime
  authority degildirler.
- Her role dosyasi `Authority metadata contract` ve `Expertise signal contract`
  runtime bloklarini tasimalidir; boylece katalog metadata'si sadece offline
  validation'da degil, cagrilan ajanin davranisinda da etkili olur.
- Katalogdaki her ajan hem Windows hem Unix Codex config template'inde eslesen
  `[agents.<name>]` bloklarina sahip olmalidir.
- Her `config_file`, incelenmis bir `templates/codex/agents/*.toml` role
  dosyasina gitmelidir.
- Her role dosyasi her zorunlu runtime contract ve guardrail blogundan bir
  tane, ayrica en az 100 source-backed instruction item'i ve 20 distinct source
  marker tasimalidir.
- Agent template'leri `danger-full-access`, `approval_policy = "never"` veya
  gomulu token environment variable adlari kullanmamalidir.
- Yazma agirlikli uygulama, kullanici acikca bolmeyi istemedigi surece ana
  thread'de kalmalidir.

## Harici Starter Ve ECC Import Kuralları

Buyuk agent starter repolari faydali desenler verebilir, ama toptan import
edilmemelidir. Guncel ECC kaynakli politika
[docs/harness-compatibility.tr.md](harness-compatibility.tr.md) icindedir.

Alinabilecekler:

- manifest-backed planlama
- dependency-free validation
- target/collision metadata
- plugin ve MCP limitlerini acik anlatan dokumantasyon
- personal-path ve permissive-config kontrolleri

Engellenenler:

- installer icinde implicit dependency installation
- explicit flag disinda genis global hook veya Git config mutasyonu
- `approval_policy = "never"` veya `profiles.yolo` default'lari
- aktif authenticated MCP connector kataloglari
- raw prompt/tool telemetry hook'lari
- credential sekilli ornek import'u

## Doğrulama Gate'i

Bir maintainer başka kullanıcıya setup hazır demeden önce:

```bash
npm run check
node scripts/plan-install.mjs --all --json --redact-paths
git status --short
git diff --cached --check
gitleaks detect --redact --no-banner --no-git --verbose
```

Kurulabilir skill kaynakları değişmeden önce:

```bash
npm run verify:skills
npm run verify:skills:online
```

`verify:skills` offline ve CI için güvenlidir. `verify:skills:online`, Skills
CLI'a her kurulabilir package/skill çiftini çözdürür; böylece yalnız skill adını
repo sanıp clone etmeye çalışan hatalar tekrar etmez.

## Public-Safe Kurallar

- Token, auth dosyası, cookie, private key, memory, session, makineye özel path,
  lokal trust state, installer, arşiv veya build output yayınlama.
- Authenticated MCP'ler varsayılan disabled kalır.
- Repo bilerek npm paketi yapılmadıkça `package.json` private kalır.
- Public dokümanlar bunun resmi OpenAI ürünü değil community starter olduğunu
  söylemelidir.
- İngilizce ve Türkçe docs eşli kalır.

## UI Ve Frontend Kalitesi

Görev website, app, dashboard, görsel asset veya screenshot içeriyorsa:

- Önce mevcut içeriği ve markayı koru; yeni copy eklemeden önce hiyerarşi,
  boşluk, responsive davranış, state'ler ve dönüş netliğini iyileştir.
- Mümkünse gerçek browser veya screenshot destekli akışta doğrula.
- Mobil genişlik, uzun metin, focus state, loading/empty/error state ve console
  hatalarını kontrol et.
- Motion amaçlı olsun: kısa transform/opacity geçişleri, reduced-motion fallback
  ve bloklayan dekoratif animasyon yok.

## Bakım Kontrol Listesi

- Yeni docs İngilizce ve Türkçe eşlidir.
- README ilk ekranı doğru işletim dokümanlarına link verir.
- Yeni katalog kayıtları sadece elle değil script ile doğrulanır.
- Installer davranışı geçici `CODEX_HOME` ve `AGENTS_HOME` ile smoke-test edilir.
- Changelog kullanıcıyı etkileyen değişiklikleri kaydeder.
- Stage öncesi git status incelenir, sadece niyetli dosyalar stage edilir.
