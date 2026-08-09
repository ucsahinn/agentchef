# Codex Chef Günlük Hızlı Kartı

Bu kart günlük operatör kullanımı içindir. Komut ile prompt niyetini ayırır;
varsayılan yetenekleri kapatmaz ve yazan işlemler için hâlâ açık `--apply`
onayı gerekir.

## Oturum profili seç

| Gerçek komut | Ne zaman? | Sınır |
| --- | --- | --- |
| `codex` | Normal günlük iş | Dengeli varsayılan: Docs, Context7 ve Serena kullanılabilir. |
| `codex --profile full` | Tek, yetenek-ağır ana oturum | Tüm bundled yerel stdio MCP yardımcılarını açar. |
| `codex --profile multi-session` | Birden çok eşzamanlı oturum | Yerel MCP süreçlerini kapatır; remote Docs, ajanlar ve skill'ler durur. |
| `codex --profile offline` | Bilerek izole / MCP'siz oturum | Chef-managed tüm MCP aktarımlarını kapatır; shell, browser ve web-search ağ izinlerini değiştirmez. |
| `codex --profile review` | Hassas inceleme | Read-only çalışma sınırıyla başlar. |

`offline`, varsayılanı azaltan bir mod değildir; yalnızca açıkça seçildiğinde
uygulanır. Normalde `codex` ile başla.

## Chef: günlük güvenli komutlar

| Gerçek komut | Sonuç |
| --- | --- |
| `npm run chef` | Operatör menüsünü açar. |
| `npm run chef -- --status --repo-only --no-log` | Yalnız repo sağlığını gösterir; global/runtime kontrollerini atlar. |
| `npm run chef -- --mcp --details --plain --no-log` | MCP durumlarını ve erişim sınırlarını gösterir. |
| `npm run chef -- --processes --no-log` | Codex, Node ve MCP süreç sahipliğini denetler. |
| `npm run chef -- --preview` | Kurulumdan önce yazmasız planı gösterir. |
| `npm run chef -- --update` | Update planını gösterir; yazmaz. |
| `npm run chef -- --update --apply` | Yazılı onaydan sonra fast-forward, doğrulama ve managed refresh yapar. Untracked dosyaları korur; tracked/staged değişiklikte durur. |
| `npm run chef -- --repair` | Managed drift için yazmasız onarım planı gösterir. |
| `npm run chef -- --repair --apply` | Yedek alarak managed drift'i onarır. |

## Route seçimi

```powershell
# Bilinen bir route
npm run chef -- --routing --profile starter-health --plain --no-log

# İş tanımından en fazla üç güvenli öneri
npm run codex:routing -- --task "MCP ayarını ve güvenlik sınırını incele"
```

`--task` sonucu yalnızca öneridir: ajan başlatmaz, MCP açmaz, izin yükseltmez.
Eşleşme yoksa tam routing board'u aç veya açık bir `--profile <id>` seç.

## Prompt niyet etiketleri

Bunlar terminal parametresi değildir. Prompt başına yazıldıklarında istenen
kanıt türünü anlatırlar; kapalı bir MCP'yi açmazlar.

| Etiket | İstenen yüzey |
| --- | --- |
| `--docs` | Resmî OpenAI/Codex dokümanı |
| `--c7` | Güncel framework/kütüphane API dokümanı |
| `--serena` | Sembol, çağrı zinciri ve dosya navigasyonu |
| `--seq` | Adım adım karar veya kök neden analizi |
| `--pw` / `--cdp` | Browser kanıtı, DOM, konsol veya performans incelemesi |
| `--gh`, `--figma`, `--sentry`, `--vercel`, `--supabase` | Hesap/özel bağlam gerektiğinde açık onaylı connector isteği |

## Sık kullanılan skill'ler

| Skill | Kullanım |
| --- | --- |
| `$investigate` / `$systematic-debugging` | Önce kanıt ve kök neden, sonra düzeltme. |
| `$test-driven-development` / `$new-feature` | Davranışı testle tanımlayıp uçtan uca uygula. |
| `$adaptive-agent-routing` | Karmaşık işte en dar ajan/skill/MCP yolunu seç. |
| `$evidence-research` / `$openai-docs` | Güncel karar veya Codex davranışı için kaynaklı araştırma. |
| `$webapp-testing` | Gerçek browser akışı ve ekran kanıtı. |
| `$release-verify` / `$git-hygiene` | Yayın öncesi doğrulama; yayın veya push yapmaz. |

## Dikkat edilmesi gereken eksik olmayan, bilinçli sınırlar

- `--task`, otomatik iş dağıtımı değildir; öneri sonrası görev kapsamı yine
  kullanıcı ve aktif oturum tarafından belirlenir.
- Auth isteyen connector'lar varsayılan olarak kapalıdır. GitHub, Figma,
  Sentry, Vercel veya Supabase bağlamı gerektiğinde ayrıca onay gerekir.
- Durum ekranındaki yalnız untracked dosyalar update'i engellemez; temizleme
  veya silme önerilmez. Tracked/staged değişiklikleri incelemeden update apply
  çalıştırma.
- Uzun installer smoke kapsamlı collision regresyonlarını korur; günlük hızlı
  kontrol için `npm run validate:installer-smoke:core` yeterli install lifecycle
  kanıtını verir.

## Üç hazır kalıp

```text
$investigate --serena Hatayı yeniden üret, kök nedeni kanıtla; kodu değiştirme.

$webapp-testing --pw Giriş akışını gerçek browser'da test et; ekran ve konsol kanıtı ver.

$release-verify --gh Yayın için tüm kontrolleri yap; push, tag veya release yayınlama.
```
