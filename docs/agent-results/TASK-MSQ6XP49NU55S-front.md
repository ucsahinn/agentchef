# TASK-MSQ6XP49NU55S — Control Brain health projection doğrulaması

## Ne yapıldı

- `scripts/chef-cli.mjs` içindeki `inspectBrainContinuity()` ve `runContinuity()` akışı incelendi.
- Continuity projeksiyonunun yerel `CODEX_CHEF_BRAIN_HOME` vault'unu `brain-cli status --json` alt süreciyle denetlediği; canlı Control proje sağlığını ise yalnız mevcut Codex oturumundaki Control MCP'nin sorgulayabileceği doğrulandı.
- Role/project kapsamlı, restricted içeriği hariç tutan retrieval sınırı `scripts/lib/brain-foundation.mjs` içinde incelendi.
- Salt-okunur gerçek CLI akışı ve Brain CLI test paketi çalıştırıldı.

## Kanıt

Çalıştırılan komut:

```powershell
& 'C:\Program Files\nodejs\node.exe' scripts\chef-cli.mjs --continuity --json --no-log
& 'C:\Program Files\nodejs\node.exe' --test scripts\tests\brain-cli.test.mjs scripts\tests\brain-foundation.test.mjs
```

Gerçek continuity çıktısının ilgili bölümü:

```json
{
  "control": {
    "configured": false,
    "enabled": false,
    "liveStatus": "session-MCP-only",
    "liveProbe": {
      "cliSubprocessCanProbe": false,
      "availableFrom": "current-codex-session-mcp"
    }
  },
  "brain": {
    "vault": {
      "configured": true,
      "exists": true,
      "status": "ok",
      "contentOk": true,
      "securityOk": true,
      "scope": "local CODEX_CHEF_BRAIN_HOME only; separate from Control project Brain mappings"
    }
  },
  "boundaries": {
    "controlBrainBridge": "bounded read-only context only when explicitly requested and project-mapped",
    "controlProjectBrainMappingIsSeparateFromLocalVault": true
  }
}
```

Test sonucu:

```text
tests 24
pass 24
fail 0
duration_ms 4943.6061
```

## Değişen dosyalar

- `docs/agent-results/TASK-MSQ6XP49NU55S-front.md` eklendi.
- `docs/agent-results/INDEX.md` sonuç indeksi yenilendi.

## Riskler

- Bu çalışma alanında `codex_control` yapılandırılmamış. Bu nedenle canlı Control proje-health/projection değeri alınamadı; CLI tasarım gereği bunu alt süreçten sorgulamaz.
- Yerel vault'un `ok` olması, ayrı bir Control proje Brain eşlemesinin sağlığını kanıtlamaz.

## Açık sorular

- Control MCP etkin bir Codex oturumunda proje-health/projection çağrısının gerçek MCP yanıtı ayrıca kayda alınmalı mı?

## Sonraki adım

1. Control MCP etkin hedef oturumda canlı proje-health/projection çağrısını çalıştırıp MCP yanıtını kaydedin.
