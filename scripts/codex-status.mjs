#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyGitStatus, summarizeGitStatus } from "./lib/git-worktree.mjs";
import {
  CliUsageError,
  installCliErrorBoundary,
  requireCliValue
} from "./lib/cli-error-contract.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const args = process.argv.slice(2);
installCliErrorBoundary({
  tool: "codex-status",
  argv: args,
  root,
  prefix: "Codex Chef status error"
});
const DEFAULT_CHILD_TIMEOUT_MS = 120000;
const RUNTIME_VERIFY_TIMEOUT_MS = 300000;

const options = {
  json: false,
  details: false,
  redactPaths: false,
  expectSkills: false,
  expectGitGuards: false,
  noLog: false,
  skipRuntime: false,
  skipCodexDoctorChecks: false,
  skipCodexCli: false,
  output: null,
  forceOutput: false,
  lang: "en",
  codexHome: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  agentsHome: process.env.AGENTS_HOME || path.join(os.homedir(), ".agents")
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--json") options.json = true;
  else if (arg === "--details") options.details = true;
  else if (arg === "--tr") options.lang = "tr";
  else if (arg === "--lang") {
    const value = requireCliValue(args, index, "--lang");
    if (!["en", "tr"].includes(value)) throw new CliUsageError("--lang must be en or tr");
    options.lang = value;
    index += 1;
  }
  else if (arg === "--redact-paths") options.redactPaths = true;
  else if (arg === "--expect-skills") options.expectSkills = true;
  else if (arg === "--expect-git-guards") options.expectGitGuards = true;
  else if (arg === "--no-log") options.noLog = true;
  else if (arg === "--plain" || arg === "--plain-output") {
    // Shared compatibility flag with the Chef CLI; status output is already plain text.
  }
  else if (arg === "--repo-only") {
    options.skipRuntime = true;
    options.skipCodexDoctorChecks = true;
    options.skipCodexCli = true;
  }
  else if (arg === "--skip-runtime") options.skipRuntime = true;
  else if (arg === "--skip-codex-doctor-checks") options.skipCodexDoctorChecks = true;
  else if (arg === "--skip-codex-cli") options.skipCodexCli = true;
  else if (arg === "--force-output") options.forceOutput = true;
  else if (arg === "--output") {
    options.output = requireCliValue(args, index, "--output");
    index += 1;
  } else if (arg === "--codex-home") {
    options.codexHome = path.resolve(requireCliValue(args, index, "--codex-home"));
    index += 1;
  } else if (arg === "--agents-home") {
    options.agentsHome = path.resolve(requireCliValue(args, index, "--agents-home"));
    index += 1;
  } else if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  } else {
    throw new CliUsageError(`Unknown argument: ${arg}`);
  }
}

function printHelp() {
  console.log(`Usage: node scripts/codex-status.mjs [options]

Read-only end-user status board for Codex Chef.

Options:
  --json                       Emit machine-readable JSON
  --details                    Show the full diagnostic and setup evidence
  --output <path>              Write the JSON report inside this repository
  --force-output               Allow --output to replace an existing report
  --expect-skills              Fail runtime status if curated global skills are missing
  --expect-git-guards          Fail runtime status if optional Git guards are missing
  --no-log                     Accepted for shared Chef CLI no-log compatibility
  --plain, --plain-output      Accepted for shared Chef CLI plain-output compatibility
  --repo-only                  Skip installed runtime, Codex doctor, and live Codex CLI probes
  --skip-runtime               Skip installed runtime verification
  --skip-codex-doctor-checks   Skip direct Codex CLI doctor check summary
  --skip-codex-cli             Skip Codex CLI version/login/MCP probes
  --codex-home <path>          Installed Codex home to inspect
  --agents-home <path>         Installed Agents home to inspect
  --lang <en|tr>               Human-readable output language
  --tr                         Shortcut for --lang tr
  --redact-paths               Redact home and repository paths in output
`);
}

function isTr() {
  return options.lang === "tr";
}

function localText(en, tr) {
  return isTr() ? tr : en;
}

const progressEnabled = !options.json;
if (progressEnabled) {
  console.log(localText("Codex Chef status", "Codex Chef durumu"));
  console.log(options.skipRuntime && options.skipCodexDoctorChecks && options.skipCodexCli
    ? localText(
        "Collecting local repository checks; installed runtime, global skill-root inventory, Codex log metadata, and live Codex CLI probes are skipped.",
        "Yerel repo kontrolleri toplanıyor; kurulu ortam, global skill envanteri, Codex log bilgisi ve canlı Codex CLI kontrolleri atlandı."
      )
    : localText(
        "Collecting repo, runtime, Codex CLI, MCP, Git, and log metadata checks; this can take 30-60 seconds.",
        "Repo, kurulu ortam, Codex CLI, MCP, Git ve log bilgisi kontrolleri toplanıyor; 30-60 saniye sürebilir."
      ));
}

function progress(message) {
  if (!progressEnabled) return;
  const translated = isTr()
    ? String(message)
        .replace(/^running /, "çalışıyor: ")
        .replace(/\(timeout (\d+)s\)/, "(zaman sınırı $1s)")
    : message;
  console.log(`[${localText("status", "durum")}] ${translated}`);
}

function skipInstalledRuntimeAndCliMetadata() {
  return options.skipRuntime && options.skipCodexCli;
}

function redact(value) {
  if (!options.redactPaths || typeof value !== "string") return value;
  const home = os.homedir();
  const escapedHome = home.replaceAll("\\", "\\\\");
  const escapedRoot = root.replaceAll("\\", "\\\\");
  return value
    .replaceAll(home, "${HOME}")
    .replaceAll(escapedHome, "${HOME}")
    .replaceAll(home.replaceAll("\\", "/"), "${HOME}")
    .replaceAll(root, "${REPO}")
    .replaceAll(escapedRoot, "${REPO}")
    .replaceAll(root.replaceAll("\\", "/"), "${REPO}")
    .replace(/[A-Za-z]:\\Users\\[^\\/]+/g, "${OTHER_USERPROFILE}")
    .replace(/[A-Za-z]:\\\\Users\\\\[^\\/]+/g, "${OTHER_USERPROFILE}")
    .replace(/[A-Za-z]:\/Users\/[^\\/]+/g, "${OTHER_USERPROFILE}");
}

function redactDeep(value) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDeep(item)]));
  }
  return value;
}

function humanStatusValue(value, context = "") {
  if (value === undefined || value === null || value === "") return localText("not inspected", "kontrol edilmedi");
  const text = String(value);
  const normalized = text.trim().toLowerCase();
  const replacements = {
    none: context === "skillMode"
      ? localText("profile-specific; some profiles do not need skills", "profile göre değişir; bazı profiller skill istemez")
      : localText("not applicable", "uygulanmaz"),
    "not_checked_here": localText("not checked in this status run", "bu durum turunda kontrol edilmedi"),
    "not_inferred_from_catalog": localText("not inferred from catalog", "katalogdan varsayılmadı"),
    skipped: localText("skipped by this mode", "bu modda atlandı"),
    true: localText("enabled", "açık"),
    false: localText("disabled", "kapalı")
  };
  return replacements[normalized] || text;
}

function humanList(values, context = "") {
  const list = (values || []).map((value) => humanStatusValue(value, context));
  return list.length ? list.join(", ") : "not configured";
}

function stateText(value) {
  const normalized = String(value ?? "").toLowerCase();
  const replacements = {
    ok: localText("ok", "tamam"),
    attention: localText("attention", "dikkat"),
    fail: localText("fail", "hata"),
    warning: localText("warning", "uyarı"),
    skipped: localText("skipped", "atlandı"),
    same: localText("same", "aynı"),
    different: localText("different", "farklı"),
    installed: localText("installed", "kurulu"),
    not_installed: localText("not installed", "kurulu değil"),
    current: localText("current", "güncel")
  };
  return replacements[normalized] || String(value ?? localText("not inspected", "kontrol edilmedi"));
}

function translateStatusMessage(message) {
  let text = String(message || "");
  if (!isTr()) return text;
  text = text
    .replace("git status --short is clean.", "git status --short temiz.")
    .replace(/No tracked or staged changes; (\d+) unrelated untracked file\(s\) are preserved by update\./, "Tracked veya staged degisiklik yok; $1 ilgisiz untracked dosya update tarafindan korunur.")
    .replace(/git status --short reports (\d+) changed line\(s\)\./, "git status --short $1 değişen satır bildiriyor.")
    .replace("one or more required provider endpoints are unreachable over HTTP", "bir veya daha fazla gerekli provider endpoint'ine HTTP üzerinden erişilemiyor")
    .replace("MCP configuration has optional issues", "MCP config içinde isteğe bağlı uyarılar var")
    .replace("update configuration is locally consistent", "update yapılandırması yerel olarak tutarlı")
    .replace("Ambient Codex runtime home differs from installed target; verifying with explicit CODEX_HOME=", "Ortam Codex runtime home kurulu hedeften farklı; açık CODEX_HOME ile doğrulanıyor: ")
    .replace("Skipped installed/global skill roots because installed-runtime and live Codex CLI probes are disabled.", "Kurulu ortam ve canlı Codex CLI kontrolleri kapalı olduğu için kurulu/global skill kökleri atlandı.")
    .replace("For repo-wide or long-running work, run Codex with --profile token-safe or merge token-safe.config.toml; this lowers verbosity, default reasoning, compaction, and tool-output ceilings without disabling skills, agents, MCPs, memory, hooks, or apps.", "Repo genelindeki veya uzun işlerde Codex'i --profile token-safe ile çalıştırın ya da token-safe.config.toml ayarlarını birleştirin; bu işlem skill, agent, MCP, memory, hook veya app kapatmadan verbosity, varsayılan reasoning, compaction ve tool-output sınırlarını düşürür.");
  return text;
}

function translateSetupHint(message) {
  let text = String(message || "");
  if (!isTr()) return text;
  return text
    .replace("No credential or extra input is required.", "Kimlik bilgisi veya ek girdi gerekmez.")
    .replace("Requires npm/npx network access on first startup; no credential is required.", "İlk çalışmada npm/npx ağ erişimi gerekir; kimlik bilgisi gerekmez.")
    .replace("Requires npm/npx network access and local browser control; no credential is required.", "npm/npx ağ erişimi ve yerel tarayıcı kontrolü gerekir; kimlik bilgisi gerekmez.")
    .replace("Requires npm/npx network access and starts an isolated Chrome/DevTools bridge; no credential is required.", "npm/npx ağ erişimi gerekir ve izole Chrome/DevTools köprüsü başlatır; kimlik bilgisi gerekmez.")
    .replace("Requires uvx and the pinned Serena git source; disable if uvx is unavailable.", "uvx ve sabitlenmiş Serena git kaynağı gerekir; uvx yoksa kapatın.")
    .replace("No credential is required; use only for non-secret local memory.", "Kimlik bilgisi gerekmez; yalnız gizli olmayan yerel memory için kullanın.")
    .replace("Requires Node/npx first-run package download; keeps local repository graph state on this machine. Indexing, destructive graph, and admin tools stay prompt-gated or disabled.", "İlk çalışmada Node/npx paket indirmesi gerekir; yerel repo graph durumu bu makinede kalır. Indexing, destructive graph ve admin tool'ları prompt-gated veya disabled kalır.")
    .replace("Choose a deliberate local root path in config args before enabling.", "Açmadan önce config argümanlarında bilinçli bir yerel kök path seçin.")
    .replace("Requires GitHub/Copilot account authorization; keep disabled until private GitHub context is needed.", "GitHub/Copilot hesap yetkilendirmesi gerekir; private GitHub context gerekene kadar kapalı tutun.")
    .replace("Requires Figma account or workspace authorization.", "Figma hesap veya workspace yetkilendirmesi gerekir.")
    .replace("Requires Linear workspace authorization.", "Linear workspace yetkilendirmesi gerekir.")
    .replace("Requires Notion workspace authorization.", "Notion workspace yetkilendirmesi gerekir.")
    .replace("Requires Sentry organization authorization and may expose production error data.", "Sentry organizasyon yetkilendirmesi gerekir ve production hata verisini açığa çıkarabilir.")
    .replace("Requires Vercel account/team authorization and may expose project or deployment data.", "Vercel hesap/takım yetkilendirmesi gerekir ve proje/deploy verisini açığa çıkarabilir.")
    .replace("Before enabling, add a task-specific project_ref query parameter, keep read_only=true, retain only the required feature groups, and complete Supabase OAuth.", "Etkinleştirmeden önce göreve özel project_ref query parametresini ekleyin, read_only=true ayarını koruyun, yalnız gerekli feature group'larını bırakın ve Supabase OAuth akışını tamamlayın.");
}

function translateNextAction(message) {
  if (!isTr()) return message;
  const translations = new Map([
    [
      "Run npm run chef -- --preview --no-log to inspect the install plan, then run npm run chef -- --install --apply when ready.",
      "Kurulum planını görmek için npm run chef -- --preview --no-log çalıştırın; hazır olduğunuzda npm run chef -- --install --apply ile kurulumu başlatın."
    ],
    [
      "Run npm run repair:install -- --apply to repair managed runtime drift, then rerun npm run codex:status.",
      "Yönetilen kurulum drift'ini onarmak için npm run repair:install -- --apply çalıştırın; ardından npm run codex:status komutunu yeniden çalıştırın."
    ],
    [
      "Review attention items; they do not necessarily mean Codex Chef install is broken.",
      "Dikkat maddelerini inceleyin; bunlar Codex Chef kurulumunun bozuk olduğu anlamına gelmeyebilir."
    ],
    ["No action needed.", "İşlem gerekmiyor."]
  ]);
  return translations.get(message) || translateStatusMessage(message);
}

function run(command, commandArgs, extra = {}) {
  const executable = process.platform === "win32" && command.endsWith(".cmd") ? "cmd.exe" : command;
  const argsForSpawn = process.platform === "win32" && command.endsWith(".cmd")
    ? ["/d", "/s", "/c", command, ...commandArgs]
    : commandArgs;
  return spawnSync(executable, argsForSpawn, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: extra.timeout || DEFAULT_CHILD_TIMEOUT_MS,
    windowsHide: true,
    env: extra.env || process.env
  });
}

function runNodeScript(script, scriptArgs, label, extra = {}) {
  const timeout = extra.timeout || DEFAULT_CHILD_TIMEOUT_MS;
  progress(`running ${label} (timeout ${Math.round(timeout / 1000)}s)`);
  const result = run(process.execPath, [script, ...scriptArgs], { timeout });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.error) {
    return { inspected: false, status: "fail", failures: [`${label} could not run: ${result.error.message}`] };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch (error) {
    return {
      inspected: false,
      status: "fail",
      failures: [`${label} did not emit parseable JSON: ${error.message}`],
      output: redact(output)
    };
  }
  return {
    inspected: true,
    exitCode: result.status,
    status: parsed.status || (result.status === 0 ? "ok" : "fail"),
    report: parsed,
    failures: [
      ...(Array.isArray(parsed.failures) ? parsed.failures : []),
      ...(result.status === 0 ? [] : [`${label} exited ${result.status} despite emitting JSON.`])
    ]
  };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function listRecentFiles(dir, extensions = null, limit = 8) {
  if (!fs.existsSync(dir)) return { exists: false, recent: [] };
  const recent = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => {
      if (!extensions) return true;
      return extensions.some((extension) => entry.name.endsWith(extension));
    })
    .map((entry) => {
      const fullPath = path.join(dir, entry.name);
      const stat = safeStat(fullPath);
      if (!stat) return null;
      return {
        file: redact(fullPath),
        name: entry.name,
        size: stat.size,
        modified: stat.mtime.toISOString()
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, limit);
  return { exists: true, recent };
}

function readInstalledOrTemplateConfig() {
  const installedPath = path.join(options.codexHome, "config.toml");
  const template = readTemplateConfig();
  const templatePath = template.rawPath;
  const configPath = fs.existsSync(installedPath) ? installedPath : templatePath;
  return {
    path: redact(configPath),
    source: fs.existsSync(installedPath) ? "installed" : "template",
    text: fs.readFileSync(configPath, "utf8")
  };
}

function readTemplateConfig() {
  const templatePath = process.platform === "win32"
    ? path.join(root, "templates/codex/config.windows.toml")
    : path.join(root, "templates/codex/config.unix.toml");
  return {
    rawPath: templatePath,
    path: redact(templatePath),
    source: "template",
    text: fs.readFileSync(templatePath, "utf8")
  };
}

function readTomlValue(text, dottedKey) {
  const parts = dottedKey.split(".");
  const key = parts.pop();
  const section = parts.length > 0 ? parts.join(".").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : null;
  const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = section
    ? text.match(new RegExp(`\\[${section}\\]\\s*([\\s\\S]*?)(?=\\n\\[|$)`))?.[1] || ""
    : text;
  const match = body.match(new RegExp(`^\\s*${keyPattern}\\s*=\\s*([^\\n#]+)`, "m"));
  if (!match) return null;
  const raw = match[1].trim().replace(/,$/, "");
  if (raw === "true") return true;
  if (raw === "false") return false;
  const quoted = raw.match(/^"([\s\S]*)"$/);
  if (quoted) return quoted[1];
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

function expandUserPath(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  let expanded = value
    .replaceAll("$CODEX_HOME", options.codexHome)
    .replaceAll("${CODEX_HOME}", options.codexHome)
    .replaceAll("%CODEX_HOME%", options.codexHome)
    .replaceAll("$HOME", os.homedir())
    .replaceAll("${HOME}", os.homedir())
    .replaceAll("%USERPROFILE%", os.homedir());
  if (expanded === "~" || expanded.startsWith(`~${path.sep}`) || expanded.startsWith("~/")) {
    expanded = path.join(os.homedir(), expanded.slice(2));
  }
  return path.resolve(expanded);
}

function codexCommand() {
  if (process.env.CODEX_STATUS_CODEX_COMMAND) return process.env.CODEX_STATUS_CODEX_COMMAND;
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

function inspectSkillInventory(skipGlobal = false) {
  const expected = readJson("catalog/skills.json")
    .skills
    .filter((skill) => skill.install === true || skill.directInstall === true)
    .map((skill) => skill.name)
    .sort();
  if (skipGlobal) {
    return {
      inspected: false,
      status: "skipped",
      expected: expected.length,
      installed: null,
      missing: [],
      extraCount: null,
      roots: [],
      note: "Skipped installed/global skill roots because installed-runtime and live Codex CLI probes are disabled."
    };
  }
  const roots = [
    path.join(options.codexHome, "skills"),
    path.join(options.agentsHome, "skills")
  ];
  const expectedSet = new Set(expected);
  const actual = new Set();
  const rootCounts = [];
  for (const skillRoot of roots) {
    let count = 0;
    if (!fs.existsSync(skillRoot)) {
      rootCounts.push({ path: redact(skillRoot), exists: false, count });
      continue;
    }
    for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) actual.add(entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) count += 1;
    }
    rootCounts.push({ path: redact(skillRoot), exists: true, count });
  }
  const missing = expected.filter((skill) => !actual.has(skill));
  const extraCount = [...actual].filter((skill) => !expectedSet.has(skill)).length;
  return {
    inspected: true,
    expected: expected.length,
    installed: actual.size,
    missing,
    extraCount,
    roots: rootCounts
  };
}

function inspectRoutingBoard() {
  const catalog = readJson("catalog/routing-profiles.json");
  const profiles = catalog.profiles || [];
  return {
    inspected: true,
    sourcePolicy: catalog.sourcePolicy,
    profileCount: profiles.length,
    profileIds: profiles.map((profile) => profile.id),
    requiredSurfaces: {
      agents: [...new Set(profiles.flatMap((profile) => profile.agents || []))].sort(),
      skills: [...new Set(profiles.flatMap((profile) => profile.skills || []))].sort(),
      mcp: [...new Set(profiles.flatMap((profile) => profile.mcp || []))].sort(),
      flags: [...new Set(profiles.flatMap((profile) => profile.flags || []))].sort(),
      delegationModes: [...new Set(profiles.map((profile) => profile.delegationMode))].sort(),
      skillModes: [...new Set(profiles.map((profile) => profile.skillMode))].sort(),
      mcpModes: [...new Set(profiles.map((profile) => profile.mcpMode))].sort()
    },
    boundary: "Routing profiles name visible prompt-shape matched specialists, but subagent spawning still requires the current runtime to permit delegation; destructive, credentialed, publishing, deployment, database, broad filesystem, and broad/destructive graph-indexing actions remain approval-gated."
  };
}

function inspectMcpSetupBoard() {
  const catalog = readJson("catalog/mcp-servers.json");
  const servers = catalog.servers || [];
  const enabled = servers.filter((server) => server.defaultEnabled === true);
  const disabled = servers.filter((server) => server.defaultEnabled !== true);
  const setupRequired = servers.filter((server) => server.setupKind !== "none" && (server.setupKind !== "local-state" || server.name === "codebase-memory"));

  return {
    inspected: true,
    sourcePolicy: catalog.sourcePolicy,
    evidenceBoundary: {
      catalog: "cataloged in catalog/mcp-servers.json",
      installedConfig: "configured only after templates or installed config are inspected",
      live: "verified only after /mcp or `codex mcp list --json` succeeds",
      sessionVisible: "visible in the active Codex session only through /mcp or equivalent live tooling"
    },
    serverCount: servers.length,
    enabledByDefault: enabled.map((server) => server.name),
    disabledByDefault: disabled.map((server) => server.name),
    setupRequiredCount: setupRequired.length,
    tierCounts: servers.reduce((counts, server) => {
      const tier = server.auth !== "none"
        ? "account-gated"
        : server.defaultEnabled === true
          ? "balanced-default"
          : server.transport === "stdio"
            ? "local-optional"
            : "network-optional";
      counts[tier] = (counts[tier] || 0) + 1;
      return counts;
    }, {}),
    servers: servers.map((server) => ({
      name: server.name,
      category: server.category,
      enabledByDefault: server.defaultEnabled === true,
      auth: server.auth,
      approval: server.approval,
      risk: server.risk,
      setupKind: server.setupKind,
      setupHint: server.setupHint,
      defaultReason: server.defaultReason,
      evidenceState: {
        cataloged: true,
        installedConfig: "not_inferred_from_catalog",
        liveCodexMcpList: "not_checked_here",
        sessionVisible: "not_checked_here"
      },
      capabilityState: {
        tier: server.auth !== "none"
          ? "account-gated"
          : server.defaultEnabled === true
            ? "balanced-default"
            : server.transport === "stdio"
              ? "local-optional"
              : "network-optional",
        effective: server.defaultEnabled === true ? "available_unverified" : "disabled_by_default",
        reasonCode: server.defaultEnabled === true ? "balanced_default" : "opt_in_or_profile_required"
      },
      rollback: "Set enabled=false for the connector in Codex config and restart Codex."
    }))
  };
}

function inspectEffectiveControls(skipInstalled = false) {
  const config = skipInstalled ? readTemplateConfig() : readInstalledOrTemplateConfig();
  const text = config.text;
  const tokenSafeTarget = {
    reasoningEffort: "low",
    reasoningSummary: "none",
    verbosity: "low",
    autoCompactTokenLimit: 64000,
    toolOutputTokenLimit: 6000
  };
  const contextBudget = {
    reasoningEffort: readTomlValue(text, "model_reasoning_effort"),
    reasoningSummary: readTomlValue(text, "model_reasoning_summary"),
    verbosity: readTomlValue(text, "model_verbosity"),
    autoCompactTokenLimit: readTomlValue(text, "model_auto_compact_token_limit"),
    toolOutputTokenLimit: readTomlValue(text, "tool_output_token_limit"),
    tokenSafeProfileAvailable: fs.existsSync(path.join(root, "templates", "codex", "profiles", "token-safe.config.toml")),
    tokenSafeTarget,
    longRunningRecommendation: "For repo-wide or long-running work, run Codex with --profile token-safe or merge token-safe.config.toml; this lowers verbosity, default reasoning, compaction, and tool-output ceilings without disabling skills, agents, MCPs, memory, hooks, or apps."
  };
  contextBudget.tokenSafeProfileActive = contextBudget.reasoningEffort === tokenSafeTarget.reasoningEffort
    && contextBudget.reasoningSummary === tokenSafeTarget.reasoningSummary
    && contextBudget.verbosity === tokenSafeTarget.verbosity
    && contextBudget.autoCompactTokenLimit === tokenSafeTarget.autoCompactTokenLimit
    && contextBudget.toolOutputTokenLimit === tokenSafeTarget.toolOutputTokenLimit;
  const managedHooks = skipInstalled
    ? null
    : fs.existsSync(path.join(options.codexHome, "hooks"))
    ? fs.readdirSync(path.join(options.codexHome, "hooks"), { withFileTypes: true }).filter((entry) => entry.isFile()).length
    : 0;

  return {
    inspected: true,
    configSource: config.source,
    configPath: config.path,
    approvalPolicy: readTomlValue(text, "approval_policy"),
    sandboxMode: readTomlValue(text, "sandbox_mode"),
    workspaceNetwork: readTomlValue(text, "sandbox_workspace_write.network_access"),
    features: {
      apps: readTomlValue(text, "features.apps"),
      memories: readTomlValue(text, "features.memories"),
      hooks: readTomlValue(text, "features.hooks"),
      multiAgent: readTomlValue(text, "features.multi_agent")
    },
    agents: {
      maxThreads: readTomlValue(text, "agents.max_threads"),
      maxDepth: readTomlValue(text, "agents.max_depth")
    },
    contextBudget,
    appsDefault: {
      enabled: readTomlValue(text, "apps._default.enabled"),
      destructiveEnabled: readTomlValue(text, "apps._default.destructive_enabled"),
      openWorldEnabled: readTomlValue(text, "apps._default.open_world_enabled")
    },
    managedHooks,
    hookNote: skipInstalled
      ? "Repo-only mode reports template controls and does not inspect installed hooks."
      : managedHooks === 0
      ? "Codex Chef enables hooks support but ships no lifecycle hook files; inspect /hooks before relying on user or project hooks."
      : "Managed hook files are present; inspect them before release-sensitive work."
  };
}

function parseJsonCommand(command, commandArgs, label, extra = {}) {
  progress(`running ${label} (timeout ${Math.round((extra.timeout || 120000) / 1000)}s)`);
  const result = run(command, commandArgs, { timeout: extra.timeout || 120000, env: extra.env || process.env });
  const output = redact([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
  if (result.error) {
    return {
      inspected: false,
      status: "attention",
      label,
      exitCode: null,
      summary: `${label} could not run: ${result.error.message}`,
      outputPreview: null
    };
  }
  if (result.status !== 0) {
    return {
      inspected: true,
      status: "attention",
      label,
      exitCode: result.status,
      summary: `${label} exited ${result.status}.`,
      outputPreview: output.split(/\r?\n/).slice(0, 6)
    };
  }
  try {
    return {
      inspected: true,
      status: "ok",
      label,
      exitCode: result.status,
      parsed: JSON.parse(result.stdout || "{}")
    };
  } catch (error) {
    return {
      inspected: true,
      status: "attention",
      label,
      exitCode: result.status,
      summary: `${label} did not emit parseable JSON: ${error.message}`,
      outputPreview: output.split(/\r?\n/).slice(0, 6)
    };
  }
}

function parseTextCommand(command, commandArgs, label, extra = {}) {
  progress(`running ${label} (timeout ${Math.round((extra.timeout || 120000) / 1000)}s)`);
  const result = run(command, commandArgs, { timeout: extra.timeout || 120000, env: extra.env || process.env });
  const output = redact([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
  if (result.error) {
    return {
      inspected: false,
      status: "attention",
      label,
      exitCode: null,
      summary: `${label} could not run: ${result.error.message}`,
      outputPreview: null
    };
  }
  return {
    inspected: true,
    status: result.status === 0 ? "ok" : "attention",
    label,
    exitCode: result.status,
    outputPreview: output.split(/\r?\n/).filter(Boolean).slice(0, 6)
  };
}

function mcpEntriesFromParsed(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.servers)) return parsed.servers;
  if (Array.isArray(parsed?.mcp_servers)) return parsed.mcp_servers;
  if (parsed?.servers && typeof parsed.servers === "object") {
    return Object.entries(parsed.servers).map(([id, value]) => ({
      id,
      ...(value && typeof value === "object" ? value : { value })
    }));
  }
  if (parsed?.mcp_servers && typeof parsed.mcp_servers === "object") {
    return Object.entries(parsed.mcp_servers).map(([id, value]) => ({
      id,
      ...(value && typeof value === "object" ? value : { value })
    }));
  }
  return [];
}

function inspectCodexCliRuntime() {
  if (options.skipCodexCli) {
    return {
      inspected: false,
      status: "skipped",
      target: {
        codexHome: redact(options.codexHome),
        agentsHome: redact(options.agentsHome)
      },
      version: { inspected: false, status: "skipped", exitCode: null, outputPreview: [] },
      login: { inspected: false, status: "skipped", exitCode: null, outputPreview: [] },
      mcp: {
        inspected: false,
        status: "skipped",
        exitCode: null,
        configuredCount: 0,
        enabledCount: 0,
        disabledCount: 0,
        configuredServers: [],
        states: [],
        outputPreview: null
      },
      ambient: {
        inspected: false,
        relationshipToTarget: "skipped",
        codexHomeEnv: process.env.CODEX_HOME ? redact(process.env.CODEX_HOME) : null,
        version: { inspected: false, status: "skipped", exitCode: null, outputPreview: [] },
        login: { inspected: false, status: "skipped", exitCode: null, outputPreview: [] },
        mcp: {
          inspected: false,
          status: "skipped",
          exitCode: null,
          configuredCount: 0,
          enabledCount: 0,
          disabledCount: 0,
          configuredServers: [],
          states: [],
          outputPreview: null
        }
      },
      issues: [],
      note: "Skipped by --skip-codex-cli; this also skips live `codex mcp list --json` evidence."
    };
  }

  function inspectWithEnv(env, labelPrefix) {
    const version = parseTextCommand(codexCommand(), ["--strict-config", "--version"], `${labelPrefix} codex --strict-config --version`, { env });
    const login = parseTextCommand(codexCommand(), ["login", "status"], `${labelPrefix} codex login status`, { env });
    const mcp = parseJsonCommand(codexCommand(), ["mcp", "list", "--json"], `${labelPrefix} codex mcp list --json`, { env });
    const mcpEntries = mcpEntriesFromParsed(mcp.parsed);
    const mcpNames = mcpEntries
      .map((server) => server.name || server.id)
      .filter(Boolean)
      .sort();
    const mcpStates = mcpEntries
      .map((server) => ({
        name: server.name || server.id,
        enabled: server.enabled !== false,
        disabledReason: typeof server.disabled_reason === "string" ? server.disabled_reason : null,
        authStatus: typeof server.auth_status === "string" ? server.auth_status : null
      }))
      .filter((server) => Boolean(server.name))
      .sort((left, right) => left.name.localeCompare(right.name));

    return { version, login, mcp, mcpNames, mcpStates };
  }

  const targetEnv = { ...process.env, CODEX_HOME: options.codexHome };
  const targetProbe = inspectWithEnv(targetEnv, "target");
  const ambientProbe = inspectWithEnv(process.env, "ambient");
  const { version, login, mcp, mcpNames, mcpStates } = targetProbe;
  const ambientMcpNames = ambientProbe.mcpNames;
  const ambientMcpStates = ambientProbe.mcpStates;
  const ambientMcpStatesSameAsTarget = ambientMcpStates.length === mcpStates.length
    && ambientMcpStates.every((server, index) => {
      const targetServer = mcpStates[index];
      return server.name === targetServer?.name
        && server.enabled === targetServer.enabled
        && server.disabledReason === targetServer.disabledReason
        && server.authStatus === targetServer.authStatus;
    });
  const ambientSameAsTarget = ambientProbe.login.status === login.status
    && ambientMcpNames.length === mcpNames.length
    && ambientMcpNames.every((name, index) => name === mcpNames[index])
    && ambientMcpStatesSameAsTarget;
  const ambientRelationship = ambientProbe.login.inspected || ambientProbe.mcp.inspected
    ? (ambientSameAsTarget ? "same" : "different")
    : "unknown";

  const ambientWarnings = ambientRelationship === "different"
    ? ["Ambient Codex CLI status differs from the explicit Codex Chef target; restart Codex or set CODEX_HOME for direct shell diagnostics."]
    : [];
  const issues = [
    ...(version.status === "ok" ? [] : [version.summary || `${version.label} needs attention.`]),
    ...(login.status === "ok" ? [] : ["Codex login is not confirmed by `codex login status`; refresh auth outside repo files if needed."]),
    ...(mcp.status === "ok" ? [] : [mcp.summary || "`codex mcp list --json` needs attention."])
  ];

  return {
    inspected: true,
    status: issues.length === 0 ? "ok" : "attention",
    target: {
      codexHome: redact(options.codexHome),
      agentsHome: redact(options.agentsHome)
    },
    version,
    login: {
      inspected: login.inspected,
      status: login.status,
      exitCode: login.exitCode,
      outputPreview: login.outputPreview
    },
    mcp: {
      inspected: mcp.inspected,
      status: mcp.status,
      exitCode: mcp.exitCode,
      configuredCount: mcpNames.length,
      enabledCount: mcpStates.filter((server) => server.enabled).length,
      disabledCount: mcpStates.filter((server) => !server.enabled).length,
      configuredServers: mcpNames,
      states: mcpStates,
      outputPreview: mcp.outputPreview || null
    },
    ambient: {
      inspected: true,
      relationshipToTarget: ambientRelationship,
      codexHomeEnv: process.env.CODEX_HOME ? redact(process.env.CODEX_HOME) : null,
      version: {
        inspected: ambientProbe.version.inspected,
        status: ambientProbe.version.status,
        exitCode: ambientProbe.version.exitCode,
        outputPreview: ambientProbe.version.outputPreview
      },
      login: {
        inspected: ambientProbe.login.inspected,
        status: ambientProbe.login.status,
        exitCode: ambientProbe.login.exitCode,
        outputPreview: ambientProbe.login.outputPreview
      },
      mcp: {
        inspected: ambientProbe.mcp.inspected,
        status: ambientProbe.mcp.status,
        exitCode: ambientProbe.mcp.exitCode,
        configuredCount: ambientMcpNames.length,
        enabledCount: ambientMcpStates.filter((server) => server.enabled).length,
        disabledCount: ambientMcpStates.filter((server) => !server.enabled).length,
        configuredServers: ambientMcpNames,
        states: ambientMcpStates,
        outputPreview: ambientProbe.mcp.outputPreview || null
      }
    },
    issues,
    ambientWarnings,
    note: "Auth and MCP status use official Codex CLI commands; this script does not read auth.json, keyrings, OAuth caches, or token values."
  };
}

function inspectCliQuickStart() {
  return {
    inspected: true,
    interactiveMenu: "npm run chef",
    numberedActions: true,
    readOnlyCommands: [
      "npm run chef -- --status",
      "npm run chef -- --status --repo-only",
      "npm run chef -- --doctor",
      "npm run chef -- --preview",
      "npm run chef -- --update",
      "npm run chef -- --diagnostics",
      "npm run chef:diagnostics",
      "npm run chef -- --skills",
      "npm run chef -- --mcp",
      "npm run chef -- --auth",
      "npm run chef -- --logs",
      "npm run codex:status",
      "npm run codex:status:all"
    ],
    writeActionsRequireApply: [
      "npm run chef -- --install --apply",
      "npm run chef -- --update --apply",
      "npm run chef -- --reset --apply",
      "npm run chef -- --repair --apply",
      "npm run chef -- --skills --apply"
    ],
    auditMode: "npm run chef -- --status --repo-only --no-log",
    plainOutput: "npm run chef -- --plain",
    boundary: "Update, install, reset, repair, selected skill install, publish, deploy, credential, database, and destructive work still require explicit approval or --apply where supported."
  };
}

function inspectGitRepository() {
  const result = run("git", ["status", "--short"], { timeout: 30000 });
  const output = redact([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
  if (result.error) {
    return {
      inspected: true,
      status: "attention",
      issueId: "git.unavailable",
      summary: `git status could not run: ${result.error.message}`,
      dirtyLineCount: null,
      outputPreview: null
    };
  }

  if (result.status !== 0) {
    const safeDirectory = /dubious ownership|safe\.directory/i.test(output);
    return {
      inspected: true,
      status: safeDirectory ? "attention" : "fail",
      issueId: safeDirectory ? "git.safe_directory" : "git.status_failed",
      summary: safeDirectory
        ? "Git refuses this checkout because Windows ownership differs from the current user."
        : `git status --short exited ${result.status}.`,
      remediation: safeDirectory
        ? `If you trust this checkout, run: git config --global --add safe.directory ${redact(root)}`
        : "Read the git status stderr and fix the repository state before release or push work.",
      dirtyLineCount: null,
      outputPreview: output.split(/\r?\n/).slice(0, 4)
    };
  }

  const worktree = classifyGitStatus(result.stdout);
  const summary = summarizeGitStatus(result.stdout);
  return {
    inspected: true,
    status: summary.status,
    issueId: null,
    summary: summary.summary,
    dirtyLineCount: summary.dirtyLineCount,
    untrackedCount: summary.untrackedCount,
    untrackedOnly: summary.untrackedOnly,
    outputPreview: worktree.dirty ? result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 8) : []
  };
}

function inspectRepoCliLog(logFile) {
  return {
    contentInspected: false,
    note: "Content is not inspected by status because command logs can contain local context."
  };
}

function inspectLogSummary(skipCodexLogs = false) {
  const repoLogDir = path.join(root, "tmp", "chef-cli", "logs");
  const repoCliLogs = listRecentFiles(repoLogDir, [".log"], 12);
  repoCliLogs.recent = repoCliLogs.recent.map((entry) => ({
    ...entry,
    ...inspectRepoCliLog(path.join(repoLogDir, entry.name))
  }));

  const config = skipCodexLogs ? null : readInstalledOrTemplateConfig();
  const configuredLogDir = config ? readTomlValue(config.text, "log_dir") : null;
  const codexLogDir = config ? expandUserPath(configuredLogDir, path.join(options.codexHome, "log")) : null;
  const codexLogs = skipCodexLogs ? { exists: false, recent: [] } : listRecentFiles(codexLogDir, [".log", ".jsonl"], 8);

  return {
    inspected: true,
    repoCliLogs: {
      path: redact(repoLogDir),
      exists: repoCliLogs.exists,
      recent: repoCliLogs.recent,
      contentInspected: false,
      note: "Repo-local Chef CLI logs are generated by this wrapper and have command output redacted."
    },
    codexLogs: {
      inspected: !skipCodexLogs,
      path: codexLogDir ? redact(codexLogDir) : null,
      configSource: config?.source || "skipped",
      exists: codexLogs.exists,
      recent: codexLogs.recent,
      contentInspected: false,
      note: skipCodexLogs
        ? "Skipped Codex log metadata because installed-runtime and live Codex CLI probes are disabled."
        : "Codex log contents are not read here because they can contain prompts or local context; this status only reports file metadata."
    }
  };
}

function summarizeCodexDoctor() {
  if (options.skipCodexDoctorChecks) {
    return { inspected: false, status: "skipped", note: "Skipped by --skip-codex-doctor-checks." };
  }

  const doctorEnv = { ...process.env, CODEX_HOME: options.codexHome };

  function inspectOnce() {
    const result = run(codexCommand(), ["doctor", "--json"], {
      env: doctorEnv,
      timeout: 120000
    });
    if (result.error) {
      return {
        inspected: false,
        status: "attention",
        failures: [],
        warnings: [`codex doctor --json could not run: ${result.error.message}`]
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(result.stdout || "{}");
    } catch (error) {
      return {
        inspected: false,
        status: "attention",
        failures: [],
        warnings: [`codex doctor --json did not emit parseable JSON: ${error.message}`]
      };
    }

    const checks = Object.values(parsed.checks || {});
    const counts = { ok: 0, warning: 0, fail: 0, other: 0 };
    for (const check of checks) {
      if (check.status === "ok") counts.ok += 1;
      else if (check.status === "warning") counts.warning += 1;
      else if (check.status === "fail") counts.fail += 1;
      else counts.other += 1;
    }

    const failedChecks = checks
      .filter((check) => check.status === "fail")
      .map((check) => ({
        id: check.id,
        summary: check.summary,
        remediation: check.remediation || null
      }));
    const warningChecks = checks
      .filter((check) => check.status === "warning")
      .map((check) => ({
        id: check.id,
        summary: check.summary,
        remediation: check.remediation || null
      }));
    const nonBlockingWarningIds = new Set(["network.websocket_reachability"]);
    const blockingWarningChecks = warningChecks.filter((check) => !nonBlockingWarningIds.has(check.id));
    const nonBlockingWarningChecks = warningChecks.filter((check) => nonBlockingWarningIds.has(check.id));
    const exitIssue = result.status === 0
      ? null
      : `codex doctor --json exited ${result.status} despite emitting parseable JSON.`;

    return {
      inspected: true,
      status: exitIssue || counts.fail > 0 || blockingWarningChecks.length > 0 ? "attention" : "ok",
      exitCode: result.status,
      exitIssue,
      overallStatus: parsed.overallStatus || null,
      codexVersion: parsed.codexVersion || null,
      counts,
      failedChecks: redactDeep(failedChecks),
      warningChecks: redactDeep(warningChecks),
      blockingWarningChecks: redactDeep(blockingWarningChecks),
      nonBlockingWarningChecks: redactDeep(nonBlockingWarningChecks)
    };
  }

  const first = inspectOnce();
  const retryableIds = new Set(["network.provider_reachability", "mcp.config"]);
  const shouldRetry = [
    ...(first.failedChecks || []),
    ...(first.warningChecks || [])
  ].some((check) => retryableIds.has(check.id));
  if (!shouldRetry) return first;

  const second = inspectOnce();
  if (!second.inspected) return first;
  const firstScore = (first.counts?.fail || 0) * 10 + (first.counts?.warning || 0);
  const secondScore = (second.counts?.fail || 0) * 10 + (second.counts?.warning || 0);
  if (secondScore < firstScore) {
    return {
      ...second,
      retried: true,
      retryReason: "Transient provider reachability or MCP config doctor result improved on retry."
    };
  }
  return first;
}

function summarizeSkillContext(runtimeReport, skillInventory) {
  const runtimeSkills = runtimeReport?.skills || {};
  const skills = runtimeSkills.inspected ? runtimeSkills : skillInventory;
  const installed = skills.inspected ? skills.installed : null;
  const curatedExpected = skills.expected || 0;
  const status = installed !== null && installed > Math.max(50, curatedExpected * 2) ? "attention" : "ok";
  const warningLikely = status === "attention";

  return {
    status,
    installed,
    curatedExpected,
    warningLikely,
    documentedBudget: "Codex caps the initial skills list at roughly 2% of the model context window, or 8,000 characters when the context window is unknown.",
    impact: warningLikely
      ? "Skill descriptions may be shortened in the initial list; selected skills still load their full SKILL.md instructions."
      : skills.inspected === false
        ? "Installed skill count was not inspected in repo-only mode; use npm run codex:status for runtime skill pressure."
        : "Installed skill count is unlikely to pressure the initial skills list.",
    recommendation: warningLikely
      ? "Disable only unused or duplicate skill sources when implicit discovery feels noisy; explicit invocation remains available only through an enabled copy."
      : skills.inspected === false
        ? "No action needed for repo-only audits."
        : "No action needed."
  };
}

function writeOutput(report) {
  if (!options.output) return;

  const outputPath = path.resolve(root, options.output);
  const relative = path.relative(root, outputPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write status report outside repository: ${options.output}`);
  }
  const segments = relative.split(path.sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new Error(`Refusing to write status report through linked path: ${options.output}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      break;
    }
  }
  if (fs.existsSync(outputPath) && !options.forceOutput) {
    throw new Error(`Refusing to overwrite existing report without --force-output: ${options.output}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const finalStat = fs.existsSync(outputPath) ? fs.lstatSync(outputPath) : null;
  if (finalStat?.isSymbolicLink()) {
    throw new Error(`Refusing to write status report through linked path: ${options.output}`);
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

const repoDoctor = runNodeScript(
  "scripts/codex-doctor.mjs",
  ["--json", ...(options.redactPaths ? ["--redact-paths"] : [])],
  "repo:doctor"
);

const runtime = options.skipRuntime
  ? { inspected: false, status: "skipped", report: null, failures: [], note: "Skipped by --skip-runtime." }
  : runNodeScript(
      "scripts/verify-install-runtime.mjs",
      [
        "--json",
        ...(options.redactPaths ? ["--redact-paths"] : []),
        "--codex-home",
        options.codexHome,
        "--agents-home",
        options.agentsHome,
        ...(options.expectSkills ? ["--expect-skills"] : []),
        ...(options.expectGitGuards ? ["--expect-git-guards"] : []),
        "--skip-doctor-probe",
        "--no-mcp-probe"
      ],
      "verify:install:runtime",
      { timeout: RUNTIME_VERIFY_TIMEOUT_MS }
    );

const codexDoctor = summarizeCodexDoctor();
const skipGlobalMetadata = skipInstalledRuntimeAndCliMetadata();
const skillInventory = inspectSkillInventory(skipGlobalMetadata);
const skillsContext = summarizeSkillContext(runtime.report, skillInventory);
const routingBoard = inspectRoutingBoard();
const mcpSetupBoard = inspectMcpSetupBoard();
const effectiveControls = inspectEffectiveControls(skipGlobalMetadata);
const codexCliRuntime = inspectCodexCliRuntime();
const cliQuickStart = inspectCliQuickStart();
const gitRepository = inspectGitRepository();
const logSummary = inspectLogSummary(skipGlobalMetadata);

function classifyRuntimeInstallState(runtimeReport) {
  if (!runtimeReport) return options.skipRuntime ? "skipped" : "unknown";
  const managed = runtimeReport.managedFiles || {};
  const expected = Number(managed.expected || 0);
  const matched = Number(managed.matched || 0);
  const missing = Number(managed.missing || 0);
  const mismatched = Number(managed.mismatched || 0);
  if (expected > 0 && matched === 0 && missing >= Math.max(1, expected - mismatched)) return "not_installed";
  if (expected > 0 && matched < expected) return "drift";
  return runtimeReport.status === "ok" ? "installed" : "attention";
}

const runtimeInstallState = classifyRuntimeInstallState(runtime.report);
const runtimeFailures = runtimeInstallState === "not_installed"
  ? ["runtime: Codex Chef is not installed at the target Codex home; run `npm run chef -- --preview --no-log` before install or `npm run chef -- --install --apply` when ready."]
  : runtime.failures.map((failure) => `runtime: ${failure}`);

const failures = [
  ...repoDoctor.failures.map((failure) => `repo: ${failure}`),
  ...runtimeFailures
];
const warnings = [
  ...(runtime.report?.warnings || []),
  ...(codexDoctor.warnings || []),
  ...(codexCliRuntime.ambientWarnings || [])
];
const nonBlockingWarningPatterns = [
  "Ambient Codex runtime home differs",
  "Ambient Codex CLI status differs"
];
const attentionWarnings = warnings.filter((warning) => {
  const text = String(warning || "");
  return !nonBlockingWarningPatterns.some((pattern) => text.includes(pattern));
});

const attentionReasons = [
  ...attentionWarnings,
  ...(skillsContext.status === "attention" ? [skillsContext.impact] : []),
  ...(codexCliRuntime.status === "attention" ? codexCliRuntime.issues : []),
  ...(gitRepository.status === "ok" ? [] : [gitRepository.summary]),
  ...(codexDoctor.status === "attention"
    ? [
        codexDoctor.exitIssue
          || `codex doctor checks need attention: ${codexDoctor.counts?.fail || 0} fail, ${codexDoctor.counts?.warning || 0} warning`
      ]
    : [])
];

const status = failures.length > 0
  ? "fail"
  : attentionReasons.length > 0
    ? "attention"
    : "ok";

const report = {
  schemaVersion: "codex-chef.status.v1",
  generatedAt: new Date().toISOString(),
  status,
  repoDoctor,
  runtime,
  runtimeInstallState,
  codexDoctor,
  codexCliRuntime,
  skillInventory,
  skillsContext,
  routingBoard,
  mcpSetupBoard,
  effectiveControls,
  cliQuickStart,
  gitRepository,
  logSummary,
  warnings,
  attentionReasons,
  failures,
  nextActions: status === "fail"
    ? (runtimeInstallState === "not_installed"
        ? ["Run npm run chef -- --preview --no-log to inspect the install plan, then run npm run chef -- --install --apply when ready."]
        : ["Run npm run repair:install -- --apply to repair managed runtime drift, then rerun npm run codex:status."])
    : attentionReasons.length > 0
      ? ["Review attention items; they do not necessarily mean Codex Chef install is broken."]
      : ["No action needed."]
};

writeOutput(report);

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  if (!progressEnabled) console.log(localText("Codex Chef status", "Codex Chef durumu"));
  console.log(`${localText("Overall", "Genel")}: ${stateText(report.status)}`);
  if (options.details) {
    console.log(`${localText("Use", "Kullanım")}: ${cliQuickStart.interactiveMenu} (${localText("or", "veya")} ${cliQuickStart.auditMode} ${localText("for no repo-local log", "repo-local log istemiyorsanız")})`);
    console.log(`${localText("Numbered menu", "Numaralı menü")}: ${cliQuickStart.numberedActions ? localText("yes", "evet") : localText("no", "hayır")}; ${localText("write actions require --apply or typed confirmation", "yazan işlemler --apply veya yazılı onay ister")}.`);
    console.log(`${localText("Target Codex home", "Hedef Codex home")}: ${codexCliRuntime.target.codexHome}`);
    const ambientMcpText = codexCliRuntime.ambient.mcp.inspected === false
      ? localText("MCP skipped", "MCP atlandı")
      : `MCP ${codexCliRuntime.ambient.mcp.configuredCount} (${codexCliRuntime.ambient.mcp.enabledCount} ${localText("on", "açık")}/${codexCliRuntime.ambient.mcp.disabledCount} ${localText("off", "kapalı")})`;
    console.log(
      `${localText("Ambient Codex", "Ortam Codex")}: ${stateText(codexCliRuntime.ambient.relationshipToTarget)} (login ${stateText(codexCliRuntime.ambient.login.status)}, ${ambientMcpText}; CODEX_HOME env ${codexCliRuntime.ambient.codexHomeEnv || localText("unset", "atanmamış")})`
    );
  }
  console.log(`${localText("Repo Git", "Repo Git")}: ${stateText(gitRepository.status)} - ${translateStatusMessage(gitRepository.summary)}`);
  if (gitRepository.remediation) console.log(`${localText("Repo Git remediation", "Repo Git önerisi")}: ${translateStatusMessage(gitRepository.remediation)}`);
  const runtimeMcpAmbiguous = runtime.report?.runtime?.mcpList?.ambiguous === true;
  const targetMcpText = runtimeMcpAmbiguous
    ? localText("MCP visibility ambiguous in this package-runner process", "bu package-runner sürecinde MCP görünürlüğü belirsiz")
    : codexCliRuntime.mcp.inspected === false
    ? localText("MCP probe skipped", "MCP kontrolü atlandı")
    : localText(
        `MCP configured ${codexCliRuntime.mcp.configuredCount}, enabled ${codexCliRuntime.mcp.enabledCount}, disabled ${codexCliRuntime.mcp.disabledCount}, live not probed`,
        `MCP yapılandırılmış ${codexCliRuntime.mcp.configuredCount}, açık ${codexCliRuntime.mcp.enabledCount}, kapalı ${codexCliRuntime.mcp.disabledCount}, canlı durum ölçülmedi`
      );
  if (runtimeMcpAmbiguous) {
    const expectedMcp = Number(runtime.report?.installed?.mcp?.expected || mcpSetupBoard.serverCount);
    console.log(`${localText("MCP", "MCP")}: ${localText(
      `runtime visibility ambiguous; ${expectedMcp}/${mcpSetupBoard.serverCount} cataloged entries are present in the managed installed config; verify with codex mcp list --json outside the package runner`,
      `runtime görünürlüğü belirsiz; yönetilen kurulu config'te ${expectedMcp}/${mcpSetupBoard.serverCount} katalog girdisi mevcut; package runner dışında codex mcp list --json ile doğrulayın`
    )}`);
  } else if (codexCliRuntime.mcp.inspected === false) {
    console.log(`${localText("MCP", "MCP")}: ${stateText("skipped")}`);
  } else {
    const catalogNames = new Set(mcpSetupBoard.servers.map((server) => server.name));
    const configuredStates = codexCliRuntime.mcp.states || [];
    const expectedPresent = configuredStates.filter((server) => catalogNames.has(server.name)).length;
    const userAdded = configuredStates.filter((server) => !catalogNames.has(server.name)).length;
    const expectedMissing = Math.max(0, mcpSetupBoard.serverCount - expectedPresent);
    console.log(`${localText("MCP", "MCP")}: ${localText(
      `${expectedPresent}/${mcpSetupBoard.serverCount} cataloged configured, ${expectedMissing} missing, ${userAdded} user-added; ${codexCliRuntime.mcp.enabledCount} enabled/${codexCliRuntime.mcp.disabledCount} disabled; live not probed`,
      `${expectedPresent}/${mcpSetupBoard.serverCount} katalog bağlayıcısı yapılandırılmış, ${expectedMissing} eksik, ${userAdded} kullanıcı ekledi; ${codexCliRuntime.mcp.enabledCount} açık/${codexCliRuntime.mcp.disabledCount} kapalı; canlı durum ölçülmedi`
    )}`);
  }
  console.log(
    codexCliRuntime.mcp.inspected === false
      ? `Codex CLI: ${stateText(codexCliRuntime.status)} (strict config ${stateText(codexCliRuntime.version.status)}, login ${stateText(codexCliRuntime.login.status)}, ${targetMcpText})`
      : `Codex CLI: ${stateText(codexCliRuntime.status)} (strict config ${stateText(codexCliRuntime.version.status)}, login ${stateText(codexCliRuntime.login.status)}, MCP ${stateText(codexCliRuntime.mcp.status)}; ${targetMcpText})`
  );
  if (options.details) {
    for (const server of codexCliRuntime.mcp.states || []) {
      const state = server.enabled ? "ON" : "OFF";
      const auth = server.authStatus ? `, auth=${server.authStatus}` : "";
      const reason = server.disabledReason ? `, reason=${server.disabledReason}` : "";
      console.log(`  MCP ${server.name}: ${state} [CLI CONFIG; live=not-probed${auth}${reason}]`);
    }
    console.log(
      `${localText("Logs", "Loglar")}: Chef ${logSummary.repoCliLogs.recent.length} ${localText("recent metadata record(s), content not inspected", "son metadata kaydı, içerik incelenmedi")}; ${logSummary.codexLogs.inspected === false ? localText("Codex skipped", "Codex atlandı") : `Codex ${logSummary.codexLogs.recent.length} ${localText("recent metadata record(s), content not inspected", "son metadata kaydı, içerik incelenmedi")}`}`
    );
    if (repoDoctor.report) {
      console.log(
        `${localText("Repo starter", "Repo starter")}: ${stateText(repoDoctor.status)} (${repoDoctor.report.agents?.count || 0} agents, ${repoDoctor.report.mcp?.count || 0} MCP, ${repoDoctor.report.docs?.baseGuides || 0} docs x ${repoDoctor.report.docs?.languages || 0})`
      );
    } else {
      console.log(`${localText("Repo starter", "Repo starter")}: ${stateText(repoDoctor.status)}`);
    }
  }
  if (runtime.report) {
    const installed = runtime.report.installed || {};
    const managed = runtime.report.managedFiles || {};
    const expectedMcp = Number(installed.mcp?.expected || 0);
    const missingMcp = Array.isArray(installed.mcp?.missing) ? installed.mcp.missing.length : 0;
    const expectedMcpPresent = Math.max(0, expectedMcp - missingMcp);
    const userAddedMcp = Math.max(0, Number(installed.mcp?.installed || 0) - expectedMcpPresent);
    const mcpRuntimeText = localText(
      `${expectedMcpPresent}/${expectedMcp} expected present${userAddedMcp > 0 ? ` + ${userAddedMcp} user-added` : ""}`,
      `${expectedMcpPresent}/${expectedMcp} beklenen hazır${userAddedMcp > 0 ? ` + ${userAddedMcp} kullanıcı ekledi` : ""}`
    );
    console.log(
      `${localText("Installed runtime", "Kurulu ortam")}: ${stateText(runtime.status)}/${stateText(runtimeInstallState)} (agents ${installed.agents?.installed || 0}/${installed.agents?.expected || 0}, MCP ${mcpRuntimeText}, ${localText("managed files", "yönetilen dosyalar")} ${managed.matched || 0}/${managed.expected || 0})`
    );
    if (runtime.report.skills?.inspected) {
      console.log(
        `${localText("Skills", "Skill'ler")}: ${runtime.report.skills.installed} ${localText("installed", "kurulu")}, ${runtime.report.skills.missing.length} ${localText("missing from curated set", "curated set içinde eksik")}`
      );
    }
  } else {
    const runtimeText = runtime.status === "skipped"
      ? localText("skipped by this mode", "bu modda atlandı")
      : `${runtime.status}/${runtimeInstallState}`;
    console.log(`${localText("Installed runtime", "Kurulu ortam")}: ${runtimeText}`);
  }
  if (!runtime.report?.skills?.inspected && skillInventory.inspected) {
    console.log(`${localText("Skills", "Skill'ler")}: ${skillInventory.installed} ${localText("total installed across global roots", "global köklerde toplam kurulu")} (${skillInventory.expected} Codex Chef managed, ${skillInventory.missing.length} ${localText("missing", "eksik")}, ${skillInventory.extraCount} ${localText("other/user-installed", "diğer/kullanıcı kurulu")})`);
  } else if (!runtime.report?.skills?.inspected && skillInventory.inspected === false) {
    console.log(`${localText("Skills", "Skill'ler")}: ${localText("skipped", "atlandı")} (${translateStatusMessage(skillInventory.note)})`);
  }
  if (options.details) {
    const skillsInstalledText = skillsContext.installed === null || skillsContext.installed === undefined
      ? localText("installed not inspected", "kurulu skill sayısı kontrol edilmedi")
      : `${skillsContext.installed} ${localText("installed", "kurulu")}`;
    console.log(`${localText("Skills context", "Skill context")}: ${stateText(skillsContext.status)} (${skillsInstalledText}; curated baseline ${skillsContext.curatedExpected})`);
    console.log(
      `${localText("Enterprise routing", "Enterprise yönlendirme")}: ${routingBoard.profileCount} profiles (agents ${routingBoard.requiredSurfaces.agents.length}, skills ${routingBoard.requiredSurfaces.skills.length}, MCP ${routingBoard.requiredSurfaces.mcp.length}, flags/checks ${routingBoard.requiredSurfaces.flags.length})`
    );
    console.log(
      `${localText("Routing modes", "Yönlendirme modları")}: delegation=${humanList(routingBoard.requiredSurfaces.delegationModes, "delegationMode")}, skills=${humanList(routingBoard.requiredSurfaces.skillModes, "skillMode")}, MCP=${humanList(routingBoard.requiredSurfaces.mcpModes, "mcpMode")}`
    );
    console.log(
      `${localText("MCP quick view", "MCP hızlı görünüm")}: ${localText("ready", "hazır")}=${mcpSetupBoard.enabledByDefault.join(", ") || localText("not configured", "yapılandırılmadı")}, opt-in=${mcpSetupBoard.disabledByDefault.join(", ") || localText("not configured", "yapılandırılmadı")}`
    );
    console.log(
      `${localText("Effective controls", "Etkin kontroller")}: multi_agent=${humanStatusValue(effectiveControls.features.multiAgent)}, max_depth=${humanStatusValue(effectiveControls.agents.maxDepth)}, approval=${humanStatusValue(effectiveControls.approvalPolicy)}, sandbox=${humanStatusValue(effectiveControls.sandboxMode)}, network=${humanStatusValue(effectiveControls.workspaceNetwork)}, hooks=${humanStatusValue(effectiveControls.features.hooks)}, managed hooks=${humanStatusValue(effectiveControls.managedHooks)}, apps default=${humanStatusValue(effectiveControls.appsDefault.enabled)}/destructive=${humanStatusValue(effectiveControls.appsDefault.destructiveEnabled)}/open_world=${humanStatusValue(effectiveControls.appsDefault.openWorldEnabled)}`
    );
    console.log(
      `${localText("Context budget", "Context bütçesi")}: reasoning=${humanStatusValue(effectiveControls.contextBudget.reasoningEffort)}, summary=${humanStatusValue(effectiveControls.contextBudget.reasoningSummary)}, verbosity=${humanStatusValue(effectiveControls.contextBudget.verbosity)}, compact=${humanStatusValue(effectiveControls.contextBudget.autoCompactTokenLimit)}, tool_output=${humanStatusValue(effectiveControls.contextBudget.toolOutputTokenLimit)}`
    );
    const tokenSafeTarget = effectiveControls.contextBudget.tokenSafeTarget || {};
    const tokenSafeTargetText = `${tokenSafeTarget.reasoningEffort}/${tokenSafeTarget.reasoningSummary}/${tokenSafeTarget.verbosity}/${tokenSafeTarget.autoCompactTokenLimit}/${tokenSafeTarget.toolOutputTokenLimit}`;
    console.log(`${localText("Token-safe profile", "Token-safe profil")}: available=${effectiveControls.contextBudget.tokenSafeProfileAvailable ? "yes" : "no"}, active=${effectiveControls.contextBudget.tokenSafeProfileActive ? "yes" : "no"}, target=${tokenSafeTargetText}. ${translateStatusMessage(effectiveControls.contextBudget.longRunningRecommendation)}`);
    console.log(
      `${localText("MCP setup", "MCP kurulumu")}: ${mcpSetupBoard.serverCount} ${localText("servers", "sunucu")} (${mcpSetupBoard.enabledByDefault.length} ${localText("enabled", "açık")}, ${mcpSetupBoard.disabledByDefault.length} ${localText("disabled", "kapalı")}, ${mcpSetupBoard.setupRequiredCount} ${localText("with setup notes", "kurulum notlu")})`
    );
    console.log(`${localText("MCP capability tiers", "MCP yetenek katmanları")}: balanced-default=${mcpSetupBoard.tierCounts["balanced-default"] || 0}, local-optional=${mcpSetupBoard.tierCounts["local-optional"] || 0}, network-optional=${mcpSetupBoard.tierCounts["network-optional"] || 0}, account-gated=${mcpSetupBoard.tierCounts["account-gated"] || 0}. ${localText("Catalog/config/live states remain distinct.", "Katalog/config/canlı durumları ayrı tutulur.")}`);
    for (const server of mcpSetupBoard.servers.filter((item) => item.setupKind !== "none" && (item.setupKind !== "local-state" || item.name === "codebase-memory"))) {
      console.log(`${localText("MCP setup note", "MCP kurulum notu")}: ${server.name} [${server.setupKind}] - ${translateSetupHint(server.setupHint)}`);
    }
  }
  if (codexDoctor.inspected) {
    console.log(
      `${localText("Codex doctor checks", "Codex doctor kontrolleri")}: ${stateText(codexDoctor.status)} (${codexDoctor.counts.ok} ok, ${codexDoctor.counts.fail} fail, ${codexDoctor.counts.warning} warning)`
    );
  } else {
    console.log(`${localText("Codex doctor checks", "Codex doctor kontrolleri")}: ${stateText(codexDoctor.status)}`);
  }
  for (const warning of warnings) console.log(`${localText("Warning", "Uyarı")}: ${translateStatusMessage(warning)}`);
  if (skillsContext.status === "attention") console.log(`${localText("Attention", "Dikkat")}: ${translateStatusMessage(skillsContext.impact)}`);
  for (const check of codexDoctor.failedChecks || []) console.log(`${localText("Attention", "Dikkat")}: ${check.id} - ${translateStatusMessage(check.summary)}`);
  for (const check of codexDoctor.blockingWarningChecks || codexDoctor.warningChecks || []) console.log(`${localText("Attention", "Dikkat")}: ${check.id} - ${translateStatusMessage(check.summary)}`);
  for (const check of codexDoctor.nonBlockingWarningChecks || []) console.log(`${localText("Warning", "Uyarı")}: ${check.id} - ${translateStatusMessage(check.summary)}`);
  for (const failure of failures) console.error(`${localText("Failure", "Hata")}: ${translateStatusMessage(failure)}`);
  for (const [index, action] of report.nextActions.entries()) {
    console.log(`${index === 0 ? localText("Next action", "Sonraki adım") : "  "}: ${translateNextAction(action)}`);
  }
  if (!options.details) {
    const detailsCommand = options.skipRuntime
      ? "npm run chef -- --status --repo-only --details --no-log"
      : "npm run chef -- --status --details";
    console.log(`${localText("Details", "Ayrıntılar")}: ${detailsCommand}`);
  }
  if (options.output) console.log(`${localText("Report", "Rapor")}: ${redact(path.resolve(root, options.output))}`);
}

if (status === "fail") process.exit(1);
