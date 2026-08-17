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

Codex Chef prepara una base de trabajo clara para Codex en Windows, macOS,
Linux y WSL: agentes especializados, skills revisadas, MCP prudentes,
instalación con vista previa y comprobaciones que puedes ejecutar tú mismo.

Es un proyecto comunitario no oficial, no un producto de OpenAI. El acceso a
credenciales, bases de datos, publicación, despliegue y sistemas de archivos
amplios sigue requiriendo aprobación explícita.

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f680.svg" alt="" aria-hidden="true" width="20"> Empieza Con Seguridad

Revisa primero el plan de instalación. Este paso todavía no escribe en tu
configuración de Codex.

```powershell
git clone https://github.com/ucsahinn/codex-chef.git
cd codex-chef
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
node scripts/plan-install.mjs --all --json --redact-paths
```

Instala solo cuando la vista previa coincida con lo que esperas:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -Interactive
```

```bash
chmod +x scripts/install.sh
./scripts/install.sh --all --interactive
```

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f6e1.svg" alt="" aria-hidden="true" width="20"> Verificación Local

```bash
npm run check
npm run token:audit
```

`npm run token:audit` muestra qué superficies consumen más contexto. El perfil opcional `token-safe.config.toml` reduce los límites de salida sin desactivar funciones principales; la selección automática de `model/reasoning` de los agentes sigue el perfil activo del usuario.

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4da.svg" alt="" aria-hidden="true" width="20"> Documentación

- [English operator docs](docs/README.md)
- [Türkçe operatör dokümanları](docs/README.tr.md)
- [Knowledge base](kb/README.md)
- [Türkçe bilgi bankası](kb/README.tr.md)

La documentación técnica completa se mantiene en inglés y turco. Esta página
es una entrada breve escrita por personas, no un resumen automático presentado
como traducción completa.
