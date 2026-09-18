#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const sourceMarketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");
const pluginName = "agentchef-workflows";
const allowedInstallPolicies = new Set(["NOT_AVAILABLE", "AVAILABLE", "INSTALLED_BY_DEFAULT"]);
const allowedAuthenticationPolicies = new Set(["ON_INSTALL", "ON_USE"]);

export function canonicalMarketplaceEntry(pluginSource, sourcePath = sourceMarketplacePath) {
  const source = readJsonFile(sourcePath);
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error(`Source marketplace root must be a JSON object: ${sourcePath}`);
  }
  if (!Array.isArray(source.plugins)) {
    throw new Error(`Source marketplace plugins must be an array: ${sourcePath}`);
  }
  validateMarketplacePlugins(source.plugins, sourcePath);
  const entry = source.plugins.find((plugin) => plugin?.name === pluginName);
  if (!entry) {
    throw new Error(`Source marketplace is missing ${pluginName}: ${sourcePath}`);
  }
  const desired = structuredCloneJson(entry);
  desired.source = {
    ...(desired.source && typeof desired.source === "object" && !Array.isArray(desired.source)
      ? desired.source
      : {}),
    source: "local",
    path: pluginSource
  };
  return desired;
}

export function inspectMarketplaceEntry(marketplacePath, pluginTarget) {
  const marketplace = readMarketplaceOrDefault(marketplacePath);
  const desired = canonicalMarketplaceEntry(relativePluginSource(marketplacePath, pluginTarget));
  const existingIndex = marketplace.plugins.findIndex((plugin) => plugin?.name === desired.name);
  const before = existingIndex >= 0 ? marketplace.plugins[existingIndex] : null;
  return {
    marketplace,
    desired,
    existingIndex,
    beforeCount: marketplace.plugins.length,
    changed: stableJson(before) !== stableJson(desired)
  };
}

function relativePluginSource(marketplacePath, pluginTarget) {
  const marketplaceRoot = path.resolve(path.dirname(marketplacePath), "..", "..");
  const target = path.resolve(pluginTarget);
  const relative = path.relative(marketplaceRoot, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`plugin target must stay inside the marketplace root: ${pluginTarget}`);
  }
  return `./${relative.replaceAll(path.sep, "/")}`;
}

export function writeMarketplaceEntry(marketplacePath, pluginTarget) {
  const state = inspectMarketplaceEntry(marketplacePath, pluginTarget);
  if (!state.changed) return { ...state, status: "current" };

  if (!state.marketplace.name) state.marketplace.name = "agentchef";
  if (state.existingIndex >= 0) state.marketplace.plugins[state.existingIndex] = state.desired;
  else state.marketplace.plugins.push(state.desired);

  fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
  fs.writeFileSync(marketplacePath, `${JSON.stringify(state.marketplace, null, 2)}\n`, "utf8");
  return { ...state, status: state.existingIndex >= 0 ? "updated" : "added" };
}

export function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function readMarketplaceOrDefault(marketplacePath) {
  if (!fs.existsSync(marketplacePath)) return { name: "agentchef", plugins: [] };

  const marketplace = readJsonFile(marketplacePath);
  if (!marketplace || typeof marketplace !== "object" || Array.isArray(marketplace)) {
    throw new Error(`plugin marketplace root must be a JSON object: ${marketplacePath}`);
  }
  if (marketplace.plugins === undefined || marketplace.plugins === null) {
    marketplace.plugins = [];
  }
  if (!Array.isArray(marketplace.plugins)) {
    throw new Error(`plugin marketplace plugins must be an array: ${marketplacePath}`);
  }
  validateMarketplacePlugins(marketplace.plugins, marketplacePath);
  return marketplace;
}

function validateMarketplacePlugins(plugins, marketplacePath) {
  for (const [index, plugin] of plugins.entries()) {
    if (!plugin || typeof plugin !== "object" || Array.isArray(plugin)) {
      throw new Error(`plugin marketplace entry ${index} must be an object: ${marketplacePath}`);
    }
    if (!allowedInstallPolicies.has(plugin.policy?.installation)) {
      throw new Error(`plugin marketplace entry ${index} has unsupported installation policy: ${marketplacePath}`);
    }
    const isLegacyManagedEntry = plugin.name === pluginName
      && plugin.policy?.authentication === "NONE";
    if (!allowedAuthenticationPolicies.has(plugin.policy?.authentication) && !isLegacyManagedEntry) {
      throw new Error(`plugin marketplace entry ${index} has unsupported authentication policy: ${marketplacePath}`);
    }
  }
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function structuredCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])])
  );
}

function usage() {
  console.error("Usage: node scripts/upsert-marketplace-entry.mjs <marketplace-path> <plugin-target> (--check|--write)");
}

function main() {
  const args = process.argv.slice(2);
  const marketplacePath = args[0];
  const pluginTarget = args[1];
  const mode = args[2];

  if (!marketplacePath || !pluginTarget || !["--check", "--write"].includes(mode)) {
    usage();
    process.exit(1);
  }

  try {
    if (mode === "--check") {
      const state = inspectMarketplaceEntry(marketplacePath, pluginTarget);
      process.exit(state.changed ? 2 : 0);
    }
    writeMarketplaceEntry(marketplacePath, pluginTarget);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
