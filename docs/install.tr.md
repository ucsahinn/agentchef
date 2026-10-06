# Kurulum Rehberi

AgentChef mevcut kullanıcının Codex home dizinine kurulur. Varsayılan konum
`~/.codex` dizinidir; `CODEX_HOME` tanımlıysa installer bunun yerine o path'i
kullanır. İlk gerçek write sürpriz olmasın diye her zaman ön izlemeyle başla.

AgentChef Claude Code home'unu da (`~/.claude` veya `CLAUDE_CONFIG_DIR`)
yönetebilir. Codex hedefi varsayılan kalır; Claude Code hedefi `--target claude`
ya da `--target both` ile açıkça seçilir veya etkileşimli kurulumda onaylanır.
Bkz. [Hedef Seçimi](#hedef-seçimi).

Uygulamanın veya hesabın yönettiği Codex profili bağımsız bir Codex home'dur;
`~/.codex/config.toml` içindeki kök ayarları devralmaz. Bu nedenle AgentSpace
worker profilleri kendi `config.toml` dosyasında `sandbox_mode = "workspace-write"`,
`approval_policy = "on-request"` ve `approvals_reviewer = "auto_review"`
değerlerini taşımalıdır. Profil değişikliğinden sonra worker'ı yeni bir pane'de
başlat. `CODEX_HOME` değerini farklı bir profile yalnız ön izleme ve installer'ın
bilerek o profili hedeflemesini istediğinde yönlendir.

## Gereksinimler

- Codex hedefi için Codex CLI veya Codex app.
- Claude Code hedefi için Claude Code (`claude --version`); dosya tarafı onsuz
  da kurulur, plugin kaydı ise daha sonra çalıştırman için `claude plugin`
  komutlarını yazdırır.
- Git.
- Doğrulama ve isteğe bağlı skill kurulumu için Node.js 22.12 veya üzeri.
- Varsayilan stdio MCP sunuculari ve skill kurulumu icin `npx`.
- İsteğe bağlı: daha güçlü secret taraması için Gitleaks.
- Windows için isteğe bağlı: en iyi native sandbox deneyimi için `winget` ve
  güncel Windows 11.
- Pinli Serena backend'i için `uvx`. Kurulan köprünün kendisi Node tabanlıdır ve
  `uvx` olmadan başlar; `uvx` yalnızca semantic navigation gerçekten istendiğinde
  gerekir.

## Hedef Seçimi

| Seçim | Yönetilen yüzey |
| --- | --- |
| `codex` (varsayılan) | `~/.codex` dosyaları, paylaşılan `~/.agents` plugin kaynağı ve marketplace'i (AgentChef'in tüm skill'leri plugin kaynağında durur), isteğe bağlı Git guard'ları |
| `claude` | paylaşılan `~/.agents` ağaçları artı Claude Code yüzeyi: kullanıcı seviyesi kural dosyası, makbuzla kaydedilen eklemeli `settings.json` izinleri (shell ve MCP araç kuralları), Claude plugin marketplace'i ve `claude plugin` CLI üzerinden plugin kaydı; `context7` ve `serena` MCP sunucularını plugin getirir (Playwright ve Chrome DevTools proje başına eklenir, bkz. [MCP Kataloğu](mcp-catalog.tr.md)), 1.0–1.2 kurulumunun bunlar için `.claude.json` içine yazdığı girdiler kaldırılır |
| `both` | yukarıdakilerin tamamı; paylaşılan işlemler bir kez koşar |

`npm run chef -- --install`, `PATH` üzerindeki CLI'ları algılar, bir hedef
önerir ve onayını ister. Doğrudan installer çağrıları ve etkileşimsiz koşular
Claude hedefini asla örtük seçmez:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File.\scripts\install.ps1 -All -Target both -WhatIf
node scripts/plan-install.mjs --all --target claude --summary --redact-paths
npm run chef -- --install --target both
```

```bash
./scripts/install.sh --all --target=claude --dry-run
```

Claude hedefinde installer plugin'i `claude plugin marketplace add` ve
`claude plugin install agentchef@agentchef --scope user` ile kaydeder. Claude
Code bir plugin'i sürüm başına cache'ler; bu yüzden cache'teki kopya kaynaktan
farklıysa (örneğin pinned skill'ler kaynağa yeni yazıldığında) installer
plugin'i yeniden kurar (önce uninstall, sonra install). Codex tarafında ise
cache sapması denetimi, cache kaynaktan farklı olduğunda plugin'i yeniden
ekler.

Claude tarafının ayrıntıları, sahipliği ve kaldırılması
[Claude Code yüzeyleri](claude-surfaces.tr.md) sayfasında; iki hedef arasındaki
eşleme [hedef yetenek haritasında](target-capability-map.tr.md).

## PowerShell Kurulumu

Yazmadan önce ön izle:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File.\scripts\install.ps1 -All -WhatIf
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
Seçilen manifest profili, planlayıcı ile installer'ların uyguladığı normatif
operasyon sözleşmesidir. Sıralı operasyonlar; kopyalanan dosyaların yanı sıra
üretilen `full`/`multi-session`/`offline` profillerini, AgentChef'in tüm
skill'lerini taşıyan plugin kaynağını, kurulu plugin cache yenilemesini ve Unix hook izin adımını da
açıkça kapsar; bu değişiklikler belgelenmemiş installer davranışı olarak kalmaz.
Profile operasyonu `development.config.toml`, `review.config.toml`,
`ci.config.toml`, `token-safe.config.toml`, `full.config.toml` ve
`multi-session.config.toml` dosyalarini kapsar.
`full` ve `multi-session`, kurulu platforma uygun MCP tasima bloklarindan
uretilir; sadece bundled lokal server'larin `enabled` durumunu degistirir.
Bu, profil katmaninda Sequential Thinking, Serena veya launcher ayrintilarinin
kaybolmasini onler.

Varsayılan açık MCP'lerin de başlatıcı ön koşulları vardır. Node/npx tabanlı
MCP'ler, Node pinli paketleri indirebildiğinde başlar. Serena, `config.toml`
yanına kurulan yerel köprü `serena-pool.mjs` üzerinden varsayılan olarak açıktır.
Codex açılışında Serena veya dil sunucusu başlatmaz. İzin listesindeki ilk
semantic araç çağrısında o kanonik proje için pinli, yalnızca loopback'e bağlı
tek bir backend başlatır; aynı projedeki oturumlar onu paylaşır, ayrı
worktree'ler yalıtılmış kalır. Köprü yalnızca sahibine açık yerel bir token ve
Codex home altında yalıtılmış bir UV önbelleği kullanır; proje kaynağına veya
config'e asla yazmaz. `uvx` yoksa yalnızca o ilk semantic çağrı başarısız olur;
`uvx` kur veya Serena'yı kapat.

Ön izleme doğruysa kur:

```powershell
git clone https://github.com/ucsahinn/agentchef.git
cd agentchef
powershell.exe -NoProfile -ExecutionPolicy Bypass -File.\scripts\install.ps1 -All -Interactive
```

Soru sormayan otomasyon dostu kurulum:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File.\scripts\install.ps1 -All
```

Mevcut global Codex kurulumunu onar:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File.\scripts\install.ps1 -Repair -WhatIf
powershell.exe -NoProfile -ExecutionPolicy Bypass -File.\scripts\install.ps1 -Repair
```

Repair modu, zaten Codex setup'i olan makineler icindir. AgentChef'in
yonettigi global guidance, rule, agent/profile dosyalari, bundled plugin,
plugin'in on bir bundled skill'i, `serena-pool.mjs`, eksik config bloklari ve local plugin
marketplace kaydi icin once no-write plan verir, sonra istenirse backup alarak
onarir. Launcher, Serena köprüsü, üretilen/kopyalanan profiller, sahiplik
işaretleri, marketplace ve seçilen diğer tüm kaynaklarla hedefler ilk yönetilen
yazmadan önce ön kontrolden geçer; eksik, bağlantılı veya güvensiz bir yol varsa
akış güvenli biçimde durur. Baska marketplace plugin'lerini korur ve user skill'lerini silmez;
fazla veya duplicate global skill'leri cleanup adayi olarak raporlar.
Namespaced AgentChef plugin'i zaten kuruluysa preview eski versioned plugin
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
Update, yedek aldıktan sonra yalnızca kaynakta yönetilen dosyaları senkronlar ve
yönetilen dizinlerdeki ilgisiz ek dosyaları korur. Managed config tablolarini
senkronlar ve kullaniciya ait `config.toml` ayarlarini korur. Yönetilen tablolar
(`features`, `shell_environment_policy`, `memories`, `windows`,
`sandbox_workspace_write`, `agents.*`, `mcp_servers.*`) AgentChef'indir. Güncelleme
onları şablona geri yazar; böylece güvenlik onayları ve yeni pinler sana her
zaman ulaşır. Bunların içinde yaptığın bir düzenleme değiştirilir; önce alınan
yedek onu saklar. Kalıcı değişiklikleri kendi tablolarına ya da bir profile koy.
curated global skill veya
opsiyonel global Git guard kurmaz; bunlar icin
`--install --apply` veya `--skills --apply` yuzeylerini acikca kullan. Daha
once kurulmus namespaced AgentChef plugin'i managed kaynak senkronundan sonra
yenilenir ve aktif surumu dogrulanir; kurulu olmayan plugin kurulu olmadan kalir.

AgentChef backup archive'larini ayni CLI ile incele veya geri yukle:

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
dogrular, mevcut target'lar icin yeni rollback backup olusturur ve bilinen AgentChef
managed dosyalarini rollback korumali bir transaction olarak geri yazar.
Commit-pinned skill replacement backup'lari namespaced manifest kullanir ve
replacement'tan dosya birakmadan onceki skill tree'sini birebir geri yukler.
Restore,
valid `agentchef.backup.v1` manifest tum archive dosyalarini path, size ve
SHA-256 ile birebir dogrulamadikca fail-closed kalir; missing, extra, degistirilmis
ve auth, hook, session, memory veya cache state gibi unsupported control-plane
dosyalari reddedilir. `--json` ayni davranisi izler; write isteklerinde
`applyRequested`, `applied` ve `outcome` alanlari acikca yazilir ve preview
uygulanmis gibi raporlanmaz. Delete de preview-first calisir: `--delete`
resolved archive path'ini gosterir ama silmez; `--delete --apply` yalniz
canonical backup root altindaki secili AgentChef backup archive'ini kaldirir.

## AgentChef CLI Referansi

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
npm run chef -- --install --target both --apply
npm run chef -- --preview --target claude
npm run chef -- --remove --target claude
npm run chef -- --remove --target claude --apply
npm run chef -- --migrate-identity --target both
npm run chef -- --migrate-identity --target both --apply
npm run chef -- --skills
npm run chef -- --mcp
npm run chef -- --routing
npm run chef -- --inventory
npm run chef -- --inventory --target claude --details
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
Installer hook trust kontrolünü bilerek bypass etmez. Claude Code aynı hook'u
`agentchef` plugin manifestinden alır ve plugin etkinleştirildiğinde çalıştırır;
`/hooks` ile incele. 1.3.4 ile plugin ikinci bir Codex
hook'u, `hooks/routing-hint.json`, ekler; o da `/hooks` içinde güven ister:
Codex bir hook'a tanımının hash'iyle güvenir, bu da komut satırını kapsar,
çalıştırdığı betiği veya indeksi değil (`npm run chef -- --inventory` kurulu
plugin'i kurulum kaynağıyla karşılaştırır). Claude Code için yeni oturum gerekir.
Profiller, denetim
alanları, 45 saniyelik bekleme ve ayrıca onaylı temizlik komutu için
[çoklu oturum süreç hijyeni](process-hygiene.tr.md) sayfasına bak.

`Skill durumu ve katalog` ekranı commit-pinned upstream skill'leri,
bundled/direct AgentChef skill'lerini, kullanıcı tarafından eklenen diğer
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

`--inventory` da yalnız okur: her harness skill'ini, agent rolünü ve MCP
sunucusunu kaynağı ve her hedefteki durumuyla listeler; katalogdan hesaplanan
bir toplam satırı ve bir `Issues` satırı ekler. `--target codex|claude|both`,
`--json` veya `--details` (beklenen durumdaki satırlar dahil hepsi) eklenebilir.
AgentChef kuruluyken seçili bir hedefte harness skill'i veya rolü eksikse 1 ile
çıkar. Durumlar ve her biri için yapılacaklar [harness haritasında](harness-map.tr.md).

Kurulu ve hazır skill'ler kendiliğinden çalışmaz. Kullanıcı skill adını
yazdığında veya iş skill açıklamasına açıkça uyduğunda Codex context'ine girer.
Routing'in repo tarafındaki kanıtı
`npm run chef -- --routing --task "<istek>"` komutudur; eşleşen profili ve bir
`[hint]` satırını gösterir (1.3.4 ile); oturumda kanıt,
asistanın işlemden önce yazdığı `Routing plan:` satırıdır.

GitHub release, push veya workflow check'leri lokal GitHub authentication bayat
oldugu icin fail ederse GitHub CLI veya Git Credential Manager'i kendi kurum politikaniza
gore yenile. Account-scoped credential repair'i bu reponun disinda
tut; token'lari repo dosyalarina, loglara, promptlara, skill'lere, rule'lara
veya shell history'ye yapistirma.

Kullanışlı parametreler:

- `-All`: Codex template'lerini, yerel AgentChef plugin'ini, uzman ajanları,
  profilleri, kuralları ve doğrulanmış public/first-party skill'leri kurar.
  Global Git config'i değiştirmez.
- 1.3.0'dan beri AgentChef'in her skill'i iki CLI'ya da yalnızca plugin
  skill'i olarak ulaşır. On bir bundled skill plugin'in içinde gelir ve
  `AGENTS_HOME/plugins/sources/agentchef/skills/<ad>` marketplace kaynağına
  kurulur. Installer bunları artık `AGENTS_HOME/skills` altına kopyalamaz ve
  `~/.claude/skills` altına hiçbir bağlantı kurmaz; böylece her skill CLI
  başına bir kez listelenir. Codex'te `$agentchef:<skill>` (örneğin `$seo`
  workflow'u `$agentchef:seo`, `$evidence-research` ise
  `$agentchef:evidence-research` olur), Claude Code'da
  `/agentchef:<skill>` ile çağrılır (başka bir komut aynı adı taşımıyorsa
  Claude Code'da yalın `/<skill>` da çalışır). Fetch implicit invocation'ı
  kapalı tutar; SEO ile Evidence Research yalnız açıkça eşleşen isteklerde
  implicit seçilebilir. 1.0–1.2 kurulumunda doğrudan kopyalar hâlâ durur;
  geçiş için [Yükseltme](upgrade.tr.md) sayfasına bak.
- Kişisel marketplace kaydı `agentchef` plugin'ini yalnızca
  keşfedilebilir yapar; kurmaz veya etkinleştirmez.
  `$agentchef:<skill-adı>` çağrıları için `codex plugin add
  agentchef@agentchef --json` komutunu (veya `/plugins` yüzeyini)
  kullanıp yeni bir Codex oturumu başlat. Bu açık ilk kurulumdan sonra
  installer, update ve repair apply akışları eski versioned plugin cache'ini
  yerinde yeniler ve aktif sürümü doğrular; ilk opt-in öncesinde plugin kurmaz.
- Kişisel marketplace plugin aynasını
  `AGENTS_HOME/plugins/sources/agentchef` altından marketplace
  root'una göre relative bir path ile okur. Custom `AGENTS_HOME` bir installer
  hedefidir; aktif Codex host'unun bu marketplace'i keşfettiğinin kanıtı
  değildir. Default dışı root'u `codex plugin marketplace add <root>` ile
  kaydet ve `codex plugin marketplace list --json` ile doğrula.
- `-AdoptFetchSkill`, `-AdoptSeoSkill`, `-AdoptEvidenceResearchSkill`,
  `-AdoptDirectSkill <ad>` ve `-AdoptSkillLinks` (Bash:
  `--adopt-fetch-skill`, `--adopt-seo-skill`,
  `--adopt-evidence-research-skill`, `--adopt-direct-skill=<ad>`,
  `--adopt-skill-links`): eski betikler çalışmaya devam etsin diye kabul
  edilir, ama 1.3.0'dan beri etkisizdir ve bir uyarı basar. Sahiplenilecek
  doğrudan skill hedefi ya da skill bağlantısı artık yoktur.
- `-AdoptMcp` (Bash: `--adopt-mcp`; `-Target claude` ya da `both` ister):
  plugin'in getirdiği bir sunucunun adıyla (`context7`, `serena`)
  kendi eklediğin kullanıcı kapsamlı `~/.claude.json` girdisini kaldırır. Dosya
  önce yedeklenir. Bu anahtar olmadan böyle bir girdi korunur, plugin
  sunucusunu gölgelediği bildirilir ve onun yerine o kullanılır; çünkü
  kullanıcı kapsamlı girdi plugin sunucusunun önüne geçer. AgentChef 1.0–1.2'nin
  yazdığı girdiler (MCP makbuzundaki hash ile kanıtlanır) bu anahtar olmadan da
  kaldırılır.
- `-InstallSkills`: `catalog/skills.json` içinde `install: true` olan,
  `owner/repo` formatında doğrulanmış `package`, tam commit SHA ve eşleşen
  `skill` adı taşıyan kayıtları kurar. Installer exact commit'i fetch eder,
  seçilen skill'i doğrular, native copy'yi stage edip hash'ler ve plugin
  kaynağı içinde (`AGENTS_HOME/plugins/sources/agentchef/skills/<ad>`)
  `.agentchef-source.json` provenance kaydıyla birlikte atomik olarak
  etkinleştirir; böylece bundled skill'lerle aynı plugin altında listelenir. Fetch edilen repo kodunu veya registry kaynaklı bir installer'ı
  çalıştırmaz. Eşleşen geçerli AgentChef provenance marker'ı backup alan
  managed upgrade'e izin verir. Unmarked, foreign veya lokal olarak drift etmiş
  aynı adlı hedef korunur ve atlandı olarak raporlanır. `--adopt-existing`
  geniş installer flag'i değildir; yalnızca o exact hedef incelendikten sonra
  ekrana basılan `install-pinned-skill.mjs` komutu bu flag ile tekrar çalıştırılır.
- `-InstallGitGuards`: global Git ignore, global pre-commit hook kurar ve
  `core.excludesfile` ile `core.hooksPath` ayarlar. Bunu ayrı tutuyoruz çünkü
  mevcut kullanıcıdaki bütün Git repolarını etkiler. Mevcut yabancı dosya veya
  anahtar durumu; çakışan yüzey `-AdoptGitIgnore`, `-AdoptGitHook`,
  `-AdoptGitExcludesFile` ya da `-AdoptGitHooksPath` ile açıkça sahiplenilmedikçe
  güvenli biçimde reddedilir. Her parametre yalnızca adını verdiği dosya veya
  anahtar için yetki verir; diğer üç yüzeyi sahiplenmez.
- `-Force`: yedek aldıktan sonra yönetilen tekil dosyaları değiştirir ve
  yönetilen dizinlerde yalnızca kaynakta sahip olunan girdileri senkronlar.
  İlgisiz ek dosyalar korunur. Bunu sadece bilinçli upgrade için, `-WhatIf` çıktısını inceledikten sonra
  kullan. Vermezsen mevcut `config.toml` önce yedeklenir ve sadece eksik AgentChef
  bloklarını alır; mevcut ajan dosyaları ve rule dosyaları atlanır.
  Kisisel plugin marketplace dosyasi komple degistirilmez; sadece AgentChef
  kaydi backup sonrasi eklenir veya guncellenir, ilgisiz plugin kayitlari
  korunur.
- `-Repair`: ortak repair motoruyla mevcut setup'i onarir. `-WhatIf` ile
  no-write repair plani basar. `-WhatIf` olmadan managed drift'i backup alip
  duzeltir. User skill'lerini silmez.
- `-NoBackup`: yalnızca hedeflerin tamamen boş olduğu, sadece yeni dosya
  oluşturacak apply akışları için kabul edilen uyumluluk parametresidir. Seçilen
  herhangi bir işlem mevcut hedefe dokunacak, birleştirecek, değiştirecek,
  silecek, budayacak, sahiplenecek, cache yenileyecek veya global Git durumunu
  değiştirecekse ön kontrol ilk yazmadan önce akışı reddeder.
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
git clone https://github.com/ucsahinn/agentchef.git
cd agentchef
chmod +x scripts/install.sh
./scripts/install.sh --all --interactive
```

Kullanışlı flagler:

- `--all`: global Git config'i değiştirmeyen önerilen tam AgentChef kurulumu.
- `--install-skills`
- `--adopt-fetch-skill`, `--adopt-seo-skill`,
  `--adopt-evidence-research-skill`, `--adopt-direct-skill=<ad>` ve
  `--adopt-skill-links`: eski betikler için kabul edilir, 1.3.0'dan beri
  etkisizdir (bir uyarı basılır).
- `--adopt-mcp`: `context7` ya da `serena` için kendi
  `~/.claude.json` girdini yedekledikten sonra kaldırır; böylece plugin'in
  sunucusu devreye girer (`--target=claude` ya da `--target=both` ister).
- `--install-git-guards`: global Git ignore ve hook ayarlarına ayrıca opt-in.
- `--adopt-git-ignore`, `--adopt-git-hook`,
  `--adopt-git-excludes-file` ve `--adopt-git-hooks-path`: tam olarak bir
  çakışan Git-guard dosyasını ya da anahtarını sahiplenme yetkisi verir.
  Seçilmeyen yabancı durum güvenli biçimde reddedilmeye devam eder.
- `--force`: yedek aldıktan sonra yönetilen tekil dosyaları değiştirir;
  dizinlerde yalnızca kaynakta sahip olunan girdileri senkronlar ve ilgisiz ek
  dosyaları korur. Vermezsen
  mevcut `config.toml` merge edilir ve diğer mevcut managed dosyalar atlanır.
  Kisisel plugin marketplace dosyasi komple degistirilmez; sadece AgentChef
  kaydi backup sonrasi eklenir veya guncellenir, ilgisiz plugin kayitlari
  korunur.
- `--repair`: mevcut global Codex setup'i icin backup'li repair uygular;
  `--dry-run` ile no-write plan verir.
- `--no-backup`: yalnızca yeni dosya oluşturan uyumluluk modu. Mevcut bir hedef
  veya birleştirme, değiştirme, silme, sahiplenme, cache yenileme ya da global
  değişiklik seçilmişse ilk yazmadan önce durur.
- `--dry-run`
- `--plain-output`: ASCII status işaretleri kullanır.
- `--interactive`: macOS/Linux/WSL tarafında aynı path, skill, force, Git guard ve
  devam onaylarını soran rehberli setup.

İki installer da en sonda capability board basar: specialist agent'lar,
varsayılan hazır MCP server'ları, disabled/opt-in MCP connector'ları, bundled
plugin skill'leri, reviewed global skill'ler, enterprise routing profile'lari
ve MCP setup notlari. Bu notlar local tooling, OAuth authorization,
broad/destructive graph-indexing ve Supabase proje/read-only
gereksinimlerini connector'a ihtiyac duymadan once gosterir. Account, database,
production, genis filesystem ve broad/destructive graph-indexing connector'lari
sen acikca enable edene kadar kapali kalir. Lokal codebase graph okumalari
yalniz destructive/admin graph tool'lari kapaliyken acik olur.
1.3.2 ile her agent rol dosyası katalogdaki worker
modelini taşır (`~/.codex/agents/*.toml` içinde `model = "gpt-6-luna"`, Claude
plugin'inin agent dosyalarında `model: sonnet`) ve reasoning effort pinlemez;
yani model/reasoning ayrımı: worker modeli sabit, effort devralınır.
Açtığın oturum seçtiğin model ve profili korur; worker modelini değiştirmek
için bkz. [Model Katmanları](agents.tr.md#model-katmanları). Broad veya uzun
islerde skill, agent ya da MCP kapatmadan daha dusuk verbosity ve daha dar
tool-output limitleri icin `token-safe.config.toml` kullan.

AgentChef kendi template'ini canonical managed baseline, makinedeki mevcut
config'i ise kullaniciya ait overlay olarak ele alir. Normal install ve repair;
kullanicinin model/reasoning secimini, approval ve sandbox ayarlarini, project
trust kayitlarini, ozel MCP server'larini ve ilgisiz personal plugin marketplace
kayitlarini korur. Chef-managed agent/MCP guvenlik tablolari merge edilip
dogrulanir; `--force` açık, yedek destekli senkronizasyon sınırı olarak kalır ve
ilgisiz dizin girdilerini silme yetkisi vermez. Boylece paket global
ve genel olur, tek bir makinenin profil veya trust durumu dagitilan default'a
donusmez.

## Neler Yedeklenir?

Mevcut dosyalar şu klasöre kopyalanır:

```text
~/.codex/backups/agentchef-YYYYMMDD-HHMMSS-<pid>/
```

Yeni backup'lar ayrica `.agentchef-backup.json` manifest'i tasir. Bu kucuk
dosya operation, package version, platform, backup-relative path, size, hash ve
metadata yazilirken gorulen archive issue'larini kaydeder.

Ilk managed write oncesinde atomik `.agentchef-operation-journal.json`
olusturulur; canonical managed home'lar farkliysa ikisi altinda da ayri sahipli
islem kilidi alinir. Bir write mutation oncesinde journal'a durably prepare
edilir, ancak write tamamlandiktan sonra applied olarak isaretlenir. Daha
sonraki bir installer adimi hata verirse yalnizca hala installer'in yazdigi hash
ile eslesen hedef geri yuklenir veya kaldirilir; sonradan degismis hedef korunur
ve journal kurtarma kaniti olarak kalir. Tamamlanmis commit-pinned skill
kurulumlari da journal recovery'den once compensation receipt'leriyle geri
alinir. Son manifest yazilmadan kesilen islemde journal, ayni
hash-dogrulanmis restore inventory'sini saglar.

Unix'te installer eksik bir managed home dizinini atomik kilit almadan once
hazirlar. Herhangi bir kilit-dizini cakismasi eszamanli islem olarak fail-closed
olur. Normal tamamlanma journal'i acikca bitirir ve yalniz sahip kimligi mevcut
installer ile eslesen kilitleri serbest birakir; exit trap hata ve kesinti
yollarinda ayni temizligi korur.

Installer şu managed target'ları replace etmeden önce yedekler:

- `AGENTS.md`
- `config.toml`
- `rules/default.rules`
- `agents/*.toml`
- `CODEX_HOME` içindeki managed profile dosyaları
- kişisel plugin marketplace dosyası
- iki managed plugin aynası

Yönetilen dizin güncellemeleri yalnızca kaynakta sahip olunan girdileri
senkronlar ve ilgisiz ek dosyaları korur. Yıkıcı bir budama işlemi ayrı, açık ve
yedek destekli bir operasyondur. Installer herhangi bir write öncesinde
yapılandırılmış home'ların altındaki symlink veya junction bileşenlerini
reddeder; yönetilen gibi görünen bir yol başka dizine kaçamaz.

Global Git guard'ları, iki dosya ile iki Git config anahtarı normal yönetilen
dosya arşivinin dışında kaldığı için ayrı bir tipli kurtarma makbuzu kullanır.
Apply başlamadan önce önceki byte'lar, dosya modu, varlık/yokluk bilgisi ve
sıralı anahtar değerleri `agentchef.global-git-guards-receipt@1` içinde aynen
kaydedilir. Makbuz ayrıca apply sonrası beklenen yönetilen dosya hash'lerini,
Unix modlarını ve Git config değerlerini bağlar. Apply başarısız olursa işlem
bu makbuzdan geri alınır. Makbuzu sakla
ve installer'ın yazdırdığı tam restore komutunu kullan; temel biçim şöyledir:

```bash
node scripts/manage-global-git-guards.mjs restore --home <home> --receipt <receipt-path> --json
```

Restore; önce makbuz şemasını, kayıtlı home'u, tam iki dosya/iki anahtarlık izin
listesini, boyutu, yolları ve bağlantı güvenliğini doğrular. Ardından önceki
değerleri geri yükler veya daha önce bulunmayan hedefleri kaldırır. Apply'dan
sonra yönetilen dosya, mod ya da anahtar değiştiyse restore hiçbir şey yazmaz;
böylece sonraki kullanıcı değişiklikleri ezilmez ve ilk repo şablonlarına
ihtiyaç duyulmaz. Bu akış
`agentchef.backup.v1` arşivlerinden bilinçli olarak ayrıdır.

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
dosyalarının yanı sıra kurulu `serena-pool.mjs` köprüsünde source drift olup
olmadığına bakar; sonra Codex CLI kontrollerini
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

Claude Code hedefi kurulduktan sonra yeni bir Claude Code oturumu açıp
çalıştır:

```bash
npm run verify:install:runtime -- --target claude
npm run codex:status -- --target both
claude plugin list
claude mcp list
```

Claude Code içinde `/context` AgentChef kural dosyasını memory dosyaları
altında listeler, `/plugin` `agentchef` marketplace'ini gösterir ve
`/skills` plugin skill'lerini birer kez listeler.

Claude Code MCP sunucularını `.claude.json` üzerinden değil `agentchef`
plugin'inden alır: plugin manifest'i `mcp/claude.mcp.json` dosyasını gösterir;
bu dosya `context7` sunucusunu `scripts/mcp-launch.mjs`
üzerinden (yalnızca tam sabitlenmiş sürüm; Windows'ta
`NoDefaultCurrentDirectoryInExePath` ile `cmd.exe` ve `npx.cmd` üzerinden),
Serena'yı ise paylaşılan havuz bridge'inin plugin içindeki kopyasıyla
`--project-root ${CLAUDE_PROJECT_DIR}` argümanıyla başlatır. `/mcp` ve
`claude mcp list` bunları plugin sunucusu olarak gösterir; araç adları
`mcp__plugin_agentchef_<server>__<tool>` biçimindedir. Claude Code tek bir
plugin sunucusunu ayrı kapatamaz (yalnızca `--strict-mcp-config` tüm
sunucuları kapatır); bu yüzden plugin `playwright` ve `chrome-devtools`
getirmez. Onları browser kanıtı gereken projeye ekle
(`claude mcp add --scope project...`, bkz. [MCP Kataloğu](mcp-catalog.tr.md));
orada üretilen izin kuralları Playwright'ın en riskli araçlarını reddeder.
`verify-install-runtime --target claude` kendi `.claude.json` girdinin bir
plugin sunucusunu gölgelediği uyarısını verirse kurucuyu `-AdoptMcp` /
`--adopt-mcp` ile yeniden çalıştırarak girdiyi yedekli biçimde kaldır.

## Gerçek Kuruluma Dokunmadan Test

PowerShell:

```powershell
$env:CODEX_HOME = "$PWD\tmp\codex-home"
$env:AGENTS_HOME = "$PWD\tmp\agents-home"
$env:CLAUDE_CONFIG_DIR = "$PWD\tmp\claude-home"
.\scripts\install.ps1 -Force -Target both -WhatIf
```

Bash:

```bash
CODEX_HOME="$PWD/tmp/codex-home" AGENTS_HOME="$PWD/tmp/agents-home" \
CLAUDE_CONFIG_DIR="$PWD/tmp/claude-home" \
./scripts/install.sh --force --dry-run
```

Non-dry-run temp home'ları yalnızca bilerek smoke install yapmak istiyorsan
kullan. `tmp/` klasörünü de sadece bilerek oluşturduysan temizle.

Zaten bir Codex setup'ın varsa once repair planina bak:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File.\scripts\install.ps1 -Repair -WhatIf
```

### Portable Workspace OS Siniri

Bu, portable Workspace OS kurulum testidir: `CODEX_HOME` ve `AGENTS_HOME`
degerleri acik, repo-relative hedeflerdir; boylece ayni komutlar baska bir
PC'de kullanicinin gercek Codex state'ini kopyalamadan calisir. AgentChef
yalniz kendi Codex runtime template'lerini, agent'larini, skill'lerini, MCP
config'ini ve backup-backed managed dosyalarini bu hedeflere kurar. AgentChef
yalnızca kendi yönettiği yüzeyleri kurar; ayrı kurulan hafıza motoru veya
control plane gibi yardımcı araçlar ayrı authority layer'lar olarak kalır.

Izole, non-dry-run smoke install icin sahip oldugun bos bir klasor sec; `--apply`
eklemeden once plani incele:

```powershell
$portableRoot = Join-Path $PWD ".agentchef-portable"
$env:CODEX_HOME = Join-Path $portableRoot "codex"
$env:AGENTS_HOME = Join-Path $portableRoot "agents"
node.\scripts\repair-install.mjs --preview --redact-paths --json
```

Bu klasore baskasinin home dizinini, `auth.json` dosyasini, hafiza motoru
notlarini, session'larini veya yardimci arac database'lerini kopyalama. Yeni bir PC ayni
preview'i kendi bos portable root'u ile calistirir; gercek user-home kurulumu
icin ancak backup-backed plan incelendikten sonra onay verilir.

Repair temizse normal install komutuna gecebilirsin. Mevcut `config.toml`
backup alınarak merge edilir; kullanıcıya ait tablolar korunur. Diğer mevcut
managed dosyalar `-Force` / `--force` vermediğin sürece atlanır. Force yalnızca
yönetilen tekil dosyaları değiştirir ve kaynakta sahip olunan dizin girdilerini
senkronlar; ilgisiz ek dosyalar kalır. Kisisel
plugin marketplace ilgisiz kayitlari korur ve sadece AgentChef kaydini backup
sonrasi upsert eder. Managed drift varsa `-Repair` / `--repair` force
senkronizasyonundan daha guvenli ilk adımdır.

## AgentChef'i Kaldırma

```powershell
npm run chef -- --remove --target both          # ön izleme: ne silinir, ne kalır
npm run chef -- --remove --target both --apply  # önce yedekleyerek kaldır
```

Kaldırma yalnızca AgentChef'in sahipliğini kanıtlayabildiği şeyleri siler.
Bunlar: hâlâ şablonlarıyla aynı olan dosyalar, sahiplik işaretçisi taşıyan
klasörler, makbuza kayıtlı ayarlar ve MCP girdileri, marketplace girdisi,
plugin kaydı ve pinli skill indirme önbelleği. Her şey önce yedeklenir. Tek
istisna indirme önbelleğidir; onu yeniden kurulum tekrar indirir.

Bilerek kalanlar:

- Kendi ayarlarına birleştirilmiş bir `config.toml` AgentChef tablolarını
  korur. Bu dosya kaldığı sürece işaret ettiği Serena köprüsü ve ajan rol
  dosyaları da kalır (`kept-referenced`). Böylece Codex temiz açılmaya devam
  eder. `[mcp_servers.serena]` ve `[agents.*]` tablolarını kaldır ya da bir
  yedeği geri yükle, sonra kaldırmayı yeniden çalıştır.
- Üretilen MCP profilleri (`full`, `multi-session`, `offline`).
- `CODEX_HOME/serena-pool`, yani iki hedefin paylaştığı havuz token'ı.
- İsteğe bağlı Git guard'ları. Bunları kurulumda yazdırılan makbuzla geri
  yükle.
- Bütün yedek arşivleri.

Sonrasında Codex ve Claude Code'u yeniden başlat; açık oturumlar AgentChef'i
yüklemeyi bıraksın.

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
