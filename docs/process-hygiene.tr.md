# Çoklu Oturum Süreç Hijyeni

[English](process-hygiene.md) | [Türkçe](process-hygiene.tr.md)

Her Codex oturumu kendi lokal stdio MCP sunucularına sahip olur. `npx` veya
`uvx` gibi bir launcher, tek mantıksal MCP instance'ı için birden fazla Node,
Python, shell veya browser yardımcı süreci başlatabilir. Beş ya da altı
eşzamanlı oturumda her lokal MCP'yi her pencerede açmak, çoğu pencere bu
araçları kullanmasa bile aynı ağaçları katlar.

AgentChef yetenekleri korur, yalnız ne zaman başlayacaklarını değiştirir:

- Dengeli ana config uzak `openaiDeveloperDocs` ile lokal `context7` ve
  `serena` sunucularını açar.
- `codex --profile full`, yetenek ağırlıklı tek ana oturum için yedi bundled
  lokal stdio MCP'nin tamamını açar.
- `codex --profile multi-session`, ikincil bir oturumda yedi lokal stdio
  MCP'nin tamamını kapatır. Agent, skill, uzak OpenAI docs, built-in memory,
  hook ve app yüzeyleri açık kalır.
- Kapalı MCP bloğu config'de kalır. Bir profil veya bilinçli config override ile
  yeniden açılabilir; hiçbir yetenek tanımı silinmez.

## Temizlikten Önce Denetle

Çalıştır:

```powershell
npm run chef -- --processes --no-log
npm run --silent chef -- --processes --json --no-log
```

Schema-v2 denetimi şunları ayrı raporlar:

- aktif Codex ve Claude Code oturumları;
- mantıksal lokal MCP instance'ları ve yardımcı süreç sayıları;
- aktif bir Codex veya Claude Code oturumuna ait MCP ağaçları;
- güvenlik bekleme süresi henüz dolmamış sahipsiz ağaçlar;
- eski ve sahipsiz temizlik adayları;
- ilgisiz Node, Python, Serena ve uvx süreçleri.

Windows süreç metadata bilgisi okunamazsa denetim isim düzeyinde sayıma döner
ve hiçbir temizlik adayı üretmez. Eksik kanıtı hiçbir zaman süreç durdurma
yetkisine çevirmez.

Tam hedefli eski süreç planını ön izle:

```powershell
npm run chef -- --processes --cleanup-stale --no-log
```

Planı ancak inceledikten sonra uygula:

```powershell
npm run chef -- --processes --cleanup-stale --apply --no-log
```

Yalnız canlı sahibi (Codex ya da Claude Code oturumu, veya Serena havuz yöneticisi) olmayan, bekleme süresi dolmuş lokal MCP ağaçları aday
olur. Aktif Codex ağaçları ve ilgisiz runtime'lar dışarıda kalır. Durdurmadan
hemen önce her aday taze bir süreç tablosuna karşı yeniden doğrulanır: aynı PID
ve oluşturulma zamanı, hâlâ canlı bir sahibi yok, bekleme süresi hâlâ dolmuş.
Doğrulamayı geçemeyen ağaç atlanır; PID yeniden kullanılmışsa işlem güvenli
biçimde durur. Aday varken hiçbiri durdurulamadıysa komut sıfırdan farklı kodla
çıkar.

## Oturum Sonu Taraması

Bundled plugin her CLI için incelenmiş tek bir `SessionEnd` hook'u kaydeder:
Codex onu `hooks/process-hygiene.json` dosyasından, Claude Code kendi
manifestinden okur ([Claude Code oturum sonu](#claude-code-oturum-sonu)
bölümüne bak). Normal bir oturum
sonunda yalnızca oturum sahibini kaydeder: hook'un üstündeki en yakın Codex ya da
Claude Code süreci, PID'i ve oluşturulma zamanıyla. Ardından ayrık 45 saniyelik
bir bekleme başlatır. Sahip kapandıktan sonra tarama süreç tablosunu okur ve
yalnızca sahibin başlattığı MCP ağaçlarını durdurur: sahibin PID'inin MCP imzası
taşıyan doğrudan çocuğu, sahipten sonra oluşmuş ve sahibin PID'ini sonradan
alan bir süreçten daha eski. Windows'ta durdurma `taskkill /T /F` ile yapılır;
gizli bir Node süreci `/F` olmadan durmayı reddeder. Subagent lifecycle
olaylarında çalışmaz; context eklemez, prompt metni okumaz, dosya silmez ve
ilgisiz Node/Python süreçlerini taramaz.
Codex `SessionEnd` için üç saniyelik bir üst sınır belgeler. Windows'ta bütün
süreçleri komut satırlarıyla okumak bundan uzun sürer; bu yüzden hook yalnızca
süreç kimliklerini, üst süreçleri, adları ve oluşturulma zamanlarını okur (tek
sorgu), komut satırlarını ayrık taramaya bırakır. Çok yüklü bir makinede bu bile
üç saniyeyi geçebilir; o zaman Codex hook'u durdurur ve tarama planlanmaz
(fail-closed). Kalanları `--cleanup-stale --apply` temizler.

Codex plugin hook'larının incelenmesini ve güvenilir olarak işaretlenmesini
ister. Plugin kurulduktan veya yenilendikten sonra yeni Codex oturumu aç,
`/hooks` ekranında tam kaynak ile hash'i incele ve yalnız bu repoyla eşleşiyorsa
güven. Kurulum kısayolu olarak `--dangerously-bypass-hook-trust` kullanma.

Resmî kaynaklar:

- [Codex hooks](https://developers.openai.com/codex/hooks)
- [Codex config ve profiller](https://developers.openai.com/codex/config-reference)
- [Codex MCP config](https://developers.openai.com/codex/mcp)

## Claude Code Oturum Sonu

Claude Code plugin manifesti (`plugins/agentchef/.claude-plugin/plugin.json`)
aynı taramayı matcher'sız ve 15 saniyelik timeout'lu bir `SessionEnd` hook'u
olarak satır içinde tanımlar:

```text
node ${CLAUDE_PLUGIN_ROOT}/scripts/codex-process-hygiene.mjs --session-end --runtime claude
```

- Hook `hooks/hooks.json` içinde değil manifestte durur: Claude Code bir
  `hooks/hooks.json` dosyasını kendiliğinden yükler, Codex ise hook'unu kendi
  manifesti üzerinden `hooks/process-hygiene.json` dosyasından okur. İki CLI
  de diğerinin hook'unu yüklemez.
- Hook exec biçimini kullanır (`command` artı `args`, kabuk yok); bu yüzden
  `node` sürecinin üstü doğrudan Claude Code sürecidir ve sahip araması ilk
  adımda biter.
- Ayrık tarama Codex'in kullandığıyla aynıdır: 45 saniye bekler, ardından
  yalnızca o Claude oturumunun başlattığı MCP ağaçlarını ve yalnızca o süreç
  kapandıktan sonra durdurur. PID, oluşturulma zamanı ve MCP imzası yeniden
  doğrulamaları Codex tarafıyla aynıdır.
- Claude Code `/clear` için de `SessionEnd` tetikler. Claude süreci o anda
  hâlâ çalıştığı için tarama canlı bir sahip bulur ve hiçbir şeyi durdurmaz.
- Claude Code'da hash başına hook güven adımı yoktur. Hook, `agentchef`
  plugin'i etkinleştirildiğinde çalışır; `/hooks` ile incele. Manifest
  `scripts/render-target-artifacts.mjs` ile üretilir ve commit edilen kopya
  saparsa `npm run check` başarısız olur.

Resmî kaynak:
[Claude Code hooks](https://code.claude.com/docs/en/hooks).

## Operasyon Notları

- Yeni profil varsayılanları yeni oturumları etkiler; zaten çalışan MCP
  ağaçlarını yeniden yapılandırmaz.
- Canlı Codex background task için `/ps` ve `/stop` kullan. Süreç hijyeni lokal
  MCP alt süreçleri içindir; task manager yerine geçmez.
- `agents.max_threads` kapasite tavanı olarak kalır. Koşullu delegasyon ve düşük
  süreçli ikincil profiller, çoklu pencere kapasitesini kaldırmadan normal
  fan-out'u sınırlar.
- Denetim eski ve sahipsiz aday bulmazsa ham Node/Python sayısı yüksek diye
  hiçbir şeyi durdurma.
- Denetim, çalışan bir Claude Code oturumunu tıpkı bir Codex oturumu gibi MCP
  sahibi olarak tanır; bu yüzden açık bir Claude oturumunun başlattığı MCP
  sunucuları aktiftir ve asla temizlik adayı olmaz. Öncesinde bu ağaçların
  Codex üst süreci olmadığı için yetim olarak raporlanıyor ve elle temizlik,
  açık her Claude Code oturumunun MCP sunucularını sonlandırıyordu.
- AgentChef Serena havuz yöneticisi başlattığı backend'lerin sahibidir. Bilerek
  ayrık çalışır ve onları boşta kalma süresi dolunca kendisi durdurur; bu yüzden
  üst süreci `serena-pool.mjs manager` olan bir backend asla temizlik adayı
  olmaz. Öncesinde çalışan bir havuz Serena backend'i (burada 22 süreç, yaklaşık
  1 GB) yetim olarak listeleniyordu.
- Oturum sonu hook'u iki plugin manifestinde de yayınlanır. Claude Code oturum
  bitince normalde kendi MCP alt süreçlerini kendisi durdurur; hook bundan
  sonra hayatta kalan ağaçları yakalar.
