#!/usr/bin/env bash
set -euo pipefail

INSTALL_SKILLS=0
INSTALL_GIT_GUARDS=0
ALL=0
FORCE=0
UPDATE=0
REPAIR=0
ADOPT_FETCH_SKILL=0
ADOPT_SEO_SKILL=0
ADOPT_EVIDENCE_RESEARCH_SKILL=0
ADOPT_DIRECT_SKILLS=" "
ADOPT_GIT_IGNORE=0
ADOPT_GIT_HOOK=0
ADOPT_GIT_EXCLUDES_FILE=0
ADOPT_GIT_HOOKS_PATH=0
NO_BACKUP=0
DRY_RUN=0
PLAIN_OUTPUT=0
INTERACTIVE=0
SKIPPED_EXISTING_COUNT=0

for arg in "$@"; do
  case "$arg" in
    --all) ALL=1 ;;
    --install-skills) INSTALL_SKILLS=1 ;;
    --install-git-guards) INSTALL_GIT_GUARDS=1 ;;
    --force) FORCE=1 ;;
    --update) UPDATE=1 ;;
    --repair) REPAIR=1 ;;
    --adopt-fetch-skill) ADOPT_FETCH_SKILL=1 ;;
    --adopt-seo-skill) ADOPT_SEO_SKILL=1 ;;
    --adopt-evidence-research-skill) ADOPT_EVIDENCE_RESEARCH_SKILL=1 ;;
    --adopt-git-ignore) ADOPT_GIT_IGNORE=1 ;;
    --adopt-git-hook) ADOPT_GIT_HOOK=1 ;;
    --adopt-git-excludes-file) ADOPT_GIT_EXCLUDES_FILE=1 ;;
    --adopt-git-hooks-path) ADOPT_GIT_HOOKS_PATH=1 ;;
    --adopt-direct-skill=*)
      direct_skill_name="${arg#*=}"
      if [ "$direct_skill_name" = "" ]; then
        echo "--adopt-direct-skill requires a skill name after =." >&2
        exit 2
      fi
      ADOPT_DIRECT_SKILLS="${ADOPT_DIRECT_SKILLS}${direct_skill_name} "
      ;;
    --no-backup) NO_BACKUP=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --plain-output) PLAIN_OUTPUT=1 ;;
    --interactive) INTERACTIVE=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if [ "$ALL" -eq 1 ]; then
  INSTALL_SKILLS=1
fi

if [ "$INSTALL_GIT_GUARDS" -ne 1 ] && {
  [ "$ADOPT_GIT_IGNORE" -eq 1 ] ||
  [ "$ADOPT_GIT_HOOK" -eq 1 ] ||
  [ "$ADOPT_GIT_EXCLUDES_FILE" -eq 1 ] ||
  [ "$ADOPT_GIT_HOOKS_PATH" -eq 1 ];
}; then
  echo "Git guard adoption flags require --install-git-guards." >&2
  exit 2
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found for Codex Chef Bash install: $1" >&2
    echo "Install Git Bash, WSL, or a POSIX shell environment with coreutils, then rerun the installer." >&2
    exit 127
  fi
}

for command_name in dirname date node; do
  require_command "$command_name"
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
AGENTS_HOME_DIR="${AGENTS_HOME:-$HOME/.agents}"
CURATED_SKILLS_CATALOG="$REPO_ROOT/catalog/skills.json"
if [ "${CODEX_CHEF_TEST_MODE:-}" = "1" ] && [ "${CODEX_CHEF_TEST_SKILLS_CATALOG:-}" != "" ]; then
  CURATED_SKILLS_CATALOG="$CODEX_CHEF_TEST_SKILLS_CATALOG"
fi

direct_skill_names() {
  node -e 'const fs=require("fs");const skills=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).skills;for(const skill of skills){if(skill.directInstall===true)console.log(skill.name)}' "$REPO_ROOT/catalog/skills.json"
}

for requested_name in $ADOPT_DIRECT_SKILLS; do
  known_direct_skill=0
  while IFS= read -r catalog_name; do
    if [ "$requested_name" = "$catalog_name" ]; then
      known_direct_skill=1
      break
    fi
  done < <(direct_skill_names)
  if [ "$known_direct_skill" -ne 1 ]; then
    echo "Unknown managed direct skill adoption target: $requested_name" >&2
    exit 2
  fi
done

icon() {
  if [ "$PLAIN_OUTPUT" -eq 1 ] || [ "${NO_COLOR:-}" != "" ] || [ "${TERM:-}" = "dumb" ]; then
    printf "%s" "$2"
  else
    printf "%s" "$1"
  fi
}

section() {
  echo ""
  printf "%s %s\n" "$(icon "🍳" "[*]")" "$1"
}

action() {
  printf "  %s %s: %s\n" "$(icon "✓" "-")" "$1" "$2"
}

note() {
  printf "  %s %s\n" "$(icon "•" "-")" "$1"
}

yes_no() {
  local prompt="$1"
  local default="$2"
  local suffix="[y/N]"
  if [ "$default" = "yes" ]; then
    suffix="[Y/n]"
  fi
  printf "%s %s " "$prompt" "$suffix"
  read -r answer
  if [ "$answer" = "" ]; then
    [ "$default" = "yes" ]
    return
  fi
  case "$(printf "%s" "$answer" | tr '[:upper:]' '[:lower:]')" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

optional_path() {
  local label="$1"
  local current="$2"
  if [ "$INTERACTIVE" -ne 1 ]; then
    printf "%s" "$current"
    return
  fi
  printf "%s [%s] " "$label" "$current" >&2
  read -r answer
  if [ "$answer" = "" ]; then
    printf "%s" "$current"
  else
    printf "%s" "$answer"
  fi
}

normalize_install_path() {
  local target="$1"
  case "$target" in
    "~") target="$HOME" ;;
    "~"/*) target="$HOME/${target#"~/"}" ;;
  esac
  case "$target" in
    /*) printf "%s" "$target" ;;
    *) printf "%s/%s" "$PWD" "$target" ;;
  esac
}

any_managed_target_exists() {
  [ -e "$CODEX_HOME_DIR/AGENTS.md" ] ||
  [ -e "$CODEX_HOME_DIR/config.toml" ] ||
  [ -e "$CODEX_HOME_DIR/rules/default.rules" ] ||
  [ -e "$CODEX_HOME_DIR/plugins/codex-chef-workflows" ] ||
  [ -e "$AGENTS_HOME_DIR/plugins/marketplace.json" ]
}

run_preflight_validators() {
  section "Preflight validation"
  local checks=(
    "agent config:scripts/validate-agent-config.mjs"
    "MCP config:scripts/validate-mcp-config.mjs"
    "approval harmony:scripts/validate-approval-harmony.mjs"
  )
  local check label script_path
  for check in "${checks[@]}"; do
    label="${check%%:*}"
    script_path="${check#*:}"
    if ! node "$REPO_ROOT/$script_path"; then
      echo "Preflight validation failed for $label; refusing to install managed global files." >&2
      exit 1
    fi
    action "validated" "$label"
  done
}

preflight_install_targets() {
  if ! node "$REPO_ROOT/scripts/assert-install-surface.mjs" \
    --codex-home "$CODEX_HOME_DIR" \
    --agents-home "$AGENTS_HOME_DIR" >/dev/null; then
    echo "Managed install surface contains an unsafe linked path; refusing all writes." >&2
    exit 1
  fi

  local plugin_source="$REPO_ROOT/plugins/codex-chef-workflows"
  local direct_helper="$REPO_ROOT/scripts/manage-direct-skill-target.mjs"
  local direct_name direct_display direct_adopt direct_flag direct_source direct_target
  while IFS= read -r direct_name; do
    case "$direct_name" in
      fetch)
        direct_display="Fetch"
        direct_adopt="$ADOPT_FETCH_SKILL"
        direct_flag="--adopt-fetch-skill"
        ;;
      seo)
        direct_display="SEO"
        direct_adopt="$ADOPT_SEO_SKILL"
        direct_flag="--adopt-seo-skill"
        ;;
      evidence-research)
        direct_display="Evidence Research"
        direct_adopt="$ADOPT_EVIDENCE_RESEARCH_SKILL"
        direct_flag="--adopt-evidence-research-skill"
        ;;
      *)
        direct_display="$direct_name"
        direct_adopt=0
        direct_flag="--adopt-direct-skill=$direct_name"
        case "$ADOPT_DIRECT_SKILLS" in
          *" $direct_name "*) direct_adopt=1 ;;
        esac
        ;;
    esac
    direct_source="$plugin_source/skills/$direct_name"
    direct_target="$AGENTS_HOME_DIR/skills/$direct_name"
    local alternate_target="$CODEX_HOME_DIR/skills/$direct_name"
    if [ "$alternate_target" != "$direct_target" ] && { [ -e "$alternate_target" ] || [ -L "$alternate_target" ]; }; then
      echo "Duplicate direct skill root detected; move or explicitly reconcile the existing CODEX_HOME copy before install: $alternate_target" >&2
      exit 1
    fi
    local direct_args=("$direct_helper" "$direct_source" "$direct_target" "--check")
    if [ "$direct_adopt" -eq 1 ]; then
      direct_args+=("--allow-adopt")
    fi
    if node "${direct_args[@]}" >/dev/null; then
      :
    else
      local direct_status=$?
      if [ "$direct_status" -eq 2 ]; then
        echo "Refusing to overwrite user-owned $direct_display skill without $direct_flag: $direct_target" >&2
      else
        echo "Direct $direct_display ownership preflight failed: $direct_target" >&2
      fi
      exit 1
    fi
  done < <(direct_skill_names)

  local marketplace_path="$AGENTS_HOME_DIR/plugins/marketplace.json"
  local marketplace_plugin_target="$AGENTS_HOME_DIR/plugins/sources/codex-chef-workflows"
  local marketplace_helper="$REPO_ROOT/scripts/upsert-marketplace-entry.mjs"
  if node "$marketplace_helper" "$marketplace_path" "$marketplace_plugin_target" --check; then
    :
  else
    local marketplace_status=$?
    if [ "$marketplace_status" -ne 2 ]; then
      echo "Plugin marketplace preflight failed before any managed write: $marketplace_path" >&2
      exit 1
    fi
  fi
}

installer_safety_preflight() {
  local safety_args=(
    "$REPO_ROOT/scripts/lib/installer-safety-preflight.mjs"
    "--codex-home" "$CODEX_HOME_DIR"
    "--agents-home" "$AGENTS_HOME_DIR"
  )
  if [ "$NO_BACKUP" -eq 1 ]; then safety_args+=("--no-backup"); fi
  if [ "$DRY_RUN" -eq 1 ]; then safety_args+=("--dry-run"); fi
  if [ "$INSTALL_SKILLS" -eq 1 ]; then safety_args+=("--install-skills"); fi
  if [ "$INSTALL_GIT_GUARDS" -eq 1 ]; then
    safety_args+=("--install-git-guards" "--home" "$HOME")
    if [ "$ADOPT_GIT_IGNORE" -eq 1 ]; then safety_args+=("--adopt-git-ignore"); fi
    if [ "$ADOPT_GIT_HOOK" -eq 1 ]; then safety_args+=("--adopt-git-hook"); fi
    if [ "$ADOPT_GIT_EXCLUDES_FILE" -eq 1 ]; then safety_args+=("--adopt-git-excludes-file"); fi
    if [ "$ADOPT_GIT_HOOKS_PATH" -eq 1 ]; then safety_args+=("--adopt-git-hooks-path"); fi
  fi
  if [ "$ADOPT_FETCH_SKILL" -eq 1 ] || [ "$ADOPT_SEO_SKILL" -eq 1 ] || \
     [ "$ADOPT_EVIDENCE_RESEARCH_SKILL" -eq 1 ] || [ "$ADOPT_DIRECT_SKILLS" != " " ] || \
     [ "$ADOPT_GIT_IGNORE" -eq 1 ] || [ "$ADOPT_GIT_HOOK" -eq 1 ] || \
     [ "$ADOPT_GIT_EXCLUDES_FILE" -eq 1 ] || [ "$ADOPT_GIT_HOOKS_PATH" -eq 1 ]; then
    safety_args+=("--adoption-requested")
  fi
  if ! node "${safety_args[@]}"; then
    echo "Installer safety preflight rejected this run; no-backup is creation-only and Git guard conflicts require explicit adoption." >&2
    exit 1
  fi
}

if [ "$INTERACTIVE" -eq 1 ]; then
  section "Guided setup"
  note "Press Enter to accept the safe default shown in brackets."
  note "No tokens, secrets, cookies, sessions, or credentials are requested."
fi

CODEX_HOME_DIR="$(optional_path "Codex home" "$CODEX_HOME_DIR")"
AGENTS_HOME_DIR="$(optional_path "Agents home" "$AGENTS_HOME_DIR")"
CODEX_HOME_DIR="$(normalize_install_path "$CODEX_HOME_DIR")"
AGENTS_HOME_DIR="$(normalize_install_path "$AGENTS_HOME_DIR")"

if [ "$REPAIR" -eq 1 ]; then
  section "Codex Chef repair"
  REPAIR_ARGS=(
    "$REPO_ROOT/scripts/repair-install.mjs"
    "--redact-paths"
    "--platform"
    "unix"
    "--codex-home"
    "$CODEX_HOME_DIR"
    "--agents-home"
    "$AGENTS_HOME_DIR"
  )
  if [ "$DRY_RUN" -eq 1 ]; then
    note "Mode: repair preview; no files will be changed"
  else
    note "Mode: backup-backed repair of managed Codex Chef drift"
    REPAIR_ARGS+=("--apply")
  fi
  if [ "$NO_BACKUP" -eq 1 ]; then
    REPAIR_ARGS+=("--no-backup")
  fi
  if [ "$ADOPT_FETCH_SKILL" -eq 1 ]; then
    REPAIR_ARGS+=("--adopt-fetch-skill")
  fi
  if [ "$ADOPT_SEO_SKILL" -eq 1 ]; then
    REPAIR_ARGS+=("--adopt-seo-skill")
  fi
  if [ "$ADOPT_EVIDENCE_RESEARCH_SKILL" -eq 1 ]; then
    REPAIR_ARGS+=("--adopt-evidence-research-skill")
  fi
  for requested_name in $ADOPT_DIRECT_SKILLS; do
    REPAIR_ARGS+=("--adopt-direct-skill" "$requested_name")
  done
  node "${REPAIR_ARGS[@]}"
  exit $?
fi

if [ "$INTERACTIVE" -eq 1 ] && [ "$ALL" -eq 1 ] && [ "$INSTALL_SKILLS" -eq 1 ]; then
  if ! yes_no "Install or reconcile the 15 reviewed global Codex skills now?" "yes"; then
    INSTALL_SKILLS=0
  fi
fi

if [ "$UPDATE" -eq 1 ]; then
  FORCE=1
fi

if [ "$INTERACTIVE" -eq 1 ] && [ "$FORCE" -ne 1 ] && any_managed_target_exists; then
  if yes_no "Replace existing managed Codex Chef files after backup instead of preserving/merging?" "no"; then
    FORCE=1
  fi
fi

if [ "$INTERACTIVE" -eq 1 ] && [ "$INSTALL_GIT_GUARDS" -ne 1 ]; then
  if yes_no "Install optional global Git guards for this user?" "no"; then
    INSTALL_GIT_GUARDS=1
  fi
fi

BACKUP_ROOT="$CODEX_HOME_DIR/backups/codex-chef-$(date +%Y%m%d-%H%M%S)"

run_change() {
  local target="$1"
  local action="$2"
  shift 2
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "Would $action: $target"
    return 1
  fi
  "$@"
}

assert_managed_write_target() {
  local target="$1"
  local managed_root=""
  case "$target" in
    "$CODEX_HOME_DIR"|"$CODEX_HOME_DIR"/*) managed_root="$CODEX_HOME_DIR" ;;
    "$AGENTS_HOME_DIR"|"$AGENTS_HOME_DIR"/*) managed_root="$AGENTS_HOME_DIR" ;;
    "$HOME/.gitignore_global")
      if [ "$INSTALL_GIT_GUARDS" -eq 1 ]; then managed_root="$HOME"; fi
      ;;
    "$HOME/.githooks"|"$HOME/.githooks"/*)
      if [ "$INSTALL_GIT_GUARDS" -eq 1 ]; then managed_root="$HOME/.githooks"; fi
      ;;
  esac
  if [ "$managed_root" = "" ]; then
    case "$target" in
    *)
      echo "Refusing to access unmanaged install target: $target" >&2
      exit 1
      ;;
    esac
  fi
  if ! node "$REPO_ROOT/scripts/assert-managed-target.mjs" "$managed_root" "$target" >/dev/null; then
    echo "Managed write target became unsafe; refusing access: $target" >&2
    exit 1
  fi
}

managed_mkdir() {
  assert_managed_write_target "$1"
  mkdir -p "$1"
}

managed_copy_file() {
  local source="$1"
  local destination="$2"
  assert_managed_write_target "$destination"
  cp "$source" "$destination"
}

managed_backup_copy() {
  local source="$1"
  local destination="$2"
  assert_managed_write_target "$source"
  assert_managed_write_target "$destination"
  cp -R "$source" "$destination"
}

ensure_dir() {
  assert_managed_write_target "$1"
  run_change "$1" "ensure directory exists" managed_mkdir "$1" || true
}

assert_managed_directory_target() {
  local target="$1"
  case "$target" in
    "$CODEX_HOME_DIR"/*|"$AGENTS_HOME_DIR"/*) return 0 ;;
    *)
      echo "Refusing to replace unmanaged directory target: $target" >&2
      exit 1
      ;;
  esac
}

backup_target() {
  local target="$1"
  if [ "$NO_BACKUP" -eq 1 ] || [ ! -e "$target" ]; then
    return
  fi
  assert_managed_write_target "$target"
  ensure_dir "$BACKUP_ROOT"
  local rel
  case "$target" in
    "$CODEX_HOME_DIR"/*) rel="${target#"$CODEX_HOME_DIR"/}" ;;
    *) rel="$(basename "$target")" ;;
  esac
  ensure_dir "$(dirname "$BACKUP_ROOT/$rel")"
  if ! run_change "$BACKUP_ROOT/$rel" "back up $target" managed_backup_copy "$target" "$BACKUP_ROOT/$rel"; then
    if [ "$DRY_RUN" -eq 1 ]; then
      return
    fi
    echo "Backup failed; refusing to replace managed target without a backup: $target" >&2
    exit 1
  fi
}

install_file() {
  local source="$1"
  local destination="$2"
  assert_managed_write_target "$destination"
  if [ -e "$destination" ] && [ "$FORCE" -ne 1 ]; then
    SKIPPED_EXISTING_COUNT=$((SKIPPED_EXISTING_COUNT + 1))
    return
  fi
  ensure_dir "$(dirname "$destination")"
  backup_target "$destination"
  if run_change "$destination" "install file from $source" managed_copy_file "$source" "$destination"; then
    action "installed" "$destination"
  elif [ "$DRY_RUN" -ne 1 ]; then
    echo "Failed to install file from $source to $destination" >&2
    exit 1
  fi
}

install_codex_config() {
  local source="$1"
  local destination="$2"
  assert_managed_write_target "$destination"
  if [ -e "$destination" ] && { [ "$FORCE" -ne 1 ] || [ "$UPDATE" -eq 1 ]; }; then
    ensure_dir "$(dirname "$destination")"
    backup_target "$destination"
    local merge_args=("$REPO_ROOT/scripts/merge-codex-config.mjs" "$source" "$destination")
    local merge_action="merge missing Codex Chef config blocks from $source"
    if [ "$UPDATE" -eq 1 ]; then
      merge_args+=("--sync-managed-tables")
      merge_action="synchronize managed Codex Chef config blocks from $source"
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      run_change "$destination" "$merge_action" true || true
      node "${merge_args[@]}" --dry-run
      return
    fi
    assert_managed_write_target "$destination"
    if run_change "$destination" "$merge_action" node "${merge_args[@]}"; then
      if [ "$UPDATE" -eq 1 ]; then
        action "updated config" "$destination"
      else
        action "merged config" "$destination"
      fi
    fi
    return
  fi

  install_file "$source" "$destination"
}

install_mcp_profile() {
  local template="$1"
  local destination="$2"
  local config_source="$3"
  assert_managed_write_target "$destination"
  if [ -e "$destination" ] && [ "$FORCE" -ne 1 ]; then
    SKIPPED_EXISTING_COUNT=$((SKIPPED_EXISTING_COUNT + 1))
    return
  fi
  ensure_dir "$(dirname "$destination")"
  backup_target "$destination"
  local render_args=("$REPO_ROOT/scripts/merge-codex-config.mjs" "--render-mcp-profile" "--source" "$config_source" "--template" "$template" "--output" "$destination")
  local render_action="generate complete MCP profile from $config_source"
  if [ "$DRY_RUN" -eq 1 ]; then
    render_args+=("--dry-run")
  fi
  if run_change "$destination" "$render_action" node "${render_args[@]}"; then
    action "generated profile" "$destination"
  elif [ "$DRY_RUN" -ne 1 ]; then
    echo "Failed to generate MCP profile: $destination" >&2
    exit 1
  fi
}

install_directory() {
  local source="$1"
  local destination="$2"
  assert_managed_write_target "$destination"
  backup_target "$destination"
  ensure_dir "$destination"
  assert_managed_directory_target "$destination"
  if run_change "$destination" "sync source-owned files from $source while preserving unrelated extras" true; then
    (cd "$source" && find . -type f -print) | while IFS= read -r rel; do
      rel="${rel#./}"
      ensure_dir "$(dirname "$destination/$rel")"
      managed_copy_file "$source/$rel" "$destination/$rel"
    done
    action "synced directory" "$destination"
  fi
}

section "Codex Chef installer"
note "Codex home: $CODEX_HOME_DIR"
note "Agents home: $AGENTS_HOME_DIR"
if [ "$UPDATE" -eq 1 ]; then
  note "Mode: update managed targets after backup; preserve user config and synchronize Codex Chef tables"
elif [ "$FORCE" -eq 1 ]; then
  note "Mode: refresh source-owned managed targets after backup; preserve unrelated directory extras"
else
  note "Mode: preserve existing files; merge missing config blocks"
fi
if [ "$INSTALL_SKILLS" -eq 1 ]; then
  note "Skills: install reviewed commit-pinned entries by verified native copy"
else
  note "Skills: skipped unless --all or --install-skills is used"
fi
if [ "$INSTALL_GIT_GUARDS" -eq 1 ]; then
  note "Git guards: enabled for this user"
else
  note "Git guards: disabled by default"
fi
if [ "$DRY_RUN" -eq 1 ]; then
  note "Dry run: no files, Git settings, or skills will be changed"
fi
if [ "$INTERACTIVE" -eq 1 ]; then
  if [ "$UPDATE" -eq 1 ]; then
    note "Existing config policy: backup + synchronize managed Codex Chef tables while preserving user-owned settings"
  else
    note "Existing config policy: backup + merge missing Codex Chef blocks unless force is enabled"
  fi
  note "Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled."
  if ! yes_no "Continue with this plan?" "yes"; then
    echo "Codex Chef install cancelled by user." >&2
    exit 1
  fi
fi

installer_safety_preflight
run_preflight_validators
preflight_install_targets

section "Managed Codex files"
ensure_dir "$CODEX_HOME_DIR"
ensure_dir "$CODEX_HOME_DIR/agents"
ensure_dir "$CODEX_HOME_DIR/rules"
ensure_dir "$AGENTS_HOME_DIR"

TEMPLATE_ROOT="$REPO_ROOT/templates/codex"

install_file "$TEMPLATE_ROOT/AGENTS.md" "$CODEX_HOME_DIR/AGENTS.md"
install_codex_config "$TEMPLATE_ROOT/config.unix.toml" "$CODEX_HOME_DIR/config.toml"
install_file "$TEMPLATE_ROOT/codex-profile.mjs" "$CODEX_HOME_DIR/codex-profile.mjs"
install_file "$TEMPLATE_ROOT/serena-pool.mjs" "$CODEX_HOME_DIR/serena-pool.mjs"
install_file "$TEMPLATE_ROOT/rules/default.rules" "$CODEX_HOME_DIR/rules/default.rules"

for file in "$TEMPLATE_ROOT"/agents/*.toml; do
  install_file "$file" "$CODEX_HOME_DIR/agents/$(basename "$file")"
done

for file in "$TEMPLATE_ROOT"/profiles/*.toml; do
  case "$(basename "$file")" in
    full.config.toml|multi-session.config.toml|offline.config.toml)
      install_mcp_profile "$file" "$CODEX_HOME_DIR/$(basename "$file")" "$CODEX_HOME_DIR/config.toml"
      ;;
    *)
      install_file "$file" "$CODEX_HOME_DIR/$(basename "$file")"
      ;;
  esac
done

PLUGIN_SOURCE="$REPO_ROOT/plugins/codex-chef-workflows"
PLUGIN_TARGET="$CODEX_HOME_DIR/plugins/codex-chef-workflows"
install_directory "$PLUGIN_SOURCE" "$PLUGIN_TARGET"
MARKETPLACE_PLUGIN_TARGET="$AGENTS_HOME_DIR/plugins/sources/codex-chef-workflows"
install_directory "$PLUGIN_SOURCE" "$MARKETPLACE_PLUGIN_TARGET"
DIRECT_SKILL_HELPER="$REPO_ROOT/scripts/manage-direct-skill-target.mjs"
while IFS= read -r DIRECT_SKILL_NAME; do
  DIRECT_SKILL_SOURCE="$PLUGIN_SOURCE/skills/$DIRECT_SKILL_NAME"
  DIRECT_SKILL_TARGET="$AGENTS_HOME_DIR/skills/$DIRECT_SKILL_NAME"
  install_directory "$DIRECT_SKILL_SOURCE" "$DIRECT_SKILL_TARGET"
  if [ "$DRY_RUN" -ne 1 ]; then
    assert_managed_write_target "$DIRECT_SKILL_TARGET/.codex-chef-managed.json"
    DIRECT_MARK_ARGS=("$DIRECT_SKILL_HELPER" "$DIRECT_SKILL_SOURCE" "$DIRECT_SKILL_TARGET" "--mark")
    case "$DIRECT_SKILL_NAME" in
      fetch) DIRECT_SKILL_ADOPT="$ADOPT_FETCH_SKILL" ;;
      seo) DIRECT_SKILL_ADOPT="$ADOPT_SEO_SKILL" ;;
      evidence-research) DIRECT_SKILL_ADOPT="$ADOPT_EVIDENCE_RESEARCH_SKILL" ;;
      *)
        DIRECT_SKILL_ADOPT=0
        case "$ADOPT_DIRECT_SKILLS" in
          *" $DIRECT_SKILL_NAME "*) DIRECT_SKILL_ADOPT=1 ;;
        esac
        ;;
    esac
    if [ "$DIRECT_SKILL_ADOPT" -eq 1 ]; then
      DIRECT_MARK_ARGS+=("--allow-adopt")
    fi
    node "${DIRECT_MARK_ARGS[@]}" >/dev/null
  fi
done < <(direct_skill_names)

MARKETPLACE_DIR="$AGENTS_HOME_DIR/plugins"
MARKETPLACE_PATH="$MARKETPLACE_DIR/marketplace.json"
ensure_dir "$MARKETPLACE_DIR"
assert_managed_write_target "$MARKETPLACE_PATH"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "Would upsert Codex Chef plugin marketplace entry: $MARKETPLACE_PATH"
else
  MARKETPLACE_HELPER="$REPO_ROOT/scripts/upsert-marketplace-entry.mjs"
  if node "$MARKETPLACE_HELPER" "$MARKETPLACE_PATH" "$MARKETPLACE_PLUGIN_TARGET" --check
  then
    marketplace_status=0
  else
    marketplace_status=$?
  fi
  if [ "$marketplace_status" -eq 2 ]; then
    backup_target "$MARKETPLACE_PATH"
    assert_managed_write_target "$MARKETPLACE_PATH"
    node "$MARKETPLACE_HELPER" "$MARKETPLACE_PATH" "$MARKETPLACE_PLUGIN_TARGET" --write
    action "updated marketplace" "$MARKETPLACE_PATH"
  elif [ "$marketplace_status" -eq 0 ]; then
    SKIPPED_EXISTING_COUNT=$((SKIPPED_EXISTING_COUNT + 1))
  else
    echo "Cannot update plugin marketplace because it is invalid or unreadable: $MARKETPLACE_PATH" >&2
    exit 1
  fi
fi

PLUGIN_REFRESH_HELPER="$REPO_ROOT/scripts/refresh-installed-plugin.mjs"
PLUGIN_REFRESH_ARGS=("$PLUGIN_REFRESH_HELPER" "--codex-home" "$CODEX_HOME_DIR")
if [ "$DRY_RUN" -ne 1 ] && [ "$NO_BACKUP" -ne 1 ]; then
  PLUGIN_REFRESH_ARGS+=("--apply")
fi
if ! node "${PLUGIN_REFRESH_ARGS[@]}"; then
  echo "Refresh installed Codex Chef plugin cache failed." >&2
  exit 1
fi

if [ "$INSTALL_GIT_GUARDS" -eq 1 ]; then
  section "Optional Git guards"
  GIT_GUARD_HELPER="$REPO_ROOT/scripts/manage-global-git-guards.mjs"
  GIT_GUARD_COMMAND="apply"
  if [ "$DRY_RUN" -eq 1 ]; then GIT_GUARD_COMMAND="preview"; fi
  GIT_GUARD_ARGS=(
    "$GIT_GUARD_HELPER"
    "$GIT_GUARD_COMMAND"
    "--home" "$HOME"
    "--ignore-source" "$REPO_ROOT/templates/git/.gitignore_global"
    "--hook-source" "$REPO_ROOT/templates/git/pre-commit"
  )
  if [ "${GIT_CONFIG_GLOBAL:-}" != "" ]; then
    GIT_GUARD_ARGS+=("--git-config-global" "$GIT_CONFIG_GLOBAL")
  fi
  if [ "$ADOPT_GIT_IGNORE" -eq 1 ]; then GIT_GUARD_ARGS+=("--adopt-file" "gitignore-global"); fi
  if [ "$ADOPT_GIT_HOOK" -eq 1 ]; then GIT_GUARD_ARGS+=("--adopt-file" "pre-commit-hook"); fi
  if [ "$ADOPT_GIT_EXCLUDES_FILE" -eq 1 ]; then GIT_GUARD_ARGS+=("--adopt-key" "core.excludesfile"); fi
  if [ "$ADOPT_GIT_HOOKS_PATH" -eq 1 ]; then GIT_GUARD_ARGS+=("--adopt-key" "core.hooksPath"); fi
  if [ "$DRY_RUN" -ne 1 ]; then
    GIT_GUARD_RECEIPT="${BACKUP_ROOT}-git-guards.json"
    ensure_dir "$CODEX_HOME_DIR/backups"
    GIT_GUARD_ARGS+=("--receipt" "$GIT_GUARD_RECEIPT")
  fi
  GIT_GUARD_ARGS+=("--json")
  if ! GIT_GUARD_OUTPUT="$(node "${GIT_GUARD_ARGS[@]}")"; then
    echo "$GIT_GUARD_OUTPUT" >&2
    echo "Global Git guard transaction failed; managed Git state was rolled back." >&2
    exit 1
  fi
  echo "$GIT_GUARD_OUTPUT"
  if [ "$DRY_RUN" -eq 1 ]; then
    action "previewed" "global Git guard files, adoption decisions, and config changes"
  else
    if ! chmod +x "$HOME/.githooks/pre-commit"; then
      RESTORE_ARGS=(
        "$GIT_GUARD_HELPER"
        "restore"
        "--home" "$HOME"
        "--receipt" "$GIT_GUARD_RECEIPT"
        "--json"
      )
      if [ "${GIT_CONFIG_GLOBAL:-}" != "" ]; then
        RESTORE_ARGS+=("--git-config-global" "$GIT_CONFIG_GLOBAL")
      fi
      if ! node "${RESTORE_ARGS[@]}"; then
        echo "Global Git hook chmod failed and receipt rollback also failed: $GIT_GUARD_RECEIPT" >&2
        exit 1
      fi
      echo "Global Git hook chmod failed; receipt rollback restored the prior Git guard state." >&2
      exit 1
    fi
    action "configured" "global Git guard files and config transaction"
    note "Git guard receipt: $GIT_GUARD_RECEIPT"
    RESTORE_HINT_ARGS=("node" "$GIT_GUARD_HELPER" "restore" "--home" "$HOME")
    if [ "${GIT_CONFIG_GLOBAL:-}" != "" ]; then
      RESTORE_HINT_ARGS+=("--git-config-global" "$GIT_CONFIG_GLOBAL")
    fi
    RESTORE_HINT_ARGS+=("--receipt" "$GIT_GUARD_RECEIPT" "--json")
    printf -v RESTORE_HINT '%q ' "${RESTORE_HINT_ARGS[@]}"
    note "Restore with: ${RESTORE_HINT% }"
  fi
fi

if [ "$INSTALL_SKILLS" -eq 1 ]; then
  section "Curated skills"
  if [ "$DRY_RUN" -eq 1 ]; then
    node - "$CURATED_SKILLS_CATALOG" <<'NODE'
const fs = require("fs");
const catalog = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const skill of catalog.skills.filter((item) => item.install)) {
  const depthFlag = skill.fullDepth ? " --full-depth" : "";
  console.log(`Would install pinned skill: ${skill.name} from ${skill.package}@${skill.commit} --skill ${skill.skill}${depthFlag}`);
}
NODE
    echo "Skipped skill installation because --dry-run is active."
  else
  node - "$CURATED_SKILLS_CATALOG" "$REPO_ROOT" <<'NODE'
const fs = require("fs");
const { spawnSync } = require("child_process");
const catalog = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const env = {
  ...process.env,
  GIT_CONFIG_COUNT: process.env.GIT_CONFIG_COUNT || "1",
  GIT_CONFIG_KEY_0: process.env.GIT_CONFIG_KEY_0 || "http.sslBackend",
  GIT_CONFIG_VALUE_0: process.env.GIT_CONFIG_VALUE_0 || "openssl",
  CI: process.env.CI || "1",
  NO_COLOR: process.env.NO_COLOR || "1",
  FORCE_COLOR: process.env.FORCE_COLOR || "0",
  TERM: process.env.TERM || "dumb",
  npm_config_cache: process.env.npm_config_cache || `${process.cwd()}/tmp/npm-cache`,
  NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || process.env.npm_config_cache || `${process.cwd()}/tmp/npm-cache`
};
for (const skill of catalog.skills.filter((item) => item.install)) {
  if (!skill.package || !skill.commit || !skill.skill) {
    console.warn(`Skipped skill without verified package, commit, and skill fields: ${skill.name}`);
    continue;
  }
  const depthFlag = skill.fullDepth ? " --full-depth" : "";
  console.log(`Installing pinned skill: ${skill.name} from ${skill.package}@${skill.commit} --skill ${skill.skill}${depthFlag}`);
  const args = [
    `${process.argv[3]}/scripts/install-pinned-skill.mjs`,
    "--package",
    skill.package,
    "--commit",
    skill.commit,
    "--skill",
    skill.skill,
    "--cli-version",
    catalog.skillsCliVersion,
    "--json"
  ];
  if (skill.fullDepth) args.push("--full-depth");
  const result = spawnSync(
    process.execPath,
    args,
    { encoding: "utf8", env }
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== 0 || /Failed to install|Installation failed|Failed to clone/.test(output)) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    console.error(`Skill install failed for ${skill.name}`);
    process.exit(1);
  }
  let receipt;
  try {
    receipt = JSON.parse(result.stdout);
  } catch {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    console.error(`Skill install returned an invalid status receipt for ${skill.name}`);
    process.exit(1);
  }
  const statusByOutcome = {
    "installed": "installed skill",
    "upgraded": "upgraded managed skill",
    "already-current": "skill already current",
    "skipped-user-owned": "preserved user-owned skill",
    "adopted": "adopted skill"
  };
  const status = statusByOutcome[receipt.outcome];
  if (!status) {
    console.error(`Skill install returned an unknown outcome for ${skill.name}: ${receipt.outcome}`);
    process.exit(1);
  }
  console.log(`${status}: ${skill.name}`);
}
NODE
  fi
fi

section "Capability board"
node - "$REPO_ROOT" <<'NODE'
const fs = require("fs");
const path = require("path");

const root = process.argv[2];
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const agentCatalog = readJson("catalog/agents.json");
const mcpCatalog = readJson("catalog/mcp-servers.json");
const skillCatalog = readJson("catalog/skills.json");
const routingCatalog = readJson("catalog/routing-profiles.json");
const pluginSkillRoot = path.join(root, "plugins/codex-chef-workflows/skills");

const agents = agentCatalog.agents.map((agent) => agent.name);
const readyMcps = mcpCatalog.servers
  .filter((server) => server.defaultEnabled === true)
  .map((server) => server.name);
const optInMcps = mcpCatalog.servers
  .filter((server) => server.defaultEnabled !== true)
  .map((server) => server.name);
const mcpSetupNotes = mcpCatalog.servers
  .filter((server) => server.setupKind !== "none" && (server.setupKind !== "local-state" || server.name === "codebase-memory"))
  .map((server) => `${server.name} [${server.setupKind}]: ${server.setupHint}`);
const pluginSkills = fs
  .readdirSync(pluginSkillRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const reviewedSkills = skillCatalog.skills
  .filter((skill) => skill.install === true)
  .map((skill) => skill.name);
const routingProfiles = routingCatalog.profiles.map((profile) => profile.id);

for (const [label, names] of [
  ["Agents ready", agents],
  ["MCP ready by default", readyMcps],
  ["MCP opt-in / disabled by default", optInMcps],
  ["MCP setup notes", mcpSetupNotes],
  ["Local plugin skills", pluginSkills],
  ["Reviewed global skills", reviewedSkills],
  ["Enterprise routing profiles", routingProfiles]
]) {
  console.log(`  - ${label} (${names.length}):`);
  console.log(`    ${names.join(", ")}`);
}
console.log("  - Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.");
NODE

section "Next steps"
if [ "$SKIPPED_EXISTING_COUNT" -gt 0 ]; then
  note "$SKIPPED_EXISTING_COUNT existing managed target(s) were preserved; use --force only for a deliberate backup-backed replacement"
fi
if [ "$DRY_RUN" -eq 1 ]; then
  action "completed" "Codex Chef dry run"
else
  action "completed" "Codex Chef install"
  note "Restart Codex, then run:"
  echo "    codex doctor --summary"
  echo "    npm run codex:routing"
  echo "    npm run codex:status"
  echo "    npm run verify:install:runtime"
  echo '    codex exec --strict-config "Summarize the active Codex setup."'
fi
if [ "$NO_BACKUP" -ne 1 ] && [ -d "$BACKUP_ROOT" ]; then
  if ! node "$REPO_ROOT/scripts/write-backup-manifest.mjs" --backup-root "$BACKUP_ROOT" --operation install --platform unix; then
    echo "Warning: could not write backup manifest" >&2
  fi
  note "Backup: $BACKUP_ROOT"
fi
