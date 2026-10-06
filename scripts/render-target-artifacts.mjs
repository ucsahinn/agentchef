#!/usr/bin/env node
// Renders every generated, committed target artifact from its single source:
//   templates/shared/working-agreement.md -> templates/codex/AGENTS.md
//                                          -> templates/claude/rules/agentchef-working-agreement.md
//   catalog/agents.json + templates/codex/agents/*.toml -> plugins/agentchef/agents/*.md
//   templates/codex/rules/default.rules -> templates/claude/settings.fragment.json
//   .codex-plugin/plugin.json + agents/*.md -> .claude-plugin/plugin.json
//   catalog/mcp-servers.json (claudeSource: plugin) -> plugins/agentchef/mcp/claude.mcp.json
//   templates/codex/serena-pool.mjs -> plugins/agentchef/scripts/serena-pool.mjs
//   catalog/routing-profiles.json -> the profile list in the adaptive-agent-routing reference
//   catalog/routing-profiles.json + catalog/skills.json -> plugins/agentchef/scripts/routing-index.json
//   scripts/lib/routing-recommendation.mjs -> plugins/agentchef/scripts/routing-recommendation.mjs
//   codexRoutingHintHook -> plugins/agentchef/hooks/routing-hint.json
// The Claude manifest carries its three hooks inline (Agent spawn guard,
// routing hint, SessionEnd process hygiene).
// Claude would also load a hooks/hooks.json on its own, and Codex reads its
// hook from hooks/process-hygiene.json, so neither CLI loads the other's.
// `--check` (used by npm run check) fails when a committed artifact drifts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderWorkingAgreement, workingAgreementTargets } from "./lib/emitters/working-agreement.mjs";
import { emitClaudeAgents } from "./lib/emitters/claude-agents.mjs";
import { emitClaudePermissions } from "./lib/emitters/claude-permissions.mjs";
import { emitClaudeMcpPermissions } from "./lib/emitters/claude-mcp-permissions.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const pluginDirectory = "plugins/agentchef";
const agentsOutputDirectory = `${pluginDirectory}/agents`;
const codexPluginManifestPath = `${pluginDirectory}/.codex-plugin/plugin.json`;
const claudePluginManifestPath = `${pluginDirectory}/.claude-plugin/plugin.json`;
const settingsFragmentPath = "templates/claude/settings.fragment.json";
export const claudePluginMcpPath = `${pluginDirectory}/mcp/claude.mcp.json`;
const pluginSerenaBridgePath = `${pluginDirectory}/scripts/serena-pool.mjs`;
export const routingReferencePath = `${pluginDirectory}/skills/adaptive-agent-routing/references/global-working-agreements.md`;
export const pluginRoutingEnginePath = `${pluginDirectory}/scripts/routing-recommendation.mjs`;
export const pluginRoutingIndexPath = `${pluginDirectory}/scripts/routing-index.json`;
export const codexRoutingHintHookPath = `${pluginDirectory}/hooks/routing-hint.json`;
const routingReferenceStart = "<!-- agentchef:routing-profiles:start -->";
const routingReferenceEnd = "<!-- agentchef:routing-profiles:end -->";
const projectUrl = "https://github.com/ucsahinn/agentchef";

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function readJson(repoRoot, relative) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8"));
}

// Claude Code's plugin manifest lists agent files explicitly (a directory
// value is rejected by `claude plugin validate`), so the list is generated
// from the same emitter output that produces the files.
export function renderClaudePluginManifest(repoRoot, agentFileNames) {
  const codexManifest = readJson(repoRoot, codexPluginManifestPath);
  const packageJson = readJson(repoRoot, "package.json");
  return {
    name: codexManifest.name,
    version: codexManifest.version,
    description: codexManifest.description,
    author: { name: "AgentChef", url: projectUrl },
    homepage: projectUrl,
    repository: projectUrl,
    license: packageJson.license,
    keywords: ["agentchef", "claude-code", "codex", "workflows", "security-first"],
    skills: "./skills/",
    agents: [...agentFileNames].sort().map((fileName) => `./agents/${fileName}`),
    // Not the root .mcp.json: Claude would load that one on its own as well.
    mcpServers: "./mcp/claude.mcp.json",
    hooks: claudePluginHooks
  };
}

// Exec form (command + args, no shell): node's parent is then the Claude
// process itself, so the owner lookup ends at its first step. The sweep it
// schedules stops only the MCP trees that session started, once it has exited.
//
// PreToolUse on the Agent tool enforces each coordinator's worker list, which
// Claude Code itself enforces only under claude --agent (see
// plugins/agentchef/scripts/agent-spawn-guard.mjs).
export const claudePluginHooks = Object.freeze({
  PreToolUse: [
    {
      matcher: "Agent",
      hooks: [
        {
          type: "command",
          command: "node",
          args: ["${CLAUDE_PLUGIN_ROOT}/scripts/agent-spawn-guard.mjs"],
          timeout: 10
        }
      ]
    }
  ],
  SessionEnd: [
    {
      hooks: [
        {
          type: "command",
          command: "node",
          args: ["${CLAUDE_PLUGIN_ROOT}/scripts/codex-process-hygiene.mjs", "--session-end", "--runtime", "claude"],
          timeout: 15
        }
      ]
    }
  ],
  // The routing hint: one advisory line of catalog identifiers when the
  // prompt matches a routing profile with high confidence
  // (plugins/agentchef/scripts/routing-hint.mjs). The event has no matcher.
  UserPromptSubmit: [
    {
      hooks: [
        {
          type: "command",
          command: "node",
          args: ["${CLAUDE_PLUGIN_ROOT}/scripts/routing-hint.mjs"],
          timeout: 10
        }
      ]
    }
  ]
});

// The same hint for Codex, as its own hook file next to process-hygiene.json.
// The Windows variant references the plugin root through a variable only.
export const codexRoutingHintHook = Object.freeze({
  description: "On prompt submit, score the prompt against the AgentChef routing catalog in memory and add one advisory line of profile, skill, and role identifiers when a profile matches with high confidence; nothing is stored or sent, and the prompt is never blocked.",
  hooks: {
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: "node \"$PLUGIN_ROOT/scripts/routing-hint.mjs\"",
            commandWindows: "powershell.exe -NoProfile -NonInteractive -Command \"& node (Join-Path $env:PLUGIN_ROOT 'scripts/routing-hint.mjs')\"",
            timeout: 10
          }
        ]
      }
    ]
  }
});

// The hook's data: identifiers and match words only, so a tampered copy can
// change which identifiers are hinted but cannot carry instructions.
export function renderRoutingIndex(repoRoot) {
  const routing = readJson(repoRoot, "catalog/routing-profiles.json");
  const skillEntries = new Map((readJson(repoRoot, "catalog/skills.json").skills || []).map((skill) => [skill.name, skill]));
  return {
    schemaVersion: 1,
    pluginVersion: readJson(repoRoot, "package.json").version,
    cap: routing.delegationPolicy.autoSpawnCap,
    profiles: routing.profiles.map((profile) => ({
      id: profile.id,
      match: { priority: profile.match.priority, phrases: profile.match.phrases, terms: profile.match.terms, excludeTerms: profile.match.excludeTerms },
      autoSkill: profile.autoSkill,
      autoSkillMode: skillEntries.get(profile.autoSkill)?.implicitInvocation === false ? "suggest" : "load",
      verifier: profile.verifier,
      autoVerify: profile.autoVerify,
      agents: profile.agents
    }))
  };
}

// The MCP servers Claude Code gets from the plugin. Every entry runs through
// node, the one command both platforms resolve the same way; npx packages go
// through scripts/mcp-launch.mjs and Serena through the shared pool bridge,
// pointed at the session's project.
export function renderClaudePluginMcp(repoRoot) {
  const catalog = readJson(repoRoot, "catalog/mcp-servers.json");
  const mcpServers = {};
  for (const server of catalog.servers.filter((entry) => entry.claudeSource === "plugin")) {
    if (server.name === "serena") {
      mcpServers.serena = { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/scripts/serena-pool.mjs", "bridge", "--project-root", "${CLAUDE_PROJECT_DIR}"] };
    } else if (server.transport === "stdio" && server.package) {
      mcpServers[server.name] = { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/scripts/mcp-launch.mjs", server.package, ...(server.launchArgs || [])] };
    } else {
      throw new Error(`No plugin launch form for MCP server ${server.name}`);
    }
  }
  return { mcpServers };
}

// One bullet per profile, between two markers, so the reference the routing
// skill loads cannot drift from the catalog (it used to be hand-copied).
export function renderRoutingReference(repoRoot) {
  const routing = readJson(repoRoot, "catalog/routing-profiles.json");
  const skillEntries = new Map((readJson(repoRoot, "catalog/skills.json").skills || []).map((skill) => [skill.name, skill]));
  const current = normalize(fs.readFileSync(path.join(repoRoot, routingReferencePath), "utf8"));
  const start = current.indexOf(routingReferenceStart);
  const end = current.indexOf(routingReferenceEnd);
  if (start < 0 || end < 0 || end < start) throw new Error(`${routingReferencePath} is missing the routing-profiles markers`);
  const code = (name) => `\`${name}\``;
  const lines = routing.profiles.map((profile) => {
    const skills = profile.skills.length ? profile.skills.map(code).join(", ") : "none";
    const autoSkill = profile.autoSkill
      ? `${code(profile.autoSkill)}${skillEntries.get(profile.autoSkill)?.implicitInvocation === false ? " (explicit-only: suggest, do not load)" : ""}`
      : "none";
    const verifier = `${code(profile.verifier)}${profile.autoVerify ? " (required after file changes)" : " (suggested)"}`;
    const handoffs = (profile.crossDomainHandoffs || []).map((handoff) => ` Cross-domain: ${code(handoff.toCoordinator)} via ${handoff.via} when ${handoff.when.replace(/\.$/, "")}.`).join("");
    return `- ${code(profile.id)}: agents ${profile.agents.map(code).join(", ")}; skills ${skills}; auto-skill ${autoSkill}; verifier ${verifier}.${handoffs}`;
  });
  const cap = routing.delegationPolicy.autoSpawnCap;
  const body = [
    routingReferenceStart,
    `Rendered from \`catalog/routing-profiles.json\` by \`scripts/render-target-artifacts.mjs\`; do not edit by hand. A matched profile loads its auto-skill first (explicit-only skills are suggested instead), runs its verifier before a file-changing task is reported done when the verifier is required, and starts at most ${cap} agents per task without the user naming them.`,
    "",
    ...lines,
    routingReferenceEnd
  ].join("\n");
  return `${current.slice(0, start)}${body}${current.slice(end + routingReferenceEnd.length)}`;
}

// The working agreement's routing lines come from the catalogs, so the rule
// the model reads and the data the hint hook scores cannot disagree.
export function workingAgreementSharedTokens(repoRoot = root) {
  const routing = readJson(repoRoot, "catalog/routing-profiles.json");
  const agents = readJson(repoRoot, "catalog/agents.json");
  return {
    SPAWN_WHEN: routing.delegationPolicy.spawnWhen.join("; "),
    SKIP_WHEN: routing.delegationPolicy.skipWhen.join(", "),
    AUTO_SPAWN_CAP: routing.delegationPolicy.autoSpawnCap,
    AUTO_VERIFY_PROFILES: routing.profiles.filter((profile) => profile.autoVerify).map((profile) => `\`${profile.id}\``).join(", "),
    WORKER_MODEL_CODEX: agents.workerModels.codex,
    WORKER_MODEL_CLAUDE: agents.workerModels.claude
  };
}

export function renderAllTargetArtifacts(repoRoot = root) {
  const outputs = new Map();
  const source = fs.readFileSync(path.join(repoRoot, "templates", "shared", "working-agreement.md"), "utf8");
  const sharedTokens = workingAgreementSharedTokens(repoRoot);
  for (const target of Object.values(workingAgreementTargets)) {
    outputs.set(target.output, `${renderWorkingAgreement(source, target.id, sharedTokens).trimEnd()}\n`);
  }
  const catalog = readJson(repoRoot, "catalog/agents.json");
  const agentFileNames = [];
  for (const [fileName, text] of emitClaudeAgents({ catalog, roleDirectory: path.join(repoRoot, "templates", "codex", "agents") })) {
    outputs.set(`${agentsOutputDirectory}/${fileName}`, text);
    agentFileNames.push(fileName);
  }
  outputs.set(claudePluginManifestPath, `${JSON.stringify(renderClaudePluginManifest(repoRoot, agentFileNames), null, 2)}\n`);
  outputs.set(claudePluginMcpPath, `${JSON.stringify(renderClaudePluginMcp(repoRoot), null, 2)}\n`);
  // The plugin carries its own copy of the bridge; identical bytes keep it on
  // the same pool manager as the Codex copy.
  outputs.set(pluginSerenaBridgePath, normalize(fs.readFileSync(path.join(repoRoot, "templates", "codex", "serena-pool.mjs"), "utf8")));
  outputs.set(routingReferencePath, renderRoutingReference(repoRoot));
  // The hook scores with a byte-identical copy of the engine and a rendered
  // index, so the plugin has no dependency on the repository checkout.
  outputs.set(pluginRoutingEnginePath, normalize(fs.readFileSync(path.join(repoRoot, "scripts", "lib", "routing-recommendation.mjs"), "utf8")));
  outputs.set(pluginRoutingIndexPath, `${JSON.stringify(renderRoutingIndex(repoRoot), null, 2)}\n`);
  outputs.set(codexRoutingHintHookPath, `${JSON.stringify(codexRoutingHintHook, null, 2)}\n`);
  const rules = fs.readFileSync(path.join(repoRoot, "templates", "codex", "rules", "default.rules"), "utf8");
  const permissions = emitClaudePermissions(rules);
  const mcpPermissions = emitClaudeMcpPermissions(readJson(repoRoot, "catalog/mcp-servers.json"));
  outputs.set(settingsFragmentPath, `${JSON.stringify({
    $comment: "Generated from templates/codex/rules/default.rules and catalog/mcp-servers.json by scripts/render-target-artifacts.mjs; do not edit by hand.",
    permissions: {
      allow: [...permissions.permissions.allow, ...mcpPermissions.allow],
      ask: [...permissions.permissions.ask, ...mcpPermissions.ask],
      deny: mcpPermissions.deny
    }
  }, null, 2)}\n`);
  return outputs;
}

function main(argv) {
  const write = argv.includes("--write");
  const check = argv.includes("--check") || !write;
  const outputs = renderAllTargetArtifacts();
  const drifted = [];
  for (const [relative, text] of outputs) {
    const absolute = path.join(root, relative);
    const current = fs.existsSync(absolute) ? normalize(fs.readFileSync(absolute, "utf8")) : null;
    if (current === normalize(text)) continue;
    drifted.push(relative);
    if (write) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, text, "utf8");
    }
  }
  // A role removed from the catalog leaves its rendered file behind; Claude
  // would still load it, so a leftover is drift in both modes.
  const agentsDirectory = path.join(root, agentsOutputDirectory);
  const orphans = fs.existsSync(agentsDirectory)
    ? fs.readdirSync(agentsDirectory).filter((name) => name.endsWith(".md") && !outputs.has(`${agentsOutputDirectory}/${name}`))
    : [];
  if (orphans.length > 0) {
    console.error("Rendered agent files no longer in the catalog; remove them with `git rm`:");
    for (const name of orphans) console.error(`- ${agentsOutputDirectory}/${name}`);
    process.exit(1);
  }
  if (check && !write && drifted.length > 0) {
    console.error("Generated target artifacts are out of date; run `npm run render:targets`:");
    for (const relative of drifted) console.error(`- ${relative}`);
    process.exit(1);
  }
  console.log(write
    ? `Rendered ${outputs.size} target artifacts (${drifted.length} updated).`
    : `Target artifacts are current. Checked ${outputs.size} files.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2));
}
