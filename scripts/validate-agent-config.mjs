#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const failures = [];

const catalogPath = path.join(root, "catalog", "agents.json");
const configFiles = [
  "templates/codex/config.windows.toml",
  "templates/codex/config.unix.toml"
];
const agentDir = path.join(root, "templates", "codex", "agents");
const allowedSandboxModes = new Set(["read-only", "workspace-write"]);
const allowedModelSelections = new Set(["auto"]);
const allowedReasoningEfforts = new Set(["auto", "low", "medium", "high", "xhigh"]);
const minimumSourceBackedItems = 100;
const minimumDistinctSourceMarkers = 20;

function fail(message) {
  failures.push(message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function parseAgentBlocks(text) {
  const blocks = new Map();
  const lines = text.split(/\r?\n/);
  let currentName = null;
  let currentLines = [];

  function flush() {
    if (currentName) {
      blocks.set(currentName, `${currentLines.join("\n")}\n`);
    }
  }

  for (const line of lines) {
    const heading = line.match(/^\[agents\.([A-Za-z0-9_.-]+)\]\s*$/);
    if (heading) {
      flush();
      currentName = heading[1];
      currentLines = [];
      continue;
    }
    if (currentName && /^\[/.test(line)) {
      flush();
      currentName = null;
      currentLines = [];
      continue;
    }
    if (currentName) currentLines.push(line);
  }
  flush();

  return blocks;
}

function readTomlString(block, key) {
  const match = block.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"\\s*$`, "m"));
  return match ? match[1] : null;
}

function readTomlStringArray(block, key) {
  const match = block.match(new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]\\s*$`, "m"));
  if (!match) return null;
  const values = [];
  const itemPattern = /"([^"]*)"/g;
  let item;
  while ((item = itemPattern.exec(match[1]))) {
    values.push(item[1]);
  }
  return values;
}

function readAgentTemplate(rel) {
  const full = path.join(root, "templates", "codex", rel);
  if (!fs.existsSync(full)) {
    fail(`Agent template missing: templates/codex/${rel}`);
    return null;
  }
  return fs.readFileSync(full, "utf8");
}

function validateTextContains(label, text, needle) {
  if (!text.includes(needle)) {
    fail(`${label} must include: ${needle}`);
  }
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function collectSourceMarkers(text) {
  const markers = new Set();
  for (const match of text.matchAll(/\[Source: ([^\]]+)\]/g)) {
    for (const marker of match[1].split(";").map((item) => item.trim()).filter(Boolean)) {
      markers.add(marker);
    }
  }
  return markers;
}

function normalizeSentence(value) {
  return String(value || "").trim().replace(/[.;:!?]+$/u, "").replace(/\s+/g, " ");
}

function lowerFirst(value) {
  const normalized = normalizeSentence(value);
  return normalized ? `${normalized[0].toLowerCase()}${normalized.slice(1)}` : normalized;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle);
  if (start === -1) return "";
  const contentStart = start + startNeedle.length;
  const end = text.indexOf(endNeedle, contentStart);
  if (end === -1) return "";
  return text.slice(contentStart, end).trim();
}

function validateWorldClassBlock(agent, template) {
  const orderedSections = [
    "Authority metadata contract:",
    "Expertise signal contract:",
    "World-class specialist upgrade:",
    "Research-backed playbook:"
  ];
  let previousIndex = -1;
  for (const section of orderedSections) {
    const index = template.indexOf(section);
    if (index === -1) continue;
    if (index <= previousIndex) {
      fail(`Agent template ${agent.name} must order ${orderedSections.join(" -> ")}.`);
      break;
    }
    previousIndex = index;
  }

  const block = sectionBetween(template, "World-class specialist upgrade:", "Research-backed playbook:");
  const bullets = block.split(/\r?\n/).filter((line) => line.startsWith("- "));
  if (bullets.length < 4 || bullets.length > 6) {
    fail(`Agent template ${agent.name} world-class specialist upgrade must contain 4-6 bullets; found ${bullets.length}.`);
  }
  for (const bullet of bullets) {
    if (!bullet.includes("[Source:")) {
      fail(`Agent template ${agent.name} world-class specialist upgrade bullet must be source-backed: ${bullet}`);
    }
  }
  for (const required of [
    "senior specialist level",
    "domain-specific failure mode",
    "strictest applicable evidence grade",
    "senior peer reviewer",
    "unproven, unsafe, overbroad, stale, or unverifiable",
    "decision heuristics, failure modes, and verification signals",
    "mark a corpus gap"
  ]) {
    if (!block.includes(required)) {
      fail(`Agent template ${agent.name} world-class specialist upgrade must include: ${required}`);
    }
  }
  const primaryUse = normalizeSentence(agent.primaryUse);
  if (!block.includes(primaryUse)) {
    fail(`Agent template ${agent.name} world-class specialist upgrade must include primaryUse text.`);
  }
  const boundary = lowerFirst(agent.mustNot);
  if (!new RegExp(`do not\\s+${escapeRegExp(boundary)}`, "i").test(block)) {
    fail(`Agent template ${agent.name} world-class specialist upgrade must negate mustNot boundary with "do not ${boundary}".`);
  }
}

if (!fs.existsSync(catalogPath)) {
  fail("Missing catalog/agents.json");
} else {
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch (error) {
    fail(`catalog/agents.json must be parseable JSON: ${error.message}`);
  }

  if (catalog) {
    if (!catalog.officialReference?.startsWith("https://developers.openai.com/codex/config-reference")) {
      fail("catalog/agents.json must point at the official Codex config reference.");
    }
    if (catalog.defaults?.model !== "gpt-5.5") fail("catalog/agents.json defaults.model must stay gpt-5.5.");
    if (catalog.defaults?.maxThreads !== 10) fail("catalog/agents.json defaults.maxThreads must stay 10.");
    if (catalog.defaults?.maxDepth !== 2) fail("catalog/agents.json defaults.maxDepth must stay 2 for bounded coordinator-to-worker delegation.");
    if (catalog.defaults?.jobMaxRuntimeSeconds !== 3600) {
      fail("catalog/agents.json defaults.jobMaxRuntimeSeconds must stay 3600.");
    }
    if (!Array.isArray(catalog.agents) || catalog.agents.length === 0) {
      fail("catalog/agents.json must define a non-empty agents array.");
    }

    const catalogNames = new Set();
    const workerProfile = catalog.workerApprovalProfile;
    if (workerProfile?.approvalPolicy !== "on-request"
      || workerProfile?.sandboxSource !== "catalog-agent"
      || workerProfile?.rules !== "rules/default.rules") {
      fail("Agent catalog must define the safe on-request worker approval profile.");
    }
    if (catalog.knowledgePolicy?.agentReference !== "name"
      || catalog.knowledgePolicy?.runtimeInjection !== false
      || catalog.knowledgePolicy?.privateAgentSpaceMemory !== "excluded") {
      fail("Agent catalog must keep knowledge name-bound, metadata-only, and private AgentSpace memory excluded.");
    }
    const roleAssignments = new Map();
    const rolesById = new Map();
    for (const role of catalog.agentSpaceRoles || []) {
      if (!/^(backend|data|devops|frontend|leadership|product|qa|design|security|marketing|support)$/.test(role.id || "")) {
        fail(`Unsupported AgentSpace role id: ${role.id}`);
      }
      if (rolesById.has(role.id)) fail(`Duplicate AgentSpace role id: ${role.id}`);
      rolesById.set(role.id, role);
      for (const name of role.specialists || []) {
        if (roleAssignments.has(name)) fail(`AgentSpace specialist assigned more than once: ${name}`);
        roleAssignments.set(name, role.id);
      }
    }
    for (const agent of catalog.agents || []) {
      if (!agent.name || !/^[A-Za-z0-9_.-]+$/.test(agent.name)) {
        fail(`Agent must declare a valid name: ${agent.name}`);
        continue;
      }
      if (catalogNames.has(agent.name)) fail(`Duplicate agent name: ${agent.name}`);
      catalogNames.add(agent.name);
      if (!roleAssignments.has(agent.name)) fail(`Agent missing AgentSpace role ownership: ${agent.name}`);
      for (const key of [
        "category",
        "description",
        "templateDescription",
        "configFile",
        "sandboxMode",
        "modelSelection",
        "modelReasoningEffort",
        "neverOverrideUserProfile",
        "risk",
        "defaultReason",
        "primaryUse",
        "mustNot"
      ]) {
        if (!agent[key]) fail(`Agent ${agent.name} must declare ${key}.`);
      }
      if (agent.configFile !== `agents/${agent.name}.toml`) {
        fail(`Agent ${agent.name} configFile must be agents/${agent.name}.toml.`);
      }
      if (!allowedSandboxModes.has(agent.sandboxMode)) {
        fail(`Agent ${agent.name} has unsupported sandboxMode: ${agent.sandboxMode}`);
      }
      if (!allowedModelSelections.has(agent.modelSelection)) {
        fail(`Agent ${agent.name} has unsupported modelSelection: ${agent.modelSelection}`);
      }
      if (!allowedReasoningEfforts.has(agent.modelReasoningEffort)) {
        fail(`Agent ${agent.name} has unsupported modelReasoningEffort: ${agent.modelReasoningEffort}`);
      }
      if (agent.neverOverrideUserProfile !== true) {
        fail(`Agent ${agent.name} must preserve the active user profile.`);
      }
      if (agent.sandboxMode === "read-only" && /modify|edit|write/i.test(agent.defaultReason || "")) {
        fail(`Agent ${agent.name} read-only defaultReason must not imply writes.`);
      }

      const template = readAgentTemplate(agent.configFile);
      if (template) {
        if (readTomlString(template, "approval_policy") !== "on-request") {
          fail(`Agent template approval_policy must stay on-request for ${agent.name}.`);
        }
        if (readTomlString(template, "name") !== agent.name) {
          fail(`Agent template name drift for ${agent.name}.`);
        }
        if (readTomlString(template, "description") !== agent.templateDescription) {
          fail(`Agent template description drift for ${agent.name}.`);
        }
        const nicknameCandidates = readTomlStringArray(template, "nickname_candidates");
        if (!nicknameCandidates || nicknameCandidates.length < 3) {
          fail(`Agent template ${agent.name} must include at least three nickname_candidates.`);
        } else {
          if (new Set(nicknameCandidates).size !== nicknameCandidates.length) {
            fail(`Agent template ${agent.name} nickname_candidates must be unique.`);
          }
          for (const nickname of nicknameCandidates) {
            if (!/^[A-Za-z0-9 _-]+$/.test(nickname)) {
              fail(`Agent template ${agent.name} has invalid nickname_candidate: ${nickname}`);
            }
          }
        }
        const templateModel = readTomlString(template, "model");
        if (agent.modelSelection === "auto") {
          if (templateModel) fail(`Agent template must not pin model when modelSelection is auto for ${agent.name}.`);
        } else if (templateModel !== catalog.defaults.model) {
          fail(`Agent template model drift for ${agent.name}.`);
        }
        if (readTomlString(template, "sandbox_mode") !== agent.sandboxMode) {
          fail(`Agent template sandbox_mode drift for ${agent.name}.`);
        }
        const templateReasoningEffort = readTomlString(template, "model_reasoning_effort");
        if (agent.modelReasoningEffort === "auto") {
          if (templateReasoningEffort) {
            fail(`Agent template must not pin model_reasoning_effort when modelReasoningEffort is auto for ${agent.name}.`);
          }
        } else if (templateReasoningEffort !== agent.modelReasoningEffort) {
          fail(`Agent template model_reasoning_effort drift for ${agent.name}.`);
        }
        const webSearch = readTomlString(template, "web_search") === "live";
        if (webSearch !== Boolean(agent.webSearch)) {
          fail(`Agent template web_search drift for ${agent.name}.`);
        }
        if (!/developer_instructions\s*=\s*"""/.test(template)) {
          fail(`Agent template must include developer_instructions for ${agent.name}.`);
        }
        const requiredRoleSections = [
          ["Authority metadata contract:", "authority metadata contract"],
          ["Expertise signal contract:", "expertise signal contract"],
          ["World-class specialist upgrade:", "world-class specialist upgrade"],
          ["Source refresh protocol:", "source refresh protocol"],
          ["Cross-repo transfer protocol:", "cross-repo transfer protocol"],
          ["Research synthesis protocol:", "research synthesis protocol"],
          ["Adversarial validation protocol:", "adversarial validation protocol"],
          ["Source currency protocol:", "source currency protocol"],
          ["Corpus expansion protocol:", "corpus expansion protocol"],
          ["Expert calibration protocol:", "expert calibration protocol"],
          ["Evidence output contract:", "evidence output contract"],
          ["Tool and delegation routing:", "tool and delegation routing"],
          ["Verification checklist:", "verification checklist"],
          ["Escalation and refusal guardrails:", "escalation and refusal guardrails"],
          ["Primary reference anchors:", "primary reference anchors"],
          ["Senior blind-spot checks:", "senior blind-spot checks"],
          ["Decision thresholds:", "decision thresholds"],
          ["Handoff payload contract:", "handoff payload contract"],
          ["Evidence grading rubric:", "evidence grading rubric"],
          ["Invocation intake checklist:", "invocation intake checklist"],
          ["Corpus acquisition map:", "corpus acquisition map"]
        ];
        for (const [needle, label] of requiredRoleSections) {
          const occurrences = countOccurrences(template, needle);
          if (occurrences !== 1) {
            fail(`Agent template must include exactly one ${label} for ${agent.name}; found ${occurrences}.`);
          }
        }
        validateWorldClassBlock(agent, template);
        const sourceBackedItems = countOccurrences(template, "[Source:");
        if (sourceBackedItems < minimumSourceBackedItems) {
          fail(`Agent template ${agent.name} must include at least ${minimumSourceBackedItems} source-backed instruction items; found ${sourceBackedItems}.`);
        }
        const distinctSourceMarkers = collectSourceMarkers(template);
        if (distinctSourceMarkers.size < minimumDistinctSourceMarkers) {
          fail(`Agent template ${agent.name} must include at least ${minimumDistinctSourceMarkers} distinct source markers; found ${distinctSourceMarkers.size}.`);
        }
        if (/danger-full-access|approval_policy\s*=\s*"never"|GITHUB_TOKEN|GH_TOKEN|OPENAI_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_API_KEY|GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_ID/.test(template)) {
          fail(`Agent template contains forbidden unsafe setting or token name: ${agent.name}.`);
        }
      }
    }
    for (const name of roleAssignments.keys()) {
      if (!catalogNames.has(name)) fail(`AgentSpace role references unknown specialist: ${name}`);
    }

    const coordinationPolicy = catalog.coordinationPolicy;
    if (coordinationPolicy?.maxDelegationDepth !== 2
      || coordinationPolicy?.maxWorkersPerCoordinator !== 4
      || coordinationPolicy?.peerCommunication !== "parent-routed-handoff"
      || coordinationPolicy?.workerDelegation !== "prohibited"
      || coordinationPolicy?.privateContext !== "excluded") {
      fail("Coordinator policy must keep depth-two, bounded, parent-routed, private-context-excluded orchestration.");
    }
    if (!Array.isArray(catalog.coordinators) || catalog.coordinators.length !== rolesById.size) {
      fail("Coordinator catalog must define exactly one coordinator for every AgentSpace role.");
    }
    const coordinatorNames = new Set();
    const coordinatorRoles = new Set();
    for (const coordinator of catalog.coordinators || []) {
      if (!/^[A-Za-z0-9_.-]+_coordinator$/.test(coordinator.name || "")) {
        fail(`Coordinator must declare a valid _coordinator name: ${coordinator.name}`);
        continue;
      }
      if (coordinatorNames.has(coordinator.name)) fail(`Duplicate coordinator name: ${coordinator.name}`);
      coordinatorNames.add(coordinator.name);
      if (coordinatorRoles.has(coordinator.roleId)) fail(`Duplicate coordinator role: ${coordinator.roleId}`);
      coordinatorRoles.add(coordinator.roleId);
      const role = rolesById.get(coordinator.roleId);
      if (!role) fail(`Coordinator references unsupported role: ${coordinator.roleId}`);
      if (!coordinator.description || coordinator.configFile !== `agents/${coordinator.name}.toml`) {
        fail(`Coordinator ${coordinator.name} must declare description and matching configFile.`);
      }
      if (!Array.isArray(coordinator.workers) || coordinator.workers.length < 1 || coordinator.workers.length > (coordinationPolicy?.maxWorkersPerCoordinator || 4)) {
        fail(`Coordinator ${coordinator.name} must own a bounded worker group.`);
      }
      if (JSON.stringify([...(coordinator.workers || [])].sort()) !== JSON.stringify([...(role?.specialists || [])].sort())) {
        fail(`Coordinator ${coordinator.name} workers must exactly match AgentSpace role ${coordinator.roleId}.`);
      }
      const template = readAgentTemplate(coordinator.configFile);
      if (!template) continue;
      if (readTomlString(template, "name") !== coordinator.name
        || readTomlString(template, "description") !== coordinator.description
        || readTomlString(template, "approval_policy") !== "on-request"
        || readTomlString(template, "sandbox_mode") !== "read-only") {
        fail(`Coordinator template contract drift for ${coordinator.name}.`);
      }
      const nicknames = readTomlStringArray(template, "nickname_candidates");
      if (!nicknames || nicknames.length < 3 || new Set(nicknames).size !== nicknames.length) {
        fail(`Coordinator ${coordinator.name} must have three unique nickname_candidates.`);
      }
      for (const required of [
        "Do not delegate to another coordinator or create nested worker trees.",
        "A worker may not delegate further.",
        "the parent routes peer consultation",
        "AgentSpace private memory, sessions, credentials, or machine-local context"
      ]) {
        if (!template.includes(required)) fail(`Coordinator ${coordinator.name} missing orchestration guardrail: ${required}`);
      }
      if (/model\s*=|model_reasoning_effort\s*=|danger-full-access|approval_policy\s*=\s*"never"|\.agentspace[\\/]|MEMORY\.md|auth\.json|sessions[\\/]/i.test(template)) {
        fail(`Coordinator ${coordinator.name} contains a forbidden pin, unsafe setting, or private-context reference.`);
      }
    }

    const templateNames = fs.existsSync(agentDir)
      ? fs.readdirSync(agentDir).filter((file) => file.endsWith(".toml")).map((file) => path.basename(file, ".toml"))
      : [];
    const runtimeNames = new Set([...catalogNames, ...coordinatorNames]);
    for (const name of templateNames) {
      if (!runtimeNames.has(name)) fail(`Agent template missing from catalog: ${name}`);
    }
    for (const name of runtimeNames) {
      if (!templateNames.includes(name)) fail(`Catalog agent missing template file: ${name}`);
    }

    for (const configFile of configFiles) {
      const text = read(configFile);
      const blocks = parseAgentBlocks(text);
      const configNames = new Set(blocks.keys());

      validateTextContains(configFile, text, "multi_agent = true");
      validateTextContains(configFile, text, "max_threads = 10");
      validateTextContains(configFile, text, "max_depth = 2");
      validateTextContains(configFile, text, "job_max_runtime_seconds = 3600");
      if (/\[apps\._default\][\s\S]*?\ndefault_tools_enabled\s*=/.test(text)) {
        fail(`${configFile} must not use apps._default.default_tools_enabled; Codex strict config rejects it.`);
      }

      for (const name of runtimeNames) {
        if (!configNames.has(name)) fail(`${configFile} missing agent block for ${name}.`);
      }
      for (const name of configNames) {
        if (!runtimeNames.has(name)) fail(`${configFile} has agent block not present in catalog: ${name}.`);
      }
      for (const agent of catalog.agents || []) {
        const block = blocks.get(agent.name);
        if (!block) continue;
        if (readTomlString(block, "description") !== agent.description) {
          fail(`${configFile} description drift for ${agent.name}.`);
        }
        if (readTomlString(block, "config_file") !== agent.configFile) {
          fail(`${configFile} config_file drift for ${agent.name}.`);
        }
      }
      for (const coordinator of catalog.coordinators || []) {
        const block = blocks.get(coordinator.name);
        if (!block) continue;
        if (readTomlString(block, "description") !== coordinator.description
          || readTomlString(block, "config_file") !== coordinator.configFile) {
          fail(`${configFile} coordinator block drift for ${coordinator.name}.`);
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Agent config validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const validatedCatalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const specialistCount = validatedCatalog.agents.length;
const coordinatorCount = (validatedCatalog.coordinators || []).length;
console.log(`Agent config validation passed. Checked ${coordinatorCount} coordinators and ${specialistCount} specialist workers across ${configFiles.length} configs.`);
