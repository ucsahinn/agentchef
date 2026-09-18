# Public Hazırlık

Public-ready olmak yalnızca “dosyalar GitHub’da” demek değildir. Repoyu ilk kez açan biri AgentChef’in neyi değiştirdiğini, neye bilerek dokunmadığını ve bu iki iddiayı pazarlama cümlelerine güvenmeden nasıl doğrulayacağını anlayabilmeli.

## Dürüst Konumlandırma

AgentChef resmi bir OpenAI ürünü değil, topluluk tarafından geliştirilen bir projedir. Windows, macOS, Linux ve WSL üzerinde Codex için çalışan lokal ve platform bağımsız bir kurulum kitidir. İncelenebilir varsayılanlar ve araçlar sunar; hosted bir kontrol paneli değildir, private hesapları, database’leri, production sistemlerini veya geniş filesystem köklerini sessizce bağlamaz.

Public girişte insan tarafından yazılmış iki README bulunur: İngilizce ve Türkçe. Ayrıntılı operatör dokümantasyonu İngilizce ve Türkçe tutulur. Daha kısa Almanca, İspanyolca, Brezilya Portekizcesi ve Fransızca sayfalar otomatik özetleri tam çeviri gibi göstermek yerine okuyucuyu kanonik rehberlere yönlendirir.

## Public Kullanıcının Kanıtlayabilmesi Gerekenler

- Herhangi bir global write öncesinde kurulum planı görülebilir.
- PowerShell ve Bash installer’ları yönetilen hedefleri değiştirmeden önce yedek alır.
- Normal kurulum ve repair; kullanıcıya ait config, skill, MCP, profil ve ilgisiz plugin dosyalarını korur.
- Kimlik doğrulamalı ve yüksek riskli connector’lar kullanıcı bilinçli açana kadar kapalı kalır.
- Source tree içinde auth state, session, memory, private path, generated archive, installer veya lokal cache bulunmaz.
- Package allowlist yalnızca tracked ve incelenmiş source dosyalarını içerir.
- CI; Windows installer davranışını, Ubuntu/Node 22 ve macOS/Node 24 taşınabilirliğini kontrol eder.
- Release notes güncel public sürümü anlatır; eski teknik geçmiş `CHANGELOG.md` içinde kalır.

## Repo Hijyeni

Source ile release depolamasını birbirine karıştırma:

- Source Git’e aittir.
- İleride generated archive veya installer oluşursa GitHub Releases altında yayınlanır.
- Ignored `.serena/`, `tmp/`, log, cache, screenshot ve lokal agent state public commit’e girmez.
- Eski GitHub Release sayfaları güncel indirme yolunu karıştırıyorsa kaldırılabilir; fakat tag ve commit geçmişi, ayrıca incelenmiş bir gerekçe olmadıkça korunur.

## Tamamlanma Kanıtı

Repo kökünde geniş doğrulama zincirini çalıştır:

```bash
npm run check
npm run verify:skills:online
node scripts/plan-install.mjs --all --json --redact-paths
git diff --check
gitleaks detect --redact --no-banner --no-git --verbose
```

Release öncesinde değişen ve stage edilen her path’i ayrıca incele. Push sonrasında GitHub Actions tamamen yeşil olmalı ve release tag’i hedeflenen commit’e çözülmeli.

Dar kapsamlı tek bir komut geniş public hazırlığı kanıtlamaz. Bir yüzey çalıştırılamadıysa neyin doğrulanmadığını açıkça yaz.
