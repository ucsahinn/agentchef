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

Yalnız aktif Codex sahibi olmayan, bekleme süresi dolmuş lokal MCP ağaçları aday
olur. Aktif Codex ağaçları ve ilgisiz runtime'lar dışarıda kalır. Temizlik,
yakaladığı ağacı durdurmadan önce süreç kimliğini ve oluşturulma zamanını yeniden
doğrular; PID yeniden kullanılmışsa işlem güvenli biçimde durur.

## Oturum Sonu Taraması

Bundled plugin tek bir incelenmiş `SessionEnd` hook'u kaydeder. Normal bir oturum
sonunda yalnız o Codex sahibinin lokal MCP alt süreçlerini yakalar, detached
45 saniyelik bekleme başlatır ve sahip zinciri gittikten sonra hâlâ aynı PID ile
oluşturulma zamanını taşıyan yakalanmış süreçleri durdurur. Subagent lifecycle
olaylarında çalışmaz; context eklemez, prompt metni okumaz, dosya silmez ve
ilgisiz Node/Python süreçlerini taramaz.
Hook komutu Codex'in belgelediği üç saniyelik `SessionEnd` üst sınırını yalnız
sahipliği yakalayıp detached taramayı planlamak için kullanır; eksik veya yavaş
süreç metadata bilgisi fail-closed kalır.

Codex plugin hook'larının incelenmesini ve güvenilir olarak işaretlenmesini
ister. Plugin kurulduktan veya yenilendikten sonra yeni Codex oturumu aç,
`/hooks` ekranında tam kaynak ile hash'i incele ve yalnız bu repoyla eşleşiyorsa
güven. Kurulum kısayolu olarak `--dangerously-bypass-hook-trust` kullanma.

Resmî kaynaklar:

- [Codex hooks](https://developers.openai.com/codex/hooks)
- [Codex config ve profiller](https://developers.openai.com/codex/config-reference)
- [Codex MCP config](https://developers.openai.com/codex/mcp)

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
- Oturum sonu hook'u hâlâ yalnızca Codex plugin manifestinde yayınlanır. Claude
  Code oturum bitince kendi MCP alt süreçlerini kendisi durdurur.
