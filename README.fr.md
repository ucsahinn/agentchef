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

Codex Chef installe une base de travail Codex lisible sur Windows, macOS,
Linux et WSL : agents spécialisés, skills vérifiés, MCP prudents, aperçu avant
écriture et contrôles que vous pouvez lancer vous-même.

Ce projet communautaire est non officiel et ne fait pas partie des produits
OpenAI. Les identifiants, bases de données, publications, déploiements et accès
larges au système de fichiers restent soumis à une approbation explicite.

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f680.svg" alt="" aria-hidden="true" width="20"> Commencer En Sécurité

Consultez d’abord le plan d’installation. Cette étape n’écrit encore rien dans
votre configuration Codex.

```powershell
git clone https://github.com/ucsahinn/codex-chef.git
cd codex-chef
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
node scripts/plan-install.mjs --all --json --redact-paths
```

Installez uniquement après avoir vérifié l’aperçu :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -Interactive
```

```bash
chmod +x scripts/install.sh
./scripts/install.sh --all --interactive
```

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f6e1.svg" alt="" aria-hidden="true" width="20"> Vérification Locale

```bash
npm run check
npm run token:audit
```

`npm run token:audit` indique quelles surfaces utilisent le plus de contexte. Le profil facultatif `token-safe.config.toml` réduit les limites de sortie sans désactiver les fonctions principales ; la sélection automatique `model/reasoning` des agents suit le profil utilisateur actif.

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4da.svg" alt="" aria-hidden="true" width="20"> Documentation

- [English operator docs](docs/README.md)
- [Türkçe operatör dokümanları](docs/README.tr.md)
- [Knowledge base](kb/README.md)
- [Türkçe bilgi bankası](kb/README.tr.md)

La documentation technique complète est maintenue en anglais et en turc. Cette
page est une courte entrée écrite par des personnes, pas un résumé automatique
présenté comme une traduction complète.
