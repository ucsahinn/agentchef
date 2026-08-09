# Kurulum Rehberi

Codex Chef mevcut kullanıcının Codex home dizinine kurulur. Varsayılan konum
`~/.codex` dizinidir; `CODEX_HOME` tanımlıysa installer bunun yerine o path'i
kullanır. İlk gerçek write sürpriz olmasın diye her zaman ön izlemeyle başla.

## Gereksinimler

- Codex CLI veya Codex app.
- Git.
- Doğrulama ve isteğe bağlı skill kurulumu için Node.js 18 veya üzeri.
- Varsayilan stdio MCP sunuculari ve skill kurulumu icin `npx`.
- İsteğe bağlı: daha güçlü secret taraması için Gitleaks.
- Windows için isteğe bağlı: en iyi native sandbox deneyimi için `winget` ve
  güncel Windows 11.
- Varsayilan Serena semantic-code MCP acik kalacaksa `uvx`. `uvx` yoksa
  Serena'yi disable et veya status panosunda setup notu gormeyi bekle.

## PowerShell Kurulumu

Yazmadan önce ön izle:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
```

Installer'lari cagirmadan manifest-backed operasyon planini incele:

```bash
node scripts/plan-install.mjs --all --summary --redact-paths
node scripts/plan-install.mjs --all --json
```

Tam JSON'i incelemeden once manifest profil ve operasyonlarini listele:

```bash
node scripts/plan-install.mjs --list-profiles
node scripts/plan-install.mjs --list-operations
```

Summary normal preview'i kisa tutar; JSON ve full human plan managed
target'lari, opsiyonel global Git degisikliklerini, curated skill komutlarini,
collision policy'yi, backup davranisini ve risk seviyesini listeler.
Profile operasyonu `development.config.toml`, `review.config.toml`,
`ci.config.toml`, `token-safe.config.toml`, `full.config.toml` ve
`multi-session.config.toml` dosyalarini kapsar.
`full` ve `multi-session`, kurulu platforma uygun MCP tasima bloklarindan
uretilir; sadece bundled lokal server'larin `enabled` durumunu degistirir.
Bu, profil katmaninda Sequential Thinking, Serena veya launcher ayrintilarinin
kaybolmasini onler.

Varsayilan acik MCP'lerin de launcher onkosullari vardir. Node/npx tabanli
MCP'ler, Node pinned package'lari indirebildiginde baslar. Serena semantic code
navigation icin default aciktir ama `uvx` ve pinned git source ister. Fresh
machine'de bu launcher yoksa `/mcp` icinde live gorunmesini beklemeden once
`uvx` kur veya `mcp_servers.serena.enabled = false` yap.

Ön izleme doğruysa kur:

```powershell
git clone https://github.com/ucsahinn/codex-chef.git
cd codex-chef
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -Interactive
```

Soru sormayan otomasyon dostu kurulum:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All
```

Mevcut global Codex kurulumunu onar:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair -WhatIf
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair
```

Repair modu, zaten Codex setup'i olan makineler icindir. Codex Chef'in
yonettigi global guidance, rule, agent/profile dosyalari, bundled plugin,
on bir yönetilen direct lokal workflow, eksik config bloklari ve local plugin
marketplace kaydi icin once no-write plan verir, sonra istenirse backup alarak
onarir. Baska marketplace plugin'lerini korur ve user skill'lerini silmez;
fazla veya duplicate global skill'leri cleanup adayi olarak raporlar.
Namespaced Codex Chef plugin'i zaten kuruluysa preview eski versioned plugin
cache'ini raporlar, apply ise cache'i yerinde yeniler. Repair, plugin'i daha
once kurmamis bir kullanici icin kendiliginden kurmaz.

Mevcut checkout ve managed setup'i guided CLI ile guncelle:

```powershell
npm run chef -- --update
npm run chef -- --update --verbose-plan
npm run chef -- --update --apply
```

`--apply` olmadan update modu managed/global dosyalari degistirmez; normal CLI
loglari `--no-log` yoksa repo-local kalir. Varsayilan preview kisadir;
`npm run chef -- --update --verbose-plan` tam install dry-run kanitini basar.
Apply modunda clean worktree ister ve `git pull --ff-only` calistirir. Pull repo HEAD'ini ilerletirse aynı onaylı CLI fresh preview basar, sinirli update-integrity kontrolu, managed refresh ve
kurulu ortam doğrulamasıyla devam eder; ikinci çalıştırma gerekmez. Geniş `npm run check` paketi CI/release kapısı olarak kalır; Update rutin kullanıcıları installer-smoke senaryoları için bekletmez. Repo zaten guncelse managed dosyalari backup alan installer uzerinden yeniler.
Update Codex Chef'e ait dosyalari backup sonrasinda yeniler, managed config tablolarini
senkronlar ve kullaniciya ait `config.toml` ayarlarini korur. curated global skill veya
opsiyonel global Git guard kurmaz; bunlar icin
`--install --apply` veya `--skills --apply` yuzeylerini acikca kullan. Daha
once kurulmus namespaced Codex Chef plugin'i managed kaynak senkronundan sonra
yenilenir ve aktif surumu dogrulanir; kurulu olmayan plugin kurulu olmadan kalir.

Codex Chef backup archive'larini ayni CLI ile incele veya geri yukle:

```powershell
npm run chef -- --backups
npm run chef:backups
npm run chef -- --backups --backup <id>
npm run chef -- --backups --backup <id> --restore
npm run chef -- --backups --backup <id> --delete
npm run chef -- --backups --backup <id> --restore --apply
npm run chef -- --backups --backup <id> --delete --apply
```

List ve inspect komutlari metadata-only calisir: backup archive konumunu,
manifest durumunu, dogrulanmis restorable dosya sayisini, size ve hash
bilgilerini gosterir ama file content basmaz. Manifest, tum dosya seti, hash'ler
ve target allowlist gecmeden bir archive restorable diye etiketlenmez. Restore,
`--apply` verilmedikce preview'dir. Apply path'i exact source byte'larini okuyup
dogrular, mevcut target'lar icin yeni rollback backup olusturur ve bilinen Codex
Chef managed dosyalarini rollback korumali bir transaction olarak geri yazar.
Commit-pinned skill replacement backup'lari namespaced manifest kullanir ve
replacement'tan dosya birakmadan onceki skill tree'sini birebir geri yukler.
Restore,
valid `codex-chef.backup.v1` manifest tum archive dosyalarini path, size ve
SHA-256 ile birebir dogrulamadikca fail-closed kalir; missing, extra, degistirilmis
ve auth, hook, session, memory veya cache state gibi unsupported control-plane
dosyalari reddedilir. `--json` ayni davranisi izler; write isteklerinde
`applyRequested`, `applied` ve `outcome` alanlari acikca yazilir ve preview
uygulanmis gibi raporlanmaz. Delete de preview-first calisir: `--delete`
resolved archive path'ini gosterir ama silmez; `--delete --apply` yalniz
canonical backup root altindaki secili Codex Chef backup archive'ini kaldirir.

## Codex Chef CLI Referansi

Root README ilk kurulumu kisa tutar. Tam operator referansi gerektiginde bu
bolumu kullan.

```powershell
npm run chef
npm run chef -- --status
npm run chef -- --status --details
npm run chef -- --status --repo-only
npm run chef -- --preview
npm run chef -- --preview --verbose-plan
npm run chef -- --update
npm run chef -- --update --verbose-plan
npm run chef -- --backups
npm run chef:backups
npm run chef -- --backups --backup <id> --delete
npm run chef -- --reset --apply
npm run chef -- --repair --apply
npm run chef -- --install --apply
npm run chef -- --skills
npm run chef -- --mcp
npm run chef -- --routing
npm run chef -- --continuity
npm run chef -- --diagnostics
npm run chef -- --processes
npm run chef -- --processes --cleanup-stale
npm run chef -- --auth
npm run chef -- --logs
npm run chef -- --help --lang tr
npm run chef -- --status --repo-only --no-log
```

Komuta merkezi mevcut durumu dikkate alır. Etkileşimli tam kurulumdan önce
yönetilen dosyaları ve curated skill durumunu okur, ardından kısa bir ön izleme
gösterir. Sıfırdan veya eksik bir kurulum yazılı `APPLY` onayıyla devam eder;
zaten eksiksiz olan kurulum başarılı biçimde sonlanır ve yeniden kurulmaz;
yönetilen dosyalarda drift varsa akış bunu yeni kurulum gibi göstermeyip yedekli
onarım yoluna yönlendirir. Doğrudan komutlar, belgelenmiş `--apply` bayrağı
verilmediği sürece yalnız ön izleme yapar.

Bundled plugin ayrıca incelenmiş tek bir `SessionEnd` süreç hijyeni hook'u
kurar. Kurulum veya yenilemeden sonra yeni Codex oturumu aç, `/hooks` ekranında
tam kaynak/hash bilgisini incele ve yalnız bu repoyla eşleşiyorsa güven.
Installer hook trust kontrolünü bilerek bypass etmez. Profiller, denetim
alanları, 45 saniyelik bekleme ve ayrıca onaylı temizlik komutu için
[çoklu oturum süreç hijyeni](process-hygiene.tr.md) sayfasına bak.

`Skill durumu ve katalog` ekranı commit-pinned upstream skill'leri,
bundled/direct Codex Chef skill'lerini, kullanıcı tarafından eklenen diğer
skill'leri ve global köklerde görünen toplamı ayrı gösterir. Aynı adlı klasör
yeterli değildir: upstream kayıtların kaynak provenance bilgisi, bundled
kayıtların ise geçerli yönetilen sahipliği olmalıdır. Yalnız eksik veya
geçersiz upstream kayıtlar tek tek kurulabilir; bundled/direct drift onarım
akışına yönlendirilir. Kullanıcı skill'leri sayılır ve korunur.

`MCP bağlayıcıları` ekranı kurulu `CODEX_HOME/config.toml` dosyasını okuyarak
bağlayıcıları yapılandırılmış ve açık, yapılandırılmış ama kapalı, katalogda olup
yapılandırılmamış ve kullanıcı tarafından eklenmiş olarak ayırır. Bunlar config
durumlarıdır, canlı sağlık iddiası değildir. `codex mcp list --json` yalnız
config discovery'yi kanıtlar; yeniden başlatılmış Codex oturumunda `/mcp` veya
gerçek bir initialization probe başarılı olana kadar canlı durum ölçülmemiş
sayılır.

Varsayılan durum panosu kısadır. MCP listesinin tamamı, yönlendirme kontrolleri,
context bütçesi, kurulum notları, hedef/ortam Codex karşılaştırması ve log
bilgileri için `--details` ekleyin.

`--routing` task-shape haritasini, beklenen skill ve MCP yuzeylerini ve operator
raporlama sozlesmesini gosterir. Tamamlanan agent thread'lerini incelemek ve kapatmak
icin `/agent`; current Codex session tarafindan baslatilan terminal
isleri icin `/ps` ve `/stop` kullan. `--diagnostics` Serena/MCP surec audit
komutunu ve diger read-only kanit komutlarini gosterir, ama surec durdurmaz ve
global dosya degistirmez.

`--continuity`, Control veya Brain üzerinde değişiklik yapmadan ikisini de
görünür kılar. `codex-control-router` skill'ini, kurulu `codex_control` MCP
yapılandırmasını, bundled Brain skill'ini ve yalnız açıkça yapılandırılmış
`CODEX_CHEF_BRAIN_HOME` vault'unu raporlar. Anlık işler mevcut oturumda kalır;
Control yalnız açıkça gecikmeli, arka plan, tekrarlı, yeniden başlatmaya
dayanıklı, izlenen veya Control yönetimli isteklerde etkinleşir. Brain otomatik
capture kapalı kalır ve tüm Brain yazmaları önce ön izleme, sonra açık apply
gerektirir.

CLI alt süreci kurulu Control yapılandırmasını doğrulayabilir, ancak mevcut
Codex oturumunun MCP araçlarını çağıramaz. Canlı proje sağlığını aktif Codex
oturumundan Control MCP ile (veya owner terminalinden
`codex-control status --json` ile) doğrulayın. Bir Control projesindeki
`brainMapped: true` durumu, yerel `CODEX_CHEF_BRAIN_HOME` vault'undan ayrıdır;
birini yapılandırmak diğerini sessizce yapılandırmaz veya ona yazmaz.

Kurulu ve hazır skill'ler kendiliğinden çalışmaz. Kullanıcı skill adını
yazdığında veya iş skill açıklamasına açıkça uyduğunda Codex context'ine girer;
canlı aktivasyon, asistanın `Skill selected` yazması ve işlemden önce ilgili
`SKILL.md` dosyasını okumasıyla kanıtlanır.

GitHub release, push veya workflow check'leri lokal GitHub authentication bayat
oldugu icin fail ederse GitHub CLI veya Git Credential Manager'i kendi kurum politikaniza
gore yenile. Account-scoped credential repair'i bu reponun disinda
tut; token'lari repo dosyalarina, loglara, promptlara, skill'lere, rule'lara
veya shell history'ye yapistirma.

Kullanışlı parametreler:

- `-All`: Codex template'lerini, yerel Codex Chef plugin'ini, uzman ajanları,
  profilleri, kuralları ve doğrulanmış public/first-party skill'leri kurar.
  Global Git config'i değiştirmez.
- Her varsayılan yönetilen kurulum, on bir lokal workflow'un canonical
  kaynaklarını `AGENTS_HOME/skills/<ad>` hedeflerine senkronize eder. Böylece
  `$adaptive-agent-routing`, `$context-budget-planner`, `$fetch <url>`, `$seo
  <hedef>` ve `$evidence-research <soru>` gibi çağrılar plugin kurulmadan
  doğrudan kullanılabilir. Fetch implicit invocation'ı kapalı tutar; SEO ile
  Evidence Research yalnız açıkça eşleşen isteklerde implicit seçilebilir.
  Exact direct hedefte kullanıcıya ait farklı bir skill varsa installer hiçbir
  managed dosya yazmadan durur.
- Kişisel marketplace kaydı `codex-chef-workflows` plugin'ini yalnızca
  keşfedilebilir yapar; kurmaz veya etkinleştirmez.
  `$codex-chef-workflows:<skill-adı>` çağrıları için `codex plugin add
  codex-chef-workflows@codex-chef --json` komutunu (veya `/plugins` yüzeyini)
  kullanıp yeni bir Codex oturumu başlat. Bu açık ilk kurulumdan sonra
  installer, update ve repair apply akışları eski versioned plugin cache'ini
  yerinde yeniler ve aktif sürümü doğrular; ilk opt-in öncesinde plugin kurmaz.
- Kişisel marketplace plugin aynasını
  `AGENTS_HOME/plugins/sources/codex-chef-workflows` altından marketplace
  root'una göre relative bir path ile okur. Custom `AGENTS_HOME` bir installer
  hedefidir; aktif Codex host'unun bu marketplace'i keşfettiğinin kanıtı
  değildir. Default dışı root'u `codex plugin marketplace add <root>` ile
  kaydet ve `codex plugin marketplace list --json` ile doğrula.
- `-AdoptFetchSkill`: yalnızca foreign-collision preflight'ından sonra
  `AGENTS_HOME/skills/fetch` exact hedefini açıkça sahiplenir. Bash karşılığı
  `--adopt-fetch-skill` olur. Normal install ve repair bu yetkiyi varsaymaz.
- `-AdoptSeoSkill`: yalnızca incelenmiş foreign collision sonrasında
  `AGENTS_HOME/skills/seo` hedefini sahiplenir. Bash karşılığı
  `--adopt-seo-skill` olur.
- `-AdoptEvidenceResearchSkill`: yalnızca
  `AGENTS_HOME/skills/evidence-research` hedefini sahiplenir. Bash karşılığı
  `--adopt-evidence-research-skill` olur.
- `-AdoptDirectSkill <ad>`: katalogdaki başka bir foreign direct skill hedefini
  açıkça sahiplenir. Bash karşılığı `--adopt-direct-skill=<ad>` olur.
- `-InstallSkills`: `catalog/skills.json` içinde `install: true` olan,
  `owner/repo` formatında doğrulanmış `package`, tam commit SHA ve eşleşen
  `skill` adı taşıyan kayıtları kurar. Installer exact commit'i fetch eder,
  seçilen skill'i doğrular, native copy'yi stage edip hash'ler ve atomik olarak
  etkinleştirir. Fetch edilen repo kodunu veya registry kaynaklı bir installer'ı
  çalıştırmaz. Eşleşen geçerli Codex Chef provenance marker'ı backup alan
  managed upgrade'e izin verir. Unmarked, foreign veya lokal olarak drift etmiş
  aynı adlı hedef korunur ve atlandı olarak raporlanır. `--adopt-existing`
  geniş installer flag'i değildir; yalnızca o exact hedef incelendikten sonra
  ekrana basılan `install-pinned-skill.mjs` komutu bu flag ile tekrar çalıştırılır.
- `-InstallGitGuards`: global Git ignore, global pre-commit hook kurar ve
  `core.excludesfile` ile `core.hooksPath` ayarlar. Bunu ayrı tutuyoruz çünkü
  mevcut kullanıcıdaki bütün Git repolarını etkiler.
- `-Force`: yedek aldıktan sonra yönetilen Codex dosyalarının üzerine yazar.
  Bunu sadece bilinçli upgrade için, `-WhatIf` çıktısını inceledikten sonra
  kullan. Vermezsen mevcut `config.toml` önce yedeklenir ve sadece eksik Codex
  Chef bloklarını alır; mevcut ajan dosyaları ve rule dosyaları atlanır.
  Kisisel plugin marketplace dosyasi komple degistirilmez; sadece Codex Chef
  kaydi backup sonrasi eklenir veya guncellenir, ilgisiz plugin kayitlari
  korunur.
- `-Repair`: ortak repair motoruyla mevcut setup'i onarir. `-WhatIf` ile
  no-write repair plani basar. `-WhatIf` olmadan managed drift'i backup alip
  duzeltir. User skill'lerini silmez.
- `-NoBackup`: opsiyonel managed-file yedeklerini kapatır. Tavsiye edilmez.
  Pinned-skill upgrade veya açık pinned-skill adoption için zorunlu güvenlik
  yedeğini asla kapatmaz.
- `-WhatIf`: gerçek setup'a dokunmadan dosya, Git ve skill operasyonlarını ön
  izler.
- `-Interactive`: özel Codex/Agents home değerlerini ve opsiyonel global Git
  guard seçimini sorar. Ayrıca reviewed skill'leri kurup kurmayacağını,
  managed dosyaları backup sonrası force-replace etmek isteyip istemediğini ve
  plan özeti sonrası devam edip etmeyeceğini sorar. Token, secret veya
  credential istemez.
- `-PlainOutput`: eski Windows konsolları, CI logları veya Unicode'u kötü
  gösteren terminaller için emoji yerine ASCII status işaretleri kullanır.

## Bash Kurulumu (macOS, Linux veya WSL)

Yazmadan önce ön izle:

```bash
./scripts/install.sh --all --dry-run
```

Ön izleme doğruysa kur:

```bash
git clone https://github.com/ucsahinn/codex-chef.git
cd codex-chef
chmod +x scripts/install.sh
./scripts/install.sh --all --interactive
```

Kullanışlı flagler:

- `--all`: global Git config'i değiştirmeyen önerilen tam Codex Chef kurulumu.
- `--install-skills`
- `--adopt-fetch-skill`, `--adopt-seo-skill` ve
  `--adopt-evidence-research-skill`: yalnız adı verilen foreign direct hedefi
  inceleme sonrasında sahiplenir; normal install ve repair fail-closed kalır.
- `--adopt-direct-skill=<ad>`: katalogdaki başka bir foreign direct hedefi
  inceleme sonrasında sahiplenir.
- `--install-git-guards`: global Git ignore ve hook ayarlarına ayrıca opt-in.
- `--force`: backup aldıktan sonra managed hedefleri değiştirir; vermezsen
  mevcut `config.toml` merge edilir ve diğer mevcut managed dosyalar atlanır.
  Kisisel plugin marketplace dosyasi komple degistirilmez; sadece Codex Chef
  kaydi backup sonrasi eklenir veya guncellenir, ilgisiz plugin kayitlari
  korunur.
- `--repair`: mevcut global Codex setup'i icin backup'li repair uygular;
  `--dry-run` ile no-write plan verir.
- `--no-backup`
- `--dry-run`
- `--plain-output`: ASCII status işaretleri kullanır.
- `--interactive`: macOS/Linux/WSL tarafında aynı path, skill, force, Git guard ve
  devam onaylarını soran rehberli setup.

İki installer da en sonda capability board basar: specialist agent'lar,
varsayılan hazır MCP server'ları, disabled/opt-in MCP connector'ları, bundled
plugin skill'leri, reviewed global skill'ler, enterprise routing profile'lari
ve MCP setup notlari. Bu notlar local tooling, OAuth authorization, filesystem
path secimi, broad/destructive graph-indexing ve Supabase proje/read-only
gereksinimlerini connector'a ihtiyac duymadan once gosterir. Account, database,
production, genis filesystem ve broad/destructive graph-indexing connector'lari
sen acikca enable edene kadar kapali kalir. Lokal codebase graph okumalari
yalniz destructive/admin graph tool'lari kapaliyken acik olur.
Agent role dosyalari agent bazli model/reasoning pinlemeden kurulur. Aktif
profil ve Codex runtime task'a uygun dengeyi secebilir; broad veya uzun islerde
skill, agent ya da MCP kapatmadan daha dusuk verbosity ve daha dar tool-output
limitleri icin `token-safe.config.toml` kullan.

Codex Chef kendi template'ini canonical managed baseline, makinedeki mevcut
config'i ise kullaniciya ait overlay olarak ele alir. Normal install ve repair;
kullanicinin model/reasoning secimini, approval ve sandbox ayarlarini, project
trust kayitlarini, ozel MCP server'larini ve ilgisiz personal plugin marketplace
kayitlarini korur. Chef-managed agent/MCP guvenlik tablolari merge edilip
dogrulanir; `--force` acik replacement siniri olarak kalir. Boylece paket global
ve genel olur, tek bir makinenin profil veya trust durumu dagitilan default'a
donusmez.

## Neler Yedeklenir?

Mevcut dosyalar şu klasöre kopyalanır:

```text
~/.codex/backups/codex-chef-YYYYMMDD-HHMMSS/
```

Yeni backup'lar ayrica `.codex-chef-backup.json` manifest'i tasir. Bu kucuk
dosya operation, package version, platform, backup-relative path, size, hash ve
metadata yazilirken gorulen archive issue'larini kaydeder.

Installer şu managed target'ları replace etmeden önce yedekler:

- `AGENTS.md`
- `config.toml`
- `rules/default.rules`
- `agents/*.toml`
- `CODEX_HOME` içindeki managed profile dosyaları
- kişisel plugin marketplace dosyası
- iki managed plugin aynası
- bütün managed direct-skill dizinleri ve ownership marker'ları

Dizin replacement sadece yönetilen Codex veya Agents home altında yapılır.
Installer herhangi bir write öncesinde bu root'ların altındaki symlink veya
junction component'lerini reddeder; managed gibi görünen bir path başka dizine
kaçamaz.

## Kurulum Sonrası Kontrol

Codex'i yeniden başlat ve çalıştır:

```bash
codex doctor --summary
npm run codex:routing
npm run codex:status
npm run verify:install:runtime
codex exec --strict-config "Summarize the active Codex setup."
```

`npm run codex:routing`, `catalog/routing-profiles.json` dosyasindan enterprise
routing panosunu basar: task shape, eslesen subagent, skill, MCP ve
config/profile flag'leri. Bu pano gorunur bir routing kontratidir; gizli hook
veya auto-executor degildir. Hesap, deploy, database, destructive ve genis
filesystem aksiyonlari acik onay gerektirir.

`npm run codex:status` son kullanici status panosudur. Repo-only starter
sagligini, kurulu runtime drift'ini, direkt Codex doctor check ozetlerini,
skill context-budget warning'lerini, routing board ozetini, effective control
ozetini ve MCP setup notlarini birlikte toplar.
Gercek kurulumda curated skill'ler ve opsiyonel Git guard'lar bilerek dahil edildiyse
`npm run codex:status:all` kullan.

`npm run verify:install:runtime` read-only çalışır. Kurulan `~/.codex` ve
`~/.agents` hedeflerini kontrol eder; managed agent, rule, profile ve plugin
dosyalarında source drift olup olmadığına bakar; sonra Codex CLI kontrollerini
`CODEX_HOME` açıkça kurulu hedefe ayarlanmış şekilde çalıştırır. Ambient shell
bir sandbox veya farklı `CODEX_HOME` okuyorsa bu drift warning olarak raporlanır;
verifier yine de kurulu hedefin beklenen MCP config'ini verdiğini kanıtlar.

Live probe'lar ilerleme ciktisi basar ve probe basina kisa timeout kullanir.
Live/network kontrolleri yoksa `--offline`; managed kurulum ile Codex CLI
dogrulanirken MCP probe baslatilmasin isteniyorsa `--no-mcp-probe` ekle.

Codex içinde:

```text
/mcp
/skills
/plugins
/hooks
```

## Gerçek Kuruluma Dokunmadan Test

PowerShell:

```powershell
$env:CODEX_HOME = "$PWD\tmp\codex-home"
$env:AGENTS_HOME = "$PWD\tmp\agents-home"
.\scripts\install.ps1 -Force -WhatIf
```

Bash:

```bash
CODEX_HOME="$PWD/tmp/codex-home" AGENTS_HOME="$PWD/tmp/agents-home" \
  ./scripts/install.sh --force --dry-run
```

Non-dry-run temp home'ları yalnızca bilerek smoke install yapmak istiyorsan
kullan. `tmp/` klasörünü de sadece bilerek oluşturduysan temizle.

Zaten bir Codex setup'ın varsa once repair planina bak:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair -WhatIf
```

Repair temizse normal install komutuna gecebilirsin. Mevcut `config.toml`
backup alınarak merge edilir; kullanıcıya ait tablolar korunur. Diğer mevcut
managed dosyalar `-Force` / `--force` vermediğin sürece atlanır. Kisisel
plugin marketplace ilgisiz kayitlari korur ve sadece Codex Chef kaydini backup
sonrasi upsert eder. Managed drift varsa `-Repair` / `--repair` force'tan daha
guvenli ilk adımdır.

## Geri Dönüş

1. Codex'i kapat.
2. Backup archive'larini `npm run chef -- --backups` ile listele.
3. Secilen archive'dan restore preview al:
   `npm run chef -- --backups --backup <id> --restore`.
4. Preview dogruysa apply et:
   `npm run chef -- --backups --backup <id> --restore --apply`.
5. Codex'i yeniden başlat.
6. `codex doctor --summary` çalıştır.

Restore once mevcut managed target'lar icin rollback backup olusturur.
Installer ve CLI, preview-first backup delete akisinda acikca `--apply`
vermedikce backup dosyalarini silmez.
