# Upgrade Rehberi

Güncelleme, daha önce yaptığın tercihleri ezmeden AgentChef'in yönetilen
dosyalarını yenilemeli. Aşağıdaki akış gelen değişikliği önce gösterir, yedek
alır, yalnız yönetilen yüzeyi uygular ve kurulu runtime'ı doğrular.

## Codex Chef 0.5.74'ten AgentChef 0.6.0'a Geçiş

0.6.0, AgentChef adıyla çıkan ilk sürümdür. Mevcut bir 0.5.74 kurulumu için
değişenler:

- Depo `https://github.com/ucsahinn/agentchef` adresine taşındı; eski adres
  yönlendirir ama remote'unu güncelle:
  `git remote set-url origin https://github.com/ucsahinn/agentchef.git`.
- Node.js 22.12 veya üzeri gerekir (Node 18 ve 20 ömrünü tamamladı).
- Yerleşik Brain workflow'u kaldırıldı (bkz. [Brain emekliliği](brain-retirement.tr.md)).
  Installer artık `~/.agents/skills/codex-chef-brain` dizinini yönetmez; eski
  kopya olduğu gibi bırakılır, istersen kendin silebilirsin. `--continuity` ve
  `CODEX_CHEF_BRAIN_HOME` kaldırıldı.
- Diskteki kimlik değişmedi: plugin id'si, sahiplik işaretçileri, yedek klasörü
  adları ve şema stringleri hâlâ `codex-chef` önekini kullanır; 0.6.0 için göç
  adımı gerekmez. Kimlik yeniden adlandırması, önce-ön-izle mantıklı özel bir
  göç komutuyla 1.0.0'da yayınlandı.
- Almanca, İspanyolca, Fransızca ve Brezilya Portekizcesi README özetleri
  kaldırıldı; İngilizce ve Türkçe dokümantasyon tam paritede sürüyor.

Aşağıdaki normal güncelleme akışı geçerlidir; ön izleme, yeniden adlandırılmış
`AGENTS.md` metnini ve kaldırılan Brain skill adımını gösterir.

## 0.6.0'dan 0.9.0'a Geçiş

0.9.0, ikinci kurulum hedefi olarak Claude Code'u ekler. Mevcut bir Codex
kurulumu için varsayılan olarak hiçbir şey değişmez: aşağıdaki güncelleme
akışı `~/.codex` ve `~/.agents` dizinlerini eskisi gibi yönetmeye devam eder
ve diskteki kimlik hâlâ `codex-chef` önekini kullanır. 0.9.0'daki yenilikler:

- Installer'larda, `npm run chef -- --install`, `--preview`, `--reset` ve
  yeni `--remove` komutunda `--target codex|claude|both`. Etkileşimli
  kurulum `codex` ve `claude` CLI'larını algılar ve hangi hedeflerin
  yönetileceğini sorar.
- Claude Code yüzeyi tek bir transaction yardımcısıyla kurulur
  (`scripts/install-claude-target.mjs`); bkz.
  [Claude Code yüzeyleri](claude-surfaces.tr.md).
- `npm run chef -- --remove --target <t>`, yalnızca AgentChef'e ait dosyaları,
  bağlantıları, marketplace girdilerini ve makbuza kayıtlı ayarları silen
  önce-ön-izle bir kaldırmadır; kullanıcı içeriği, Git guard'ları ve yedekler
  kalır. Üretilen MCP profilleri (full, multi-session, offline) de kalır.
  `CODEX_HOME/cache/pinned-skill-sources` altında AgentChef makbuzu taşıyan
  pinli skill önbellekleri yedeksiz silinir; yeniden kurulum onları pinli
  commit'ten tekrar indirir. Girdi silindikten sonra yalnızca AgentChef'in boş
  iskeleti kalan plugin marketplace dosyası da kaldırılır.
  `CODEX_HOME/serena-pool` iki ortamın paylaştığı yerel havuz token'ını tutar;
  açık oturum kalmadığında silebilirsiniz. Kendi ayarlarınıza birleştirilmiş
  bir `config.toml` kaldığı sürece, onun işaret ettiği Serena köprüsü ve ajan
  rol dosyaları `kept-referenced` olarak kalır; böylece Codex temiz açılmaya
  devam eder. `[mcp_servers.serena]` ve `[agents.*]` tablolarını kaldırıp
  kaldırma işlemini yeniden çalıştırırsanız bu dosyalar da silinir.
- `npm run verify:install:runtime -- --target claude` ve
  `npm run codex:status -- --target both` Claude tarafını doğrular.

## 0.9.0'dan 1.0.0'a Geçiş

1.0.0, diskteki kimliği `codex-chef`'ten `agentchef`'e çevirir: sahiplik
işaretçileri (`.agentchef-managed.json`, `.agentchef-source.json`), işlem
günlüğü ve kilit adları, yedek klasörü önekleri, makbuz ve rapor şema
stringleri (`agentchef.<ad>.vN`), plugin klasörü
(`plugins/agentchef-workflows`), operator skill'i (`agentchef-operator`),
kişisel marketplace adı ve plugin id'si (`agentchef-workflows@agentchef`;
plugin'in kendisi 1.3.0'da `agentchef` oldu), Git hook banner'ı ve `AGENTCHEF_*`
ortam değişkenleri.

Güncelleme günü hiçbir şey bozulmaz: her okuyucu eski yazımı kabul eder, bu
yüzden göç edilmemiş bir home yine yönetilen olarak tanınır, onarılır,
doğrulanır ve doğru kaldırılır. Dönüşümün kendisi tek bir açık, önce-ön-izle
komuttur:

```powershell
npm run chef -- --migrate-identity                     # ön izleme, Codex hedefi
npm run chef -- --migrate-identity --target both       # ön izleme, iki hedef
npm run chef -- --migrate-identity --target both --apply
```

Göç ayrıca AgentChef'in `CODEX_HOME/config.toml` içine kendi yazdığı banner
yorumlarını ve plugin id anahtarlarını (`[hooks.state."<plugin id>:…"]` dahil)
yeniden yazar ve boşalmış eski plugin-cache klasörünü kaldırır. Plugin yeni
id'siyle yeniden eklenmişse o hook-state tablosunu Codex zaten yazmıştır; bu
durumda eski tablo yeniden adlandırılmaz, silinir; böylece dosyada asla aynı
tablodan iki tane oluşmaz. Başka ürünlerin
tabloları, proje güven girdileri ve kendi ayarların bu dosyada hiç
değiştirilmez.

Göç; işaretçileri, operator skill klasörünü ve plugin klasörlerini yeniden
adlandırır; marketplace girdisini, adını ve plugin id'sini yeniden yazar;
yalnızca baytları gönderilen bir şablonla eşleşen eski banner'lı Git hook'unu
yeniler; Claude makbuzlarını ve operator skill bağlantısını yeniden yazar;
CLI'lar mevcutsa plugin'i `codex plugin` ve `claude plugin` üzerinden
yeniden kaydeder. Yedekler `CODEX_HOME/backups/agentchef-migrate-*` altına
düşer. Eski yedek klasörleri adlarını korur ve `npm run chef -- --backups`
ile listelenmeye devam eder. Eski `CODEX_CHEF_*` ortam değişkenleri çalışmaya
devam eder ve kendin yeniden adlandırabilesin diye raporlanır.

1.0.0 ayrıca Claude hedefinin user-scope `.claude.json` dosyasını nerede
bulduğunu düzeltir: home dizinindeki `~/.claude.json`, ya da yalnızca değişken
ayarlıysa `$CLAUDE_CONFIG_DIR/.claude.json`. 0.9.0 MCP girdilerini Claude
Code'un değişken olmadan hiç okumadığı `~/.claude/.claude.json` dosyasına
birleştiriyordu. Bir 0.9.0 Claude kurulumu bu dosyayı bıraktıysa installer'ı
yeniden çalıştır (doğru dosyaya birleştirir ve makbuzu yeniden yazar), sonra
başka bir şey içermediğini doğrulayıp artık `~/.claude/.claude.json` dosyasını
kendin sil. Skill bağlantı adımı artık yalnızca hâlâ `catalog/skills.json`
içinde olan skill'leri bağlar; katalogdan çıkmış yönetilen bir dizin `retired`
olarak raporlanır ve dokunulmaz.

## 1.x'ten 1.2.0'a Geçiş

Göç adımı gerekmez. Rehberli güncellemeyi çalıştır; kurulu her hedefi (Codex
hedefi, Claude Code hedefi ya da ikisi) yeniler ve Claude Code'u yeni plugin
sürümüne taşır:

```powershell
npm run chef -- --update            # ön izleme
npm run chef -- --update --apply    # incelemeden sonra uygula
```

Açıkça seçmek için `--target codex|claude|both` ver. Güncellemeden sonra Serena
backend'i yeni pin (v1.7.0) için bir kez daha indirilir; bu yüzden ilk semantic
çağrı daha uzun sürer. Nelerin değiştiği [sürüm notlarında](release-notes.tr.md).

## 1.0–1.2'den 1.3.0'a Geçiş

1.3.0, plugin'in adını `agentchef-workflows`'tan `agentchef`'e çevirir.
Çağrılar artık Codex'te `$agentchef:<skill>`, Claude Code'da
`/agentchef:<skill>` (başka bir komut aynı adı taşımıyorsa orada yalın
`/<skill>` da çalışır), bir rol için de `agentchef:<rol>` biçimindedir.

AgentChef'in her skill'i artık iki CLI'ya da yalnızca plugin skill'i olarak
ulaşır. On bundled skill plugin'in içinde gelir; on sekiz pinned upstream skill
ise (`-All`, `-InstallSkills`, `--all`, `--install-skills`) aynı plugin
kaynağına, `AGENTS_HOME/plugins/sources/agentchef/skills/<ad>` altına, her
biri kendi `.agentchef-source.json` provenance kaydıyla yazılır. Installer
artık skill'leri `AGENTS_HOME/skills` altına kopyalamaz ve
`~/.claude/skills` altına bağlamaz; böylece her skill CLI başına iki kez
değil bir kez listelenir. `-AdoptSkillLinks`, `--adopt-skill-links` ve
`-Adopt*Skill` / `--adopt-*-skill` bayrakları hâlâ kabul edilir ama yalnızca
bir uyarı basar.

1.0–1.2 kurulumunu göç komutuyla dönüştür; önce ön izle:

```powershell
npm run chef -- --migrate-identity --target both          # ön izleme
npm run chef -- --migrate-identity --target both --apply
```

Göç; plugin klasörlerini, marketplace girdilerini ve Codex'teki
`[plugins."agentchef-workflows@agentchef"]` ile hook-state tablolarını yeniden
adlandırır, Codex ve Claude plugin kayıtlarını da yenisiyle değiştirir.
Ayrıca AgentChef'in `AGENTS_HOME/skills` altındaki kendi doğrudan skill
kopyalarını emekli eder: her kopya önce yedeklenir, sonra kaldırılır. Bir kopya
yalnızca marker'ı (`.agentchef-managed.json`) ya da provenance kaydı
(`.agentchef-source.json`) onun AgentChef'e ait olduğunu kanıtlıyorsa ve plugin
kaynağı o skill'i zaten taşıyorsa emekli edilir. Skill'i henüz plugin'de
olmayan pinned bir kopya, installer onu plugin'e yazana kadar korunur (karar
`keep-until-plugin`); tam kurulumu çalıştır, sonra göçü yeniden çalıştır.
Emekli edilen bir kopyaya işaret eden Claude bağlantıları onunla birlikte
kaldırılır ve kurulum makbuzundan düşülür. Kendi skill'lerine ve yabancı
bağlantılara asla dokunulmaz.

Claude installer'ı da önceki kurulum makbuzunun kaydettiği skill
bağlantılarını emekli eder, ama yalnızca plugin başarıyla kaydedildikten
sonra. Kayıt atlanır ya da başarısız olursa bağlantılar yerinde ve makbuzda
kayıtlı kalır.

Göçten sonra AgentChef skill'leri artık `~/.agents/skills` altında değildir.
`~/.agents/skills` dizinini doğrudan okuyan başka araçlar onları artık görmez;
onları yalnızca Codex ve Claude Code, plugin üzerinden görür.

`npm run verify:install:runtime -- --expect-skills` skill'leri plugin
kaynağının içinde denetler; bir skill'in plugin dışında hâlâ doğrudan bir
kopyası varsa başarısız olmadan uyarır ve göç komutunu gösterir.

### 1.3.0'daki MCP değişiklikleri

Kendiliğinden kaldırılanlar:

- Codex: `memory` ve `filesystem` sunucuları artık katalogda yok. Güncelleme
  (`-Update` / `--update`), `[mcp_servers.memory*]` ve
  `[mcp_servers.filesystem]` tablolarını AgentChef'in yazdığıyla bayt bayt
  aynıysa kaldırır (`templates/codex/retired-tables.json`). Playwright artık
  Codex ana config'inde açıktır (pin `@playwright/mcp@0.0.83`); Chrome
  DevTools `chrome-devtools-mcp@1.10.1` sürümüne geçer.
- Claude Code: `context7`, `playwright` ve `serena` sunucularını artık
  `agentchef` plugin'i getirir. 1.0–1.2 kurulumunun `~/.claude.json` içine
  yazdığı `context7` ve `serena` girdileri, değerleri MCP makbuzundaki hash ile
  hâlâ eşleşiyorsa kaldırılır; çünkü kullanıcı kapsamlı bir girdi plugin
  sunucusunun önüne geçerdi. Plugin araçlarının adı
  `mcp__plugin_agentchef_<server>__<tool>` biçimindedir; üretilen izin
  kuralları ve ajan yetkileri bu adı kullanır.

Yalnızca bildirilen, kendiliğinden asla kaldırılmayanlar:

- Düzenlediğin bir Codex `memory` ya da `filesystem` tablosu `config.toml`
  içinde kalır ve güncelleme onu adıyla bildirir. Artık istemiyorsan kendin
  sil.
- AgentChef'in yazmadığı ya da sonradan düzenlenmiş `context7`, `playwright`
  veya `serena` adlı bir `.claude.json` girdisi kalır ve plugin sunucusunu
  gölgelediği bildirilir (kurucu planı da
  `verify-install-runtime --target claude` da bunu söyler). Kaldırmak için
  Claude kurulumunu `-AdoptMcp` / `--adopt-mcp` ile yeniden çalıştır;
  `.claude.json` önce yedeklenir.

Claude Code tek bir plugin MCP sunucusunu ayrı kapatamaz (yalnızca
`--strict-mcp-config` tüm sunucuları kapatır); bu yüzden yükseltmeden sonra
Playwright her Claude Code oturumunda kullanılabilir. `browser_run_code_unsafe`,
`browser_evaluate` ve `browser_file_upload` araçları izin kurallarında
reddedilir.

## Güvenli Upgrade Akışı

1. Repo güncellemesini çek.
2. Diff'i incele.
3. Installer değişikliklerini ön izle.
4. Ön izleme doğru görünüyorsa installer'ı çalıştır.
5. Codex'i yeniden başlat.
6. Aktif config ve skill'leri doğrula.

Guided CLI guvenli yolu tek komutta toplar:

```powershell
npm run chef -- --update
npm run chef -- --update --verbose-plan
npm run chef -- --update --apply
```

`--apply` olmadan update modu managed/global dosyalari degistirmez; normal CLI
loglari `--no-log` yoksa repo-local kalir. Varsayilan preview kisadir;
`npm run chef -- --update --verbose-plan` tam install dry-run kanitini basar.
Apply modunda tracked veya staged degisiklik varsa durur; tracked hedeflerle cakismayan untracked dosyalari korur ve `git pull --ff-only` calistirir. Pull repo HEAD'ini ilerletirse ayni onayli CLI güncel ağaçtan fresh installer preview çalıştırır, lokal validation,
managed yenileme ve kurulu ortam doğrulamasıyla devam eder; ikinci çalıştırma gerekmez. Repo zaten guncelse managed dosyalari lokal validation sonrasi backup alan installer
uzerinden yeniler; curated global skill veya opsiyonel global Git guard kurmaz.

Manuel PowerShell:

```powershell
git pull
npm run check
node scripts/plan-install.mjs --all --json
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
.\scripts\install.ps1 -All -Interactive
npm run verify:install:runtime -- --expect-skills
```

Bash veya WSL:

```bash
git pull
npm run check
node scripts/plan-install.mjs --all --json
./scripts/install.sh --all --dry-run
./scripts/install.sh --all --interactive
npm run verify:install:runtime -- --expect-skills
```

`-Force` / `--force` bilinçli replace upgrade içindir. Normal ilk kurulumda
veya mevcut kullanıcı refresh akışında force verme; böylece mevcut
`config.toml` merge edilir ve diğer mevcut managed dosyalar atlanır. Replace
upgrade sırasında force ancak preview'i inceledikten ve bu repo template'lerinin
managed hedefleri replace etmesini istediğinden emin olduktan sonra
kullanılmalı.

Managed hedefleri current repo template'leriyle bilerek replace etmek
istiyorsan preview'i inceledikten sonra aynı installer'ı `-Force` veya
`--force` ile tekrar çalıştır.

## Backup'lar

Varsayılan olarak overwrite edilen yönetilen dosyalar şuraya yedeklenir:

```text
~/.codex/backups/agentchef-YYYYMMDD-HHMMSS-<pid>/
```

1.0.0'dan önce alınan arşivler `codex-chef-` ile başlar. Claude Code hedefi
değiştirdiği dosyaları `~/.claude/agentchef/backups/agentchef-*` altına yedekler.

Başka backup'ın yoksa `-NoBackup` veya `--no-backup` kullanma.

Rollback oncesi mevcut backup archive'larini listele ve incele:

```powershell
npm run chef -- --backups
npm run chef -- --backups --backup <id>
npm run chef -- --backups --backup <id> --delete
```

Backup archive inspect gorunumu metadata-only calisir; path, size, hash,
manifest durumu ve restorable target bilgisini basar ama file content basmaz.
Silme preview-first'tur; resolved archive path'i artik gerekmedigini
dogruladigin backup'a aitse yalniz o zaman `--apply` ekle.

## Neyi Karşılaştırmalı?

Upgrade öncesi şu dosyaları incele:

- `templates/codex/AGENTS.md`
- `templates/codex/config.windows.toml`
- `templates/codex/config.unix.toml`
- `templates/codex/profiles/full.config.toml`
- `templates/codex/profiles/multi-session.config.toml`
- `templates/codex/profiles/token-safe.config.toml`
- `templates/codex/rules/default.rules`
- `catalog/skills.json`
- `catalog/skills-lock.json`
- `catalog/agents.json`
- `catalog/mcp-servers.json`
- `manifests/install-plan.json`
- `schemas/install-plan.schema.json`

## Upgrade Sonrası

Çalıştır:

```bash
codex doctor --summary
npm run token:audit
npm run chef -- --processes --no-log
npm run verify:install:runtime -- --expect-skills
codex exec --strict-config "Summarize the active Codex setup."
```

Kurulu agent role dosyalarinin agent bazli `model` /
`model_reasoning_effort` pinlerini geri getirmedigini dogrula. Broad veya uzun
session'larda maksimum default reasoning yerine daha dusuk cikti hacmi onemliyse
`token-safe.config.toml` kullan.

Eski lokal `conservative`, `trusted-project` veya `full-access` profil
dosyalarinda onceki release'lerden kalmis hard model pinleri bulunabilir. Once
repair preview al; bu pinler kaldirilacaksa backup'li migration'i ayrica ac:

```bash
node scripts/repair-install.mjs --migrate-legacy-profile-pins
node scripts/repair-install.mjs --apply --migrate-legacy-profile-pins
```

Migration yalniz legacy model/reasoning pin alanlarini kaldirir. Profil
dosyalarini, aktif default profili, project trust kayitlarini, approval ve
sandbox ayarlarini, ozel MCP'leri ve kullaniciya ait config overlay'in geri
kalanini korur.

Codex içinde kontrol et:

```text
/mcp
/skills
/plugins
/hooks
```

`/hooks` yeni veya değişmiş process-hygiene kaynak hash'i gösterirse güvenmeden
önce incele. Upgrade ve repair, Codex hook trust kontrolünü bypass etmez.

## Rollback

1. Codex'i kapat.
2. Secilen backup archive'dan restore preview al:
   `npm run chef -- --backups --backup <id> --restore`.
3. Preview dogruysa apply et:
   `npm run chef -- --backups --backup <id> --restore --apply`.
4. Codex'i yeniden başlat.
5. `codex doctor --summary` komutunu tekrar çalıştır.

Restore apply once mevcut target'lar icin rollback backup olusturur. Yalniz
bilinen AgentChef managed dosyalarini restore eder ve eski backup archive'lari
otomatik silmez.
