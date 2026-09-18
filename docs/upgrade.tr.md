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
  göç komutuyla 1.0.0'a planlandı.
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
  kalır.
- `npm run verify:install:runtime -- --target claude` ve
  `npm run codex:status -- --target both` Claude tarafını doğrular.

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
~/.codex/backups/codex-chef-YYYYMMDD-HHMMSS/
```

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
