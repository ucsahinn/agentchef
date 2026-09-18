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
  [switch]$AdoptGitIgnore,
  [switch]$AdoptGitHook,
  [switch]$AdoptGitExcludesFile,
  [switch]$AdoptGitHooksPath,
  [switch]$NoBackup,
  [switch]$Interactive,
  [ValidateSet("codex", "claude", "both")][string]$Target = "codex",
  [string]$ClaudeHome,
  [switch]$AdoptSkillLinks,
  [switch]$SkipClaudePluginRegister,
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

if (($AdoptGitIgnore -or $AdoptGitHook -or $AdoptGitExcludesFile -or $AdoptGitHooksPath) -and -not $InstallGitGuards) {
  throw "Git guard adoption switches require -InstallGitGuards."
}
if ($Repair -and $InstallGitGuards) {
  throw "-Repair does not reconcile global Git guards; run the installer without -Repair for that operation."
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
$AgentsHome = if ($env:AGENTS_HOME) { $env:AGENTS_HOME } else { Join-Path $HOME ".agents" }
# Install targets: codex (default) keeps the 0.5.x behavior; claude adds the
# Claude Code surface through scripts/install-claude-target.mjs; both runs the
# shared operations once. Transaction state (lock, journal, backups) stays
# under CODEX_HOME for every target.
$InstallCodex = $Target -in @("codex", "both")
$InstallClaude = $Target -in @("claude", "both")
if (-not $ClaudeHome) {
  $ClaudeHome = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
}
if (($AdoptSkillLinks -or $SkipClaudePluginRegister) -and -not $InstallClaude) {
  throw "-AdoptSkillLinks and -SkipClaudePluginRegister require -Target claude or both."
}
if ($Repair -and $InstallClaude) {
  throw "-Repair reconciles the Codex surface only; rerun the installer with -Target claude to repair Claude Code files (the Claude target is idempotent)."
}

function Get-CuratedSkillsCatalogPath {
  if (
    $env:AGENTCHEF_TEST_MODE -eq "1" -and
    -not [string]::IsNullOrWhiteSpace($env:AGENTCHEF_TEST_SKILLS_CATALOG)
  ) {
    return (Resolve-Path -LiteralPath $env:AGENTCHEF_TEST_SKILLS_CATALOG).Path
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
    (Join-Path $CodexHome "plugins\agentchef-workflows"),
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
  $SurfaceArgs = @($SurfaceHelper, "--codex-home", $CodexHome, "--agents-home", $AgentsHome, "--target", $Target)
  if ($InstallClaude) { $SurfaceArgs += @("--claude-home", $ClaudeHome) }
  & node @SurfaceArgs | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Managed install surface contains an unsafe linked path; refusing all writes."
  }

  $PluginSource = Join-Path $RepoRoot "plugins\agentchef-workflows"
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

  if ($InstallCodex) {
    $MarketplacePath = Join-Path (Join-Path $AgentsHome "plugins") "marketplace.json"
    $MarketplacePluginTarget = Join-Path $AgentsHome "plugins\sources\agentchef-workflows"
    $MarketplaceHelper = Join-Path $RepoRoot "scripts\upsert-marketplace-entry.mjs"
    & node $MarketplaceHelper $MarketplacePath $MarketplacePluginTarget --check
    if ($LASTEXITCODE -notin @(0, 2)) {
      throw "Plugin marketplace preflight failed before any managed write: $MarketplacePath"
    }
  }
}

function Invoke-InstallerSafetyPreflight {
  $SafetyHelper = Join-Path $RepoRoot "scripts\lib\installer-safety-preflight.mjs"
  $SafetyArgs = @(
    $SafetyHelper,
    "--codex-home",
    $CodexHome,
    "--agents-home",
    $AgentsHome
  )
  $SafetyArgs += @("--target", $Target)
  if ($InstallClaude) { $SafetyArgs += @("--claude-home", $ClaudeHome) }
  if ($NoBackup) { $SafetyArgs += "--no-backup" }
  if ($WhatIfPreference) { $SafetyArgs += "--dry-run" }
  if ($InstallSkills) { $SafetyArgs += "--install-skills" }
  if ($InstallGitGuards) {
    $SafetyArgs += @("--install-git-guards", "--home", $HOME)
    if ($AdoptGitIgnore) { $SafetyArgs += "--adopt-git-ignore" }
    if ($AdoptGitHook) { $SafetyArgs += "--adopt-git-hook" }
    if ($AdoptGitExcludesFile) { $SafetyArgs += "--adopt-git-excludes-file" }
    if ($AdoptGitHooksPath) { $SafetyArgs += "--adopt-git-hooks-path" }
  }
  if (
    $AdoptFetchSkill -or
    $AdoptSeoSkill -or
    $AdoptEvidenceResearchSkill -or
    $AdoptDirectSkill.Count -gt 0 -or
    $AdoptGitIgnore -or
    $AdoptGitHook -or
    $AdoptGitExcludesFile -or
    $AdoptGitHooksPath
  ) {
    $SafetyArgs += "--adoption-requested"
  }
  & node @SafetyArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Installer safety preflight rejected this run; no-backup is creation-only and Git guard conflicts require explicit adoption."
  }
}

function Get-GlobalGitGuardArgs {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("preview", "apply", "restore")][string]$Command,
    [string]$ReceiptPath
  )
  $Helper = Join-Path $RepoRoot "scripts\manage-global-git-guards.mjs"
  $GuardArgs = @($Helper, $Command, "--home", $HOME)
  if (-not [string]::IsNullOrWhiteSpace($env:GIT_CONFIG_GLOBAL)) {
    $GuardArgs += @("--git-config-global", $env:GIT_CONFIG_GLOBAL)
  }
  if ($Command -ne "restore") {
    $GuardArgs += @(
      "--ignore-source", (Join-Path $RepoRoot "templates\git\.gitignore_global"),
      "--hook-source", (Join-Path $RepoRoot "templates\git\pre-commit")
    )
    if ($AdoptGitIgnore) { $GuardArgs += @("--adopt-file", "gitignore-global") }
    if ($AdoptGitHook) { $GuardArgs += @("--adopt-file", "pre-commit-hook") }
    if ($AdoptGitExcludesFile) { $GuardArgs += @("--adopt-key", "core.excludesfile") }
    if ($AdoptGitHooksPath) { $GuardArgs += @("--adopt-key", "core.hooksPath") }
  }
  if (-not [string]::IsNullOrWhiteSpace($ReceiptPath)) {
    $GuardArgs += @("--receipt", $ReceiptPath)
  }
  $GuardArgs += "--json"
  return $GuardArgs
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
if ($InstallClaude) {
  $ClaudeHome = Read-OptionalPath -Label "Claude home" -CurrentValue $ClaudeHome
  $ClaudeHome = Resolve-InstallPath $ClaudeHome
}

if ($Repair) {
  Write-Section "AgentChef repair"
  if ($WhatIfPreference) {
    Write-Note "Mode: repair preview; no files will be changed"
  } else {
    Write-Note "Mode: backup-backed repair of managed AgentChef drift"
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
  if (Read-YesNo -Prompt "Replace existing managed AgentChef files after backup instead of preserving/merging?" -Default $false) {
    $Force = $true
  }
}

if ($Interactive -and -not $InstallGitGuards) {
  if (Read-YesNo -Prompt "Install optional global Git guards for this Windows user?" -Default $false) {
    $InstallGitGuards = $true
  }
}

$BackupRoot = Join-Path $CodexHome ("backups\agentchef-" + (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + $PID)
$OperationJournalScript = Join-Path $RepoRoot "scripts\lib\operation-journal.mjs"
$OperationJournalActive = $false
$LastBackupPath = $null
$GitGuardReceipt = $null
$SkillCompensationReceipts = @()
$OperationLockId = [guid]::NewGuid().ToString()
$OperationLockPaths = @()

function Get-CanonicalOperationLockRoots {
  $roots = @($CodexHome, $AgentsHome) |
    ForEach-Object { [System.IO.Path]::GetFullPath($_).TrimEnd('\', '/') } |
    Sort-Object { $_.ToLowerInvariant() } -Unique
  if ($roots.Count -eq 0) { throw "AgentChef operation lock requires at least one managed home." }
  return @($roots)
}

function Release-OperationLock {
  foreach ($lockPath in @($Script:OperationLockPaths | Sort-Object -Descending)) {
    $ownerPath = Join-Path $lockPath "owner.json"
    if (-not (Test-Path -LiteralPath $ownerPath)) { continue }
    try {
      $owner = Get-Content -LiteralPath $ownerPath -Raw -ErrorAction Stop | ConvertFrom-Json
      if ($owner.id -eq $OperationLockId) {
        Remove-Item -LiteralPath $ownerPath -Force -ErrorAction Stop
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction Stop
      }
    } catch {
      # Preserve a lock we cannot prove belongs to this process.
    }
  }
  $Script:OperationLockPaths = @()
}

function Acquire-OperationLock {
  if ($WhatIfPreference) { return }
  $acquired = @()
  try {
    foreach ($root in Get-CanonicalOperationLockRoots) {
      [System.IO.Directory]::CreateDirectory($root) | Out-Null
      $lockPath = Join-Path $root ".agentchef-operation.lock"
      New-Item -ItemType Directory -Path $lockPath -ErrorAction Stop | Out-Null
      $acquired += $lockPath
      $ownerPath = Join-Path $lockPath "owner.json"
      @{ id = $OperationLockId; pid = $PID; operation = "install"; startedAt = (Get-Date).ToUniversalTime().ToString("o") } |
        ConvertTo-Json -Compress | Set-Content -LiteralPath $ownerPath -NoNewline -Encoding utf8 -ErrorAction Stop
    }
  } catch {
    foreach ($lockPath in @($acquired | Sort-Object -Descending)) {
      $ownerPath = Join-Path $lockPath "owner.json"
      try {
        $owner = Get-Content -LiteralPath $ownerPath -Raw -ErrorAction Stop | ConvertFrom-Json
        if ($owner.id -eq $OperationLockId) { Remove-Item -LiteralPath $lockPath -Force -ErrorAction Stop }
      } catch {
        # The directory was created by this acquisition before its owner record could be written.
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
      }
    }
    throw "Another AgentChef operation is already in progress for a managed Codex home; refusing concurrent install."
  }
  $Script:OperationLockPaths = @($acquired)
}

function Start-OperationJournal {
  if ($WhatIfPreference -or $NoBackup) { return }
  & node $OperationJournalScript start $BackupRoot install
  if ($LASTEXITCODE -ne 0) { throw "Could not create durable install operation journal." }
  $Script:OperationJournalActive = $true
}

function Finish-OperationJournal {
  param([Parameter(Mandatory=$true)][ValidateSet("complete", "failed")][string]$State)
  if (-not $Script:OperationJournalActive) { return }
  & node $OperationJournalScript finish $BackupRoot $State
  if ($LASTEXITCODE -ne 0) { Write-Warning "Could not mark install operation journal as $State." }
  $Script:OperationJournalActive = $false
}

function Prepare-InstallWrite {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [string]$BackupPath = "-"
  )
  if ($WhatIfPreference -or $NoBackup) { return }
  & node $OperationJournalScript prepare $BackupRoot $Path $BackupPath
  if ($LASTEXITCODE -ne 0) { throw "Could not durably prepare install mutation for $Path." }
}

function Mark-InstallWriteApplied {
  param([Parameter(Mandatory=$true)][string]$Path)
  if ($WhatIfPreference -or $NoBackup) { return }
  & node $OperationJournalScript applied $BackupRoot $Path
  if ($LASTEXITCODE -ne 0) { throw "Could not mark completed install mutation for $Path." }
}

function Prepare-InstallTree {
  param(
    [Parameter(Mandatory=$true)][string]$Destination,
    [Parameter(Mandatory=$true)][string]$Source,
    [string]$BackupPath = "-"
  )
  if ($WhatIfPreference -or $NoBackup) { return }
  & node $OperationJournalScript prepare-tree $BackupRoot $Destination $Source $BackupPath
  if ($LASTEXITCODE -ne 0) { throw "Could not durably prepare managed directory mutations for $Destination." }
}

function Mark-InstallTreeApplied {
  param(
    [Parameter(Mandatory=$true)][string]$Destination,
    [Parameter(Mandatory=$true)][string]$Source
  )
  if ($WhatIfPreference -or $NoBackup) { return }
  & node $OperationJournalScript applied-tree $BackupRoot $Destination $Source
  if ($LASTEXITCODE -ne 0) { throw "Could not mark completed managed directory mutations for $Destination." }
}

trap {
  $compensationReceipts = @($Script:SkillCompensationReceipts)
  [array]::Reverse($compensationReceipts)
  foreach ($receiptPath in $compensationReceipts) {
    & node (Join-Path $RepoRoot "scripts\install-pinned-skill.mjs") --rollback-receipt $receiptPath --json 2>&1 | Write-Warning
  }
  if ($Script:OperationJournalActive) {
    & node $OperationJournalScript rollback $BackupRoot - $CodexHome $AgentsHome 2>&1 | Write-Warning
  }
  if ($Script:GitGuardReceipt -and (Test-Path -LiteralPath $Script:GitGuardReceipt)) {
    $RollbackGuardArgs = Get-GlobalGitGuardArgs -Command "restore" -ReceiptPath $Script:GitGuardReceipt
    & node @RollbackGuardArgs 2>&1 | Write-Warning
  }
  Finish-OperationJournal -State "failed"
  Release-OperationLock
  throw $_
}

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

function Resolve-ManagedWriteRoot {
  param([Parameter(Mandatory=$true)][string]$TargetFull)
  $roots = @(
    [System.IO.Path]::GetFullPath($CodexHome).TrimEnd('\', '/'),
    [System.IO.Path]::GetFullPath($AgentsHome).TrimEnd('\', '/')
  )
  if ($InstallGitGuards) {
    $gitIgnoreTarget = [System.IO.Path]::GetFullPath((Join-Path $HOME ".gitignore_global"))
    $hooksRoot = [System.IO.Path]::GetFullPath((Join-Path $HOME ".githooks")).TrimEnd('\', '/')
    if ($TargetFull.Equals($gitIgnoreTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
      $roots += [System.IO.Path]::GetFullPath($HOME).TrimEnd('\', '/')
    }
    if (
      $TargetFull.Equals($hooksRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $TargetFull.StartsWith($hooksRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
    ) {
      $roots += $hooksRoot
    }
  }

  foreach ($root in $roots) {
    if (
      $TargetFull.Equals($root, [System.StringComparison]::OrdinalIgnoreCase) -or
      $TargetFull.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
    ) {
      return $root
    }
  }

  throw "Refusing to access unmanaged install target: $TargetFull"
}

function Assert-ManagedWriteTarget {
  param([Parameter(Mandatory=$true)][string]$Path)
  $targetFull = [System.IO.Path]::GetFullPath($Path)
  $root = Resolve-ManagedWriteRoot -TargetFull $targetFull
  $helper = Join-Path $RepoRoot "scripts\assert-managed-target.mjs"
  & node $helper $root $targetFull | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Managed write target became unsafe; refusing access: $Path"
  }
}

function Assert-ManagedWriteTargets {
  # Verify a whole set of targets with one helper process per managed root.
  # Directory syncs pass every file and parent here instead of spawning Node
  # twice per copied file, which dominated install time on Windows.
  param([Parameter(Mandatory=$true)][string[]]$Paths)
  $helper = Join-Path $RepoRoot "scripts\assert-managed-target.mjs"
  $groups = @{}
  foreach ($candidate in $Paths) {
    $targetFull = [System.IO.Path]::GetFullPath($candidate)
    $root = Resolve-ManagedWriteRoot -TargetFull $targetFull
    if (-not $groups.ContainsKey($root)) {
      $groups[$root] = New-Object System.Collections.Generic.List[string]
    }
    if (-not $groups[$root].Contains($targetFull)) {
      $groups[$root].Add($targetFull)
    }
  }
  foreach ($root in @($groups.Keys)) {
    $listPath = [System.IO.Path]::GetTempFileName()
    try {
      [System.IO.File]::WriteAllLines($listPath, [string[]]$groups[$root].ToArray(), (New-Object System.Text.UTF8Encoding($false)))
      & node $helper $root --list $listPath | Out-Null
      if ($LASTEXITCODE -ne 0) {
        throw "Managed write target became unsafe; refusing access under: $root"
      }
    } finally {
      Remove-Item -LiteralPath $listPath -Force -ErrorAction SilentlyContinue
    }
  }
}

$Script:EnsuredDirectories = @{}

function Ensure-Dir {
  param([Parameter(Mandatory=$true)][string]$Path)
  $key = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/').ToLowerInvariant()
  if ($Script:EnsuredDirectories.ContainsKey($key)) { return }
  Assert-ManagedWriteTarget $Path
  Invoke-Change -Target $Path -Action "Ensure directory exists" -ScriptBlock {
    Assert-ManagedWriteTarget $Path
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  } | Out-Null
  $Script:EnsuredDirectories[$key] = $true
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
    $Script:LastBackupPath = $null
    return
  }

  Assert-ManagedWriteTarget $Path
  Ensure-Dir $BackupRoot
  $codexFull = [System.IO.Path]::GetFullPath($CodexHome).TrimEnd('\', '/')
  $agentsFull = [System.IO.Path]::GetFullPath($AgentsHome).TrimEnd('\', '/')
  $pathFull = [System.IO.Path]::GetFullPath($Path)
  if ($pathFull.StartsWith($codexFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    $relative = Join-Path "codex" (Get-RelativePathSafe -Base $CodexHome -Path $Path)
  } elseif ($pathFull.StartsWith($agentsFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    $relative = Join-Path "agents" (Get-RelativePathSafe -Base $AgentsHome -Path $Path)
  } else {
    throw "Refusing to back up unmanaged target: $Path"
  }
  $destination = Join-Path $BackupRoot $relative
  Ensure-Dir (Split-Path -Parent $destination)
  Invoke-Change -Target $destination -Action "Back up $Path" -ScriptBlock {
    Assert-ManagedWriteTarget $Path
    Assert-ManagedWriteTarget $destination
    Copy-Item -LiteralPath $Path -Destination $destination -Recurse -Force
  } | Out-Null
  if (-not $WhatIfPreference) {
    & node $OperationJournalScript record $BackupRoot $destination
    if ($LASTEXITCODE -ne 0) { throw "Could not durably record backup before replacing $Path." }
    $Script:LastBackupPath = $destination
  }
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
  $backupPath = if ($Script:LastBackupPath) { $Script:LastBackupPath } else { "-" }
  $changed = Invoke-Change -Target $Destination -Action "Install file from $Source" -ScriptBlock {
    Assert-ManagedWriteTarget $Destination
    Prepare-InstallWrite -Path $Destination -BackupPath $backupPath
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
  }
  if ($changed) {
    Mark-InstallWriteApplied -Path $Destination
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
    $Action = "Merge missing AgentChef config blocks from $Source"
    if ($Update) {
      $MergeArgs += "--sync-managed-tables"
      $Action = "Synchronize managed AgentChef config blocks from $Source"
    }
    if ($WhatIfPreference) {
      $DryRunArgs = @($MergeArgs) + "--dry-run"
      Invoke-Change -Target $Destination -Action $Action -ScriptBlock {
        & node @DryRunArgs
      } | Out-Null
      return
    }
    $backupPath = if ($Script:LastBackupPath) { $Script:LastBackupPath } else { "-" }
    $changed = Invoke-Change -Target $Destination -Action $Action -ScriptBlock {
      Assert-ManagedWriteTarget $Destination
      Prepare-InstallWrite -Path $Destination -BackupPath $backupPath
      & node @MergeArgs
      if ($LASTEXITCODE -ne 0) {
        throw "Codex config merge failed with code $LASTEXITCODE"
      }
    }
    if ($changed) {
      Mark-InstallWriteApplied -Path $Destination
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
  $backupPath = if ($Script:LastBackupPath) { $Script:LastBackupPath } else { "-" }
  $changed = Invoke-Change -Target $Destination -Action $Action -ScriptBlock {
    Assert-ManagedWriteTarget $Destination
    Prepare-InstallWrite -Path $Destination -BackupPath $backupPath
    & node @RenderArgs
    if ($LASTEXITCODE -ne 0) {
      throw "MCP profile generation failed with code $LASTEXITCODE"
    }
  }
  if ($changed) {
    Mark-InstallWriteApplied -Path $Destination
    Write-Action -Status "generated profile" -Message $Destination
  }
}

function Install-Directory {
  param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Destination
  )

  Assert-ManagedWriteTarget $Destination
  Backup-Target $Destination
  $directoryBackup = $Script:LastBackupPath
  Ensure-Dir $Destination
  Assert-ManagedDirectoryTarget $Destination
  $backupPath = if ($directoryBackup) { $directoryBackup } else { "-" }
  $changed = Invoke-Change -Target $Destination -Action "Sync source-owned files from $Source while preserving unrelated extras" -ScriptBlock {
    Prepare-InstallTree -Destination $Destination -Source $Source -BackupPath $backupPath
    $sourceFull = [System.IO.Path]::GetFullPath($Source).TrimEnd([char[]]@('\', '/'))
    $destinationFull = [System.IO.Path]::GetFullPath($Destination)
    $copies = New-Object System.Collections.Generic.List[object]
    $targets = New-Object System.Collections.Generic.List[string]
    Get-ChildItem -LiteralPath $Source -Recurse -File -Force | ForEach-Object {
      $fileFull = [System.IO.Path]::GetFullPath($_.FullName)
      $relative = $fileFull.Substring($sourceFull.Length).TrimStart([char[]]@('\', '/'))
      $target = [System.IO.Path]::Combine($destinationFull, $relative)
      $targetParent = Split-Path -Parent $target
      if ($targetParent) { $targets.Add($targetParent) }
      $targets.Add($target)
      $copies.Add([pscustomobject]@{ Source = $_.FullName; Target = $target; Parent = $targetParent })
    }
    if ($targets.Count -gt 0) {
      Assert-ManagedWriteTargets -Paths $targets.ToArray()
    }
    foreach ($copy in $copies) {
      if ($copy.Parent) {
        [System.IO.Directory]::CreateDirectory($copy.Parent) | Out-Null
      }
      [System.IO.File]::Copy($copy.Source, $copy.Target, $true)
    }
  }
  if ($changed) {
    Mark-InstallTreeApplied -Destination $Destination -Source $Source
    Write-Action -Status "synced directory" -Message $Destination
  }
}

Write-Section "AgentChef installer"
Write-Note "Targets: $Target"
Write-Note "Codex home: $CodexHome"
Write-Note "Agents home: $AgentsHome"
if ($InstallClaude) {
  Write-Note "Claude home: $ClaudeHome"
}
if ($Update) {
  Write-Note "Mode: update managed targets after backup; preserve user config and synchronize AgentChef tables"
} elseif ($Force) {
  Write-Note "Mode: refresh source-owned managed targets after backup; preserve unrelated directory extras"
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
    Write-Note "Existing config policy: backup + synchronize managed AgentChef tables while preserving user-owned settings"
  } else {
    Write-Note "Existing config policy: backup + merge missing AgentChef blocks unless Force is enabled"
  }
  Write-Note "Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled."
  if (-not (Read-YesNo -Prompt "Continue with this plan?" -Default $true)) {
    throw "AgentChef install cancelled by user."
  }
}

Invoke-InstallerSafetyPreflight
Invoke-PreflightValidators
Invoke-InstallTargetPreflight
Acquire-OperationLock
Start-OperationJournal

$TemplateRoot = Join-Path $RepoRoot "templates\codex"
$PluginSource = Join-Path $RepoRoot "plugins\agentchef-workflows"

if ($InstallCodex) {
  Write-Section "Managed Codex files"
  Ensure-Dir $CodexHome
  Ensure-Dir (Join-Path $CodexHome "agents")
  Ensure-Dir (Join-Path $CodexHome "rules")

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

  $PluginTarget = Join-Path $CodexHome "plugins\agentchef-workflows"
  Install-Directory -Source $PluginSource -Destination $PluginTarget
}

Write-Section "Shared agent surfaces"
Ensure-Dir $AgentsHome
$MarketplacePluginTarget = Join-Path $AgentsHome "plugins\sources\agentchef-workflows"
Install-Directory -Source $PluginSource -Destination $MarketplacePluginTarget
$DirectSkillHelper = Join-Path $RepoRoot "scripts\manage-direct-skill-target.mjs"
$DirectSkills = @(Get-ManagedDirectSkills)
foreach ($DirectSkill in $DirectSkills) {
  $DirectSource = Join-Path $PluginSource "skills\$($DirectSkill.Name)"
  $DirectTarget = Join-Path $AgentsHome "skills\$($DirectSkill.Name)"
  Install-Directory -Source $DirectSource -Destination $DirectTarget
  if (-not $WhatIfPreference) {
    Assert-ManagedWriteTarget (Join-Path $DirectTarget ".agentchef-managed.json")
    $DirectMarkArgs = @($DirectSkillHelper, $DirectSource, $DirectTarget, "--mark")
    if ($DirectSkill.Adopt) {
      $DirectMarkArgs += "--allow-adopt"
    }
    $markerBackup = "-"
    if ($Script:LastBackupPath -and (Test-Path -LiteralPath (Join-Path $Script:LastBackupPath ".agentchef-managed.json"))) {
      $markerBackup = Join-Path $Script:LastBackupPath ".agentchef-managed.json"
    }
    Prepare-InstallWrite -Path (Join-Path $DirectTarget ".agentchef-managed.json") -BackupPath $markerBackup
    & node @DirectMarkArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Cannot record AgentChef ownership for the direct $($DirectSkill.Display) skill: $DirectTarget"
    }
    Mark-InstallWriteApplied -Path (Join-Path $DirectTarget ".agentchef-managed.json")
  }
}

if ($InstallCodex) {
  $MarketplaceDir = Join-Path $AgentsHome "plugins"
  Ensure-Dir $MarketplaceDir
  $MarketplacePath = Join-Path $MarketplaceDir "marketplace.json"
  $MarketplaceHelper = Join-Path $RepoRoot "scripts\upsert-marketplace-entry.mjs"
  Assert-ManagedWriteTarget $MarketplacePath
  & node $MarketplaceHelper $MarketplacePath $MarketplacePluginTarget --check
  $marketplaceCheckExit = $LASTEXITCODE
  if ($marketplaceCheckExit -eq 2) {
    Backup-Target $MarketplacePath
    $marketplaceBackup = if ($Script:LastBackupPath) { $Script:LastBackupPath } else { "-" }
    $changed = Invoke-Change -Target $MarketplacePath -Action "Upsert AgentChef plugin marketplace entry" -ScriptBlock {
      Assert-ManagedWriteTarget $MarketplacePath
      Prepare-InstallWrite -Path $MarketplacePath -BackupPath $marketplaceBackup
      & node $MarketplaceHelper $MarketplacePath $MarketplacePluginTarget --write
      if ($LASTEXITCODE -ne 0) {
        throw "Cannot update plugin marketplace because the helper failed with code $LASTEXITCODE`: $MarketplacePath"
      }
    }
    if ($changed) {
      Mark-InstallWriteApplied -Path $MarketplacePath
      Write-Action -Status "updated marketplace" -Message $MarketplacePath
    }
  } elseif ($marketplaceCheckExit -eq 0) {
    $Script:SkippedExistingCount += 1
  } else {
    throw "Cannot update plugin marketplace because it is invalid or unreadable: $MarketplacePath"
  }
}

if ($InstallGitGuards) {
  Write-Section "Optional Git guards"
  if ($WhatIfPreference) {
    $GitGuardArgs = Get-GlobalGitGuardArgs -Command "preview"
    $GitGuardOutput = (& node @GitGuardArgs | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
      throw "Global Git guard preview failed with code $LASTEXITCODE`: $GitGuardOutput"
    }
    Write-Host $GitGuardOutput
    Write-Action -Status "previewed" -Message "global Git guard files, adoption decisions, and config changes"
  } else {
    $Script:GitGuardReceipt = "$BackupRoot-git-guards.json"
    Ensure-Dir (Split-Path -Parent $Script:GitGuardReceipt)
    $GitGuardArgs = Get-GlobalGitGuardArgs -Command "apply" -ReceiptPath $Script:GitGuardReceipt
    $GitGuardOutput = (& node @GitGuardArgs | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
      throw "Global Git guard transaction failed with code $LASTEXITCODE`: $GitGuardOutput"
    }
    Write-Host $GitGuardOutput
    Write-Action -Status "configured" -Message "global Git guard files and config transaction"
    Write-Note "Git guard receipt: $Script:GitGuardReceipt"
    $RestoreArgs = Get-GlobalGitGuardArgs -Command "restore" -ReceiptPath $Script:GitGuardReceipt
    $RestoreDisplay = ($RestoreArgs | ForEach-Object { '"' + $_.Replace('"', '`"') + '"' }) -join ' '
    Write-Note "Restore with: node $RestoreDisplay"
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
      if ($SkillResult.compensation -and $SkillResult.compensation.receiptPath) {
        $Script:SkillCompensationReceipts += [string]$SkillResult.compensation.receiptPath
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

if ($InstallClaude) {
  # One Node transaction owns every Claude-side mutation (files, additive JSON
  # merges with receipts, skill links, marketplace manifest, plugin CLI). It
  # rolls its own journal back on failure; the throw below then rolls back the
  # Codex-side journal so -Target both stays all-or-nothing.
  Write-Section "Claude Code target"
  $ClaudeHelper = Join-Path $RepoRoot "scripts\install-claude-target.mjs"
  $ClaudeArgs = @(
    $ClaudeHelper,
    "--claude-home", $ClaudeHome,
    "--agents-home", $AgentsHome,
    "--home", $HOME,
    "--platform", "windows",
    "--agents-lock-held"
  )
  if ($WhatIfPreference) { $ClaudeArgs += "--dry-run" } else { $ClaudeArgs += "--apply" }
  if ($NoBackup) { $ClaudeArgs += "--no-backup" }
  if ($AdoptSkillLinks) { $ClaudeArgs += "--adopt-skill-links" }
  if ($SkipClaudePluginRegister) { $ClaudeArgs += "--skip-plugin-register" }
  & node @ClaudeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Claude Code target install failed with code $LASTEXITCODE; the helper rolled back its own changes."
  }
}

if ($InstallCodex) {
  # The plugin cache is the final external mutation: later output/manifest work is non-mutating.
  $PluginRefreshHelper = Join-Path $RepoRoot "scripts\refresh-installed-plugin.mjs"
  $PluginRefreshArgs = @($PluginRefreshHelper, "--codex-home", $CodexHome)
  if (-not $WhatIfPreference -and -not $NoBackup) {
    $PluginRefreshArgs += "--apply"
  }
  & node @PluginRefreshArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Refresh installed AgentChef plugin cache failed with code $LASTEXITCODE."
  }
}

Write-Section "Capability board"
try {
  $AgentCatalog = Get-Content -Path (Join-Path $RepoRoot "catalog\agents.json") -Raw | ConvertFrom-Json
  $McpCatalog = Get-Content -Path (Join-Path $RepoRoot "catalog\mcp-servers.json") -Raw | ConvertFrom-Json
  $SkillCatalog = Get-Content -Path (Join-Path $RepoRoot "catalog\skills.json") -Raw | ConvertFrom-Json
  $RoutingCatalog = Get-Content -Path (Join-Path $RepoRoot "catalog\routing-profiles.json") -Raw | ConvertFrom-Json
  $PluginSkillRoot = Join-Path $RepoRoot "plugins\agentchef-workflows\skills"
  $AgentNames = @($AgentCatalog.agents | ForEach-Object { $_.name }) + @($AgentCatalog.coordinators | ForEach-Object { $_.name })
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
  Write-Action -Status "completed" -Message "AgentChef dry run"
} else {
  Write-Action -Status "completed" -Message "AgentChef install"
  if ($InstallCodex) {
    Write-Note "Restart Codex, then run:"
    Write-Host "    codex doctor --summary"
    Write-Host "    npm run codex:routing"
    Write-Host "    npm run codex:status"
    Write-Host "    npm run verify:install:runtime"
    Write-Host "    codex exec --strict-config `"Summarize the active Codex setup.`""
  }
  if ($InstallClaude) {
    Write-Note "Start a new Claude Code session, then run:"
    Write-Host "    claude plugin list"
    Write-Host "    claude mcp list"
    Write-Host "    npm run verify:install:runtime -- --target claude"
  }
}
if (-not $NoBackup -and (Test-Path -LiteralPath $BackupRoot)) {
  $ManifestScript = Join-Path $RepoRoot "scripts\write-backup-manifest.mjs"
  $ManifestOutput = & node $ManifestScript --backup-root $BackupRoot --operation install --platform windows 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Could not write backup manifest: $($ManifestOutput -join [Environment]::NewLine)"
  }
  Write-Note "Backup: $BackupRoot"
}
Finish-OperationJournal -State "complete"
Release-OperationLock

# PowerShell can otherwise propagate the last native command exit code after a
# successful dry run or install, which makes CI report a false failure.
exit 0
