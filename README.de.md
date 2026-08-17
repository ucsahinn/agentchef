# Codex Chef

<p align="center">
  <img src="assets/banner.svg" alt="Codex Chef" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/ucsahinn/codex-chef/actions/workflows/validate.yml"><img alt="Validate workflow" src="https://github.com/ucsahinn/codex-chef/actions/workflows/validate.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/ucsahinn/codex-chef?color=0f766e" /></a>
  <a href="README.md"><img alt="Six README languages" src="https://img.shields.io/badge/readme-6%20languages-0f766e" /></a>
</p>
<p align="center"><a href="https://github.com/ucsahinn/codex-chef/releases/tag/v0.5.74">Codex Chef v0.5.74 — final standalone release</a></p>


<p align="center">
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.md">English</a> |
  <a href="README.pt-BR.md">Português (Brasil)</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.fr.md">Français</a>
</p>

Codex Chef bringt eine nachvollziehbare Codex-Arbeitsumgebung auf Windows,
macOS, Linux und WSL: spezialisierte Agents, geprüfte Skills, vorsichtige
MCP-Standards, Vorschauen vor Änderungen und klare Prüfungen.

Dies ist ein inoffizielles Community-Projekt und kein Produkt von OpenAI.
Zugangsdaten, Datenbanken, Veröffentlichungen, Deployments und weitreichende
Dateisystemzugriffe bleiben zustimmungspflichtig.

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f680.svg" alt="" aria-hidden="true" width="20"> Sicher Starten

Zeige zuerst den Installationsplan an. Dabei wird noch nichts in deine
Codex-Konfiguration geschrieben.

```powershell
git clone https://github.com/ucsahinn/codex-chef.git
cd codex-chef
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
node scripts/plan-install.mjs --all --json --redact-paths
```

Installiere erst, wenn die Vorschau zu deiner Umgebung passt:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -Interactive
```

```bash
chmod +x scripts/install.sh
./scripts/install.sh --all --interactive
```

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f6e1.svg" alt="" aria-hidden="true" width="20"> Lokal Prüfen

```bash
npm run check
npm run token:audit
```

`npm run token:audit` macht große Kontextflächen sichtbar. Das optionale Profil `token-safe.config.toml` senkt Ausgabegrenzen, ohne Kernfunktionen abzuschalten; die automatische `model/reasoning`-Auswahl der Agenten folgt dem aktiven Benutzerprofil.

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4da.svg" alt="" aria-hidden="true" width="20"> Dokumentation

- [English operator docs](docs/README.md)
- [Türkçe operatör dokümanları](docs/README.tr.md)
- [Knowledge base](kb/README.md)
- [Türkçe bilgi bankası](kb/README.tr.md)

Codex Chef hält die vollständige technische Dokumentation auf Englisch und
Türkisch. Diese Seite ist ein kurzer, von Menschen geschriebener Einstieg und
kein automatisch erzeugter Ersatz für eine vollständige Übersetzung.
