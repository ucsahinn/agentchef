# Kurulum Nasıl Kullanılır?

Bu starter sadece bir `config.toml` kopyası değildir. Kurulumdan sonra Codex'in
kalıcı talimatları, güvenli MCP varsayılanları, doğrulanmış public/first-party
skill'leri, uzman ajanları, profilleri, kuralları, yerel plugin'i ve repo-only
doctor tanılaması hazır olur. Git hijyen guard'ları ayrı opt-in olarak durur
çünkü global Git davranışını değiştirir.

## Ön İzleme Öncelikli Kurulum

PowerShell:

```powershell
git clone https://github.com/ucsahinn/agentchef.git
cd agentchef
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
node scripts/plan-install.mjs --all --json --redact-paths
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -Interactive
```

Bash veya WSL:

```bash
git clone https://github.com/ucsahinn/agentchef.git
cd agentchef
chmod +x scripts/install.sh
./scripts/install.sh --all --dry-run
node scripts/plan-install.mjs --all --json --redact-paths
./scripts/install.sh --all --interactive
```

Yalın `-All` veya `--all` komutunu yalnızca install planının zaten incelendiği
ve hedef Codex/Agents klasörlerinin kontrollü olduğu otomasyonlarda kullan.

Sadece belirli parçaları kurmak istiyorsan dar bayrakları kullan:

- `-InstallSkills` / `--install-skills`
- `-InstallGitGuards` / `--install-git-guards`

Skill kurulumu `catalog/skills.json` içindeki doğrulanmış `package` ve `skill`
değerlerini kullanır; Skills CLI'ye `--skill`, `--yes` ve `--global` verir. İki
alanı da olmayan katalog kayıtları isimleriyle clone edilmeye çalışılmaz, skip
edilir.

## İlk Doğrulama

Kurulumdan sonra Codex'i yeniden başlat ve çalıştır:

```bash
npm run codex:doctor
codex doctor --summary
codex exec --strict-config "Summarize the active Codex setup."
```

Codex içinde şunları kontrol et:

```text
/mcp
/skills
/plugins
/hooks
```

## Çalışma Modeli

Bu kurulumu uzman bir yazılım ekibi gibi kullan:

1. Bilmediğin repo, büyük değişiklik veya mimari soru varsa `code_mapper` ile
   başla.
2. Davranışın prompt, `AGENTS.md`, skill, plugin, MCP, hook, memory, rule veya
   config profiline mi ait olduğunu belirlemek için `context_architect` kullan.
3. Güncel Codex, API, kütüphane, framework veya cloud davranışı için
   `docs_researcher` kullan.
4. Tekrar kullanılabilir prompt, başarı kriteri, skill brief'i ve instruction
   sistemi için `prompt_architect` kullan.
5. MCP server, app connector veya tool allowlist açmadan, kapatmadan veya debug
   etmeden önce `mcp_integrator` kullan.
6. Kararlar ve dosya değişiklikleri dağılmasın diye uygulamayı ana thread'de
   tut.
7. Lint, typecheck, test, build, smoke veya CI sorunu için `test_verifier`
   kullan.
8. Tarayıcıda UI kontrolü, screenshot, responsive layout, console hatası ve
   etkileşim durumları için `frontend_verifier` kullan.
9. Auth, secret, izinler, veri erişimi, API route, kriptografi veya abuse path
   için `security_auditor` kullan.
10. Starter sağlığı, catalog drift, install-plan, docs, MCP ve safe no-write
    tanılama için `codex_doctor` kullan.
11. Push, tag, release, paket, deploy veya public yayın öncesi
   `release_verifier` kullan.

Resmi Codex dokümanları subagent akışını açıkça tetiklenen paralel çalışma
olarak anlatır. Bu starter o akış için ajan dosyalarını ve routing dilini verir;
ama onayları, sandbox'ı ve connector auth sınırlarını kaldırmaz.

## MCP Varsayılanları

Varsayılan açık gelenler:

- Resmi OpenAI dokümanları için OpenAI Docs MCP.
- Güncel kütüphane ve framework dokümanları için Context7.
- Semantik kod gezintisi için Serena.

Dengeli ana config'de tanımlı ama kapalı gelenler:

- Parçalama ve düşünce akışı için Sequential Thinking.
- Tarayıcı doğrulaması için Playwright ve Chrome DevTools.
- Gizli veri yazmamak şartıyla yerel Memory.
- Graph destekli repo zekâsı için Codebase Memory.

Hesap veya geniş erişim isteyen ve ihtiyaç olana kadar kapalı gelenler:

- GitHub
- Figma
- Linear
- Notion
- Sentry
- Vercel
- Supabase
- Filesystem

Kimlik doğrulama veya veri erişimi isteyen connector'ları sadece somut görev
için ve hesap kapsamını onayladıktan sonra aç. Connector private data okuyabiliyor
veya aksiyon alabiliyorsa önce `mcp_integrator` kullan.

## Profiller

Installer profilleri `~/.codex` içine kopyalar:

- `development.config.toml`: normal geliştirme profili.
- `review.config.toml`: read-only, yüksek reasoning review profili.
- `ci.config.toml`: hook'ları kapalı read-only doğrulama profili.
- `token-safe.config.toml`: broad veya uzun işlerde skill, agent, MCP, memory,
  hook veya app kapatmadan daha düşük verbosity, daha düşük default reasoning,
  compaction ve tool-output limitleri kullanır.
- `full.config.toml`: yetenek ağırlıklı tek ana oturumda bütün bundled lokal
  stdio MCP'leri açar.
- `multi-session.config.toml`: ikincil eşzamanlı oturumlarda lokal stdio
  MCP'leri kapatır; agent, skill, uzak OpenAI docs, built-in memory, hook ve
  app yüzeylerini korur.

Ana config'i bozmak yerine farklı güvenlik duruşu gerektiğinde profil kullan.
Uzman role dosyaları agent bazlı model/reasoning pinlemez; aktif profil ve
Codex runtime task'a uygun dengeyi seçebilir.
Sahiplik farkındalıklı denetim ve tam hedefli eski süreç temizliği için
[çoklu oturum süreç hijyeni](process-hygiene.tr.md) sayfasına bak.

## Kullanışlı Promptlar

Repo denetimi:

```text
Use code_mapper, context_architect, and test_verifier. Map this repository,
identify which Codex surface each improvement belongs in, run the narrowest
meaningful checks, and report blockers with file references before editing.
```

Codex setup tanılaması:

```text
Use codex_doctor. Run the repo-only doctor and relevant validators, summarize
agent/MCP/docs/install-plan drift, and do not inspect or mutate user-global
Codex, Agents, or Git state unless I explicitly approve.
```

İçerik eklemeden UI/UX iyileştirme:

```text
Kıdemli bir UX/UI uzmanı gibi davran. Yeni marketing bölümü veya alakasız metin
ekleme. Mevcut arayüzü iyileştir: kullanıcı teklifin ne olduğunu daha hızlı
anlasın, işletmeyle daha az adımda iletişime geçsin ve siteyi mobilde rahat
kullansın. Mevcut içeriği ve marka niyetini koru; hiyerarşi, boşluk, responsive
davranış, performans, erişilebilirlik ve görsel kalite profesyonel hissetsin.
İşi bitti saymadan önce mobil genişlik, metin taşması, focus state'leri,
loading/error durumları ve ana iletişim akışını doğrula.
```

Release hazırlığı:

```text
Use release_verifier and git-hygiene. Inspect git status, validate docs/scripts,
run secret scanning when available, check public-readiness files, and summarize
whether this is safe to push or publish. Do not push unless I explicitly approve.
```

## Güvenlik Kuralları

- Repo içine token, auth dosyası, session, memory, cookie, private key veya
  makineye özel state koyma.
- Sandbox açık kalsın.
- Onaylar interaktif kalsın.
- Kimlik doğrulamalı uzak connector'lar varsayılan kapalı kalsın.
- Gitleaks bulgularını incelenene kadar gerçek kabul et.
- Commit, push, publish, deploy, secret rotation ve yıkıcı dosya işlemleri hâlâ
  açık kullanıcı onayı ister.
