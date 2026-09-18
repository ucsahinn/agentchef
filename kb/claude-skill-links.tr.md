# Claude Skill Bağlantıları

Claude Code'daki `/skills` listesinde bir skill eksikse,
`~/.claude/skills/<name>` bir bağlantı yerine gerçek bir dizinse ya da
installer bir skill için `foreign` veya `adoptable-copy` raporluyorsa bu
makaleyi kullan.

## AgentChef Neyi Yönetir?

Claude Code `~/.agents/skills/` dizinini değil, `~/.claude/skills/` dizinini
okur. AgentChef her bundled ve küratörlü skill'in tek yönetilen kopyasını
`~/.agents/skills/<name>` altında tutar ve onu bir dizin bağlantısıyla
(`~/.claude/skills/<name>`; Windows'ta junction, diğer platformlarda symlink)
Claude'a açar. Claude Code bağlantılı skill klasörlerini destekler ve
tekilleştirir.

## Önerilen Kontroller

```bash
node scripts/install-claude-target.mjs --json --redact-paths
```

Her bağlantı tek bir karar raporlar:

| Karar | Anlamı |
| --- | --- |
| `create` | girdi yok; installer bağlantıyı oluşturur |
| `current` | bağlantı zaten yönetilen ağaca işaret ediyor |
| `adoptable-copy` | AgentChef marker'ı taşıyan gerçek bir dizin; yedekleyip bağlantıyla değiştirmek için `--adopt-skill-links` ile yeniden çalıştır |
| `foreign` | AgentChef marker'ı olmayan gerçek bir dizin ya da başka yere giden bir bağlantı; dokunulmaz |

## Temiz Karar Akışı

1. Preview al ve kararları oku.
2. `adoptable-copy` için kopyada korumak istediğin yerel düzenleme olmadığını
   doğrula, sonra `--adopt-skill-links` ile yeniden çalıştır; kopya önce
   yedeklenir.
3. `foreign` için kararı kendin ver: kendi skill'ini koru ya da kenara taşıyıp
   installer'ı yeniden çalıştır.
4. Yeni bir Claude Code oturumu başlat ve `/skills` çıktısını kontrol et.

## Durma Koşulları

- Bir destek turunda `foreign` dizinini silme; kullanıcı içeriğidir.
- Farklı bir hedefle elle bağlantı oluşturma; sapma tespiti yönetilen ağacı
  bekler.
- Windows'ta junction'lar yönetici hakkı gerektirmez; yalnızca skill
  bağlantıları için Developer Mode'u açma ya da yükseltilmiş yetkiyle çalıştırma.
