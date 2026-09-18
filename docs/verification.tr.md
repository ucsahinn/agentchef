# Doğrulama

Commit, push veya başka bir kullanıcıya kurulum önermeden önce tam lokal gate'i
çalıştır:

```bash
npm run check
```

Bu komut şunları çalıştırır:

- `scripts/validate-repo.mjs`: repo yapısı, JSON/TOML heuristics, plugin
  manifest, skill metadata, MCP metadata, README sinyalleri, SVG
  erişilebilirliği ve temel leak-pattern kontrolleri. Ayrıca `package.json`,
  `CHANGELOG.md` ve release notes dosyalarının current version için aynı hizada
  olduğunu kontrol eder.
- `scripts/validate-docs.mjs`: Markdown relative link kontrolleri ve GitHub
  workflow shape kontrolleri.
- `scripts/validate-readme-locales.mjs`: kok README dil switcher'i, lokalize
  giris dosyalari, ortak install/verification sinyalleri ve placeholder
  localization kontrolleri.
- `scripts/validate-workflow-security.mjs`: GitHub Actions icin
  least-privilege permissions, `actions/checkout` credential persistence,
  publish/auth komutu sinirlari ve implicit dependency install kontrolleri.
- `scripts/validate-install-plan.mjs`: install manifest, collision policy,
  required flag'ler, source path'ler ve high-risk operation kontrolleri.
- `scripts/validate-install-state-preview.mjs`: makine okunur no-write plan
  cikti sozlesmesi, selected/skipped component ID'leri, operation sekli, source
  version hizasi ve high-risk selection kontrolleri.
- `scripts/validate-installer-alignment.mjs`: PowerShell ve Bash install
  yuzeyleri icin manifest-to-installer drift kontrolleri.
- `scripts/validate-repair-install.mjs`: repair modu icin fixture tabanli
  kontrol. Drift preview, backup'li apply, marketplace koruma, config merge,
  skill cleanup raporu ve explicit managed-plugin pruning davranisini kanitlar.
- `scripts/validate-agent-config.mjs`: Windows ve Unix Codex template'leri icin
  uzman ajan catalog/config drift kontrolleri; role dosyalari icin otomatik
  model/reasoning secimini, aktif kullanici profilini override etmeden kontrol
  eder.
- `scripts/validate-adaptive-runtime.mjs`: kosullu spawn politikasini, kisa
  routing gorunurlugunu, `max_threads = 10` kapasitesini, normal bir-dort ajan
  paralelligini, canonical skill alias'larini, kullaniciya ait config overlay'i,
  token-audit katmanlarini, platform komut cozumlemesini ve sure sinirli runtime
  probe sozlesmesini kontrol eder.
- `scripts/validate-agent-research-corpus.mjs`: uzman ajan research corpus
  drift'i, authority-reference source marker'lari, source freshness cadence ve
  stale `dateChecked` kontrolleri ile agent basina expertise signal coverage.
- `scripts/validate-mcp-config.mjs`: Windows ve Unix Codex template'leri icin
  MCP catalog/config drift kontrolleri.
- `scripts/validate-chef-cli.mjs`: gruplu AgentChef komuta merkezi sözleşmesi,
  doğru yazma/hesap rehberi rozetleri, duruma göre kurulum ön izlemesi, curated
  skill hazır/eksik/geçersiz fixture'ları, kurulu MCP config envanteri, log
  konumu, README kullanım örnekleri ve public-safe GitHub auth sınırı rehberi.
- `scripts/validate-token-surfaces.mjs`: token audit script'i, `token-safe`
  profil, AGENTS token disiplini, context-budget skill referansi, README komut
  dokumani ve pinlenmeyen agent model/reasoning sozlesmesi.
- `scripts/verify-skill-sources.mjs`: offline skill catalog validation ve
  `catalog/skills-lock.json` commit, skill, CLI surumu ve integrity pin drift
  kontrolleri.
- `scripts/scan-supply-chain-iocs.mjs`: remote execution, tehlikeli shell,
  floating package ve implicit installer dependency kontrolleri.
- `scripts/security-audit.mjs`: public-readiness dosyaları, iki dilli docs,
  güvenli Codex default'ları, shell environment policy, disabled authenticated
  MCP'ler ve secret/state kontrolleri.
- `scripts/validate-package-surface.mjs`: repo-local npm cache ile `npm pack
  --dry-run --json --ignore-scripts` kullanarak source package dry-run
  validation yapar; scratch output, local agent state, auth file, archive ve
  release artifact'larini reddeder.
- `scripts/validate-release-readiness.mjs`: release notes, GitHub settings docs,
  workflow hardening, Gitleaks gate dokumantasyonu ve source artifact hygiene.
- `scripts/verify-install-runtime.mjs`: opsiyonel read-only post-install
  runtime kontrolü. Kurulu AgentChef hedeflerini aktif Codex CLI `CODEX_HOME`
  ile karşılaştırır.

Ek release kontrolleri:

```bash
npm run token:audit
git status --short
git diff --check
gitleaks detect --redact --no-banner --no-git --verbose
```

Repo `.gitleaks.toml` default Gitleaks kurallarını açık tutar; yalnızca ignored
local scratch, dependency, build ve cache dizinlerini kapsam dışı bırakır.

`npm run token:audit`; her oturumda yuklenen talimatlari, discoverability
metadata'sini, cagrilan veya deferred skill/ajan icerigini, repo bakim
boyutunu, tool schema/context'i, varsa olculen session telemetry'sini ve ajan
basi maliyeti ayri raporlar. Repo byte/token tahminleri tanilama amacli context
agirligidir; saglayici faturasi veya olculmus kullanim degildir.
Audit normalde Git gerektirir; boylece ignored/private lokal dosyalar kaynak
setine girmez. Git worktree disinda fail-closed davranir.
`node scripts/analyze-token-surfaces.mjs --allow-filesystem-fallback` komutunu
yalniz dizini inceledikten sonra kullanin. Acik fallback; linked, secret-like,
special ve asiri buyuk dosyalari reddeder.

Installable skill'ler değiştiğinde network-backed resolver kontrolünü de çalıştır:

```bash
npm run verify:skills:online
```

Online dogrulayici, Windows kontrollerini kullanicinin global npm cache
izinlerine baglamamak icin yok sayilan `tmp/npm-cache` calisma alani cache'ini
kullanir. Her installable skill resolution per-skill timeout ile sinirlanir; bu
sayede release verification hang etmek yerine somut pass/fail uretir.

## Syntax Kontrolleri

Lokal ortamda mümkün olan parser kontrolleri:

```bash
node --check scripts/validate-repo.mjs
node --check scripts/validate-docs.mjs
node --check scripts/validate-readme-locales.mjs
node --check scripts/validate-workflow-security.mjs
node --check scripts/validate-content-safety.mjs
node --check scripts/validate-install-plan.mjs
node --check scripts/validate-install-state-preview.mjs
node --check scripts/validate-installer-alignment.mjs
node --check scripts/plan-install.mjs
node --check scripts/validate-agent-config.mjs
node --check scripts/validate-agent-research-corpus.mjs
node --check scripts/validate-mcp-config.mjs
node --check scripts/chef-cli.mjs
node --check scripts/validate-chef-cli.mjs
node --check scripts/analyze-token-surfaces.mjs
node --check scripts/validate-token-surfaces.mjs
node --check scripts/verify-skill-sources.mjs
node --check scripts/scan-supply-chain-iocs.mjs
node --check scripts/validate-package-surface.mjs
node --check scripts/validate-release-readiness.mjs
node --check scripts/security-audit.mjs
```

Install plan smoke:

```bash
node scripts/plan-install.mjs --list-profiles
node scripts/plan-install.mjs --list-operations
node scripts/plan-install.mjs --all --json
```

Bash olan sistemlerde:

```bash
bash -n scripts/install.sh
```

Windows'ta:

```powershell
$errors = $null
$tokens = $null
[System.Management.Automation.Language.Parser]::ParseFile("scripts/install.ps1", [ref]$tokens, [ref]$errors) | Out-Null
$errors
```

## Installer Smoke Testleri

PowerShell dry run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
```

Bash dry run:

```bash
./scripts/install.sh --all --dry-run
```

AgentChef CLI smoke:

```bash
npm run validate:chef-cli
npm run chef -- --status
npm run chef -- --status --details
npm run chef -- --status --repo-only
npm run chef -- --status --repo-only --no-log
npm run chef -- --preview
npm run chef -- --update
npm run chef -- --update --verbose-plan
npm run chef -- --backups
npm run chef -- --backups --backup <id> --delete
npm run chef -- --backups --backup <id>
npm run chef -- --reset
npm run chef -- --routing --profile starter-health
npm run chef -- --diagnostics
npm run chef -- --processes
npm run chef -- --processes --cleanup-stale
```

`npm run chef` numarali operator menusunu acar. Yukaridaki noninteractive
smoke komutlari global/user state'e yazmaz. `--no-log` verilmezse ignored
repo-local CLI log'u olustururlar. Write path'leri `--apply` ister:
`npm run chef -- --update --apply` tracked/staged degisiklik olmayan worktree uzerinde, ilgisiz untracked dosyalari koruyan Git fast-forward,
yeni commit gelirse fresh preview, repo zaten guncelse backup'li managed
refresh icin lokal validation sonrasinda,
`npm run chef -- --reset --apply` backup'li managed refresh icin,
`npm run chef -- --repair --apply` backup'li repair icin,
`npm run chef -- --install --apply` full managed install icin kullanilir.
Etkileşimli terminalde `npm run chef -- --skills` her curated skill'i hazır,
eksik veya geçersiz olarak gösterir ve yalnız işlem gereken kayıtlardan birini
seçtirir. `npm run chef -- --mcp` kurulu config durumlarını gösterir, kullanıcının
eklediği bağlayıcıları korur ve hiçbir şeyi açmadan transport, endpoint/package,
setup/auth/source/rollback notlarının incelenmesini sağlar.

`npm run chef -- --diagnostics --no-log` read-only triage menusudur. Repo-only
status snapshot'ini calistirir; canli saglik, attention nedenleri, sonraki
guvenli adimlar, backup/log ozetleri ve status, doctor, routing, update
preview, repair preview, backup, log, runtime parity, Serena/MCP surec denetimi
icin tanilama kanit komutlarini gosterir. `npm run chef -- --processes
--no-log`, schema-v2 parent/child denetimini hiçbir şeyi durdurmadan çalıştırır.
Aktif Codex sahiplerini, mantıksal lokal MCP instance'larını, yardımcı süreç
ağaçlarını, bekleme süresindekileri, eski sahipsiz adayları ve ilgisiz
Node/Python runtime'larını ayırır. Yazmasız tam hedefli temizlik ön izlemesi için
`--cleanup-stale` ekle; yalnız `--cleanup-stale --apply` adayları durdurabilir.
npm üzerinden parse edilebilir JSON için `npm run --silent chef --
--processes --json --no-log` kullan. Tam semantik ve SessionEnd trust adımı
[çoklu oturum süreç hijyeninde](process-hygiene.tr.md) açıklanır.

`npm run chef -- --backups` backup archive metadata'sini global/user state'e
dokunmadan listeler. `npm run chef -- --backups --backup <id>` bir backup
archive'i yalniz path, size, hash, manifest durumu ve restorable target
metadata'siyle inceler; file content basmaz. `npm run validate:chef-cli`,
temporary-home fixture ile list, inspect, restore preview, restore apply,
backup delete preview/apply, rollback backup creation ve parseable JSON backup
smoke'larini kapsar.

Update apply path bilerek skill installer degildir: curated global skill'ler ve
opsiyonel global Git guard'lar `--install --apply`, `--skills --apply` veya
explicit installer flag'lerinin arkasinda kalir.

CI ayrica temporary home path'leriyle Bash dry-run ve PowerShell `-WhatIf`
smoke check calistirir; boylece installer runtime branch'leri global write
yapmadan denenir.

Temporary-home smoke testleri sadece bilerek ignored `tmp/` path'leri altında
dosya oluşturmak istediğinde kullanılmalı:

```powershell
$env:CODEX_HOME = "$PWD\tmp\codex-home"
$env:AGENTS_HOME = "$PWD\tmp\agents-home"
.\scripts\install.ps1
```

Oluşan `tmp/` klasörü ignored durumdadır ve commit edilmemelidir.

## Gerçek Install Doğrulaması

Gerçek installer yalnızca kullanıcı mevcut Codex/Git setup'ına yazmayı açıkça
onayladıktan sonra çalıştırılır:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -Interactive
```

Beklenen skill davranışı idempotent ve sessizdir: kurulu skill'ler `Skill
already installed`, başarılı yeni kurulumlar `Installed pinned skill` olarak
görünür; native-copy hataları registry installer çalıştırmadan fetch, staging,
hash, activation veya rollback aşamasını belirtir.

Skill aktivasyonunda iki kanit seviyesi vardir. Repo check'leri katalogun,
routing profillerinin ve activation contract'in varligini kanitlar:

```bash
npm run chef -- --skills --plain --no-log
npm run chef -- --routing --profile starter-health --plain --no-log
```

Gercek canli aktivasyon ise oturum kanitidir: `$security-best-practices` gibi
bir skill'i veya bundled local skill adini iceren no-write bir Codex turn'u
baslat; asistanin aksiyondan once `Skill selected` yazdigini ve hedef
`SKILL.md` dosyasini okudugunu dogrula.

Repo sağlığı, kurulu runtime drift'i, curated skill'ler, yapılandırılmış MCP'ler,
Codex CLI/oturum, doctor kontrolleri, dikkat maddeleri ve sonraki adımı kısa bir
son kullanıcı görünümünde görmek için:

```bash
npm run codex:status
```

Hedef/ortam runtime karşılaştırması, MCP kayıtlarının tamamı, yönlendirme
kontrolleri, context bütçesi, kurulum notları ve log bilgileri için `--details`
ekleyin:

```bash
npm run chef -- --status --details
```

Hedef/ortam karşılaştırması oturum durumuyla birlikte güvenli MCP state
alanlarını (`name`, açık/kapalı durumu, kapatma nedeni ve auth durumu) kapsar;
böylece eşit sunucu adları runtime drift'ini gizleyemez. Parse edilebilir bir
`codex doctor --json` yanıtı nonzero exit code ile dönerse `ok` değil,
`attention` olarak raporlanır.

Kurulu runtime check'lerini, global skill-root envanterini, Codex log
metadata'sini ve live Codex CLI probe'larini atlayan hizli repo-only audit icin:

```bash
npm run chef -- --status --repo-only --no-log
```

Gercek kurulum curated global skill'leri ve opsiyonel Git guard'lari bilerek
dahil ettiyse `npm run codex:status:all` kullan.

Gerçek kurulum veya upgrade sonrası read-only runtime verifier çalıştır:

```bash
npm run verify:install:runtime -- --expect-skills
```

Claude Code hedefi için `--target claude` (veya `both`) ekle. Doğrulayıcı bu
durumda `~/.claude/agentchef/` altındaki kurulum makbuzunu okur, her yönetilen
dosyanın hash'ini, her skill bağlantısını ve her birleştirme makbuzu girdisini
kontrol eder; CLI varsa `claude --version`, `claude plugin validate --strict`
ve `claude mcp list` problarını çalıştırır:

```bash
npm run verify:install:runtime -- --target claude
npm run codex:status -- --target both
```

`--expect-skills` flag'ini sadece gerçek kurulumda `-All` veya `-InstallSkills`
kullandıysan ver. Verifier managed dosyalarda source drift olup olmadığını
kontrol eder, Codex CLI kontrollerini `CODEX_HOME` açıkça kurulu hedefe
ayarlanmış şekilde çalıştırır, ambient sandbox/offline home drift'ini warning
olarak raporlar ve yalnızca kurulu hedefin kendisi doğrulanamazsa fail eder.

Her live probe kisa timeout ve ilerleme ciktisi kullanir. Network veya live
runtime kontrolu kullanilamiyorsa `--offline`; managed dosyalar ile Codex CLI
kontrol edilirken MCP probe baslatilmasin isteniyorsa `--no-mcp-probe` kullan.
Bu modlar yalniz adlandirilan probe yuzeyini atlar; source-drift dogrulamasini
gevsetmez.

## Remote Doğrulama

Onaylı push sonrası:

```bash
git rev-parse HEAD
git -c http.sslBackend=openssl ls-remote origin refs/heads/main
```

İki hash aynı olmalıdır. Ardından release notes yayınlamadan önce GitHub Actions
run durumunu doğrula.
