// On-disk identity of AgentChef, with the legacy Codex Chef spellings that
// installs made before 1.0.0 still carry. Writers use the current names;
// readers accept both so an un-migrated home is recognized as managed;
// `repair-install --migrate-identity` converts legacy names in place.
export const productName = "agentchef";
export const legacyProductName = "codex-chef";

export const identity = Object.freeze({
  pluginName: "agentchef-workflows",
  legacyPluginName: "codex-chef-workflows",
  marketplaceName: "agentchef",
  legacyMarketplaceName: "codex-chef",
  pluginId: "agentchef-workflows@agentchef",
  legacyPluginId: "codex-chef-workflows@codex-chef",
  operatorSkill: "agentchef-operator",
  legacyOperatorSkill: "codex-chef-operator",
  managedMarker: ".agentchef-managed.json",
  legacyManagedMarker: ".codex-chef-managed.json",
  sourceMarker: ".agentchef-source.json",
  legacySourceMarker: ".codex-chef-source.json",
  backupManifest: ".agentchef-backup.json",
  legacyBackupManifest: ".codex-chef-backup.json",
  pinnedRollbackReceipt: ".agentchef-pinned-skill-rollback.json",
  legacyPinnedRollbackReceipt: ".codex-chef-pinned-skill-rollback.json",
  journalFile: ".agentchef-operation-journal.json",
  legacyJournalFile: ".codex-chef-operation-journal.json",
  lockDirectory: ".agentchef-operation.lock",
  legacyLockDirectory: ".codex-chef-operation.lock",
  backupPrefix: "agentchef-",
  legacyBackupPrefix: "codex-chef-",
  schemaPrefix: "agentchef.",
  legacySchemaPrefix: "codex-chef.",
  envPrefix: "AGENTCHEF_",
  legacyEnvPrefix: "CODEX_CHEF_",
  hookBanner: "[agentchef]",
  legacyHookBanner: "[codex-chef]",
  npmCacheFolder: "agentchef",
  legacyNpmCacheFolder: "codex-chef"
});

// Marker file names in read order: current first, then legacy.
export const managedMarkerNames = Object.freeze([identity.managedMarker, identity.legacyManagedMarker]);
export const sourceMarkerNames = Object.freeze([identity.sourceMarker, identity.legacySourceMarker]);
export const journalFileNames = Object.freeze([identity.journalFile, identity.legacyJournalFile]);
export const lockDirectoryNames = Object.freeze([identity.lockDirectory, identity.legacyLockDirectory]);
export const backupPrefixes = Object.freeze([identity.backupPrefix, identity.legacyBackupPrefix]);

// `agentchef.<name>.v<n>` for writers; readers accept the legacy spelling too.
export function schemaId(name, version) {
  return `${identity.schemaPrefix}${name}.v${version}`;
}

export function legacySchemaId(name, version) {
  return `${identity.legacySchemaPrefix}${name}.v${version}`;
}

export function acceptsSchema(value, name, version) {
  return value === schemaId(name, version) || value === legacySchemaId(name, version);
}

// Converts any `codex-chef.` schema string to its `agentchef.` spelling.
export function modernSchema(value) {
  if (typeof value !== "string") return value;
  return value.startsWith(identity.legacySchemaPrefix)
    ? `${identity.schemaPrefix}${value.slice(identity.legacySchemaPrefix.length)}`
    : value;
}

export function isLegacySchema(value) {
  return typeof value === "string" && value.startsWith(identity.legacySchemaPrefix);
}

// `AGENTCHEF_<NAME>` wins; `CODEX_CHEF_<NAME>` keeps working for older
// shells, CI configurations, and test harnesses.
export function envValue(name, env = process.env) {
  const current = env[`${identity.envPrefix}${name}`];
  if (current !== undefined && current !== "") return current;
  return env[`${identity.legacyEnvPrefix}${name}`];
}

export function backupKind(id) {
  for (const prefix of backupPrefixes) {
    if (!String(id).startsWith(prefix)) continue;
    const rest = String(id).slice(prefix.length);
    if (rest.startsWith("repair-")) return "repair";
    if (rest.startsWith("restore-")) return "restore";
    if (rest.startsWith("skill-")) return "skill";
    if (rest.startsWith("remove-")) return "remove";
    return "install";
  }
  return null;
}

export function isManagedBackupId(id) {
  return backupKind(id) !== null;
}
