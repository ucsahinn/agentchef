[CmdletBinding(SupportsShouldProcess, ConfirmImpact="Medium")]
param(
  [switch]$All,
  [switch]$InstallSkills,
  [switch]$InstallGitGuards,
  [switch]$Force,
  [switch]$Update,
  [switch]$Repair,
  [switch]$AdoptFetchSkill,
  [switch]$AdoptSeoSkill,
  [switch]$AdoptEvidenceResearchSkill,
  [string[]]$AdoptDirectSkill = @(),
  [switch]$NoBackup,
  [switch]$Interactive,
  [switch]$PlainOutput
)

$ErrorActionPreference = "Stop"
$ScriptCmdlet = $PSCmdlet
$IconChef = [System.Char]::ConvertFromUtf32(0x1F373)
$IconCheck = [char]0x2713
$IconBullet = [char]0x2022
$SkippedExistingCount = 0

if ($All) {
  $InstallSkills = $true
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$AgentsHome = if ($env:AGENTS_HOME) { $env:AGENTS_HOME } else { Join-Path $HOME ".agents" }

function Get-CuratedSkillsCatalogPath {
  if (
    $env:CODEX_CHEF_TEST_MODE -eq "1" -and
    -not [string]::IsNullOrWhiteSpace($env:CODEX_CHEF_TEST_SKILLS_CATALOG)
  ) {
    return (Resolve-Path -LiteralPath $env:CODEX_CHEF_TEST_SKILLS_CATALOG).Path
  }
  return (Join-Path $RepoRoot "catalog\skills.json")
}

function Use-DecoratedOutput {
  if ($PlainOutput) { return $false }
  if ($env:NO_COLOR -or $env:TERM -eq "dumb") { return $false }
  return $true
}

function Get-Icon {
  param(
    [Parameter(Mandatory=$true)][string]$Emoji,
    [Parameter(Mandatory=$true)][string]$Fallback
  )
  if (Use-DecoratedOutput) { return $Emoji }
  return $Fallback
}

function Write-DecoratedHost {
  param(
    [Parameter(Mandatory=$true)][string]$Message,
    [string]$Color = "Gray"
  )
  if (Use-DecoratedOutput) {
    Write-Host $Message -ForegroundColor $Color
    return
  }
  Write-Host $Message
}

function Write-Section {
  param([Parameter(Mandatory=$true)][string]$Title)
  Write-Host ""
  Write-DecoratedHost -Message "$(Get-Icon $Script:IconChef "[*]") $Title" -Color "Cyan"
}

function Write-Action {
  param(
    [Parameter(Mandatory=$true)][string]$Status,
    [Parameter(Mandatory=$true)][string]$Message
  )
  Write-DecoratedHost -Message "  $(Get-Icon $Script:IconCheck "-") ${Status}: $Message" -Color "Green"
}

function Write-Note {
  param([Parameter(Mandatory=$true)][string]$Message)
  Write-DecoratedHost -Message "  $(Get-Icon $Script:IconBullet "-") $Message" -Color "DarkGray"
}

function Write-NameList {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][object[]]$Names,
    [string]$Color = "Gray"
  )
  Write-Note "$Label ($($Names.Count)):"
  Write-DecoratedHost -Message "    $($Names -join ', ')" -Color $Color
}

function Read-OptionalPath {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][string]$CurrentValue
  )
  if (-not $Interactive) {
    return $CurrentValue
  }
  $Answer = Read-Host "$Label [$CurrentValue]"
  if ([string]::IsNullOrWhiteSpace($Answer)) {
    return $CurrentValue
  }
  return $Answer.Trim()
}

function Read-YesNo {
  param(
    [Parameter(Mandatory=$true)][string]$Prompt,
    [bool]$Default = $false
  )
  if (-not $Interactive) {
    return $false
  }
  $Suffix = if ($Default) { "[Y/n]" } else { "[y/N]" }
  $Answer = Read-Host "$Prompt $Suffix"
  if ([string]::IsNullOrWhiteSpace($Answer)) {
    return $Default
  }
  return $Answer.Trim().ToLowerInvariant().StartsWith("y")
}

function Resolve-InstallPath {
  param([Parameter(Mandatory=$true)][string]$Path)
  if ($Path.StartsWith("~")) {
    $Path = Join-Path $HOME $Path.Substring(1).TrimStart('\', '/')
  }
  return [System.IO.Path]::GetFullPath($Path)
}

function Test-AnyManagedTargetExists {
  $managedTargets = @(
    (Join-Path $CodexHome "AGENTS.md"),
    (Join-Path $CodexHome "config.toml"),
    (Join-Path $CodexHome "rules\default.rules"),
    (Join-Path $CodexHome "plugins\codex-chef-workflows"),
    (Join-Path $AgentsHome "plugins\marketplace.json")
  )
  foreach ($target in $managedTargets) {
    if (Test-Path -LiteralPath $target) {
      return $true
    }
  }
  return $false
}

function Test-PathEntryExists {
  param([Parameter(Mandatory=$true)][string]$Path)
  $entry = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  return $null -ne $entry
}

function Invoke-PreflightValidators {
  Write-Section "Preflight validation"
  $Checks = @(
    @{ Label = "agent config"; Script = "scripts\validate-agent-config.mjs" },
    @{ Label = "MCP config"; Script = "scripts\validate-mcp-config.mjs" },
    @{ Label = "approval harmony"; Script = "scripts\validate-approval-harmony.mjs" }
  )
  foreach ($Check in $Checks) {
    $ScriptPath = Join-Path $RepoRoot $Check.Script
    & node $ScriptPath
    if ($LASTEXITCODE -ne 0) {
      throw "Preflight validation failed for $($Check.Label); refusing to install managed global files."
    }
    Write-Action -Status "validated" -Message $Check.Label
  }
}

function Invoke-InstallTargetPreflight {
  $SurfaceHelper = Join-Path $RepoRoot "scripts\assert-install-surface.mjs"
  & node $SurfaceHelper --codex-home $CodexHome --agents-home $AgentsHome | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Managed install surface contains an unsafe linked path; refusing all writes."
  }

  $PluginSource = Join-Path $RepoRoot "plugins\codex-chef-workflows"
  $DirectSkillHelper = Join-Path $RepoRoot "scripts\manage-direct-skill-target.mjs"
  $DirectSkills = @(Get-ManagedDirectSkills)
  foreach ($DirectSkill in $DirectSkills) {
    $DirectSource = Join-Path $PluginSource "skills\$($DirectSkill.Name)"
    $DirectTarget = Join-Path $AgentsHome "skills\$($DirectSkill.Name)"
    $AlternateTarget = Join-Path $CodexHome "skills\$($DirectSkill.Name)"
    if (
      -not ([System.IO.Path]::GetFullPath($AlternateTarget).Equals(
        [System.IO.Path]::GetFullPath($DirectTarget),
        [System.StringComparison]::OrdinalIgnoreCase
      )) -and
      (Test-PathEntryExists $AlternateTarget)
    ) {
      throw "Duplicate direct skill root detected; move or explicitly reconcile the existing CODEX_HOME copy before install: $AlternateTarget"
    }
    $DirectArgs = @($DirectSkillHelper, $DirectSource, $DirectTarget, "--check")
    if ($DirectSkill.Adopt) {
      $DirectArgs += "--allow-adopt"
    }
    & node @DirectArgs | Out-Null
    if ($LASTEXITCODE -eq 2) {
      throw "Refusing to overwrite user-owned $($DirectSkill.Display) skill without $($DirectSkill.Flag): $DirectTarget"
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Direct $($DirectSkill.Display) ownership preflight failed: $DirectTarget"
    }
  }

  $MarketplacePath = Join-Path (Join-Path $AgentsHome "plugins") "marketplace.json"
  $MarketplacePluginTarget = Join-Path $AgentsHome "plugins\sources\codex-chef-workflows"
  $MarketplaceHelper = Join-Path $RepoRoot "scripts\upsert-marketplace-entry.mjs"
  & node $MarketplaceHelper $MarketplacePath $MarketplacePluginTarget --check
  if ($LASTEXITCODE -notin @(0, 2)) {
    throw "Plugin marketplace preflight failed before any managed write: $MarketplacePath"
  }
}

function Get-ManagedDirectSkills {
  $CatalogPath = Join-Path $RepoRoot "catalog\skills.json"
  $CatalogSkills = @((Get-Content -LiteralPath $CatalogPath -Raw | ConvertFrom-Json).skills)
  $KnownNames = @($CatalogSkills | Where-Object { $_.directInstall -eq $true } | ForEach-Object { $_.name })
  $UnknownNames = @($AdoptDirectSkill | Where-Object { $_ -notin $KnownNames })
  if ($UnknownNames.Count -gt 0) {
    throw "Unknown managed direct skill adoption target: $($UnknownNames -join ', ')"
  }
  foreach ($Skill in ($CatalogSkills | Where-Object { $_.directInstall -eq $true })) {
    $LegacyAdopt = switch ($Skill.name) {
      "fetch" { [bool]$AdoptFetchSkill }
      "seo" { [bool]$AdoptSeoSkill }
      "evidence-research" { [bool]$AdoptEvidenceResearchSkill }
      default { $false }
    }
    $LegacyFlag = switch ($Skill.name) {
      "fetch" { "-AdoptFetchSkill" }
      "seo" { "-AdoptSeoSkill" }
      "evidence-research" { "-AdoptEvidenceResearchSkill" }
      default { "-AdoptDirectSkill $($Skill.name)" }
    }
    [pscustomobject]@{
      Name = $Skill.name
      Display = (($Skill.name -split "-") | ForEach-Object {
        if ($_.Length -eq 0) { "" } else { $_.Substring(0, 1).ToUpperInvariant() + $_.Substring(1) }
      }) -join " "
      Adopt = $LegacyAdopt -or ($AdoptDirectSkill -contains $Skill.name)
      Flag = $LegacyFlag
    }
  }
}

if ($Interactive) {
  Write-Section "Guided setup"
  Write-Note "Press Enter to accept the safe default shown in brackets."
  Write-Note "No tokens, secrets, cookies, sessions, or credentials are requested."
}

$CodexHome = Read-OptionalPath -Label "Codex home" -CurrentValue $CodexHome
$AgentsHome = Read-OptionalPath -Label "Agents home" -CurrentValue $AgentsHome
$CodexHome = Resolve-InstallPath $CodexHome
$AgentsHome = Resolve-InstallPath $AgentsHome

if ($Repair) {
  Write-Section "Codex Chef repair"
  if ($WhatIfPreference) {
    Write-Note "Mode: repair preview; no files will be changed"
  } else {
    Write-Note "Mode: backup-backed repair of managed Codex Chef drift"
  }
  $RepairScript = Join-Path $RepoRoot "scripts\repair-install.mjs"
  $RepairArgs = @(
    $RepairScript,
    "--redact-paths",
    "--platform",
    "windows",
    "--codex-home",
    $CodexHome,
    "--agents-home",
    $AgentsHome
  )
  if (-not $WhatIfPreference) {
    $RepairArgs += "--apply"
  }
  if ($NoBackup) {
    $RepairArgs += "--no-backup"
  }
  if ($AdoptFetchSkill) {
    $RepairArgs += "--adopt-fetch-skill"
  }
  if ($AdoptSeoSkill) {
    $RepairArgs += "--adopt-seo-skill"
  }
  if ($AdoptEvidenceResearchSkill) {
    $RepairArgs += "--adopt-evidence-research-skill"
  }
  foreach ($SkillName in $AdoptDirectSkill) {
    $RepairArgs += @("--adopt-direct-skill", $SkillName)
  }
  & node @RepairArgs
  exit $LASTEXITCODE
}

if ($Interactive -and $All -and $InstallSkills) {
  if (-not (Read-YesNo -Prompt "Install or reconcile the 15 reviewed global Codex skills now?" -Default $true)) {
    $InstallSkills = $false
  }
}

if ($Update) {
  $Force = $true
}

if ($Interactive -and (Test-AnyManagedTargetExists) -and -not $Force) {
  if (Read-YesNo -Prompt "Replace existing managed Codex Chef files after backup instead of preserving/merging?" -Default $false) {
    $Force = $true
  }
}

if ($Interactive -and -not $InstallGitGuards) {
  if (Read-YesNo -Prompt "Install optional global Git guards for this Windows user?" -Default $false) {
    $InstallGitGuards = $true
  }
}

$BackupRoot = Join-Path $CodexHome ("backups\codex-chef-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

function Invoke-Change {
  param(
    [Parameter(Mandatory=$true)][string]$Target,
    [Parameter(Mandatory=$true)][string]$Action,
    [Parameter(Mandatory=$true)][scriptblock]$ScriptBlock
  )
  if ($ScriptCmdlet.ShouldProcess($Target, $Action)) {
    & $ScriptBlock
    return $true
  }
  return $false
}

function Assert-ManagedWriteTarget {
  param([Parameter(Mandatory=$true)][string]$Path)
  $targetFull = [System.IO.Path]::GetFullPath($Path)
  $roots = @(
    [System.IO.Path]::GetFullPath($CodexHome).TrimEnd('\', '/'),
    [System.IO.Path]::GetFullPath($AgentsHome).TrimEnd('\', '/')
  )
  if ($InstallGitGuards) {
    $gitIgnoreTarget = [System.IO.Path]::GetFullPath((Join-Path $HOME ".gitignore_global"))
    $hooksRoot = [System.IO.Path]::GetFullPath((Join-Path $HOME ".githooks")).TrimEnd('\', '/')
    if ($targetFull.Equals($gitIgnoreTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
      $roots += [System.IO.Path]::GetFullPath($HOME).TrimEnd('\', '/')
    }
    if (
      $targetFull.Equals($hooksRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $targetFull.StartsWith($hooksRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
    ) {
      $roots += $hooksRoot
    }
  }
  $helper = Join-Path $RepoRoot "scripts\assert-managed-target.mjs"

  foreach ($root in $roots) {
    if (
      $targetFull.Equals($root, [System.StringComparison]::OrdinalIgnoreCase) -or
      $targetFull.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
    ) {
      & node $helper $root $targetFull | Out-Null
      if ($LASTEXITCODE -ne 0) {
        throw "Managed write target became unsafe; refusing access: $Path"
      }
      return
    }
  }

  throw "Refusing to access unmanaged install target: $Path"
}

function Ensure-Dir {
  param([Parameter(Mandatory=$true)][string]$Path)
  Assert-ManagedWriteTarget $Path
  Invoke-Change -Target $Path -Action "Ensure directory exists" -ScriptBlock {
    Assert-ManagedWriteTarget $Path
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  } | Out-Null
}

function Get-RelativePathSafe {
  param(
    [Parameter(Mandatory=$true)][string]$Base,
    [Parameter(Mandatory=$true)][string]$Path
  )
  $baseFull = [System.IO.Path]::GetFullPath($Base).TrimEnd('\', '/')
  $pathFull = [System.IO.Path]::GetFullPath($Path)
  if ($pathFull.StartsWith($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $pathFull.Substring($baseFull.Length).TrimStart('\', '/')
  }
  return Split-Path -Leaf $Path
}

function Assert-ManagedDirectoryTarget {
  param([Parameter(Mandatory=$true)][string]$Path)
  $targetFull = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
  $codexFull = [System.IO.Path]::GetFullPath($CodexHome).TrimEnd('\', '/')
  $agentsFull = [System.IO.Path]::GetFullPath($AgentsHome).TrimEnd('\', '/')
  $allowedRoots = @($codexFull, $agentsFull)

  foreach ($root in $allowedRoots) {
    if ($targetFull.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
      return
    }
  }

  throw "Refusing to replace unmanaged directory target: $Path"
}

function Backup-Target {
  param([Parameter(Mandatory=$true)][string]$Path)
  if ($NoBackup -or -not (Test-Path -LiteralPath $Path)) {
    return
  }

  Assert-ManagedWriteTarget $Path
  Ensure-Dir $BackupRoot
  $relative = Get-RelativePathSafe -Base $CodexHome -Path $Path
  if ($relative.StartsWith("..")) {
    $relative = Split-Path -Leaf $Path
  }
  $destination = Join-Path $BackupRoot $relative
  Ensure-Dir (Split-Path -Parent $destination)
  Invoke-Change -Target $destination -Action "Back up $Path" -ScriptBlock {
    Assert-ManagedWriteTarget $Path
    Assert-ManagedWriteTarget $destination
    Copy-Item -LiteralPath $Path -Destination $destination -Recurse -Force
  } | Out-Null
}

function Install-File {
  param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Destination
  )

  Assert-ManagedWriteTarget $Destination
  if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
    $Script:SkippedExistingCount += 1
    return
  }

  Ensure-Dir (Split-Path -Parent $Destination)
  Backup-Target $Destination
  $changed = Invoke-Change -Target $Destination -Action "Install file from $Source" -ScriptBlock {
    Assert-ManagedWriteTarget $Destination
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
  }
  if ($changed) {
    Write-Action -Status "installed" -Message $Destination
  }
}

function Install-CodexConfig {
  param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Destination
  )

  Assert-ManagedWriteTarget $Destination
  if ((Test-Path -LiteralPath $Destination) -and (-not $Force -or $Update)) {
    Ensure-Dir (Split-Path -Parent $Destination)
    Backup-Target $Destination
    $MergeScript = Join-Path $RepoRoot "scripts\merge-codex-config.mjs"
    $MergeArgs = @($MergeScript, $Source, $Destination)
    $Action = "Merge missing Codex Chef config blocks from $Source"
    if ($Update) {
      $MergeArgs += "--sync-managed-tables"
      $Action = "Synchronize managed Codex Chef config blocks from $Source"
    }
    if ($WhatIfPreference) {
      $DryRunArgs = @($MergeArgs) + "--dry-run"
      Invoke-Change -Target $Destination -Action $Action -ScriptBlock {
        & node @DryRunArgs
      } | Out-Null
      return
    }
    $changed = Invoke-Change -Target $Destination -Action $Action -ScriptBlock {
      Assert-ManagedWriteTarget $Destination
      & node @MergeArgs
      if ($LASTEXITCODE -ne 0) {
        throw "Codex config merge failed with code $LASTEXITCODE"
      }
    }
    if ($changed) {
      Write-Action -Status $(if ($Update) { "updated config" } else { "merged config" }) -Message $Destination
    }
    return
  }

  Install-File -Source $Source -Destination $Destination
}

function Install-McpProfile {
  param(
    [Parameter(Mandatory=$true)][string]$Template,
    [Parameter(Mandatory=$true)][string]$Destination,
    [Parameter(Mandatory=$true)][string]$ConfigSource
  )

  Assert-ManagedWriteTarget $Destination
  if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
    $Script:SkippedExistingCount += 1
    return
  }

  Ensure-Dir (Split-Path -Parent $Destination)
  Backup-Target $Destination
  $Renderer = Join-Path $RepoRoot "scripts\merge-codex-config.mjs"
  $RenderArgs = @($Renderer, "--render-mcp-profile", "--source", $ConfigSource, "--template", $Template, "--output", $Destination)
  $Action = "Generate complete MCP profile from $ConfigSource"
  if ($WhatIfPreference) {
    $RenderArgs += "--dry-run"
  }
  $changed = Invoke-Change -Target $Destination -Action $Action -ScriptBlock {
    Assert-ManagedWriteTarget $Destination
    & node @RenderArgs
    if ($LASTEXITCODE -ne 0) {
      throw "MCP profile generation failed with code $LASTEXITCODE"
    }
  }
  if ($changed) {
    Write-Action -Status "generated profile" -Message $Destination
  }
}

function Install-Directory {
  param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Destination
  )

  Assert-ManagedWriteTarget $Destination
  if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
    Ensure-Dir (Split-Path -Parent $Destination)
    Backup-Target $Destination
    Assert-ManagedDirectoryTarget $Destination
    $changed = Invoke-Change -Target $Destination -Action "Sync managed directory files from $Source" -ScriptBlock {
      $sourceFull = [System.IO.Path]::GetFullPath($Source).TrimEnd([char[]]@('\', '/'))
      $destinationFull = [System.IO.Path]::GetFullPath($Destination)
      Get-ChildItem -LiteralPath $Source -Recurse -File -Force | ForEach-Object {
        $fileFull = [System.IO.Path]::GetFullPath($_.FullName)
        $relative = $fileFull.Substring($sourceFull.Length).TrimStart([char[]]@('\', '/'))
        $target = [System.IO.Path]::Combine($destinationFull, $relative)
        Assert-ManagedWriteTarget $target
        $targetParent = Split-Path -Parent $target
        if ($targetParent) {
          Assert-ManagedWriteTarget $targetParent
          [System.IO.Directory]::CreateDirectory($targetParent) | Out-Null
        }
        Assert-ManagedWriteTarget $target
        [System.IO.File]::Copy($_.FullName, $target, $true)
      }
    }
    if ($changed) {
      Write-Action -Status "synced directory" -Message $Destination
    }
    return
  }

  Ensure-Dir (Split-Path -Parent $Destination)
  Backup-Target $Destination
  Assert-ManagedDirectoryTarget $Destination
  if (Test-Path -LiteralPath $Destination) {
    Invoke-Change -Target $Destination -Action "Replace existing managed directory" -ScriptBlock {
      Assert-ManagedWriteTarget $Destination
      Remove-Item -LiteralPath $Destination -Recurse -Force
    } | Out-Null
  }
  $changed = Invoke-Change -Target $Destination -Action "Install directory from $Source" -ScriptBlock {
    Assert-ManagedWriteTarget $Destination
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
  }
  if ($changed) {
    Write-Action -Status "installed" -Message $Destination
  }
}

Write-Section "Codex Chef installer"
Write-Note "Codex home: $CodexHome"
Write-Note "Agents home: $AgentsHome"
if ($Update) {
  Write-Note "Mode: update managed targets after backup; preserve user config and synchronize Codex Chef tables"
} elseif ($Force) {
  Write-Note "Mode: replace managed targets after backup"
} else {
  Write-Note "Mode: preserve existing files; merge missing config blocks"
}
if ($InstallSkills) {
  Write-Note "Skills: install reviewed commit-pinned entries by verified native copy"
} else {
  Write-Note "Skills: skipped unless -All or -InstallSkills is used"
}
if ($InstallGitGuards) {
  Write-Note "Git guards: enabled for this user"
} else {
  Write-Note "Git guards: disabled by default"
}
if ($WhatIfPreference) {
  Write-Note "Dry run: no files, Git settings, or skills will be changed"
}
if ($Interactive) {
  if ($Update) {
    Write-Note "Existing config policy: backup + synchronize managed Codex Chef tables while preserving user-owned settings"
  } else {
    Write-Note "Existing config policy: backup + merge missing Codex Chef blocks unless Force is enabled"
  }
  Write-Note "Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled."
  if (-not (Read-YesNo -Prompt "Continue with this plan?" -Default $true)) {
    throw "Codex Chef install cancelled by user."
  }
}

Invoke-PreflightValidators
Invoke-InstallTargetPreflight

Write-Section "Managed Codex files"
Ensure-Dir $CodexHome
Ensure-Dir (Join-Path $CodexHome "agents")
Ensure-Dir (Join-Path $CodexHome "rules")
Ensure-Dir $AgentsHome

$TemplateRoot = Join-Path $RepoRoot "templates\codex"

Install-File -Source (Join-Path $TemplateRoot "AGENTS.md") -Destination (Join-Path $CodexHome "AGENTS.md")
Install-CodexConfig -Source (Join-Path $TemplateRoot "config.windows.toml") -Destination (Join-Path $CodexHome "config.toml")
Install-File -Source (Join-Path $TemplateRoot "codex-profile.mjs") -Destination (Join-Path $CodexHome "codex-profile.mjs")
Install-File -Source (Join-Path $TemplateRoot "serena-pool.mjs") -Destination (Join-Path $CodexHome "serena-pool.mjs")
Install-File -Source (Join-Path $TemplateRoot "rules\default.rules") -Destination (Join-Path $CodexHome "rules\default.rules")

Get-ChildItem -Path (Join-Path $TemplateRoot "agents") -Filter "*.toml" | ForEach-Object {
  Install-File -Source $_.FullName -Destination (Join-Path (Join-Path $CodexHome "agents") $_.Name)
}

Get-ChildItem -Path (Join-Path $TemplateRoot "profiles") -Filter "*.toml" | ForEach-Object {
  if ($_.Name -in @("full.config.toml", "multi-session.config.toml", "offline.config.toml")) {
    Install-McpProfile -Template $_.FullName -Destination (Join-Path $CodexHome $_.Name) -ConfigSource (Join-Path $CodexHome "config.toml")
  } else {
    Install-File -Source $_.FullName -Destination (Join-Path $CodexHome $_.Name)
  }
}

$PluginSource = Join-Path $RepoRoot "plugins\codex-chef-workflows"
$PluginTarget = Join-Path $CodexHome "plugins\codex-chef-workflows"
Install-Directory -Source $PluginSource -Destination $PluginTarget
$MarketplacePluginTarget = Join-Path $AgentsHome "plugins\sources\codex-chef-workflows"
Install-Directory -Source $PluginSource -Destination $MarketplacePluginTarget
$DirectSkillHelper = Join-Path $RepoRoot "scripts\manage-direct-skill-target.mjs"
$DirectSkills = @(Get-ManagedDirectSkills)
foreach ($DirectSkill in $DirectSkills) {
  $DirectSource = Join-Path $PluginSource "skills\$($DirectSkill.Name)"
  $DirectTarget = Join-Path $AgentsHome "skills\$($DirectSkill.Name)"
  Install-Directory -Source $DirectSource -Destination $DirectTarget
  if (-not $WhatIfPreference) {
    Assert-ManagedWriteTarget (Join-Path $DirectTarget ".codex-chef-managed.json")
    $DirectMarkArgs = @($DirectSkillHelper, $DirectSource, $DirectTarget, "--mark")
    if ($DirectSkill.Adopt) {
      $DirectMarkArgs += "--allow-adopt"
    }
    & node @DirectMarkArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Cannot record Codex Chef ownership for the direct $($DirectSkill.Display) skill: $DirectTarget"
    }
  }
}

$MarketplaceDir = Join-Path $AgentsHome "plugins"
Ensure-Dir $MarketplaceDir
$MarketplacePath = Join-Path $MarketplaceDir "marketplace.json"
$MarketplaceHelper = Join-Path $RepoRoot "scripts\upsert-marketplace-entry.mjs"
Assert-ManagedWriteTarget $MarketplacePath
& node $MarketplaceHelper $MarketplacePath $MarketplacePluginTarget --check
$marketplaceCheckExit = $LASTEXITCODE
if ($marketplaceCheckExit -eq 2) {
  Backup-Target $MarketplacePath
  $changed = Invoke-Change -Target $MarketplacePath -Action "Upsert Codex Chef plugin marketplace entry" -ScriptBlock {
    Assert-ManagedWriteTarget $MarketplacePath
    & node $MarketplaceHelper $MarketplacePath $MarketplacePluginTarget --write
    if ($LASTEXITCODE -ne 0) {
      throw "Cannot update plugin marketplace because the helper failed with code $LASTEXITCODE`: $MarketplacePath"
    }
  }
  if ($changed) {
    Write-Action -Status "updated marketplace" -Message $MarketplacePath
  }
} elseif ($marketplaceCheckExit -eq 0) {
  $Script:SkippedExistingCount += 1
} else {
  throw "Cannot update plugin marketplace because it is invalid or unreadable: $MarketplacePath"
}

$PluginRefreshHelper = Join-Path $RepoRoot "scripts\refresh-installed-plugin.mjs"
$PluginRefreshArgs = @($PluginRefreshHelper, "--codex-home", $CodexHome)
if (-not $WhatIfPreference) {
  $PluginRefreshArgs += "--apply"
}
& node @PluginRefreshArgs
if ($LASTEXITCODE -ne 0) {
  throw "Refresh installed Codex Chef plugin cache failed with code $LASTEXITCODE."
}

if ($InstallGitGuards) {
  Write-Section "Optional Git guards"
  $GitIgnoreSource = Join-Path $RepoRoot "templates\git\.gitignore_global"
  $GitIgnoreTarget = Join-Path $HOME ".gitignore_global"
  $HooksDir = Join-Path $HOME ".githooks"
  $HookTarget = Join-Path $HooksDir "pre-commit"

  Install-File -Source $GitIgnoreSource -Destination $GitIgnoreTarget
  Ensure-Dir $HooksDir
  Install-File -Source (Join-Path $RepoRoot "templates\git\pre-commit") -Destination $HookTarget

  $configuredExcludes = Invoke-Change -Target "global Git config core.excludesfile" -Action "Set to $GitIgnoreTarget" -ScriptBlock {
      git config --global core.excludesfile $GitIgnoreTarget
    }
  if ($configuredExcludes) {
    if ($LASTEXITCODE -ne 0) {
      throw "git config core.excludesfile failed with code $LASTEXITCODE"
    }
  }
  $configuredHooks = Invoke-Change -Target "global Git config core.hooksPath" -Action "Set to $HooksDir" -ScriptBlock {
      git config --global core.hooksPath $HooksDir
    }
  if ($configuredHooks) {
    if ($LASTEXITCODE -ne 0) {
      throw "git config core.hooksPath failed with code $LASTEXITCODE"
    }
  }
  if ($configuredExcludes -and $configuredHooks) {
    Write-Action -Status "configured" -Message "global Git excludesfile and hooksPath"
  }
}

if ($InstallSkills) {
  Write-Section "Curated skills"
  if ($WhatIfPreference) {
    $CatalogPath = Get-CuratedSkillsCatalogPath
    $Catalog = Get-Content -LiteralPath $CatalogPath -Raw | ConvertFrom-Json
    foreach ($Skill in $Catalog.skills | Where-Object { $_.install -eq $true }) {
      $DepthFlag = if ($Skill.fullDepth -eq $true) { " --full-depth" } else { "" }
      Write-Action -Status "would install pinned skill" -Message "$($Skill.name) from $($Skill.package)@$($Skill.commit) --skill $($Skill.skill)$DepthFlag"
    }
    Write-Note "Skipped skill installation because -WhatIf is active"
  } else {
    $CatalogPath = Get-CuratedSkillsCatalogPath
    $Catalog = Get-Content -LiteralPath $CatalogPath -Raw | ConvertFrom-Json
    if (-not $env:GIT_CONFIG_COUNT) {
      $env:GIT_CONFIG_COUNT = "1"
      $env:GIT_CONFIG_KEY_0 = "http.sslBackend"
      $env:GIT_CONFIG_VALUE_0 = "openssl"
    }
    $env:CI = "1"
    $env:NO_COLOR = "1"
    $env:FORCE_COLOR = "0"
    $env:TERM = "dumb"
    if (-not $env:npm_config_cache) {
      $env:npm_config_cache = Join-Path $RepoRoot "tmp\npm-cache"
    }
    if (-not $env:NPM_CONFIG_CACHE) {
      $env:NPM_CONFIG_CACHE = $env:npm_config_cache
    }
    foreach ($Skill in $Catalog.skills | Where-Object { $_.install -eq $true }) {
      if (-not $Skill.package -or -not $Skill.commit -or -not $Skill.skill) {
        Write-Warning "Skipped skill without verified package, commit, and skill fields: $($Skill.name)"
        continue
      }
      $PinnedHelper = Join-Path $RepoRoot "scripts\install-pinned-skill.mjs"
      $SkillArgs = @(
        $PinnedHelper,
        "--package",
        $Skill.package,
        "--commit",
        $Skill.commit,
        "--skill",
        $Skill.skill,
        "--cli-version",
        $Catalog.skillsCliVersion,
        "--json"
      )
      if ($Skill.fullDepth -eq $true) {
        $SkillArgs += "--full-depth"
      }
      $DepthFlag = if ($Skill.fullDepth -eq $true) { " --full-depth" } else { "" }
      Write-Action -Status "installing pinned skill" -Message "$($Skill.name) from $($Skill.package)@$($Skill.commit) --skill $($Skill.skill)$DepthFlag"
      $Output = & node @SkillArgs 2>&1
      $ExitCode = $LASTEXITCODE
      $OutputText = ($Output -join [Environment]::NewLine)
      if ($ExitCode -ne 0 -or $OutputText -match "Failed to install|Installation failed|Failed to clone") {
        $Output | ForEach-Object { Write-Host $_ }
        throw "Skill install failed for $($Skill.name)"
      }
      try {
        $SkillResult = $OutputText | ConvertFrom-Json
      } catch {
        $Output | ForEach-Object { Write-Host $_ }
        throw "Skill install returned an invalid status receipt for $($Skill.name)"
      }
      switch ($SkillResult.outcome) {
        "installed" { Write-Action -Status "installed skill" -Message $Skill.name }
        "upgraded" { Write-Action -Status "upgraded managed skill" -Message $Skill.name }
        "already-current" { Write-Action -Status "skill already current" -Message $Skill.name }
        "skipped-user-owned" { Write-Action -Status "preserved user-owned skill" -Message $Skill.name }
        "adopted" { Write-Action -Status "adopted skill" -Message $Skill.name }
        default {
          $Output | ForEach-Object { Write-Host $_ }
          throw "Skill install returned an unknown outcome for $($Skill.name): $($SkillResult.outcome)"
        }
      }
    }
  }
}

Write-Section "Capability board"
try {
  $AgentCatalog = Get-Content -Path (Join-Path $RepoRoot "catalog\agents.json") -Raw | ConvertFrom-Json
  $McpCatalog = Get-Content -Path (Join-Path $RepoRoot "catalog\mcp-servers.json") -Raw | ConvertFrom-Json
  $SkillCatalog = Get-Content -Path (Join-Path $RepoRoot "catalog\skills.json") -Raw | ConvertFrom-Json
  $RoutingCatalog = Get-Content -Path (Join-Path $RepoRoot "catalog\routing-profiles.json") -Raw | ConvertFrom-Json
  $PluginSkillRoot = Join-Path $RepoRoot "plugins\codex-chef-workflows\skills"
  $AgentNames = @($AgentCatalog.agents | ForEach-Object { $_.name })
  $McpReady = @($McpCatalog.servers | Where-Object { $_.defaultEnabled -eq $true } | ForEach-Object { $_.name })
  $McpOptIn = @($McpCatalog.servers | Where-Object { $_.defaultEnabled -ne $true } | ForEach-Object { $_.name })
  $McpSetupNotes = @($McpCatalog.servers | Where-Object { $_.setupKind -ne "none" -and ($_.setupKind -ne "local-state" -or $_.name -eq "codebase-memory") } | ForEach-Object { "$($_.name) [$($_.setupKind)]: $($_.setupHint)" })
  $PluginSkills = @(Get-ChildItem -Path $PluginSkillRoot -Directory | ForEach-Object { $_.Name })
  $ReviewedSkills = @($SkillCatalog.skills | Where-Object { $_.install -eq $true } | ForEach-Object { $_.name })
  $RoutingProfiles = @($RoutingCatalog.profiles | ForEach-Object { $_.id })
  Write-NameList -Label "Agents ready" -Names $AgentNames -Color "White"
  Write-NameList -Label "MCP ready by default" -Names $McpReady -Color "White"
  Write-NameList -Label "MCP opt-in / disabled by default" -Names $McpOptIn -Color "DarkYellow"
  Write-NameList -Label "MCP setup notes" -Names $McpSetupNotes -Color "DarkYellow"
  Write-NameList -Label "Local plugin skills" -Names $PluginSkills -Color "White"
  Write-NameList -Label "Reviewed global skills" -Names $ReviewedSkills -Color "White"
  Write-NameList -Label "Enterprise routing profiles" -Names $RoutingProfiles -Color "White"
  Write-Note "Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled."
} catch {
  Write-Warning "Could not render capability board: $($_.Exception.Message)"
}

Write-Section "Next steps"
if ($SkippedExistingCount -gt 0) {
  Write-Note "$SkippedExistingCount existing managed target(s) were preserved; use -Force only for a deliberate backup-backed replacement"
}
if ($WhatIfPreference) {
  Write-Action -Status "completed" -Message "Codex Chef dry run"
} else {
  Write-Action -Status "completed" -Message "Codex Chef install"
  Write-Note "Restart Codex, then run:"
  Write-Host "    codex doctor --summary"
  Write-Host "    npm run codex:routing"
  Write-Host "    npm run codex:status"
  Write-Host "    npm run verify:install:runtime"
  Write-Host "    codex exec --strict-config `"Summarize the active Codex setup.`""
}
if (-not $NoBackup -and (Test-Path -LiteralPath $BackupRoot)) {
  $ManifestScript = Join-Path $RepoRoot "scripts\write-backup-manifest.mjs"
  $ManifestOutput = & node $ManifestScript --backup-root $BackupRoot --operation install --platform windows 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Could not write backup manifest: $($ManifestOutput -join [Environment]::NewLine)"
  }
  Write-Note "Backup: $BackupRoot"
}

# PowerShell can otherwise propagate the last native command exit code after a
# successful dry run or install, which makes CI report a false failure.
exit 0
