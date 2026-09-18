import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
import { defaultTargets, operationAppliesToTargets, parseTargetSelection } from "./targets/index.mjs";

export const repositoryRoot = path.resolve(moduleDirectory, "..", "..");
export const installManifestPath = path.join(repositoryRoot, "manifests", "install-plan.json");

export function readInstallManifest(root = repositoryRoot) {
  return JSON.parse(fs.readFileSync(path.join(root, "manifests", "install-plan.json"), "utf8"));
}

export function normalizeTargetPath(value, platform) {
  let normalized = String(value);
  if (platform !== "windows") return normalized.replace(/[\\/]+/g, "/");
  normalized = normalized.replace(/\//g, "\\");
  if (normalized.startsWith("\\\\?\\")) {
    return `\\\\?\\${normalized.slice(4).replace(/\\+/g, "\\")}`;
  }
  if (normalized.startsWith("\\\\")) {
    return `\\\\${normalized.slice(2).replace(/\\+/g, "\\")}`;
  }
  return normalized.replace(/\\+/g, "\\");
}

export function joinTargetPath(platform, ...segments) {
  return normalizeTargetPath(
    segments.filter(Boolean).join(platform === "windows" ? "\\" : "/"),
    platform
  );
}

export function resolveInstallValue(value, options) {
  return normalizeTargetPath(String(value)
    .replaceAll("${CODEX_HOME}", options.codexHome)
    .replaceAll("${AGENTS_HOME}", options.agentsHome)
    .replaceAll("${CLAUDE_HOME}", options.claudeHome)
    .replaceAll("${CLAUDE_JSON}", options.claudeJson)
    .replaceAll("${HOME}", options.home)
    .replaceAll("${REPO_ROOT}", options.root || repositoryRoot), options.platform);
}

function listRegularFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Install source must be a real directory: ${directory}`);
  }
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const entryStat = fs.lstatSync(absolute);
      if (entryStat.isSymbolicLink()) {
        throw new Error(`Install source tree must not contain links: ${absolute}`);
      }
      if (entryStat.isDirectory()) pending.push(absolute);
      else if (entryStat.isFile()) files.push(path.relative(directory, absolute));
      else throw new Error(`Install source tree contains an unsupported entry: ${absolute}`);
    }
  }
  return files.sort();
}

function expandGlob(root, relativeGlob, excluded = []) {
  const normalized = relativeGlob.replace(/\\/g, "/");
  const markerIndex = normalized.lastIndexOf("/*");
  if (markerIndex === -1) return [normalized];
  const directory = normalized.slice(0, markerIndex);
  const suffix = normalized.slice(markerIndex + 2);
  const excludedNames = new Set(excluded);
  const absoluteDirectory = path.join(root, directory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.name.endsWith(suffix) || excludedNames.has(entry.name)) return false;
      if (entry.isSymbolicLink()) {
        throw new Error(`Install source glob must not contain links: ${path.join(absoluteDirectory, entry.name)}`);
      }
      return entry.isFile();
    })
    .map((entry) => `${directory}/${entry.name}`)
    .sort();
}

function flagEnabled(operation, options) {
  if (operation.requiresFlag === "InstallSkills") return options.installSkills;
  if (operation.requiresFlag === "InstallGitGuards") return options.installGitGuards;
  return true;
}

// Target selection. "codex" stays the compatible default; "shared" operations
// run once for any selection; "claude" operations need an explicit target.
export function normalizeTargets(value) {
  if (value instanceof Set) return new Set([...value].map(String));
  if (Array.isArray(value)) return new Set(value.map(String));
  return parseTargetSelection(value);
}

function targetEnabled(operation, targets) {
  return operationAppliesToTargets(operation, targets);
}

export function selectInstallComponents(manifest, options) {
  const targets = normalizeTargets(options.targets);
  const profileName = options.profile || (options.all ? "all" : "default");
  const profileIds = manifest.profiles?.[profileName];
  if (!Array.isArray(profileIds)) throw new Error(`Unknown install profile: ${profileName}`);
  const byId = new Map(manifest.operations.map((operation) => [operation.id, operation]));
  const manifestIndex = new Map(manifest.operations.map((operation, index) => [operation.id, index]));
  const selectedIds = [...profileIds];
  const selectedSet = new Set(selectedIds);

  for (const operation of manifest.operations) {
    if (!operation.requiresFlag || selectedSet.has(operation.id) || !flagEnabled(operation, options)) continue;
    const insertionIndex = selectedIds.findIndex((id) => manifestIndex.get(id) > manifestIndex.get(operation.id));
    if (insertionIndex === -1) selectedIds.push(operation.id);
    else selectedIds.splice(insertionIndex, 0, operation.id);
    selectedSet.add(operation.id);
  }

  for (const id of selectedIds) {
    if (!byId.has(id)) {
      throw new Error(`Install profile ${profileName} references unknown operation: ${id}`);
    }
  }

  const selected = manifest.operations
    .filter((operation) => selectedSet.has(operation.id))
    .filter((operation) => operation.platforms.includes(options.platform))
    .filter((operation) => targetEnabled(operation, targets));
  const selectedPlatformIds = new Set(selected.map((operation) => operation.id));
  const skipped = manifest.operations.filter((operation) => !selectedPlatformIds.has(operation.id));
  return { profileName, targets: [...targets], selected, skipped };
}

function selectedBy(operation, options, profileName) {
  if (operation.requiresFlag === "InstallGitGuards") return "InstallGitGuards";
  if (operation.requiresFlag === "InstallSkills") return options.all ? "--all" : "--install-skills";
  if ((operation.target || "codex") === "claude") return "--target claude";
  return profileName;
}

function commonAction(operation, options, profileName) {
  const noBackupIncompatible = ["git-config", "refresh-plugin-cache", "chmod"].includes(operation.kind);
  return {
    componentId: operation.id,
    target: operation.target || "codex",
    summary: operation.summary,
    risk: operation.risk,
    collision: operation.collision,
    conflictPolicy: operation.conflictPolicy,
    adoptionFlag: operation.adoptionFlag,
    stateBackup: operation.stateBackup,
    backup: Boolean(operation.backup),
    noBackupPolicy: options.noBackup
      ? noBackupIncompatible
        ? "incompatible"
        : operation.backup
          ? "creation-only"
          : "not-applicable"
      : operation.backup
        ? "backup-before-existing-mutation"
        : "not-applicable",
    force: options.force,
    wouldMutateGlobalState: true,
    selectedBy: selectedBy(operation, options, profileName)
  };
}

function expandCuratedSkills(operation, options, profileName) {
  const catalog = JSON.parse(fs.readFileSync(path.join(options.root, operation.catalog), "utf8"));
  return (catalog.skills || []).filter((skill) => skill.install === true).map((skill) => ({
    ...commonAction(operation, options, profileName),
    id: `${operation.id}:${skill.name}`,
    kind: "skill-install",
    summary: `Install commit-pinned curated skill ${skill.name}`,
    command: skill.fullDepth
      ? `node scripts/install-pinned-skill.mjs --package ${skill.package} --commit ${skill.commit} --skill ${skill.skill} --cli-version ${catalog.skillsCliVersion} --full-depth`
      : `node scripts/install-pinned-skill.mjs --package ${skill.package} --commit ${skill.commit} --skill ${skill.skill} --cli-version ${catalog.skillsCliVersion}`,
    source: skill.source,
    sourceUrl: skill.sourceUrl,
    destination: joinTargetPath(options.platform, options.agentsHome, "skills", skill.name)
  }));
}

export function expandInstallComponent(operation, options, profileName) {
  const common = commonAction(operation, options, profileName);
  if (operation.kind === "skill-install") return expandCuratedSkills(operation, options, profileName);

  if (operation.kind === "copy-glob") {
    return expandGlob(options.root, operation.sourceGlob, operation.excludeBasenames).map((source) => ({
      ...common,
      id: `${operation.id}:${path.basename(source)}`,
      kind: "copy-file",
      source,
      destination: joinTargetPath(
        options.platform,
        resolveInstallValue(operation.destinationDir, options),
        path.basename(source)
      )
    }));
  }

  if (operation.kind === "generate-mcp-profile") {
    return operation.sources.map((source) => ({
      ...common,
      id: `${operation.id}:${path.basename(source)}`,
      kind: "generate-mcp-profile",
      source,
      configSource: resolveInstallValue(operation.configSource, options),
      destination: joinTargetPath(
        options.platform,
        resolveInstallValue(operation.destinationDir, options),
        path.basename(source)
      )
    }));
  }

  if (operation.kind === "git-config") {
    return [{
      ...common,
      id: operation.id,
      kind: operation.kind,
      key: operation.key,
      value: resolveInstallValue(operation.value, options)
    }];
  }

  if (operation.kind === "chmod") {
    return [{
      ...common,
      id: operation.id,
      kind: operation.kind,
      destination: resolveInstallValue(operation.destination, options),
      mode: operation.mode
    }];
  }

  if (operation.kind === "write-marketplace") {
    return [{
      ...common,
      id: operation.id,
      kind: operation.kind,
      destination: resolveInstallValue(operation.destination, options),
      pluginTarget: resolveInstallValue(operation.pluginTarget, options)
    }];
  }

  if (operation.kind === "refresh-plugin-cache") {
    return [{
      ...common,
      id: operation.id,
      kind: operation.kind,
      source: resolveInstallValue(operation.source, options),
      destination: resolveInstallValue(operation.destination, options),
      pluginId: operation.pluginId
    }];
  }

  // Claude Code operations are executed by scripts/install-claude-target.mjs;
  // the plan only resolves their destinations so preflight and previews can
  // reason about every touched path.
  if (operation.kind === "json-merge" || operation.kind === "write-claude-marketplace") {
    return [{
      ...common,
      id: operation.id,
      kind: operation.kind,
      source: operation.source,
      destination: resolveInstallValue(operation.destination, options),
      ...(operation.pluginTarget ? { pluginTarget: resolveInstallValue(operation.pluginTarget, options) } : {})
    }];
  }

  if (operation.kind === "link-directory") {
    return [{
      ...common,
      id: operation.id,
      kind: operation.kind,
      source: resolveInstallValue(operation.source, options),
      destination: resolveInstallValue(operation.destination, options)
    }];
  }

  if (operation.kind === "claude-plugin-register") {
    return [{
      ...common,
      id: operation.id,
      kind: operation.kind,
      pluginId: operation.pluginId,
      command: `${options.platform === "windows" ? "claude.cmd" : "claude"} plugin marketplace add ${joinTargetPath(options.platform, options.agentsHome, "plugins")} && ${options.platform === "windows" ? "claude.cmd" : "claude"} plugin install ${operation.pluginId} --scope user`
    }];
  }

  const source = operation.sourceByPlatform
    ? operation.sourceByPlatform[options.platform]
    : operation.source;
  const actions = [{
    ...common,
    id: operation.id,
    kind: operation.kind,
    source,
    destination: resolveInstallValue(operation.destination, options)
  }];
  if (operation.ownershipMarker) {
    actions.push({
      ...common,
      id: `${operation.id}:ownership-marker`,
      kind: "write-ownership-marker",
      source: operation.source,
      destination: resolveInstallValue(operation.ownershipMarker, options)
    });
  }
  return actions;
}

function actionPreflightTargets(action, options) {
  if (["refresh-plugin-cache", "claude-plugin-register", "link-directory"].includes(action.kind)) return [];
  if (!action.destination) return [];
  if (action.kind !== "copy-directory") return [action.destination];
  const sourceRoot = path.join(options.root, action.source);
  return [
    action.destination,
    ...listRegularFiles(sourceRoot).map((file) => joinTargetPath(options.platform, action.destination, file))
  ];
}

function assertRegularSourceFile(sourcePath) {
  if (!fs.existsSync(sourcePath)) throw new Error(`Install source file is missing: ${sourcePath}`);
  const stat = fs.lstatSync(sourcePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Install source must be a regular file without links: ${sourcePath}`);
  }
}

function sourcePreflightArtifacts(operations, options) {
  const artifacts = [];
  for (const action of operations) {
    if (!["copy-file", "copy-directory", "generate-mcp-profile", "write-ownership-marker"].includes(action.kind)) {
      continue;
    }
    if (!action.source || path.isAbsolute(action.source) || action.source.includes("..")) {
      throw new Error(`Install action ${action.id} has an unsafe repository source: ${action.source || "(missing)"}`);
    }
    const absoluteSource = path.join(options.root, action.source);
    if (["copy-directory", "write-ownership-marker"].includes(action.kind)) {
      artifacts.push(absoluteSource);
      artifacts.push(...listRegularFiles(absoluteSource).map((file) => path.join(absoluteSource, file)));
    } else {
      assertRegularSourceFile(absoluteSource);
      artifacts.push(absoluteSource);
    }
  }
  return [...new Set(artifacts)];
}

// Mirrors resolveClaudeHomes with platform-aware path joins so a contract can
// be planned for another platform: CLAUDE_CONFIG_DIR (from `env`, default
// process.env) or an explicit Claude home other than ${HOME}/.claude relocates
// the config directory, and only then does .claude.json live inside it;
// otherwise Claude Code keeps the file at ${HOME}/.claude.json.
function contractClaudeHomes({ platform, home, claudeHome, claudeJson }, env) {
  const defaultHome = joinTargetPath(platform, home, ".claude");
  const configDir = claudeHome || env.CLAUDE_CONFIG_DIR || null;
  const resolvedHome = configDir ? normalizeTargetPath(configDir, platform) : defaultHome;
  const same = platform === "windows" ? resolvedHome.toLowerCase() === defaultHome.toLowerCase() : resolvedHome === defaultHome;
  const relocated = Boolean(env.CLAUDE_CONFIG_DIR) || (Boolean(claudeHome) && !same);
  return {
    claudeHome: resolvedHome,
    claudeJson: claudeJson || joinTargetPath(platform, relocated ? resolvedHome : home, ".claude.json")
  };
}

export function resolveInstallContract(rawOptionsWithEnv) {
  const { env = process.env, ...rawOptions } = rawOptionsWithEnv;
  const claudeHomes = contractClaudeHomes(rawOptions, env);
  const options = {
    root: repositoryRoot,
    profile: rawOptions.all ? "all" : "default",
    all: false,
    installSkills: false,
    installGitGuards: false,
    force: false,
    noBackup: false,
    targets: defaultTargets,
    claudeHome: claudeHomes.claudeHome,
    claudeJson: claudeHomes.claudeJson,
    ...rawOptions
  };
  options.targets = normalizeTargets(options.targets);
  const manifest = rawOptions.manifest || readInstallManifest(options.root);
  const selection = selectInstallComponents(manifest, options);
  const operations = selection.selected.flatMap((operation) =>
    expandInstallComponent(operation, options, selection.profileName)
  );
  const sourcePreflight = sourcePreflightArtifacts(operations, options);
  const preflightTargets = [...new Set(operations.flatMap((operation) =>
    actionPreflightTargets(operation, options)
  ))];
  return {
    manifest,
    profileName: selection.profileName,
    targets: selection.targets,
    selectedComponents: selection.selected,
    skippedComponents: selection.skipped,
    operations,
    sourcePreflight,
    preflightTargets
  };
}
