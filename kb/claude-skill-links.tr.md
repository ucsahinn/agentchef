# Claude Skill Bağlantıları

Claude Code'da ya da Codex'te bir AgentChef skill'i iki kez listeleniyorsa,
1.3.0'a yükselttikten sonra `~/.claude/skills/<name>` veya
`~/.agents/skills/<name>` hâlâ bir AgentChef skill'i barındırıyorsa ya da
installer veya göç bir skill için `retire`, `keep-until-plugin` veya `foreign`
raporluyorsa bu makaleyi kullan.

## AgentChef Neyi Yönetir?

1.3.0'dan beri AgentChef ne skill bağlantısı ne de doğrudan skill kopyası
oluşturur. AgentChef'in her skill'i iki CLI'ya da yalnızca `agentchef`
plugin'i üzerinden, `~/.agents/plugins/sources/agentchef/skills/<name>`
kaynağından ulaşır: Claude Code'da `/agentchef:<skill>`, Codex'te
`$agentchef:<skill>` diye çağrılır.

1.0–1.2 kurulumları farklı çalışıyordu: skill'leri `~/.agents/skills/<name>`
altına kopyalıyor ve `~/.claude/skills/<name>` altına bağlıyordu (Windows'ta
junction, diğer platformlarda symlink); bu yüzden her skill iki kez
listeleniyordu. O kurulumlardan kalanları iki adım emekli eder:

- `npm run chef -- --migrate-identity --target both --apply`, AgentChef'in
  `~/.agents/skills` altındaki kendi doğrudan kopyalarını önce yedekler, sonra
  kaldırır. Bir kopya ancak marker'ı (`.agentchef-managed.json`) ya da
  provenance kaydı (`.agentchef-source.json`) sayesinde AgentChef'e ait
  sayılır ve yalnızca plugin kaynağı o skill'i zaten taşıyorsa emekli edilir.
  Emekli edilen bir kopyaya işaret eden Claude bağlantıları onunla birlikte
  kaldırılır ve kurulum makbuzundan düşülür.
- Claude installer'ı önceki kurulum makbuzunun kaydettiği bağlantıları emekli
  eder, ama yalnızca plugin başarıyla kaydedildikten sonra. Kayıt atlanır ya
  da başarısız olursa bağlantılar yerinde ve makbuzda kayıtlı kalır.

Kendi skill'lerine ve AgentChef'in oluşturmadığı bağlantılara asla dokunulmaz.
`-AdoptSkillLinks` ve `--adopt-skill-links` hâlâ kabul edilir ama etkisizdir.

## Önerilen Kontroller

```bash
npm run chef -- --migrate-identity --target both
node scripts/install-claude-target.mjs --json --redact-paths
npm run verify:install:runtime -- --expect-skills
```

Göç ön izlemesi her eski kopya ya da bağlantı için tek bir karar raporlar:

| Karar | Anlamı |
| --- | --- |
| `retire` | skill'i plugin kaynağında zaten bulunan bir AgentChef kopyası ya da böyle bir kopyaya giden Claude bağlantısı; `--apply` ile önce yedeklenir, sonra kaldırılır |
| `keep-until-plugin` | skill'i henüz plugin kaynağında olmayan bir AgentChef pinned kopyası; installer onu oraya yazana kadar korunur |
| `foreign` | AgentChef marker'ı ya da provenance kaydı yok, veya bağlantı başka bir yere gidiyor; dokunulmaz |

`verify-install-runtime --expect-skills` skill'leri plugin kaynağının içinde
denetler; bir skill'in plugin dışında hâlâ doğrudan bir kopyası varsa başarısız
olmadan uyarır ve göç komutunu gösterir.

## Temiz Karar Akışı

1. Göç ön izlemesini çalıştır ve kararları oku.
2. Bir kopya `keep-until-plugin` raporluyorsa önce tam kurulumu çalıştır
   (`-All` / `--all` ya da `-InstallSkills` / `--install-skills`); böylece
   pinned skill'ler plugin kaynağına yazılır. Sonra göçü yeniden ön izle.
3. Göçü `--apply` ile uygula; emekli edilen her kopya önce yedeklenir.
4. `foreign` için kararı kendin ver: o senin içeriğindir, AgentChef dokunmaz.
5. Yeni bir Claude Code ve Codex oturumu başlat ve her skill'in bir kez
   listelendiğini kontrol et.

## Durma Koşulları

- Bir destek turunda `foreign` bir dizini ya da bağlantıyı silme; kullanıcı
  içeriğidir.
- Skill bağlantılarını elle yeniden oluşturma; 1.3.0'dan beri skill'ler
  plugin'den gelir ve bir bağlantı skill'i yalnızca ikinci kez listeler.
- Göç `keep-until-plugin` raporlarken AgentChef kopyalarını elle silme;
  plugin o skill'i henüz taşımıyor.
