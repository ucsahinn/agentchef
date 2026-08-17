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

Codex Chef monta uma base de trabalho clara para Codex no Windows, macOS,
Linux e WSL: agents especializados, skills revisadas, MCPs conservadores,
instalação com prévia e verificações que você mesmo consegue executar.

Este é um projeto comunitário não oficial, não um produto da OpenAI. Acesso a
credenciais, bancos de dados, publicação, deploy e filesystem amplo continua
dependendo de aprovação explícita.

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f680.svg" alt="" aria-hidden="true" width="20"> Comece Com Segurança

Veja primeiro o plano de instalação. Essa etapa ainda não grava nada na sua
configuração do Codex.

```powershell
git clone https://github.com/ucsahinn/codex-chef.git
cd codex-chef
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
node scripts/plan-install.mjs --all --json --redact-paths
```

Instale somente depois de conferir a prévia:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -Interactive
```

```bash
chmod +x scripts/install.sh
./scripts/install.sh --all --interactive
```

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f6e1.svg" alt="" aria-hidden="true" width="20"> Verificação Local

```bash
npm run check
npm run token:audit
```

`npm run token:audit` mostra quais superfícies usam mais contexto. O perfil opcional `token-safe.config.toml` reduz os limites de saída sem desativar recursos principais; a seleção automática de `model/reasoning` dos agentes segue o perfil ativo do usuário.

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4da.svg" alt="" aria-hidden="true" width="20"> Documentação

- [English operator docs](docs/README.md)
- [Türkçe operatör dokümanları](docs/README.tr.md)
- [Knowledge base](kb/README.md)
- [Türkçe bilgi bankası](kb/README.tr.md)

A documentação técnica completa é mantida em inglês e turco. Esta página é uma
entrada curta escrita por pessoas, não um resumo automático apresentado como
tradução completa.
