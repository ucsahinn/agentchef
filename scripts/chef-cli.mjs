#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  inspectPinnedSkillTarget,
  inspectSkillTree
} from "./lib/skill-provenance.mjs";
import { inspectDirectSkillTarget, markerFileName } from "./manage-direct-skill-target.mjs";
import {
  CliUsageError,
  emitCliError,
  redactCliPaths,
  sanitizeCliError
} from "./lib/cli-error-contract.mjs";
import { classifyGitStatus } from "./lib/git-worktree.mjs";
import { acquireOperationLock } from "./lib/operation-lock.mjs";
import {
  buildProcessAudit,
  terminateCleanupPlan
} from "./codex-process-hygiene.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const logRoot = path.join(root, "tmp", "chef-cli", "logs");
const args = process.argv.slice(2);

if (args[0] === "review") {
  const { runExternalReviewCli } = await import("./external-review-cli.mjs");
  process.exit(await runExternalReviewCli(args.slice(1)));
}

function normalizeLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["tr", "tr-tr", "turkish"].includes(normalized)) return "tr";
  if (["en", "en-us", "en-gb", "english"].includes(normalized)) return "en";
  return null;
}

function languageFromEnvironment() {
  return normalizeLanguage(process.env.CODEX_CHEF_LANG || process.env.CHEF_LANG) || "en";
}

function languageFromArgs(argv, fallback) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tr") return "tr";
    if (arg === "--lang") {
      const value = argv[index + 1];
      const parsed = value && !value.startsWith("-") ? normalizeLanguage(value) : null;
      if (parsed) return parsed;
    }
  }
  return fallback;
}

const options = {
  help: false,
  json: false,
  plain: false,
  noLog: false,
  repoOnly: false,
  apply: false,
  restore: false,
  deleteBackup: false,
  verbosePlan: false,
  details: false,
  cleanupStale: false,
  lang: languageFromArgs(args, languageFromEnvironment()),
  action: null,
  backupId: null,
  profile: null
};

function isTr() {
  return options.lang === "tr";
}

function localText(en, tr) {
  return isTr() ? tr : en;
}

function cliError(en, tr = en) {
  const prefix = isTr() ? "Codex Chef CLI hatasi" : "Codex Chef CLI error";
  process.exit(emitCliError({
    tool: "chef",
    error: new CliUsageError(localText(en, tr)),
    argv: args,
    root,
    prefix
  }));
}

class UserInterrupt extends Error {
  constructor() {
    super("User interrupted");
    this.name = "UserInterrupt";
    this.code = "CODEX_CHEF_USER_INTERRUPT";
  }
}

function isQuestionAbort(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

function isUserInterrupt(error) {
  return error instanceof UserInterrupt || error?.code === "CODEX_CHEF_USER_INTERRUPT";
}

function questionAbortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  return error;
}

async function normalizeQuestionAbort(task) {
  try {
    return await task();
  } catch (error) {
    if (isQuestionAbort(error)) throw new UserInterrupt();
    throw error;
  }
}

async function readQuestion(rl, prompt) {
  return normalizeQuestionAbort(() => rl.question(prompt));
}

async function askInteractive(prompt, interaction = {}) {
  if (interaction.question) return interaction.question(prompt);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readQuestion(rl, prompt);
  } finally {
    rl.close();
  }
}

const ACTION_FLAGS = new Map([
  ["--status", "status"],
  ["--doctor", "doctor"],
  ["--preview", "preview"],
  ["--update", "update"],
  ["--reset", "reset"],
  ["--repair", "repair"],
  ["--backups", "backups"],
  ["--install", "install"],
  ["--skills", "skills"],
  ["--mcp", "mcp"],
  ["--routing", "routing"],
  ["--continuity", "continuity"],
  ["--control-brain", "continuity"],
  ["--diagnostics", "diagnostics"],
  ["--diagnose", "diagnostics"],
  ["--processes", "processes"],
  ["--auth", "auth"],
  ["--logs", "logs"]
]);
const requestedActionFlags = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--help" || arg === "-h") options.help = true;
  else if (arg === "--json") options.json = true;
  else if (arg === "--lang") {
    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      cliError("--lang requires a language code (en or tr). Run npm run chef -- --help for supported commands.", "--lang dil kodu ister (en veya tr). Desteklenen komutlar için npm run chef -- --help çalıştırın.");
    }
    const parsed = normalizeLanguage(value);
    if (!parsed) {
      cliError(`Unsupported language ${value}. Supported languages: en, tr.`, `Desteklenmeyen dil ${value}. Desteklenen diller: en, tr.`);
    }
    options.lang = parsed;
    index += 1;
  }
  else if (arg === "--tr") options.lang = "tr";
  else if (arg === "--plain") options.plain = true;
  else if (arg === "--no-log") options.noLog = true;
  else if (arg === "--repo-only") options.repoOnly = true;
  else if (arg === "--apply") options.apply = true;
  else if (arg === "--restore") options.restore = true;
  else if (arg === "--delete") options.deleteBackup = true;
  else if (arg === "--verbose-plan") options.verbosePlan = true;
  else if (arg === "--details") options.details = true;
  else if (arg === "--cleanup-stale") options.cleanupStale = true;
  else if (arg === "--backup") {
    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      cliError("--backup requires a backup id. Run npm run chef -- --backups to list available backups.", "--backup bir yedek id'si ister. Uygun yedekleri listelemek için npm run chef -- --backups çalıştırın.");
    }
    options.backupId = value;
    index += 1;
  }
  else if (arg === "--profile") {
    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      cliError("--profile requires a routing profile id. Run npm run chef -- --routing to list profiles.", "--profile bir routing profile id'si ister. Profilleri listelemek için npm run chef -- --routing çalıştırın.");
    }
    options.profile = value;
    index += 1;
  }
  else if (ACTION_FLAGS.has(arg)) {
    requestedActionFlags.push(arg);
    options.action = ACTION_FLAGS.get(arg);
  }
  else {
    cliError(`Unknown option ${arg}. Run npm run chef -- --help for supported commands.`, `Bilinmeyen seçenek ${arg}. Desteklenen komutlar için npm run chef -- --help çalıştırın.`);
  }
}

if (requestedActionFlags.length > 1) {
  cliError(
    `Choose exactly one action. Received: ${requestedActionFlags.join(", ")}.`,
    `Tam olarak bir işlem seçin. Alınan seçenekler: ${requestedActionFlags.join(", ")}.`
  );
}
if (options.repoOnly && options.action && options.action !== "status") {
  cliError(
    "--repo-only can only be used with --status.",
    "--repo-only yalnızca --status ile kullanılabilir."
  );
}
if (options.profile && options.action !== "routing") {
  cliError(
    "--profile can only be used with --routing.",
    "--profile yalnızca --routing ile kullanılabilir."
  );
}
if (options.cleanupStale && options.action !== "processes") {
  cliError(
    "--cleanup-stale can only be used with --processes.",
    "--cleanup-stale yalnızca --processes ile kullanılabilir."
  );
}
if (options.apply && options.action === "processes" && !options.cleanupStale) {
  cliError(
    "--processes --apply also requires --cleanup-stale.",
    "--processes --apply ayrıca --cleanup-stale ister."
  );
}

const ASCII_ICONS = {
  chef: "[chef]",
  ok: "[ok]",
  info: "[info]",
  warn: "[warn]",
  run: "[run]",
  update: "[update]",
  lock: "[auth]",
  docs: "[docs]",
  logs: "[logs]"
};

const RICH_ICONS = {
  chef: "🍳",
  ok: "✅",
  info: "ℹ️",
  warn: "⚠️",
  run: "▶️",
  update: "⬆️",
  lock: "🔐",
  docs: "📚",
  logs: "🧾"
};

const MENU_ASCII_ICONS = {
  status: "ST",
  "status:repo-only": "RP",
  doctor: "DR",
  preview: "PV",
  update: "UP",
  install: "IN",
  reset: "RS",
  repair: "FX",
  backups: "BK",
  skills: "SK",
  mcp: "MC",
  routing: "RT",
  continuity: "CB",
  diagnostics: "DG",
  processes: "PS",
  auth: "AU",
  logs: "LG",
  language: "LN",
  exit: "QT"
};

const MENU_RICH_ICONS = {
  status: "📊",
  "status:repo-only": "📁",
  doctor: "🩺",
  preview: "👁️",
  update: "⬆️",
  install: "📦",
  reset: "♻️",
  repair: "🛠️",
  backups: "💾",
  skills: "🧠",
  mcp: "🔌",
  routing: "🧭",
  continuity: "🧩",
  diagnostics: "🔎",
  processes: "⚙️",
  auth: "🔐",
  logs: "🧾",
  language: "🌐",
  exit: "⏹️"
};

const MENU_LEGEND_SOURCE_MARKER = "Legend: SAFE | APPLY-GATED | ACCOUNT-GUIDED";

const COLOR_CODES = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m"
};

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

const ICON_COLORS = {
  chef: "cyan",
  ok: "green",
  info: "blue",
  warn: "yellow",
  run: "magenta",
  update: "green",
  lock: "yellow",
  docs: "cyan",
  logs: "dim"
};

function supportsColor() {
  if (options.plain) return false;
  if (Object.hasOwn(process.env, "NO_COLOR") && process.env.NO_COLOR !== "") return false;
  const force = String(process.env.FORCE_COLOR || "").toLowerCase();
  if (force === "0" || force === "false") return false;
  if (force || process.env.CLICOLOR_FORCE === "1") return true;
  return Boolean(process.stdout.isTTY);
}

function colorize(value, color) {
  if (!supportsColor()) return String(value);
  const code = COLOR_CODES[color];
  if (!code) return String(value);
  return `${code}${value}${COLOR_CODES.reset}`;
}

function paint(value, ...styles) {
  if (!supportsColor()) return String(value);
  const codes = styles.map((style) => COLOR_CODES[style]).filter(Boolean).join("");
  return codes ? `${codes}${value}${COLOR_CODES.reset}` : String(value);
}

function styleAction(action) {
  return paint(action, "bold", "brightCyan");
}

function styleHeading(value) {
  return paint(value, "bold", "brightCyan");
}

function styleLabel(value) {
  return colorize(value, "cyan");
}

function styleMuted(value) {
  return paint(value, "dim", "gray");
}

function stripAnsi(value) {
  return String(value).replace(ANSI_PATTERN, "");
}

function visualLength(value) {
  return stripAnsi(value).length;
}

function padVisual(value, width) {
  const text = String(value);
  const missing = width - visualLength(text);
  return missing > 0 ? `${text}${" ".repeat(missing)}` : text;
}

function truncateVisual(value, width) {
  const text = String(value ?? "");
  if (visualLength(text) <= width) return text;
  if (width <= 3) return ".".repeat(Math.max(1, width));
  const plain = stripAnsi(text);
  return `${plain.slice(0, Math.max(0, width - 3))}...`;
}

function terminalWidth() {
  const width = Number(process.stdout.columns || process.env.COLUMNS || 96);
  return Math.max(40, Math.min(120, Number.isFinite(width) ? width : 96));
}

function wrapVisual(value, width) {
  const text = stripAnsi(String(value ?? "")).trim();
  const limit = Math.max(12, Number(width) || terminalWidth());
  if (!text) return [""];
  const lines = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (word.length > limit) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let offset = 0; offset < word.length; offset += limit) {
        const chunk = word.slice(offset, offset + limit);
        if (chunk.length === limit) lines.push(chunk);
        else current = chunk;
      }
    } else if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= limit) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function printWrapped(value, { indent = "", styler = (line) => line, width = terminalWidth() } = {}) {
  const contentWidth = Math.max(12, width - visualLength(indent));
  const continuationIndent = " ".repeat(visualLength(indent));
  for (const [index, line] of wrapVisual(value, contentWidth).entries()) {
    console.log(`${index === 0 ? indent : continuationIndent}${styler(line)}`);
  }
}

function divider(title = "") {
  const width = terminalWidth();
  if (!title) return colorize("-".repeat(width), "dim");
  const text = ` ${title} `;
  const side = Math.max(3, Math.floor((width - visualLength(text)) / 2));
  const line = `${"-".repeat(side)}${text}${"-".repeat(Math.max(3, width - side - visualLength(text)))}`;
  return colorize(line, "dim");
}

function printDivider(title = "") {
  console.log(divider(title));
}

function printBrandSignature() {
  const lines = [
    "██╗   ██╗   ██████╗   ███████╗",
    "██║   ██║  ██╔════╝   ██╔════╝",
    "██║   ██║  ██║        ███████╗",
    "██║   ██║  ██║        ╚════██║",
    "╚██████╔╝  ╚██████╗   ███████║",
    " ╚═════╝    ╚═════╝   ╚══════╝"
  ];
  console.log("");
  const palette = ["brightCyan", "cyan", "brightBlue", "blue", "brightGreen", "green"];
  for (const [index, line] of lines.entries()) {
    console.log(paint(line, "bold", palette[index % palette.length]));
  }
  console.log("");
}

function writeBoundaryKind(boundary) {
  const normalized = stripAnsi(String(boundary || "")).toLowerCase();
  if (
    normalized.includes("guidance") ||
    normalized.includes("rehberi")
  ) {
    return "guidance";
  }
  if (
    normalized === "none" ||
    normalized === "read-only" ||
    normalized === "yazmaz" ||
    normalized.includes("read-only") ||
    normalized.includes("no writes") ||
    normalized.includes("yazmasiz") ||
    normalized.includes("yazmaz")
  ) {
    return "safe";
  }
  if (
    normalized.includes("optional") ||
    normalized.includes("opsiyonel")
  ) {
    return "guidance";
  }
  return "write";
}

function styleWriteBoundary(boundary) {
  const kind = writeBoundaryKind(boundary);
  if (kind === "safe") return colorize(boundary, "green");
  if (kind === "guidance") return colorize(boundary, "yellow");
  return colorize(boundary, "red");
}

function displayValue(value, column = {}) {
  if (value === undefined || value === null || value === "") return localText("Not set", "Belirtilmedi");
  const text = String(value);
  const normalized = text.trim().toLowerCase();
  const key = String(column.key || "").toLowerCase();
  const label = String(column.label || "").toLowerCase();
  const isWrites = key === "writes" || label === "writes" || label === "impact" || label === "yazar" || label === "etki";
  const isSetup = key === "setup" || label === "setup";
  const replacements = {
    none: isWrites
      ? localText("Read-only", "Yazmaz")
      : isSetup
        ? localText("No setup required", "Kurulum gerekmez")
        : localText("Not applicable", "Uygulanmaz"),
    "network optional": localText("Optional network if you install", "Kurulum seçilirse ağ kullanabilir"),
    "none/account guidance": localText("No writes; account guidance only", "Yazmaz; yalnız hesap rehberi"),
    "none/global with --restore --apply": localText("No writes here; restore/delete needs --apply", "Bu ekranda yazmaz; geri yükleme/silme --apply ister"),
    "none without --apply": localText("No writes until --apply", "--apply yoksa yazmaz"),
    "ready_by_default": localText("Ready by default", "Varsayılan hazır"),
    "disabled_by_default": localText("Disabled by default", "Varsayılan kapalı"),
    "configured_unverified": localText("Configured, not live-checked", "Config var, canlı kontrol yok"),
    "not_checked": localText("Not live-checked", "Canlı kontrol yok"),
    "yes": localText("Yes", "Evet"),
    "no": localText("No", "Hayır"),
    "missing": localText("Missing", "Eksik"),
    "present": localText("Present", "Var"),
    "skipped": localText("Skipped", "Atlandı")
  };
  return replacements[normalized] || text;
}

function makeIcons() {
  const source = supportsColor() ? RICH_ICONS : ASCII_ICONS;
  return Object.fromEntries(
    Object.entries(source).map(([name, icon]) => [name, colorize(icon, ICON_COLORS[name])])
  );
}

const ICONS = makeIcons();
let lastActionSummary = null;

const MENU_ITEMS = [
  {
    id: "status",
    label: "System status",
    writes: "No writes",
    description: "Check installed runtime, repo health, login, MCP, skills, and logs."
  },
  {
    id: "status:repo-only",
    label: "Repo health",
    writes: "No writes",
    description: "Fast local checks without touching installed runtime or Codex CLI probes."
  },
  {
    id: "doctor",
    label: "Full checkup",
    writes: "No writes",
    description: "Run repo doctor plus installed-runtime expectation checks."
  },
  {
    id: "preview",
    label: "Install preview",
    writes: "No writes",
    description: "Show the install plan and platform dry run before changing anything."
  },
  {
    id: "update",
    label: "Update Codex Chef",
    writes: "Typed confirmation: repo/global/network",
    description: "Check, confirm, fast-forward, validate, and refresh managed files in one flow."
  },
  {
    id: "install",
    label: "Full install",
    writes: "Typed confirmation: global/network",
    description: "Install managed Codex files and curated skills after explicit approval."
  },
  {
    id: "reset",
    label: "Refresh setup",
    writes: "Typed confirmation: global/network",
    description: "Reinstall managed files from a backup-backed force refresh."
  },
  {
    id: "repair",
    label: "Repair setup",
    writes: "Typed confirmation: global",
    description: "Fix managed-file drift after backing up anything that changes."
  },
  {
    id: "backups",
    label: "Backups",
    writes: "Restore/delete: typed confirmation",
    description: "Choose a backup, inspect it, then restore or delete in the same session."
  },
  {
    id: "skills",
    label: "Skill status & catalog",
    writes: "Install: typed confirmation",
    description: "See all Chef-managed, upstream, bundled, and user skills; install a selected upstream skill with confirmation."
  },
  {
    id: "mcp",
    label: "MCP connectors",
    writes: "No writes; account guidance only",
    description: "Review default MCPs, disabled account connectors, and setup notes."
  },
  {
    id: "routing",
    label: "Routing guide",
    writes: "No writes",
    description: "Show how task shapes map to agents, skills, MCPs, and wait policy."
  },
  {
    id: "diagnostics",
    label: "Diagnostics hub",
    writes: "No writes",
    description: "Collect safe evidence commands, log metadata, backups, and cleanup notes."
  },
  {
    id: "processes",
    label: "Process audit",
    writes: "Read-only unless stale cleanup is explicitly applied",
    description: "Trace Codex-owned local MCP trees, separate unrelated runtimes, and preview exact stale cleanup."
  },
  {
    id: "auth",
    label: "Auth notes",
    writes: "No writes; account guidance only",
    description: "Show public-safe GitHub auth boundaries and read-only verification notes."
  },
  {
    id: "logs",
    label: "Recent logs",
    writes: "No writes",
    description: "List recent Chef log metadata without printing raw log contents."
  },
  {
    id: "continuity",
    label: "Control & Brain",
    writes: "No writes",
    description: "Show when Control routing activates, whether its MCP is configured, and whether Brain has an explicit vault target."
  },
  {
    id: "language",
    label: "Language",
    writes: "No writes",
    description: "Switch the interactive CLI between English and Turkish."
  },
  {
    id: "exit",
    label: "Exit",
    writes: "No writes",
    description: "Close the operator board."
  }
];

const MENU_GROUPS = [
  {
    id: "system",
    label: "System dashboard",
    labelTr: "Sistem paneli",
    description: "Runtime, repository, login, skills, MCP, and health evidence.",
    descriptionTr: "Çalışma ortamı, repo, oturum, skill, MCP ve sağlık kanıtları.",
    itemIds: ["status"]
  },
  {
    id: "setup",
    label: "Setup & update",
    labelTr: "Kurulum ve güncelleme",
    description: "Preview first. Update an existing setup, install once, repair drift, and use force refresh only as recovery.",
    descriptionTr: "Önce ön izle. Mevcut kurulumu güncelle, ilk kez kur, drift'i onar; zorunlu yenilemeyi yalnız kurtarma için kullan.",
    itemIds: ["preview", "update", "install", "reset", "repair"]
  },
  {
    id: "capabilities",
    label: "Capabilities",
    labelTr: "Yetenekler",
    description: "Curated skills, MCP connectors, and routing ownership.",
    descriptionTr: "Seçili skill'ler, MCP bağlayıcıları ve yönlendirme sahipliği.",
    itemIds: ["skills", "mcp", "routing", "continuity"]
  },
  {
    id: "recovery",
    label: "Recovery & evidence",
    labelTr: "Kurtarma ve kanıt",
    description: "Backups, diagnostics, process evidence, and safe log metadata.",
    descriptionTr: "Yedekler, tanılama, süreç kanıtı ve güvenli log bilgisi.",
    itemIds: ["backups", "diagnostics", "processes", "logs"]
  },
  {
    id: "repository",
    label: "Repository checks",
    labelTr: "Repo kontrolleri",
    description: "Fast local repository health and the full validation suite.",
    descriptionTr: "Hızlı yerel repo sağlığı ve tam doğrulama paketi.",
    itemIds: ["status:repo-only", "doctor"]
  },
  {
    id: "account",
    label: "Account & preferences",
    labelTr: "Hesap ve tercihler",
    description: "Public-safe authentication guidance and language preference.",
    descriptionTr: "Public-safe kimlik rehberi ve dil tercihi.",
    itemIds: ["auth", "language"]
  }
];

const GROUP_VISUALS = [
  { icon: "◉", color: "brightGreen" },
  { icon: "◆", color: "brightMagenta" },
  { icon: "✦", color: "brightCyan" },
  { icon: "◇", color: "brightBlue" },
  { icon: "✓", color: "brightGreen" },
  { icon: "●", color: "brightYellow" }
];

function groupVisual(group) {
  const index = Math.max(0, MENU_GROUPS.findIndex((candidate) => candidate.id === group.id));
  return GROUP_VISUALS[index % GROUP_VISUALS.length];
}

function statusBadge(label, kind = "safe") {
  const color = kind === "write"
    ? "brightRed"
    : kind === "guidance"
      ? "brightYellow"
      : "brightGreen";
  return paint(`[ ${label} ]`, "bold", color);
}

function menuImportance(item) {
  const levels = {
    status: localText("ESSENTIAL", "TEMEL"),
    "status:repo-only": localText("QUICK CHECK", "HIZLI KONTROL"),
    doctor: localText("DEEP CHECK", "DERİN KONTROL"),
    preview: localText("START HERE", "BURADAN BAŞLA"),
    update: localText("RECOMMENDED", "ÖNERİLEN"),
    install: localText("FIRST SETUP", "İLK KURULUM"),
    reset: localText("ADVANCED", "İLERİ SEVİYE"),
    repair: localText("DRIFT FIX", "DRIFT ONARIMI"),
    backups: localText("RECOVERY", "KURTARMA"),
    skills: localText("OPTIONAL", "İSTEĞE BAĞLI"),
    mcp: localText("CAPABILITY", "YETENEK"),
    routing: localText("GUIDANCE", "REHBER"),
    diagnostics: localText("EVIDENCE", "KANIT"),
    processes: localText("EVIDENCE", "KANIT"),
    auth: localText("GUIDANCE", "REHBER"),
    logs: localText("HISTORY", "GEÇMİŞ"),
    continuity: localText("CONTINUITY", "SÜREKLİLİK"),
    language: localText("PREFERENCE", "TERCİH"),
    exit: localText("SESSION", "OTURUM")
  };
  return levels[item.id] || localText("UTILITY", "ARAÇ");
}

function importanceBadge(item) {
  const color = item.id === "reset"
    ? "brightRed"
    : ["update", "preview", "repair"].includes(item.id)
      ? "brightMagenta"
      : menuItemColor(item);
  return paint(`[ ${menuImportance(item)} ]`, "bold", color);
}

function printChoiceRow(index, label, detail = "", color = "brightCyan", icon = "›") {
  if (!supportsColor()) {
    console.log(`${index}. ${label}${detail ? ` - ${detail}` : ""}`);
    return;
  }
  console.log(`${paint(String(index).padStart(2, "0"), "bold", color)} ${paint(icon, "bold", color)} ${paint(label, "bold", "white")}`);
  if (detail) console.log(`   ${paint("└─", color)} ${styleMuted(detail)}`);
}

const MENU_TEXT_TR = {
  status: {
    label: "Sistem durumu",
    description: "Kurulu çalışma ortamını, repo sağlığını, oturumu, MCP'leri, skill'leri ve logları kontrol eder.",
    writes: "Yazmaz"
  },
  "status:repo-only": {
    label: "Repo sağlığı",
    description: "Kurulu ortam veya Codex CLI probu olmadan hızlı yerel kontroller yapar.",
    writes: "Yazmaz"
  },
  doctor: {
    label: "Tam kontrol",
    description: "Repo doctor ve kurulu çalışma ortamı beklentilerini birlikte çalıştırır.",
    writes: "Yazmaz"
  },
  preview: {
    label: "Kurulum ön izlemesi",
    description: "Herhangi bir değişiklik yapmadan kurulum planını ve platform provasını gösterir.",
    writes: "Yazmaz"
  },
  update: {
    label: "Codex Chef'i güncelle",
    description: "Kontrol, onay, Git fast-forward, doğrulama ve yönetilen dosya yenilemeyi tek akışta tamamlar.",
    writes: "Yazılı onay: repo/global/ağ"
  },
  install: {
    label: "Tam kurulum",
    description: "Açık onaydan sonra yönetilen Codex dosyalarını ve seçili skill'leri kurar.",
    writes: "Yazılı onay: global/ağ"
  },
  reset: {
    label: "Kurulumu yenile",
    description: "Yedekli yenileme ile yönetilen dosyaları yeniden kurar.",
    writes: "Yazılı onay: global/ağ"
  },
  repair: {
    label: "Kurulumu onar",
    description: "Değişecek dosyaları yedekleyip yönetilen dosya farklarını onarır.",
    writes: "Yazılı onay: global"
  },
  backups: {
    label: "Yedekler",
    description: "Yedeği seçer ve inceler; geri yükleme veya silmeyi aynı oturumda onayla tamamlar.",
    writes: "Geri yükleme/silme: yazılı onay"
  },
  skills: {
    label: "Skill durumu ve katalog",
    description: "Chef yönetimli, upstream, bundled ve kullanıcı skill'lerini gösterir; seçilen upstream skill'i onayla kurar.",
    writes: "Kurulum: yazılı onay"
  },
  mcp: {
    label: "MCP bağlayıcıları",
    description: "Varsayılan MCP'leri, kapalı hesap bağlayıcılarını ve kurulum notlarını gösterir.",
    writes: "Yazmaz; yalnız hesap rehberi"
  },
  routing: {
    label: "Yönlendirme rehberi",
    description: "Görev tiplerinin agent, skill, MCP ve bekleme politikasına nasıl bağlandığını gösterir.",
    writes: "Yazmaz"
  },
  diagnostics: {
    label: "Tanılama merkezi",
    description: "Güvenli kanıt komutlarını, log bilgisini, yedekleri ve temizlik notlarını toplar.",
    writes: "Yazmaz"
  },
  processes: {
    label: "Süreç denetimi",
    description: "Codex'e ait yerel MCP ağaçlarını izler, ilgisiz runtime'ları ayırır ve tam hedefli eski süreç temizliğini önizler.",
    writes: "Açık stale cleanup uygulanmadıkça yazmaz"
  },
  auth: {
    label: "Kimlik notlari",
    description: "Public-safe GitHub kimlik sınırlarını ve yazmasız doğrulama notlarını gösterir.",
    writes: "Yazmaz; yalnız hesap rehberi"
  },
  logs: {
    label: "Son loglar",
    description: "Ham log içeriğini basmadan son Chef log bilgisini listeler.",
    writes: "Yazmaz"
  },
  continuity: {
    label: "Control ve Brain",
    description: "Control yönlendirmesinin ne zaman açıldığını, MCP yapılandırmasını ve Brain için açık vault hedefi olup olmadığını gösterir.",
    writes: "Yazmaz"
  },
  language: {
    label: "Dil",
    description: "İnteraktif CLI dilini Türkçe ve İngilizce arasında değiştirir.",
    writes: "Yazmaz"
  },
  exit: {
    label: "Çıkış",
    description: "Operatör panelini kapat.",
    writes: "Yazmaz"
  }
};

function menuLabel(item) {
  return isTr() ? MENU_TEXT_TR[item.id]?.label || item.label : item.label;
}

function menuDescription(item) {
  return isTr() ? MENU_TEXT_TR[item.id]?.description || item.description : item.description;
}

function menuWrites(item) {
  return isTr() ? MENU_TEXT_TR[item.id]?.writes || item.writes : item.writes;
}

function menuGroups() {
  return MENU_GROUPS.map((group) => ({
    ...group,
    labelText: isTr() ? group.labelTr : group.label,
    items: group.itemIds
      .map((id) => MENU_ITEMS.find((item) => item.id === id))
      .filter(Boolean)
  })).filter((group) => group.items.length > 0);
}

function menuItemNumber(item) {
  return MENU_ITEMS.findIndex((candidate) => candidate.id === item.id) + 1;
}

function menuItemColor(item) {
  const colors = {
    status: "brightGreen",
    "status:repo-only": "brightGreen",
    doctor: "brightGreen",
    preview: "brightBlue",
    update: "brightMagenta",
    install: "brightCyan",
    reset: "brightYellow",
    repair: "brightYellow",
    backups: "brightBlue",
    skills: "brightMagenta",
    mcp: "brightCyan",
    routing: "brightBlue",
    continuity: "brightMagenta",
    diagnostics: "brightGreen",
    processes: "brightCyan",
    auth: "brightYellow",
    logs: "brightBlue",
    language: "brightMagenta",
    exit: "gray"
  };
  return colors[item.id] || "brightCyan";
}

function menuIcon(item) {
  const icons = supportsColor() ? MENU_RICH_ICONS : MENU_ASCII_ICONS;
  return icons[item.id] || "--";
}

function tableBorder(widths) {
  return colorize(`+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`, supportsColor() ? "blue" : "dim");
}

function tableRow(cells, widths, muted = false) {
  const row = cells.map((cell, index) => ` ${padVisual(truncateVisual(cell, widths[index]), widths[index])} `).join("|");
  const line = `|${row}|`;
  return muted ? styleMuted(line) : line;
}

function printSurfaceHeader(title, subtitle = "", icon = ICONS.info, accent = "brightCyan") {
  console.log("");
  if (supportsColor()) {
    const width = Math.max(28, Math.min(terminalWidth(), 92));
    const titleText = truncateVisual(
      ` ${stripAnsi(icon)}  ${stripAnsi(title)} `,
      Math.max(4, width - 5)
    );
    const remainder = Math.max(2, width - visualLength(titleText) - 3);
    console.log(paint(`╭─${titleText}${"─".repeat(remainder)}╮`, "bold", accent));
    if (subtitle) {
      for (const line of wrapVisual(subtitle, width - 2)) {
        console.log(`${paint("│", accent)} ${paint(line, "white")}`);
      }
    }
    console.log(paint(`╰${"─".repeat(width - 2)}╯`, accent));
    return;
  }
  const rawTitle = String(title || "");
  const dividerTitle = isTr()
    ? rawTitle.toLocaleUpperCase("tr-TR").replace(/\bSKİLL\b/g, "SKILL")
    : rawTitle.toUpperCase();
  printDivider(dividerTitle);
  console.log(`${icon} ${styleHeading(title)}`);
  if (subtitle) printWrapped(subtitle, { styler: styleMuted });
}

function printSurfaceNote(label, value) {
  const marker = supportsColor() ? `${paint("◆", "brightBlue")} ` : "";
  printWrapped(`${stripAnsi(marker)}${label}: ${stripAnsi(value)}`, {
    styler: styleMuted
  });
}

function operatorPrompt(upperBound = MENU_ITEMS.length, canGoBack = false) {
  if (!supportsColor()) {
    return `\n${styleLabel(localText(`Choose action 1-${upperBound}`, `İşlem seç 1-${upperBound}`))}${styleMuted(localText(" / l language / q quit:", " / l dil / q çıkış:"))} `;
  }
  const shortcuts = canGoBack
    ? localText(" / b back / l language / q quit:", " / b geri / l dil / q çıkış:")
    : localText(" / l language / q quit:", " / l dil / q çıkış:");
  return `\n${paint("›", "bold", "brightMagenta")} ${styleLabel(localText(`Choose 1-${upperBound}`, `1-${upperBound} seç`))}${styleMuted(shortcuts)} `;
}

function printOperatorStatusStrip() {
  const head = gitHead();
  const commit = head.ok && head.value ? head.value.slice(0, 7) : localText("unknown", "bilinmiyor");
  const legendLabel = isTr() ? "Lejant" : MENU_LEGEND_SOURCE_MARKER.split(":")[0];
  printWrapped(`${localText("Mode", "Mod")}: ${localText("Local operator", "Yerel operatör")} | ${localText("Version", "Versiyon")}: ${currentPackageVersion()} | Git: ${gitBranch()}@${commit}`);
  printWrapped(`${localText("Safety", "Güvenlik")}: ${localText("menu writes use typed confirmation; direct CLI writes require --apply", "menüde yazan işlemler yazılı onay; doğrudan CLI işlemleri --apply ister")}`);
  printWrapped(`${legendLabel}: SAFE=${localText("read-only", "yazmaz")} | APPLY-GATED=${localText("backup/confirmation required", "yedek/onay gerekir")} | ACCOUNT-GUIDED=${localText("guidance only", "yalnız rehberlik")}`);
  if (lastActionSummary) {
    const color = lastActionSummary.ok ? "brightGreen" : lastActionSummary.skipped ? "brightYellow" : "brightRed";
    const duration = Number.isFinite(lastActionSummary.elapsedMs) ? ` | ${lastActionSummary.elapsedMs} ms` : "";
    printWrapped(`${localText("Last action", "Son işlem")}: ${lastActionSummary.label} | ${lastActionSummary.status}${duration}`, {
      styler: (line) => paint(line, color)
    });
  }
}

function printStackedMenu(width) {
  const indent = "     ";
  for (const group of menuGroups()) {
    console.log("");
    console.log(styleHeading(group.labelText));
    for (const item of group.items) {
      const number = `${menuItemNumber(item)}.`;
      const icon = colorize(menuIcon(item), menuItemColor(item));
      const label = colorize(menuLabel(item), menuItemColor(item));
      console.log(`${padVisual(number, 4)} ${icon} ${label}`);
      console.log(`${indent}${styleLabel(localText("Impact", "Etki"))}: ${styleWriteBoundary(menuWrites(item))}`);
      printWrapped(menuDescription(item), { indent, styler: styleMuted, width });
    }
  }
}

function printTableMenu(width) {
  const iconWidth = Math.max(localText("Icon", "Ikon").length, ...MENU_ITEMS.map((item) => visualLength(menuIcon(item))));
  const numberWidth = Math.max(String(MENU_ITEMS.length).length + 1, 2);
  const labelWidth = Math.min(
    Math.max(...MENU_ITEMS.map((item) => menuLabel(item).length), localText("Action", "Islem").length),
    22
  );
  const desiredWritesWidth = Math.min(
    Math.max(...MENU_ITEMS.map((item) => menuWrites(item).length), localText("Impact", "Etki").length),
    40
  );
  const minPurposeWidth = 20;
  const tableOverhead = 16;
  const fixedWithoutWrites = iconWidth + numberWidth + labelWidth + tableOverhead;
  const writesWidth = Math.max(
    localText("Impact", "Etki").length,
    Math.min(desiredWritesWidth, width - fixedWithoutWrites - minPurposeWidth)
  );
  const purposeWidth = Math.max(minPurposeWidth, width - fixedWithoutWrites - writesWidth);
  const widths = [iconWidth, numberWidth, labelWidth, writesWidth, purposeWidth];
  for (const group of menuGroups()) {
    console.log("");
    console.log(styleHeading(group.labelText));
    console.log(tableBorder(widths));
    console.log(tableRow([
      styleMuted(localText("Icon", "Ikon")),
      styleMuted("#"),
      styleMuted(localText("Action", "Islem")),
      styleMuted(localText("Impact", "Etki")),
      styleMuted(localText("What it does", "Ne yapar"))
    ], widths));
    console.log(tableBorder(widths));
    for (const item of group.items) {
      const icon = colorize(menuIcon(item), menuItemColor(item));
      const number = `${menuItemNumber(item)}.`;
      const label = colorize(truncateVisual(menuLabel(item), labelWidth), menuItemColor(item));
      const writes = styleWriteBoundary(truncateVisual(menuWrites(item), writesWidth));
      const purpose = styleMuted(truncateVisual(menuDescription(item), purposeWidth));
      console.log(tableRow([icon, number, label, writes, purpose], widths));
    }
    console.log(tableBorder(widths));
  }
}

function printHelpText(value) {
  const width = terminalWidth();
  for (const rawLine of String(value).split(/\r?\n/)) {
    if (visualLength(rawLine) <= width) {
      console.log(rawLine);
      continue;
    }
    const optionLine = /^(\s{2}--\S+(?:\s+\S+)?)(\s{2,})(.+)$/.exec(rawLine);
    if (optionLine) {
      const prefix = `${optionLine[1]}${optionLine[2]}`;
      const continuation = " ".repeat(visualLength(prefix));
      const wrapped = wrapVisual(optionLine[3], width - visualLength(prefix));
      wrapped.forEach((line, index) => console.log(`${index === 0 ? prefix : continuation}${line}`));
      continue;
    }
    const indent = rawLine.match(/^\s*/)?.[0] || "";
    for (const line of wrapVisual(rawLine.trim(), width - visualLength(indent))) {
      console.log(`${indent}${line}`);
    }
  }
}

function printHelp() {
  if (isTr()) {
    printHelpText(`${colorize("Codex Chef CLI", "cyan")}

Kullanım:
  npm run chef
  npm run chef -- --status --repo-only
  npm run chef -- --preview
  npm run chef -- --diagnostics

Komut kısayolları:
  Yazmasız ekranlar: --status, --doctor, --preview, --skills, --mcp, --routing, --continuity/--control-brain, --diagnostics, --processes, --auth, --logs
  Onaylı yazan işlemler: --update [--apply], --reset [--apply], --repair [--apply], --install [--apply], --processes --cleanup-stale --apply
  Süreç temizliği: --processes --cleanup-stale [--apply]; --apply olmadan yalnız önizleme
  Yedekler: --backups [--backup ID] [--restore|--delete --apply]
  Yönlendirme profili: --routing --profile starter-health
  Ayrıntılı preview kanıtı: --preview --verbose-plan

Seçenekler:
  --json          Desteklenen yerlerde JSON çıktı verir
  --lang tr       Operatör metinlerini Türkçe yapar (en veya tr)
  --tr           --lang tr kısa yolu
  --plain        İkon yerine ASCII etiketleri kullanır
  --no-log       Sıkı audit için repo-local CLI log dosyası oluşturmaz
  --repo-only    Status için kurulu runtime, global skill kökleri, Codex logları ve Codex CLI problarını atlar
  --profile ID   --routing ile tek routing profilini gösterir
  --diagnose     --diagnostics kısa yolu
  --control-brain --continuity kısa yolu
  --backup ID    Belirli Codex Chef yedek arşivini inceler veya geri yükler
  --restore      --backup ID için geri yükleme preview'i; dosya kopyalamak için --apply ekle
  --delete       --backup ID için silme preview'i; arşivi silmek için --apply ekle
  --verbose-plan Preview ekranlarında tam install dry-run kanıtını basar
  --details      Özet ekranlarda tam tablo ve kanıt ayrıntılarını gösterir
  --cleanup-stale Süresi dolmuş, aktif Codex sahibi olmayan yerel MCP ağaçlarını önizler
  --apply        Update, install, reset, repair, seçili skill install veya açık stale-process temizliği için write action izni verir
  --help         Bu yardımı gösterir

Ekranlar:
  Sistem durumu, Repo sağlığı, Tam kontrol, Kurulum ön izlemesi, Codex Chef'i güncelle,
  Tam kurulum, Kurulumu yenile, Kurulumu onar, Yedekler, Skill kataloğu,
  MCP bağlayıcıları, Yönlendirme rehberi, Control ve Brain, Tanılama merkezi, Süreç denetimi,
  Kimlik notları, Son loglar

Detay:
  README hızlı yolu gösterir; tam CLI referansı docs/install.tr.md içindedir.

Loglar:
  tmp/chef-cli/logs
`);
    return;
  }
  printHelpText(`${colorize("Codex Chef CLI", "cyan")}

Usage:
  npm run chef
  npm run chef -- --status --repo-only
  npm run chef -- --preview
  npm run chef -- --diagnostics

Reference actions:
  Read-only: --status, --doctor, --preview, --skills, --mcp, --routing, --continuity/--control-brain, --diagnostics, --processes, --auth, --logs
  Write gated: --update [--apply], --reset [--apply], --repair [--apply], --install [--apply], --processes --cleanup-stale --apply
  Process cleanup: --processes --cleanup-stale [--apply]; preview-only without --apply
  Backups: --backups [--backup ID] [--restore|--delete --apply]
  Routing: --routing --profile starter-health
  Verbose preview: --preview --verbose-plan

Operator screens:
  System status, Repo health, Full checkup, Install preview, Update Codex Chef,
  Full install, Refresh setup, Repair setup, Backups, Skill status & catalog,
  MCP connectors, Routing guide, Control & Brain, Diagnostics hub, Process audit,
  Auth notes, Recent logs

Options:
  --json          Emit JSON where supported
  --lang tr       Localize operator-facing wrapper text (en or tr)
  --tr           Shortcut for --lang tr
  --plain        Use ASCII labels instead of icons
  --no-log       Do not create repo-local CLI log files for strict audits
  --repo-only    Skip installed runtime, global skill roots, Codex logs, and Codex CLI probes for status
  --profile ID   Show one routing profile when used with --routing
  --diagnose     Alias for --diagnostics
  --control-brain Alias for --continuity
  --backup ID    Inspect or restore a specific Codex Chef backup archive
  --restore      Preview restore for --backup ID; add --apply to copy files back
  --delete       Preview deletion for --backup ID; add --apply to remove the archive
  --verbose-plan Print the full install dry-run evidence for preview screens
  --details      Show full tables and evidence on summary screens
  --cleanup-stale Preview expired local MCP trees that have no active Codex owner
  --apply        Allow write actions for update, install, reset, repair, selected skill install, or explicit stale-process cleanup
  --help         Show this help

Details:
  README shows the short path; the full CLI reference lives in docs/install.md.

Logs:
  tmp/chef-cli/logs
`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function ensureLogRoot() {
  fs.mkdirSync(logRoot, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function makeLogPath(action) {
  if (options.noLog) return null;
  ensureLogRoot();
  return path.join(logRoot, `${timestamp()}-${action}.log`);
}

function commandForDisplay(command, commandArgs) {
  return [command, ...commandArgs].join(" ");
}

function redactLocalPaths(output) {
  return redactCliPaths(output, { root });
}

function redactSensitiveOutput(output) {
  return redactLocalPaths(output)
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/xox[baprs]-[A-Za-z0-9-]{20,}/g, "[REDACTED_SLACK_TOKEN]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(?:api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["']?[^"'\s]{12,}/gi, (match) => {
      const key = match.split(/[:=]/)[0].trim();
      return `${key}=[REDACTED_SECRET]`;
    })
    .replace(/\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s"'`]+/gi, "[REDACTED_CONNECTION_STRING]")
    .replace(/\bSUPABASE_DB_URL\s*=\s*[^\s"'`]+/gi, "SUPABASE_DB_URL=[REDACTED_CONNECTION_STRING]");
}

function runLoggedCommand(action, command, commandArgs, extra = {}) {
  const logPath = makeLogPath(action);
  const executable = process.platform === "win32" && command.endsWith(".cmd") ? "cmd.exe" : command;
  const argsForSpawn = process.platform === "win32" && command.endsWith(".cmd")
    ? ["/d", "/s", "/c", command, ...commandArgs]
    : commandArgs;
  const startedAt = new Date().toISOString();
  const header = [
    `Codex Chef CLI log`,
    `action=${action}`,
    `startedAt=${startedAt}`,
    `cwd=${redactLocalPaths(root)}`,
    `command=${commandForDisplay(command, commandArgs)}`,
    ""
  ].join("\n");
  if (logPath) fs.appendFileSync(logPath, header, "utf8");
  const startedMs = Date.now();
  if (!options.json && !extra.quiet) {
    console.log(`${ICONS.run} [----------]   0% RUNNING  ${action}`);
    printWrapped(commandForDisplay(command, commandArgs), { indent: `${ICONS.run} ` });
  }
  if (extra.waitNote && !options.json && !extra.quiet) {
    printWrapped(extra.waitNote, { indent: `${ICONS.info} ` });
  }

  const result = spawnSync(executable, argsForSpawn, {
    cwd: extra.cwd || root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: extra.timeout || 180000,
    windowsHide: true,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      ...(extra.env || {})
    }
  });

  const output = redactSensitiveOutput([result.stdout, result.stderr].filter(Boolean).join("\n"));
  const failed = Boolean(result.error) || result.status !== 0;
  if (output.trim() && !extra.captureOnly && (!extra.quiet || failed)) {
    process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }
  if (logPath) {
    fs.appendFileSync(logPath, output, "utf8");
    fs.appendFileSync(logPath, `\nexitCode=${result.status ?? "error"}\n`, "utf8");
    if (result.signal) fs.appendFileSync(logPath, `signal=${result.signal}\n`, "utf8");
  }

  if (result.error) {
    if (!options.json) console.error(`${ICONS.warn} [!!!!!!!!!!] 100% FAILED   ${action} (${Date.now() - startedMs} ms)`);
    if (!extra.captureOnly) console.error(`${ICONS.warn} ${result.error.message}`);
    return { ok: false, status: null, signal: result.signal || null, logPath, error: result.error.message, output, elapsedMs: Date.now() - startedMs };
  }
  if (result.status !== 0) {
    if (!options.json) console.error(`${ICONS.warn} [!!!!!!!!!!] 100% FAILED   ${action} (${Date.now() - startedMs} ms)`);
    const logNote = logPath ? ` Log: ${toPosix(path.relative(root, logPath))}` : " Logging disabled by --no-log.";
    const signalNote = result.signal ? ` Signal: ${result.signal}.` : "";
    if (!extra.captureOnly) {
      console.error(`${ICONS.warn} Command failed with exit ${result.status}.${signalNote}${logNote}`);
    }
    return { ok: false, status: result.status, signal: result.signal || null, logPath, output, elapsedMs: Date.now() - startedMs };
  }
  if (!options.json && !extra.quiet) console.log(`${ICONS.ok} [##########] 100% DONE     ${action} (${Date.now() - startedMs} ms)`);
  if (logPath && !options.json && !extra.quiet) console.log(`${ICONS.ok} Log: ${toPosix(path.relative(root, logPath))}`);
  else if (!options.json && !extra.quiet) console.log(`${ICONS.ok} ${localText("Log disabled by --no-log", "Log --no-log ile kapalı")}`);
  return { ok: true, status: result.status, signal: result.signal || null, logPath, output, elapsedMs: Date.now() - startedMs };
}

function runNode(action, script, scriptArgs = [], extra = {}) {
  return runLoggedCommand(action, process.execPath, [script, ...scriptArgs], extra);
}

function runPowerShell(action, script, scriptArgs = [], extra = {}) {
  return runLoggedCommand(action, "powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    ...scriptArgs
  ], { timeout: 300000, ...extra });
}

function runBash(action, script, scriptArgs = [], extra = {}) {
  return runLoggedCommand(action, "bash", [script, ...scriptArgs], { timeout: 300000, ...extra });
}

function isMenuInteraction(interaction = {}) {
  return interaction.fromMenu === true;
}

function writeFlowRequested(interaction = {}) {
  return options.apply || isMenuInteraction(interaction);
}

async function confirmWriteAction(action, detail, interaction = {}) {
  if (!interaction.fromMenu && options.apply) return true;
  if (!process.stdin.isTTY && !interaction.question) {
    console.log(`${ICONS.warn} ${localText(`${action} needs --apply before it can change files or global state.`, `${action} dosya veya global durum değiştirmeden önce --apply ister.`)}`);
    return false;
  }
  const answer = await askInteractive(
    `${ICONS.warn} ${detail} ${localText("Type APPLY to continue, or press Enter to cancel:", "Devam etmek için APPLY yazın; vazgeçmek için Enter'a basın:")} `,
    interaction
  );
  return answer.trim() === "APPLY";
}

function printHeader() {
  printBrandSignature();
  printDivider("Codex Chef");
  if (supportsColor()) {
    console.log(`${ICONS.chef} ${paint("CODEX CHEF", "bold", "brightCyan")}  ${paint("OPERATOR CONSOLE", "bold", "brightMagenta")}`);
    console.log(`${paint("●", "brightGreen")} ${paint(localText("READY", "HAZIR"), "bold", "brightGreen")}  ${paint("•", "gray")}  ${styleMuted(`v${currentPackageVersion()}  ${gitBranch()}`)}`);
  } else {
    console.log(`${ICONS.chef} Codex Chef`);
  }
  printWrapped(localText(
    "One operator board for status, setup, backups, skills, MCP connectors, diagnostics, auth notes, and logs.",
    "Durum, kurulum, yedekler, skill'ler, MCP bağlayıcıları, tanılama, kimlik notları ve loglar için tek operatör paneli."
  ), { styler: styleMuted });
  printWrapped(localText(
    `Language: English | Safety: menu writes ask for APPLY; direct CLI writes require --apply.`,
    `Dil: Türkçe | Güvenlik: menü işlemleri APPLY onayı; doğrudan CLI işlemleri --apply ister.`
  ), { styler: styleMuted });
  console.log("");
}

function printMenu() {
  printDivider("COMMAND CENTER");
  if (supportsColor()) {
    console.log(`${paint("✦", "bold", "brightMagenta")} ${styleHeading(localText("Codex Chef command center", "Codex Chef komuta merkezi"))}`);
  } else {
    console.log(styleHeading(localText("Codex Chef command center", "Codex Chef komuta merkezi")));
  }
  printOperatorStatusStrip();
  console.log("");
  MENU_GROUPS.forEach((group, index) => {
    const label = options.lang === "tr" ? group.labelTr : group.label;
    const description = options.lang === "tr" ? group.descriptionTr : group.description;
    const visual = groupVisual(group);
    const boundaryCounts = group.itemIds
      .map((id) => MENU_ITEMS.find((item) => item.id === id))
      .filter(Boolean)
      .reduce((counts, item) => {
        counts[writeBoundaryKind(item.writes)] += 1;
        return counts;
      }, { safe: 0, guidance: 0, write: 0 });
    const badgeParts = [];
    if (boundaryCounts.write > 0) {
      badgeParts.push(localText(`${boundaryCounts.write} approval-gated`, `${boundaryCounts.write} onaylı işlem`));
    }
    if (boundaryCounts.guidance > 0) {
      badgeParts.push(localText(`${boundaryCounts.guidance} account-guided`, `${boundaryCounts.guidance} hesap rehberi`));
    }
    const badge = badgeParts.length > 0
      ? badgeParts.join(" / ")
      : localText("read-only", "salt okunur");
    if (supportsColor()) {
      const badgeKind = boundaryCounts.write > 0 ? "write" : boundaryCounts.guidance > 0 ? "guidance" : "safe";
      console.log(`${paint("╭─", visual.color)} ${paint(String(index + 1).padStart(2, "0"), "bold", visual.color)} ${paint(visual.icon, "bold", visual.color)}  ${paint(label, "bold", "white")}`);
      printWrapped(stripAnsi(statusBadge(badge, badgeKind)), { indent: "    ", styler: styleMuted });
      printWrapped(description, { indent: "    ", styler: styleMuted });
    } else {
      console.log(`${styleHeading(String(index + 1).padStart(2, "0"))}  ${styleHeading(label)}`);
      printWrapped(`[${badge}]`, { indent: "    ", styler: styleMuted });
      printWrapped(description, { indent: "    " });
    }
  });
  console.log("");
  printWrapped(localText(
    "Choose a workspace. Shortcuts: l = language, q = quit.",
    "Bir çalışma alanı seçin. Kısayollar: l = dil, q = çıkış."
  ), { styler: styleMuted });
}

function printLegacyMenu() {
  printDivider("OPERATOR BOARD");
  console.log(styleHeading(localText("Operator menu", "Operatör menüsü")));
  printOperatorStatusStrip();
  console.log("");
  const width = terminalWidth();
  if (width < 110) printStackedMenu(width);
  else printTableMenu(width);
  console.log("");
  printWrapped(localText(
    "Shortcuts: l = language, q = quit. Empty input repeats this prompt without repainting the menu.",
    "Kısayollar: l = dil, q = çıkış. Boş giriş menüyü yeniden basmadan promptu tekrarlar."
  ), { styler: styleMuted });
}

function printHubMenu(group) {
  const label = options.lang === "tr" ? group.labelTr : group.label;
  const description = options.lang === "tr" ? group.descriptionTr : group.description;
  const visual = groupVisual(group);
  printDivider(label.toUpperCase());
  if (supportsColor()) {
    console.log(`${paint(visual.icon, "bold", visual.color)} ${paint(label, "bold", visual.color)}`);
    printWrapped(description, { styler: styleMuted });
  } else {
    console.log(styleHeading(label));
    printWrapped(description);
  }
  console.log("");
  group.itemIds.forEach((id, index) => {
    const item = MENU_ITEMS.find((candidate) => candidate.id === id);
    if (!item) return;
    if (supportsColor()) {
      const color = menuItemColor(item);
      const boundary = writeBoundaryKind(menuWrites(item));
      console.log(`${paint("╭─", color)} ${paint(String(index + 1).padStart(2, "0"), "bold", color)} ${colorize(menuIcon(item), color)}  ${paint(menuLabel(item), "bold", "white")}`);
      printWrapped(`${stripAnsi(importanceBadge(item))} ${stripAnsi(statusBadge(menuWrites(item), boundary))}`, {
        indent: "    ",
        styler: styleMuted
      });
      printWrapped(menuDescription(item), { indent: "    ", styler: styleMuted });
    } else {
      console.log(`${styleHeading(String(index + 1).padStart(2, "0"))}  ${menuIcon(item)} ${styleHeading(menuLabel(item))}`);
      printWrapped(menuDescription(item), { indent: "    " });
      printWrapped(`${localText("Importance", "Önem")}: ${menuImportance(item)} | ${localText("Impact", "Etki")}: ${menuWrites(item)}`, {
        indent: "    ",
        styler: styleMuted
      });
    }
  });
  console.log("");
  printWrapped(localText("b = back, l = language, q = quit", "b = geri, l = dil, q = çıkış"), {
    styler: styleMuted
  });
}

function printActionStart(item) {
  const label = menuLabel(item) || item.label || item.id;
  printSurfaceHeader(
    localText(`Opening: ${label}`, `Aciliyor: ${label}`),
    menuDescription(item),
    colorize(menuIcon(item), menuItemColor(item)),
    menuItemColor(item)
  );
}

function printActionEnd(item, result) {
  const label = menuLabel(item) || item.label || item.id;
  const status = result?.skipped
    ? localText("skipped", "atlandı")
    : result?.ok === false
      ? localText("attention", "dikkat")
      : localText("ready", "hazır");
  const color = result?.skipped ? "brightYellow" : result?.ok === false ? "brightRed" : "brightGreen";
  const elapsedMs = result?.operation?.elapsedMs ?? result?.elapsedMs;
  lastActionSummary = {
    label,
    status,
    ok: result?.ok !== false && !result?.skipped,
    skipped: Boolean(result?.skipped),
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : null
  };
  if (supportsColor()) {
    const icon = result?.skipped ? "○" : result?.ok === false ? "!" : "✓";
    console.log("");
    console.log(`${paint("╰─", color)} ${paint(icon, "bold", color)} ${paint(localText(`${label}: ${status}`, `${label}: ${status}`), "bold", color)}`);
  } else {
    printDivider(localText(`${label}: ${status}`, `${label}: ${status}`));
  }
}

async function pauseBeforeMenu(question) {
  await question(`\n${styleMuted(localText("Press Enter to return to the operator board.", "Operatör paneline dönmek için Enter'a basın."))} `);
  console.log("");
}

function toggleLanguage() {
  options.lang = isTr() ? "en" : "tr";
  console.log(`${ICONS.ok} ${localText("Language switched to English.", "Dil Türkçe olarak ayarlandı.")}`);
  return { ok: true };
}

function runStatus(overrides = {}) {
  const repoOnly = Boolean(overrides.repoOnly || options.repoOnly);
  return runNode(repoOnly ? "status-repo-only" : "status", "scripts/codex-status.mjs", [
    "--redact-paths",
    "--lang",
    options.lang,
    ...(repoOnly ? ["--skip-runtime", "--skip-codex-doctor-checks", "--skip-codex-cli"] : []),
    ...(options.details ? ["--details"] : []),
    ...(options.json ? ["--json"] : [])
  ], {
    waitNote: repoOnly
      ? localText(
          "Collecting local repo checks only; installed runtime, global skill roots, Codex logs, and Codex CLI probes are skipped.",
          "Yalnızca yerel repo kontrolleri toplanıyor; kurulu ortam, global skill kökleri, Codex logları ve Codex CLI kontrolleri atlandı."
        )
      : localText(
          "Collecting Codex runtime, MCP, Git, and log metadata checks; this can take 30-60 seconds.",
          "Codex çalışma ortamı, MCP, Git ve log bilgisi kontrolleri toplanıyor; 30-60 saniye sürebilir."
        )
  });
}

function runDoctor() {
  if (options.json) {
    const repoDoctor = runNode("doctor", "scripts/codex-doctor.mjs", [
      "--redact-paths",
      "--json"
    ], {
      quiet: true,
      captureOnly: true,
      waitNote: "Running repo doctor checks."
    });
    const runtime = runNode("runtime", "scripts/verify-install-runtime.mjs", [
      "--redact-paths",
      "--expect-skills",
      "--expect-git-guards",
      "--require-live-runtime",
      "--json"
    ], {
      quiet: true,
      captureOnly: true,
      waitNote: "Verifying installed Codex Chef runtime; this can take 30-60 seconds."
    });

    const parseReport = (result) => {
      try {
        return JSON.parse(result.output || "{}");
      } catch {
        return null;
      }
    };
    const repoReport = parseReport(repoDoctor);
    const runtimeReport = parseReport(runtime);
    const failed = !repoDoctor.ok
      || !runtime.ok
      || repoReport?.status === "fail"
      || runtimeReport?.status === "fail";
    const attention = !failed && (
      repoReport?.status === "attention"
      || runtimeReport?.status === "attention"
    );
    const report = {
      schemaVersion: "codex-chef.doctor-bundle.v1",
      generatedAt: new Date().toISOString(),
      status: failed ? "fail" : attention ? "attention" : "ok",
      repoDoctor: {
        ok: repoDoctor.ok,
        exitCode: repoDoctor.status,
        elapsedMs: repoDoctor.elapsedMs,
        report: repoReport,
        parseError: repoReport ? null : "Child command did not emit parseable JSON."
      },
      runtime: {
        ok: runtime.ok,
        exitCode: runtime.status,
        elapsedMs: runtime.elapsedMs,
        report: runtimeReport,
        parseError: runtimeReport ? null : "Child command did not emit parseable JSON."
      }
    };
    console.log(JSON.stringify(report, null, 2));
    return {
      ok: !failed,
      status: failed ? 1 : 0,
      logPath: runtime.logPath || repoDoctor.logPath,
      output: JSON.stringify(report),
      elapsedMs: repoDoctor.elapsedMs + runtime.elapsedMs
    };
  }

  const first = runNode("doctor", "scripts/codex-doctor.mjs", [
    "--redact-paths",
  ], {
    waitNote: "Running repo doctor checks."
  });
  if (!first.ok) return first;
  return runNode("runtime", "scripts/verify-install-runtime.mjs", [
    "--redact-paths",
    "--expect-skills",
    "--expect-git-guards",
    "--require-live-runtime"
  ], {
    waitNote: "Verifying installed Codex Chef runtime; this can take 30-60 seconds."
  });
}

function runPreview(force = false, includeSkills = true, compact = !options.verbosePlan) {
  const plan = runNode("preview-plan", "scripts/plan-install.mjs", [
    ...(includeSkills ? ["--all"] : []),
    ...(force ? ["--force"] : []),
    ...(compact ? ["--summary"] : []),
    ...(options.json ? ["--json"] : []),
    "--redact-paths"
  ]);
  if (!plan.ok) return plan;
  if (compact && !options.details && !options.verbosePlan) return plan;
  if (process.platform === "win32") {
    return runPowerShell("preview-installer", ".\\scripts\\install.ps1", [
      ...(includeSkills ? ["-All"] : []),
      ...(force ? ["-Force"] : []),
      "-WhatIf",
      "-PlainOutput"
    ]);
  }
  return runBash("preview-installer", "scripts/install.sh", [
    ...(includeSkills ? ["--all"] : []),
    ...(force ? ["--force"] : []),
    "--dry-run",
    "--plain-output"
  ]);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runPackageScript(action, scriptName, extra = {}) {
  return runLoggedCommand(action, npmCommand(), ["run", scriptName], extra);
}

function runUpdateValidation(extra = {}) {
  if (!extra.quiet) console.log(`${ICONS.info} ${localText("Checking the repo before managed files are refreshed.", "Yonetilen dosyalar yenilenmeden once repo kontrol ediliyor.")}`);
  return runPackageScript("update-check", "validate:update", {
    timeout: 120000,
    quiet: extra.quiet,
    waitNote: localText(
      "Running the bounded update integrity check before global managed files are refreshed.",
      "Global yönetilen dosyalar yenilenmeden önce sınırlı güncelleme bütünlük kontrolü çalıştırılıyor."
    )
  });
}

function updateRecoveryReceiptPath() {
  return path.join(logRoot, "update-recovery.json");
}

function worktreeFingerprint(dirty) {
  return crypto.createHash("sha256").update(String(dirty?.output || "")).digest("hex");
}

function atomicWriteUpdateRecoveryReceipt(receipt) {
  const receiptPath = updateRecoveryReceiptPath();
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const temporaryPath = `${receiptPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporaryPath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporaryPath, receiptPath);
  try {
    const directory = fs.openSync(path.dirname(receiptPath), "r");
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR'].includes(error?.code)) throw error;
  }
  return receiptPath;
}

function prepareUpdateRecoveryReceipt({ beforeHead, candidateHead, expectedPackageVersion, dirty }) {
  const receipt = {
    schemaVersion: "codex-chef.update-recovery.v1",
    phase: "prepared",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    beforeHead,
    candidateHead,
    expectedPackageVersion,
    worktreeFingerprint: worktreeFingerprint(dirty),
    recoveryCommand: "npm run chef -- --update --apply",
    transitions: [{ phase: "prepared", at: new Date().toISOString() }]
  };
  receipt.path = atomicWriteUpdateRecoveryReceipt(receipt);
  return receipt;
}

function advanceUpdateRecoveryReceipt(receipt, phase, extra = {}) {
  receipt.phase = phase;
  receipt.updatedAt = new Date().toISOString();
  receipt.transitions.push({ phase, at: receipt.updatedAt });
  Object.assign(receipt, extra);
  receipt.path = atomicWriteUpdateRecoveryReceipt(receipt);
  return receipt;
}

function findRecoverableUpdateReceipt(beforeHead, expectedPackageVersion, dirty) {
  const receiptPath = updateRecoveryReceiptPath();
  if (!fs.existsSync(receiptPath)) return null;
  try {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    const resumable = receipt?.schemaVersion === "codex-chef.update-recovery.v1"
      && ["source-advanced", "managed-refresh-started"].includes(receipt.phase)
      && receipt.candidateHead === beforeHead
      && receipt.expectedPackageVersion === expectedPackageVersion
      && receipt.worktreeFingerprint === worktreeFingerprint(dirty);
    if (!resumable) return null;
    receipt.path = receiptPath;
    return receipt;
  } catch {
    return null;
  }
}

function recordUpdateRecoveryFailure(receipt, failure, stage) {
  const message = failure?.error || failure?.message || failure?.output || `Update ${stage} failed.`;
  receipt.lastFailure = {
    stage,
    at: new Date().toISOString(),
    message: redactSensitiveOutput(String(message)).slice(0, 1000)
  };
  receipt.updatedAt = receipt.lastFailure.at;
  receipt.path = atomicWriteUpdateRecoveryReceipt(receipt);
  const sourceAdvanced = receipt.phase !== "prepared";
  if (!options.json) {
    console.log(`${ICONS.warn} ${sourceAdvanced
      ? localText(
        "Source update succeeded, but the managed runtime is not verified. The recovery receipt preserves the exact retry state.",
        "Kaynak güncellemesi başarılı oldu ancak yönetilen runtime doğrulanmadı. Kurtarma makbuzu tam yeniden deneme durumunu koruyor."
      )
      : localText(
        "Source update did not complete. The recovery receipt preserves the prepared candidate for inspection.",
        "Kaynak güncellemesi tamamlanmadı. Kurtarma makbuzu incelenmek üzere hazırlanan adayı koruyor."
      )}`);
    console.log(`${ICONS.info} ${localText("Recovery receipt", "Kurtarma makbuzu")}: ${toPosix(path.relative(root, receipt.path))}`);
    console.log(`${ICONS.info} ${localText("Retry", "Yeniden dene")}: ${receipt.recoveryCommand}`);
  }
  return {
    ...(failure || { ok: false }),
    ok: false,
    sourceAdvanced,
    runtimeVerified: false,
    recoveryReceiptPath: receipt.path,
    recoveryCommand: receipt.recoveryCommand
  };
}

function resolveGitRef(ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    return { ok: false, message: redactSensitiveOutput(result.error?.message || result.stderr || `git rev-parse ${ref} exited ${result.status}`) };
  }
  return { ok: true, value: result.stdout.trim() };
}

function runFetchedUpdateValidation(candidateCommit, extra = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-update-"));
  const candidatePath = path.join(tempRoot, "candidate");
  let added = false;
  try {
    const addedWorktree = runLoggedCommand("update-candidate-worktree", "git", ["worktree", "add", "--detach", candidatePath, candidateCommit], {
      timeout: 120000,
      quiet: extra.quiet
    });
    if (!addedWorktree.ok) return addedWorktree;
    added = true;
    return runLoggedCommand("update-candidate-check", npmCommand(), ["run", "validate:update"], {
      cwd: candidatePath,
      timeout: 120000,
      quiet: extra.quiet,
      waitNote: localText(
        "Validating the exact fetched commit before changing the current checkout.",
        "Mevcut checkout degismeden once tam olarak getirilen commit dogrulaniyor."
      )
    });
  } finally {
    if (added) {
      runLoggedCommand("update-candidate-cleanup", "git", ["worktree", "remove", "--force", candidatePath], {
        timeout: 120000,
        quiet: true
      });
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const MANAGED_REFRESH_TARGETS = [
  "CODEX_HOME/AGENTS.md",
  "CODEX_HOME/config.toml",
  "CODEX_HOME/rules/default.rules",
  "CODEX_HOME/*.config.toml profiles",
  "CODEX_HOME/agents/*.toml role files",
  "CODEX_HOME/plugins/codex-chef-workflows",
  "AGENTS_HOME/plugins/marketplace.json"
];

function printManagedRefreshSummary(interaction = {}) {
  console.log("");
  console.log(styleHeading(localText("Managed targets", "Yönetilen hedefler")));
  if (options.details) {
    for (const target of MANAGED_REFRESH_TARGETS) console.log(`- ${target}`);
  } else {
    console.log(`- ${localText(
      `${MANAGED_REFRESH_TARGETS.length} managed target groups; backup first; user data is preserved.`,
      `${MANAGED_REFRESH_TARGETS.length} managed hedef grubu; önce yedek alınır; kullanıcı verisi korunur.`
    )}`);
  }
  console.log(styleMuted(localText(
    "Apply backs up replaced managed files first; it does not delete, prune, or clean user data.",
    "Apply önce değişecek managed dosyaları yedekler; user data silmez, prune/clean yapmaz."
  )));
  if (options.details) {
    console.log(styleMuted(localText(
      "Update excludes curated global skill installs and optional global Git guards; use --install or --skills for those explicit surfaces.",
      "Update curated global skill kurulumlarını ve opsiyonel global Git guard'larını dışarıda tutar; bu yüzeyler için --install veya --skills kullanın."
    )));
  }
  console.log("");
  console.log(styleHeading(localText("Next safe step", "Sonraki güvenli adım")));
  if (isMenuInteraction(interaction)) {
    console.log(`- ${localText("Continue here after reviewing the plan; the menu will ask for typed APPLY confirmation.", "Planı inceledikten sonra burada devam edin; menü yazılı APPLY onayı isteyecek.")}`);
  } else {
    console.log(`- ${localText("Apply after review", "İncelemeden sonra uygula")}: npm run chef -- --update --apply`);
    console.log(`- ${localText("Full evidence", "Tam kanıt")}: npm run chef -- --update --details`);
  }
}

function inspectGitDirty() {
  const result = spawnSync("git", ["status", "--short"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    windowsHide: true
  });
  if (result.error) {
    return { ok: false, message: result.error.message, output: "" };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      message: `git status exited ${result.status}`,
      output: redactSensitiveOutput([result.stdout, result.stderr].filter(Boolean).join("\n"))
    };
  }
  const output = redactLocalPaths(result.stdout || "");
  const classification = classifyGitStatus(result.stdout || "");
  return {
    ok: true,
    dirty: classification.blocking,
    untrackedOnly: classification.untrackedOnly,
    untracked: classification.untracked,
    output
  };
}

function gitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    windowsHide: true
  });
  if (result.error) {
    return { ok: false, message: result.error.message, value: null };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      message: `git rev-parse exited ${result.status}`,
      value: null
    };
  }
  return { ok: true, message: null, value: String(result.stdout || "").trim() };
}

function gitBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    windowsHide: true
  });
  if (result.error || result.status !== 0) return localText("unknown branch", "branch bilinmiyor");
  return String(result.stdout || "").trim() || localText("detached HEAD", "detached HEAD");
}

function latestReleaseNoteTitle() {
  const notesPath = path.join(root, "docs", isTr() ? "release-notes.tr.md" : "release-notes.md");
  if (!fs.existsSync(notesPath)) return localText("release notes not found", "release note bulunamadi");
  const version = currentPackageVersion();
  const lines = fs.readFileSync(notesPath, "utf8")
    .split(/\r?\n/)
    .map((item) => item.trim());
  const line = lines.find((item) => item.startsWith(`## v${version}`))
    || lines.find((item) => /^##\s+v\d+\.\d+\.\d+/.test(item));
  return line ? line.replace(/^#+\s+/, "").trim() : localText("release notes available", "release note var");
}

function currentPackageVersion() {
  return readJson("package.json").version;
}

function printUpdateContext() {
  const head = gitHead();
  console.log(styleHeading(localText("Current repository", "Mevcut repo")));
  console.log(`- ${localText("Version", "Versiyon")}: ${currentPackageVersion()}`);
  console.log(`- ${localText("Branch", "Dal")}: ${gitBranch()}`);
  console.log(`- ${localText("Commit", "Commit")}: ${head.ok && head.value ? head.value.slice(0, 12) : localText("not inspected", "kontrol edilmedi")}`);
  console.log(`- ${localText("Release notes", "Release notu")}: ${latestReleaseNoteTitle()}`);
  console.log(styleMuted(localText(
    "Preview does not contact the remote. Apply checks the available version first, fast-forwards when newer, and refreshes managed files even when the source is current.",
    "Ön izleme remote'a bağlanmaz. Apply önce uygun sürümü kontrol eder; daha yeniyse fast-forward yapar, kaynak güncelse bile managed dosyaları yeniler."
  )));
}

function compareReleaseVersions(left, right) {
  const parse = (value) => {
    const match = String(value || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    return match ? match.slice(1).map(Number) : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function gitPackageVersion(ref) {
  const result = spawnSync("git", ["show", `${ref}:package.json`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      message: redactSensitiveOutput(result.error?.message || result.stderr || `git show exited ${result.status}`)
    };
  }
  try {
    return { ok: true, value: JSON.parse(result.stdout).version };
  } catch (error) {
    return { ok: false, message: `Invalid package.json at ${ref}: ${error.message}` };
  }
}

function printProgress(percent, label, state = "run") {
  if (options.json) return;
  const bounded = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.round(bounded / 10);
  const bar = `${"#".repeat(filled)}${"-".repeat(10 - filled)}`;
  const icon = state === "done" ? ICONS.ok : state === "failed" ? ICONS.warn : ICONS.run;
  console.log(`${icon} [${bar}] ${String(bounded).padStart(3)}% ${label}`);
}

async function runUpdate(interaction = {}) {
  if (!writeFlowRequested(interaction)) {
    printSurfaceHeader(
      localText("Update preview", "Güncelleme ön izlemesi"),
      localText("No remote pull or managed file refresh happens in preview mode.", "Ön izleme modunda remote pull veya managed dosya yenileme yapılmaz."),
      ICONS.update
    );
    console.log(styleHeading(localText("Result", "Sonuç")));
    console.log(`${ICONS.ok} ${localText("No managed or global files changed.", "Managed veya global dosya değişmedi.")}`);
    console.log(styleMuted(localText(
      "Use apply only after reviewing the target list and backup behavior.",
      "Apply'i yalnız hedef listesini ve yedek davranışını inceledikten sonra kullanın."
    )));
    printUpdateContext();
    printManagedRefreshSummary(interaction);
    if (options.verbosePlan) return runPreview(true, false);
    return { ok: true };
  }
  if (isMenuInteraction(interaction)) {
    printSurfaceHeader(
      localText("Update plan", "Güncelleme planı"),
      localText("Reviewing the current tree before any remote or managed write.", "Remote veya managed yazma işleminden önce mevcut ağaç inceleniyor."),
      ICONS.update
    );
    printUpdateContext();
    printManagedRefreshSummary(interaction);
    if (options.details) {
      const currentPreview = runPreview(true, false);
      if (!currentPreview.ok) return currentPreview;
    }
  }
  const dirty = inspectGitDirty();
  if (!dirty.ok) {
    console.log(`${ICONS.warn} ${localText(`Cannot inspect Git worktree: ${dirty.message}`, `Git worktree incelenemedi: ${dirty.message}`)}`);
    if (dirty.output.trim()) process.stdout.write(dirty.output.endsWith("\n") ? dirty.output : `${dirty.output}\n`);
    return { ok: false };
  }
  if (dirty.untrackedOnly) {
    console.log(`${ICONS.info} ${localText(
      "Untracked local files detected; they will be preserved while the update runs.",
      "Takip edilmeyen lokal dosyalar bulundu; güncelleme sırasında korunacaklar."
    )}`);
    for (const file of dirty.untracked || []) {
      console.log(`- ${redactLocalPaths(file)}`);
    }
  }
  if (dirty.dirty) {
    console.log(`${ICONS.warn} ${localText("Update apply requires no tracked or staged worktree edits so local changes are not overwritten.", "Update apply, lokal değişikliklerin üzerine yazılmaması için tracked veya staged worktree değişikliği olmamasını ister.")}`);
    process.stdout.write(dirty.output.endsWith("\n") ? dirty.output : `${dirty.output}\n`);
    console.log(`${ICONS.info} ${localText(
      isMenuInteraction(interaction)
        ? "Commit, stash, or move local changes, then choose Update Codex Chef again from this menu."
        : "Commit, stash, or move local changes, then rerun npm run chef -- --update --apply.",
      isMenuInteraction(interaction)
        ? "Lokal değişiklikleri commit/stash/move yapın, ardından bu menüden Codex Chef'i güncelle seçeneğini yeniden seçin."
        : "Lokal değişiklikleri commit/stash/move yapın, sonra npm run chef -- --update --apply tekrar çalıştırın."
    )}`);
    return { ok: false };
  }
  const beforeHead = gitHead();
  if (!beforeHead.ok) {
    console.log(`${ICONS.warn} ${localText(`Cannot inspect current Git HEAD: ${beforeHead.message}`, `Gecerli Git HEAD incelenemedi: ${beforeHead.message}`)}`);
    return { ok: false };
  }
  const beforeVersion = currentPackageVersion();
  printProgress(10, localText("Checking available version", "Uygun sürüm kontrol ediliyor"));
  const fetchArgs = process.platform === "win32"
    ? ["-c", "http.sslBackend=openssl", "fetch", "--quiet", "origin", "main"]
    : ["fetch", "--quiet", "origin", "main"];
  const fetch = runLoggedCommand("update-fetch", "git", fetchArgs, { timeout: 300000, quiet: true });
  if (!fetch.ok) {
    printProgress(10, localText("Version check failed", "Sürüm kontrolü başarısız"), "failed");
    return fetch;
  }
  const candidate = resolveGitRef("FETCH_HEAD");
  if (!candidate.ok) {
    console.log(`${ICONS.warn} Cannot resolve fetched update commit: ${candidate.message}`);
    return { ok: false };
  }
  const remoteVersion = gitPackageVersion(candidate.value);
  if (!remoteVersion.ok) {
    console.log(`${ICONS.warn} ${localText(`Cannot read available version: ${remoteVersion.message}`, `Uygun sürüm okunamadı: ${remoteVersion.message}`)}`);
    return { ok: false };
  }
  const candidateIsCurrent = candidate.value === beforeHead.value;
  const versionOrder = compareReleaseVersions(beforeVersion, remoteVersion.value);
  const resumableReceipt = findRecoverableUpdateReceipt(beforeHead.value, beforeVersion, dirty);
  console.log(`${styleLabel(localText("Local version", "Yerel sürüm"))}: ${beforeVersion}`);
  console.log(`${styleLabel(localText("Available version", "Uygun sürüm"))}: ${remoteVersion.value}`);
  if (versionOrder === null) {
    console.log(`${ICONS.warn} ${localText("Versions could not be compared safely; update stopped.", "Sürümler güvenle karşılaştırılamadı; güncelleme durduruldu.")}`);
    return { ok: false };
  }
  if (versionOrder === 0 && candidateIsCurrent) {
    printProgress(20, localText(
      `Already current: v${beforeVersion}. Continuing with validation and managed refresh.`,
      `Zaten güncel: v${beforeVersion}. Validation ve managed refresh ile devam ediliyor.`
    ));
    const allowed = await confirmWriteAction(
      localText("Update", "Guncelleme"),
      localText(
        `Codex Chef is already at v${beforeVersion}; validate the current checkout, then refresh managed Codex files and verify the installed runtime.`,
        `Codex Chef zaten v${beforeVersion} sürümünde; doğrulanacak, managed Codex dosyaları yenilenecek ve kurulu runtime kontrol edilecek.`
      ),
      interaction
    );
    if (!allowed) return { ok: false, skipped: true, upToDate: true, localVersion: beforeVersion, availableVersion: remoteVersion.value };
    const validation = runUpdateValidation({ quiet: !options.details });
    if (!validation.ok) return resumableReceipt
      ? recordUpdateRecoveryFailure(resumableReceipt, validation, "recovery validation")
      : validation;
    let applied;
    if (resumableReceipt) advanceUpdateRecoveryReceipt(resumableReceipt, "managed-refresh-started", { sourceHead: beforeHead.value });
    if (process.platform === "win32") {
      applied = runPowerShell("update-install", ".\\scripts\\install.ps1", ["-Update", "-PlainOutput"], { quiet: !options.details });
    } else {
      applied = runBash("update-install", "scripts/install.sh", ["--update", "--plain-output"], { quiet: !options.details });
    }
    const completed = completeAppliedAction(applied, false, {
      kind: "update",
      quiet: !options.details,
      beforeVersion,
      afterVersion: beforeVersion,
      beforeHead: beforeHead.value,
      afterHead: beforeHead.value
    });
    if (!resumableReceipt) return completed;
    if (!completed.ok) return recordUpdateRecoveryFailure(resumableReceipt, completed, "managed refresh or runtime verification");
    advanceUpdateRecoveryReceipt(resumableReceipt, "verified", {
      sourceHead: beforeHead.value,
      verifiedAt: new Date().toISOString()
    });
    completed.recoveryReceiptPath = resumableReceipt.path;
    return completed;
  }
  if (versionOrder > 0) {
    printProgress(100, localText("Local version is newer; update skipped.", "Yerel sürüm daha yeni; güncelleme atlandı."), "done");
    return { ok: true, skipped: true, localVersion: beforeVersion, availableVersion: remoteVersion.value };
  }
  printProgress(20, localText(
    versionOrder === 0
      ? `New source revision found for v${remoteVersion.value}`
      : `New version found: v${remoteVersion.value}`,
    versionOrder === 0
      ? `v${remoteVersion.value} için yeni kaynak revizyonu bulundu`
      : `Yeni sürüm bulundu: v${remoteVersion.value}`
  ));
  const allowed = await confirmWriteAction(
    localText("Update", "Guncelleme"),
    localText(
      versionOrder === 0
        ? `Update validates fetched commit ${candidate.value.slice(0, 12)}, then fast-forwards Codex Chef to a newer source revision at v${remoteVersion.value} and refreshes managed files.`
        : `Update validates fetched commit ${candidate.value.slice(0, 12)}, then fast-forwards Codex Chef from v${beforeVersion} to v${remoteVersion.value} and refreshes managed files.`,
      versionOrder === 0
        ? `Güncelleme alınan ${candidate.value.slice(0, 12)} commit'ini doğrular, ardından Codex Chef'i v${remoteVersion.value} sürümündeki daha yeni kaynak revizyonuna fast-forward eder ve managed Codex dosyalarını yeniler.`
        : `Güncelleme Codex Chef'i v${beforeVersion} sürümünden v${remoteVersion.value} sürümüne fast-forward eder, doğrular ve managed Codex dosyalarını yeniler.`
    ),
    interaction
  );
  if (!allowed) return { ok: false, skipped: true };
  printProgress(30, localText("Downloading source update", "Kaynak güncelleme indiriliyor"));
  const candidateValidation = runFetchedUpdateValidation(candidate.value, { quiet: !options.details });
  if (!candidateValidation.ok) return candidateValidation;
  const recoveryReceipt = prepareUpdateRecoveryReceipt({
    beforeHead: beforeHead.value,
    candidateHead: candidate.value,
    expectedPackageVersion: remoteVersion.value,
    dirty
  });
  const pull = runLoggedCommand("update-merge", "git", ["merge", "--ff-only", candidate.value], {
    timeout: 300000,
    quiet: true
  });
  if (!pull.ok) return recordUpdateRecoveryFailure(recoveryReceipt, pull, "source merge");
  advanceUpdateRecoveryReceipt(recoveryReceipt, "source-advanced", { sourceHead: candidate.value });
  printProgress(40, localText("Source update complete", "Kaynak güncelleme tamamlandı"));
  const afterHead = gitHead();
  if (!afterHead.ok) {
    console.log(`${ICONS.warn} ${localText(`Cannot inspect updated Git HEAD: ${afterHead.message}`, `Guncel Git HEAD incelenemedi: ${afterHead.message}`)}`);
    return recordUpdateRecoveryFailure(recoveryReceipt, { ok: false, error: afterHead.message }, "source inspection");
  }
  if (beforeHead.value !== afterHead.value) {
    console.log(`${ICONS.update} ${localText(`Repository updated from ${beforeHead.value.slice(0, 7)} to ${afterHead.value.slice(0, 7)}.`, `Repo ${beforeHead.value.slice(0, 7)} -> ${afterHead.value.slice(0, 7)} güncellendi.`)}`);
    console.log(`${ICONS.info} ${localText(
      "Running a fresh preview from the updated tree, then continuing validation and managed refresh in this approved session.",
      "Güncel ağaçtan yeni ön izleme çalıştırılıyor; ardından doğrulama ve managed yenileme bu onaylı oturumda sürecek."
    )}`);
    const preview = runPreview(true, false);
    if (!preview.ok) return recordUpdateRecoveryFailure(recoveryReceipt, preview, "updated-tree preview");
  } else {
    console.log(`${ICONS.ok} ${localText("Repository already up to date; applying the reviewed managed refresh.", "Repo zaten güncel; incelenmiş managed refresh uygulanıyor.")}`);
  }
  const afterVersion = currentPackageVersion();
  printProgress(55, localText("Validating repository", "Repo doğrulanıyor"));
  const validation = runUpdateValidation({ quiet: !options.details });
  if (!validation.ok) return recordUpdateRecoveryFailure(recoveryReceipt, validation, "updated-tree validation");
  printProgress(70, localText("Repository valid", "Repo doğrulandı"));
  let applied;
  printProgress(80, localText("Refreshing managed files", "Managed dosyalar yenileniyor"));
  advanceUpdateRecoveryReceipt(recoveryReceipt, "managed-refresh-started", { sourceHead: afterHead.value });
  if (process.platform === "win32") {
    applied = runPowerShell("update-install", ".\\scripts\\install.ps1", ["-Update", "-PlainOutput"], { quiet: !options.details });
  } else {
    applied = runBash("update-install", "scripts/install.sh", ["--update", "--plain-output"], { quiet: !options.details });
  }
  if (applied.ok) printProgress(90, localText("Verifying installed runtime", "Kurulu runtime doğrulanıyor"));
  const completed = completeAppliedAction(applied, false, {
    kind: "update",
    quiet: !options.details,
    beforeVersion,
    afterVersion,
    beforeHead: beforeHead.value,
    afterHead: afterHead.value
  });
  if (completed.ok) {
    advanceUpdateRecoveryReceipt(recoveryReceipt, "verified", {
      sourceHead: afterHead.value,
      verifiedAt: new Date().toISOString()
    });
    completed.recoveryReceiptPath = recoveryReceipt.path;
  } else {
    return recordUpdateRecoveryFailure(recoveryReceipt, completed, "managed refresh or runtime verification");
  }
  printProgress(100, completed.ok ? localText("Update complete", "Güncelleme tamamlandı") : localText("Update failed", "Güncelleme başarısız"), completed.ok ? "done" : "failed");
  return completed;
}

function runPostApplyVerification(expectSkills = false, extra = {}) {
  if (!extra.quiet) {
    printSurfaceHeader(
      localText("Runtime verification", "Çalışma ortamı doğrulaması"),
      localText(
        "Confirming that installed managed files match this repository. This is evidence, not an assumed success state.",
        "Kurulu managed dosyaların bu repoyla eşleştiği doğrulanıyor. Bu varsayılan başarı değil, gerçek kanıttır."
      ),
      ICONS.run
    );
  }
  return runNode("post-apply-verify", "scripts/verify-install-runtime.mjs", [
    "--redact-paths",
    ...(expectSkills ? ["--expect-skills"] : [])
  ], { quiet: extra.quiet });
}

function outputValue(output, label) {
  const prefix = `${label}:`;
  const line = String(output || "").split(/\r?\n/).find((entry) => entry.trim().startsWith(prefix));
  return line ? line.trim().slice(prefix.length).trim() : null;
}

function operationLabel(kind) {
  const labels = {
    update: localText("Update Codex Chef", "Codex Chef'i güncelle"),
    install: localText("Full install", "Tam kurulum"),
    reset: localText("Force refresh", "Zorunlu yenileme"),
    repair: localText("Repair setup", "Kurulumu onar")
  };
  return labels[kind] || localText("Managed operation", "Yönetilen işlem");
}

function buildOperationResult(applied, verification, context = {}) {
  const evidenceOutput = verification?.output || "";
  const applyOutput = applied?.output || "";
  return {
    kind: context.kind || "managed",
    label: operationLabel(context.kind),
    beforeVersion: context.beforeVersion || null,
    afterVersion: context.afterVersion || currentPackageVersion(),
    beforeHead: context.beforeHead || null,
    afterHead: context.afterHead || null,
    sourceChanged: Boolean(context.beforeHead && context.afterHead && context.beforeHead !== context.afterHead),
    backup: outputValue(applyOutput, "Backup"),
    applyLogPath: applied?.logPath || null,
    verificationLogPath: verification?.logPath || null,
    applyElapsedMs: applied?.elapsedMs ?? null,
    verificationElapsedMs: verification?.elapsedMs ?? null,
    elapsedMs: (applied?.elapsedMs || 0) + (verification?.elapsedMs || 0),
    evidence: {
      status: outputValue(evidenceOutput, "Status"),
      managedFiles: outputValue(evidenceOutput, "Managed files"),
      agents: outputValue(evidenceOutput, "Agents"),
      mcp: outputValue(evidenceOutput, "MCP config"),
      skills: outputValue(evidenceOutput, "Skills")
    }
  };
}

function printOperationReceipt(result) {
  const operation = result.operation;
  const ok = result.ok !== false;
  printSurfaceHeader(
    localText("Operation receipt", "İşlem makbuzu"),
    localText("What changed, what was verified, and what to do next.", "Ne değişti, ne doğrulandı ve sırada ne yapılmalı."),
    ok ? ICONS.ok : ICONS.warn,
    ok ? "brightGreen" : "brightRed"
  );
  printSurfaceNote(localText("Operation", "İşlem"), operation.label);
  printSurfaceNote(localText("Outcome", "Sonuç"), ok ? colorize(localText("verified", "doğrulandı"), "brightGreen") : colorize(localText("attention", "dikkat"), "brightRed"));
  if (operation.beforeVersion || operation.afterVersion) {
    printSurfaceNote(localText("Version", "Sürüm"), `${operation.beforeVersion || operation.afterVersion} ${options.plain ? "->" : "→"} ${operation.afterVersion}`);
  }
  if (operation.beforeHead && operation.afterHead) {
    const sourceState = operation.sourceChanged
      ? `${operation.beforeHead.slice(0, 7)} ${options.plain ? "->" : "→"} ${operation.afterHead.slice(0, 7)}`
      : `${operation.afterHead.slice(0, 7)} (${localText("already current", "zaten güncel")})`;
    printSurfaceNote(localText("Repository", "Repo"), sourceState);
  }
  if (operation.backup) printSurfaceNote(localText("Backup", "Yedek"), operation.backup);
  for (const [label, value] of [
    [localText("Runtime", "Çalışma ortamı"), operation.evidence.status],
    [localText("Managed files", "Yönetilen dosyalar"), operation.evidence.managedFiles],
    [localText("Agents", "Ajanlar"), operation.evidence.agents],
    ["MCP", operation.evidence.mcp],
    [localText("Skills", "Skill'ler"), operation.evidence.skills]
  ]) {
    if (value) printSurfaceNote(label, value);
  }
  printSurfaceNote(localText("Duration", "Süre"), `${operation.elapsedMs} ms`);
  if (operation.applyLogPath) printSurfaceNote(localText("Apply log", "Uygulama logu"), toPosix(path.relative(root, operation.applyLogPath)));
  if (operation.verificationLogPath) printSurfaceNote(localText("Verification log", "Doğrulama logu"), toPosix(path.relative(root, operation.verificationLogPath)));
  console.log("");
  console.log(`${paint(options.plain ? "->" : "→", "bold", ok ? "brightCyan" : "brightYellow")} ${styleHeading(localText("Next step", "Sonraki adım"))}`);
  console.log(ok
    ? localText("Restart Codex to load refreshed managed files, then use System status if you want a fresh live-session check.", "Yenilenen yönetilen dosyaları yüklemek için Codex'i yeniden başlat; ardından yeni bir canlı oturum kontrolü için Sistem durumu'nu kullan.")
    : localText("Nothing is claimed ready. Inspect the failed command and its log before retrying or choosing Repair setup.", "Hiçbir şey hazır sayılmadı. Yeniden denemeden veya Kurulumu onar'ı seçmeden önce başarısız komutu ve logunu incele."));
}

function completeAppliedAction(applied, expectSkills = false, context = {}) {
  const quiet = context.quiet ?? !options.details;
  const verification = applied.ok ? runPostApplyVerification(expectSkills, { quiet }) : null;
  const operation = buildOperationResult(applied, verification, context);
  const result = {
    ...(verification || applied),
    applied: Boolean(applied.ok),
    applyLogPath: applied.logPath,
    verificationLogPath: verification?.logPath || null,
    operation
  };
  if (!options.json) printOperationReceipt(result);
  return result;
}

async function runInstall(interaction = {}) {
  const installation = inspectInstallState();
  if (!installation.ok) return installation;
  printInstallState(installation);

  if (installation.kind === "current") {
    console.log(`${ICONS.ok} ${localText(
      "The complete Codex Chef setup is already current; nothing needs to be installed.",
      "Codex Chef kurulumu zaten eksiksiz ve güncel; kurulacak bir şey yok."
    )}`);
    return { ok: true, skipped: true };
  }

  if (installation.kind === "repair") {
    console.log(`${ICONS.warn} ${localText(
      "This is an existing setup with managed drift. Use Repair setup so drift is backed up and repaired explicitly.",
      "Bu, yönetilen dosyalarında drift olan mevcut bir kurulum. Farkların yedeklenip açıkça onarılması için Kurulumu onar akışını kullanın."
    )}`);
    console.log(styleMuted(localText(
      "Run npm run chef -- --repair to preview it, or choose Repair setup from this menu.",
      "Ön izlemek için npm run chef -- --repair çalıştırın veya bu menüden Kurulumu onar seçeneğini açın."
    )));
    return { ok: true, skipped: true };
  }

  if (installation.kind === "skill_attention") {
    console.log(`${ICONS.warn} ${localText(
      "One or more curated skill directories are invalid. Open Skill status & catalog to inspect and reinstall only those entries.",
      "Bir veya daha fazla curated skill dizini geçersiz. Yalnız bu kayıtları inceleyip yeniden kurmak için Skill durumu ve katalog ekranını açın."
    )}`);
    return { ok: true, skipped: true };
  }

  if (!writeFlowRequested(interaction)) {
    printSurfaceHeader(
      localText("Install preview", "Kurulum ön izlemesi"),
      localText(
        "Full install preview. No managed files, global skills, or Git settings will be changed.",
        "Tam kurulum ön izlemesi. Yönetilen dosyalar, global skill'ler veya Git ayarları değiştirilmeyecek."
      ),
      ICONS.info
    );
    return runPreview();
  }
  if (isMenuInteraction(interaction)) {
    printSurfaceHeader(
      localText("Install preview", "Kurulum ön izlemesi"),
      localText(
        "Reviewing the first-install plan before confirmation.",
        "İlk kurulum planı onaydan önce inceleniyor."
      ),
      ICONS.info
    );
    const preview = runPreview();
    if (!preview.ok) return preview;
  }
  const allowed = await confirmWriteAction(
    "Install",
    "Full install can write managed Codex files after backup and can install curated global skills.",
    interaction
  );
  if (!allowed) return { ok: false, skipped: true };
  let applied;
  if (process.platform === "win32") {
    applied = runPowerShell("install", ".\\scripts\\install.ps1", ["-All", "-PlainOutput"]);
  } else {
    applied = runBash("install", "scripts/install.sh", ["--all", "--plain-output"]);
  }
  return completeAppliedAction(applied, true, {
    kind: "install",
    beforeVersion: currentPackageVersion(),
    afterVersion: currentPackageVersion()
  });
}

async function runReset(interaction = {}) {
  if (!writeFlowRequested(interaction)) {
    printSurfaceHeader(
      localText("Refresh preview", "Yenileme ön izlemesi"),
      localText("No files are replaced in preview. Add --apply only after reviewing the backup-backed plan.", "Ön izlemede dosya değişmez. Yedekli planı inceledikten sonra --apply ekleyin."),
      ICONS.info
    );
    return runPreview(true);
  }
  if (isMenuInteraction(interaction)) {
    printSurfaceHeader(
      localText("Refresh plan", "Yenileme planı"),
      localText("Reviewing the backup-backed managed-file refresh before confirmation.", "Yedekli managed dosya yenilemesi onaydan önce inceleniyor."),
      ICONS.info
    );
    const preview = runPreview(true);
    if (!preview.ok) return preview;
  }
  const allowed = await confirmWriteAction(
    "Reset",
    "Reset refreshes managed Codex Chef files after backup with installer force mode; unrelated user files remain out of scope.",
    interaction
  );
  if (!allowed) return { ok: false, skipped: true };
  let applied;
  if (process.platform === "win32") {
    applied = runPowerShell("reset-apply", ".\\scripts\\install.ps1", ["-All", "-Force", "-PlainOutput"]);
  } else {
    applied = runBash("reset-apply", "scripts/install.sh", ["--all", "--force", "--plain-output"]);
  }
  return completeAppliedAction(applied, true, {
    kind: "reset",
    beforeVersion: currentPackageVersion(),
    afterVersion: currentPackageVersion()
  });
}

async function runRepair(interaction = {}) {
  if (!writeFlowRequested(interaction)) {
    printSurfaceHeader(
      localText("Repair preview", "Onarım ön izlemesi"),
      localText("Shows managed drift without changing files. Add --apply only after review.", "Dosya değiştirmeden managed drift'i gösterir. Yalnız incelemeden sonra --apply ekleyin."),
      ICONS.info
    );
    return runNode("repair-preview", "scripts/repair-install.mjs", ["--redact-paths"]);
  }
  if (isMenuInteraction(interaction)) {
    printSurfaceHeader(
      localText("Repair plan", "Onarım planı"),
      localText("Reviewing managed-file drift before confirmation.", "Managed dosya farkları onaydan önce inceleniyor."),
      ICONS.info
    );
    const preview = runNode("repair-preview", "scripts/repair-install.mjs", ["--redact-paths"]);
    if (!preview.ok) return preview;
  }
  const allowed = await confirmWriteAction(
    "Repair",
    "Repair can update managed Codex Chef files after backup while preserving unrelated user files.",
    interaction
  );
  if (!allowed) return { ok: false, skipped: true };
  return completeAppliedAction(
    runNode("repair-apply", "scripts/repair-install.mjs", ["--redact-paths", "--apply"]),
    false,
    {
      kind: "repair",
      beforeVersion: currentPackageVersion(),
      afterVersion: currentPackageVersion()
    }
  );
}

const BACKUP_MANIFEST_NAME = ".codex-chef-backup.json";
const OPERATION_JOURNAL_NAME = ".codex-chef-operation-journal.json";
const PINNED_SKILL_ROLLBACK_RECEIPT_NAME = ".codex-chef-pinned-skill-rollback.json";
const BACKUP_ID_PATTERN = /^codex-chef-[A-Za-z0-9._-]+$/;

function codexHome() {
  return path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

function agentsHome() {
  return path.resolve(process.env.AGENTS_HOME || path.join(os.homedir(), ".agents"));
}

function backupRootPath() {
  return path.join(codexHome(), "backups");
}

function compactTimestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function isInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRealpath(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function assertInside(child, parent, label) {
  const childPath = path.resolve(child);
  const parentPath = path.resolve(parent);
  if (!isInside(childPath, parentPath)) {
    throw new Error(`Refusing ${label} outside expected root: ${redactLocalPaths(childPath)}`);
  }
}

function validateBackupId(id) {
  if (!id || !BACKUP_ID_PATTERN.test(id) || id.includes("/") || id.includes("\\")) {
    throw new Error(`Invalid backup id: ${id || "<missing>"}`);
  }
}

function validateArchiveRelativePath(relativePath) {
  if (!relativePath || relativePath.includes("\0")) return false;
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) || path.posix.isAbsolute(relativePath)) return false;
  if (/^[A-Za-z]:/.test(relativePath) || relativePath.startsWith("\\\\") || relativePath.startsWith("//")) return false;
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("../") || normalized.includes("/../") || normalized.endsWith("/..")) return false;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return false;
  if (parts.some((part) => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) return false;
  return true;
}

function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function readBackupManifest(archivePath) {
  const manifestPath = path.join(archivePath, BACKUP_MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    const journalPath = path.join(archivePath, OPERATION_JOURNAL_NAME);
    if (!fs.existsSync(journalPath)) return null;
    try {
      const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
      if (
        journal?.schemaVersion !== "codex-chef.operation-journal.v1"
        || !Array.isArray(journal.backups)
      ) {
        return { invalid: true, error: "Operation journal has an unsupported shape." };
      }
      return {
        schemaVersion: "codex-chef.backup.v1",
        createdAt: journal.createdAt,
        operation: journal.operation,
        recoveryJournal: true,
        entries: journal.backups.map((entry) => ({
          backupRelativePath: entry.path,
          size: entry.size,
          sha256: entry.sha256
        })),
        issues: []
      };
    } catch (error) {
      return { invalid: true, error: `Operation journal is invalid JSON: ${error.message}` };
    }
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { invalid: true, error: error.message };
  }
}

function listArchiveFiles(archivePath, includeHashes = false) {
  const files = [];
  const issues = [];
  const archiveReal = safeRealpath(archivePath);

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const relative = toPosix(path.relative(archivePath, fullPath));
      if (
        relative === BACKUP_MANIFEST_NAME
        || relative === OPERATION_JOURNAL_NAME
        || relative === PINNED_SKILL_ROLLBACK_RECEIPT_NAME
      ) continue;
      if (!validateArchiveRelativePath(relative)) {
        issues.push(`Rejected unsafe backup path: ${relative}`);
        continue;
      }
      const stat = fs.lstatSync(fullPath);
      const real = safeRealpath(fullPath);
      if (!isInside(real, archiveReal)) {
        issues.push(`Rejected backup path escaping archive root: ${relative}`);
        continue;
      }
      if (stat.isSymbolicLink()) {
        issues.push(`Rejected symlink in backup archive: ${relative}`);
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        files.push({
          relative,
          path: fullPath,
          size: stat.size,
          sha256: includeHashes ? hashFile(fullPath) : undefined
        });
      }
    }
  }

  walk(archivePath);
  files.sort((a, b) => a.relative.localeCompare(b.relative));
  return { files, issues };
}

function listCanonicalTreeFiles(sourceRoot) {
  const files = [];
  const pending = [sourceRoot];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`Canonical managed restore source contains a link: ${redactLocalPaths(absolute)}`);
      }
      if (stat.isDirectory()) pending.push(absolute);
      else if (stat.isFile()) files.push(toPosix(path.relative(sourceRoot, absolute)));
    }
  }
  return files.sort();
}

function managedRestoreAllowlist() {
  const mappings = new Map();
  const add = (archiveRelative, target) => {
    mappings.set(archiveRelative.replaceAll("\\", "/"), target);
  };
  const addCodex = (relative) => {
    add(relative, path.join(codexHome(), ...relative.split("/")));
    add(`codex/${relative}`, path.join(codexHome(), ...relative.split("/")));
  };

  for (const relative of ["AGENTS.md", "config.toml", "rules/default.rules", "codex-profile.mjs", "serena-pool.mjs"]) addCodex(relative);
  for (const file of fs.readdirSync(path.join(root, "templates", "codex", "agents"))) {
    if (file.endsWith(".toml")) addCodex(`agents/${file}`);
  }
  for (const file of fs.readdirSync(path.join(root, "templates", "codex", "profiles"))) {
    if (file.endsWith(".config.toml")) addCodex(file);
  }

  const pluginSource = path.join(root, "plugins", "codex-chef-workflows");
  for (const file of listCanonicalTreeFiles(pluginSource)) {
    addCodex(`plugins/codex-chef-workflows/${file}`);
    add(
      `agents/plugins/sources/codex-chef-workflows/${file}`,
      path.join(agentsHome(), "plugins", "sources", "codex-chef-workflows", ...file.split("/"))
    );
  }

  const directSkills = readJson("catalog/skills.json").skills.filter((skill) => skill.directInstall === true);
  for (const skill of directSkills) {
    const source = path.join(pluginSource, "skills", skill.name);
    for (const file of [...listCanonicalTreeFiles(source), markerFileName]) {
      const target = path.join(agentsHome(), "skills", skill.name, ...file.split("/"));
      add(`agents/skills/${skill.name}/${file}`, target);
      add(`${skill.name}/${file}`, target);
    }
  }

  add("marketplace.json", path.join(agentsHome(), "plugins", "marketplace.json"));
  add("agents/plugins/marketplace.json", path.join(agentsHome(), "plugins", "marketplace.json"));
  return mappings;
}

function pinnedSkillIds() {
  return new Set(
    readJson("catalog/skills.json").skills
      .filter((skill) => skill.install === true && skill.directInstall !== true)
      .map((skill) => skill.name)
  );
}

function mapBackupRelativeToTarget(relative, pinnedSkill = null) {
  const normalized = relative.replaceAll("\\", "/");
  const exact = managedRestoreAllowlist().get(normalized);
  if (exact) return exact;
  if (!pinnedSkill || !pinnedSkillIds().has(pinnedSkill)) return null;
  const prefix = `agents/skills/${pinnedSkill}/`;
  if (!normalized.startsWith(prefix)) return null;
  const skillRelative = normalized.slice(prefix.length);
  if (!validateArchiveRelativePath(skillRelative)) return null;
  const target = path.join(agentsHome(), "skills", pinnedSkill, ...skillRelative.split("/"));
  return isInside(target, path.join(agentsHome(), "skills", pinnedSkill)) ? target : null;
}

function validateBackupManifest(manifest, files) {
  const issues = [];
  if (!manifest) return ["Backup manifest is required for restore."];
  if (manifest.invalid) return [`Backup manifest is invalid JSON: ${manifest.error}`];
  if (manifest.schemaVersion !== "codex-chef.backup.v1" || !Array.isArray(manifest.entries)) {
    return ["Backup manifest must use codex-chef.backup.v1 with an entries array."];
  }
  if (Array.isArray(manifest.issues) && manifest.issues.length > 0) {
    issues.push("Backup manifest records unresolved archive issues.");
  }

  const manifestEntries = new Map();
  for (const entry of manifest.entries) {
    const relative = String(entry?.backupRelativePath || "").replaceAll("\\", "/");
    if (
      !validateArchiveRelativePath(relative)
      || !Number.isInteger(entry?.size)
      || entry.size < 0
      || !/^[a-f0-9]{64}$/.test(entry?.sha256 || "")
    ) {
      issues.push(`Backup manifest has an invalid entry: ${relative || "<missing>"}`);
      continue;
    }
    if (manifestEntries.has(relative)) {
      issues.push(`Backup manifest repeats an entry: ${relative}`);
      continue;
    }
    manifestEntries.set(relative, entry);
  }

  const archiveEntries = new Set(files.map((file) => file.relative));
  for (const file of files) {
    const entry = manifestEntries.get(file.relative);
    if (!entry) {
      issues.push(`Backup file is not recorded in the manifest: ${file.relative}`);
      continue;
    }
    if (entry.size !== file.size || entry.sha256 !== file.sha256) {
      issues.push(`Backup file does not match its manifest hash or size: ${file.relative}`);
    }
  }
  for (const relative of manifestEntries.keys()) {
    if (!archiveEntries.has(relative)) issues.push(`Backup manifest entry is missing from the archive: ${relative}`);
  }
  return issues;
}

function assertNoSymlinkParents(targetPath) {
  const roots = [codexHome(), agentsHome()];
  const rootForTarget = roots.find((candidate) => isInside(targetPath, candidate));
  if (!rootForTarget) {
    throw new Error(`Refusing restore target outside Codex/Agents homes: ${redactLocalPaths(targetPath)}`);
  }

  const rootReal = safeRealpath(rootForTarget);
  let current = rootForTarget;
  const relativeParts = path.relative(rootForTarget, path.dirname(targetPath))
    .split(path.sep)
    .filter(Boolean);
  for (const part of relativeParts) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing restore through symlinked directory: ${redactLocalPaths(current)}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Refusing restore through non-directory path: ${redactLocalPaths(current)}`);
    }
    if (!isInside(safeRealpath(current), rootReal)) {
      throw new Error(`Refusing restore through directory outside canonical root: ${redactLocalPaths(current)}`);
    }
  }
}

function assertManagedRestoreTarget(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!isInside(resolved, codexHome()) && !isInside(resolved, agentsHome())) {
    throw new Error(`Refusing restore target outside Codex/Agents homes: ${redactLocalPaths(resolved)}`);
  }
  assertNoSymlinkParents(resolved);
}

function restoreBackupPlan(archivePath) {
  const { files, issues } = listArchiveFiles(archivePath, true);
  const manifest = readBackupManifest(archivePath);
  issues.push(...validateBackupManifest(manifest, files));
  const pinnedSkill = manifest?.operation === "pinned-skill-replacement"
    ? String(manifest.skill || "")
    : null;
  if (pinnedSkill && !pinnedSkillIds().has(pinnedSkill)) {
    issues.push(`Backup manifest names an unknown pinned skill: ${pinnedSkill || "<missing>"}`);
  }
  const unsupported = [];
  const planned = [];
  const seenTargets = new Set();

  for (const file of files) {
    const target = mapBackupRelativeToTarget(file.relative, pinnedSkill);
    if (!target) {
      unsupported.push(file.relative);
      continue;
    }
    assertManagedRestoreTarget(target);
    const canonicalTarget = path.resolve(target).toLowerCase();
    if (seenTargets.has(canonicalTarget)) {
      throw new Error(`Backup archive maps multiple files to the same restore target: ${redactLocalPaths(target)}`);
    }
    seenTargets.add(canonicalTarget);
    planned.push({
      ...file,
      target,
      targetExists: fs.existsSync(target)
    });
  }

  const replaceRoot = pinnedSkill && pinnedSkillIds().has(pinnedSkill)
    ? {
      skill: pinnedSkill,
      archiveRelativeRoot: `agents/skills/${pinnedSkill}`,
      targetRoot: path.join(agentsHome(), "skills", pinnedSkill)
    }
    : null;
  if (replaceRoot && files.some((file) => !file.relative.startsWith(`${replaceRoot.archiveRelativeRoot}/`))) {
    issues.push(`Pinned skill backup contains files outside ${replaceRoot.archiveRelativeRoot}.`);
  }
  return {
    files: planned,
    unsupported,
    issues,
    manifestVerified: issues.length === 0,
    replaceRoot
  };
}

function createRollbackBackup(plan, restoredFrom = "") {
  const restoreId = `codex-chef-restore-${compactTimestamp()}-${process.pid}`;
  const rollbackPath = path.join(backupRootPath(), restoreId);
  const entries = [];
  if (plan.replaceRoot && fs.existsSync(plan.replaceRoot.targetRoot)) {
    assertManagedRestoreTarget(plan.replaceRoot.targetRoot);
    const targetStat = fs.lstatSync(plan.replaceRoot.targetRoot);
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      throw new Error(`Refusing to back up unsafe pinned skill target: ${redactLocalPaths(plan.replaceRoot.targetRoot)}`);
    }
    const destination = path.join(rollbackPath, plan.replaceRoot.archiveRelativeRoot);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(plan.replaceRoot.targetRoot, destination, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: false
    });
    const scanned = listArchiveFiles(rollbackPath, true);
    if (scanned.issues.length > 0) throw new Error(scanned.issues.join(" "));
    for (const file of scanned.files) {
      entries.push({
        source: redactLocalPaths(path.join(plan.replaceRoot.targetRoot, path.relative(destination, file.path))),
        backupRelativePath: file.relative,
        size: file.size,
        sha256: file.sha256
      });
    }
  } else {
    for (const item of plan.files) {
      if (!fs.existsSync(item.target)) continue;
      assertManagedRestoreTarget(item.target);
      const targetStat = fs.lstatSync(item.target);
      if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
        throw new Error(`Refusing to back up unsafe restore target: ${redactLocalPaths(item.target)}`);
      }
      const relative = isInside(item.target, codexHome())
        ? path.join("codex", path.relative(codexHome(), item.target))
        : path.join("agents", path.relative(agentsHome(), item.target));
      const destination = path.join(rollbackPath, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(item.target, destination);
      const destinationStat = fs.statSync(destination);
      entries.push({
        source: redactLocalPaths(item.target),
        backupRelativePath: toPosix(relative),
        size: destinationStat.size,
        sha256: hashFile(destination)
      });
    }
  }
  if (entries.length > 0) {
    writeBackupManifest(rollbackPath, {
      operation: plan.replaceRoot ? "pinned-skill-replacement" : "restore-rollback",
      ...(plan.replaceRoot ? { skill: plan.replaceRoot.skill } : {}),
      restoredFrom: path.basename(restoredFrom),
      entries
    });
  }
  return entries.length > 0 ? rollbackPath : null;
}

function writeBackupManifest(backupPath, extra = {}) {
  fs.mkdirSync(backupPath, { recursive: true });
  const packageJson = readJson("package.json");
  const manifest = {
    schemaVersion: "codex-chef.backup.v1",
    createdAt: new Date().toISOString(),
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    platform: process.platform,
    ...extra
  };
  fs.writeFileSync(path.join(backupPath, BACKUP_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function stageRestoreFile(targetPath, data) {
  const stagePath = path.join(
    path.dirname(targetPath),
    `.codex-chef-restore-stage-${path.basename(targetPath)}-${process.pid}-${crypto.randomUUID()}.tmp`
  );
  const descriptor = fs.openSync(stagePath, "wx", 0o600);
  try {
    fs.writeSync(descriptor, data);
    fs.fsyncSync(descriptor);
  } catch (error) {
    try {
      fs.closeSync(descriptor);
    } finally {
      fs.rmSync(stagePath, { force: true });
    }
    throw error;
  }
  fs.closeSync(descriptor);
  return stagePath;
}

function recoverStaleRestoreStages(items) {
  const scanned = new Set();
  for (const item of items) {
    const directory = path.dirname(item.target);
    const prefix = `.codex-chef-restore-stage-${path.basename(item.target)}-`;
    const key = `${directory}\0${prefix}`;
    if (scanned.has(key) || !fs.existsSync(directory)) continue;
    scanned.add(key);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.name.startsWith(prefix) || !entry.name.endsWith(".tmp")) continue;
      const candidate = path.join(directory, entry.name);
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(`Refusing stale restore staging entry that is not a regular file: ${redactLocalPaths(candidate)}`);
      }
      fs.unlinkSync(candidate);
    }
  }
}

function restoreBackupArchiveUnlocked(archivePath, plan) {
  if (plan.files.length === 0) {
    throw new Error("Selected backup archive has no restorable managed Codex Chef files.");
  }
  const verified = [];
  for (const item of plan.files) {
    const sourceStat = fs.lstatSync(item.path);
    if (sourceStat.isSymbolicLink()) {
      throw new Error(`Refusing to restore symlink from backup archive: ${item.relative}`);
    }
    assertInside(safeRealpath(item.path), safeRealpath(archivePath), "restore source");
    const data = fs.readFileSync(item.path);
    const digest = crypto.createHash("sha256").update(data).digest("hex");
    if (sourceStat.size !== item.size || data.length !== item.size || digest !== item.sha256) {
      throw new Error(`Backup file changed after preview; refusing restore: ${item.relative}`);
    }
    assertManagedRestoreTarget(item.target);
    verified.push({ ...item, data });
  }
  recoverStaleRestoreStages(verified);
  const rollbackPath = createRollbackBackup(plan, archivePath);
  if (plan.replaceRoot) {
    const targetRoot = plan.replaceRoot.targetRoot;
    const displaced = path.join(
      path.dirname(targetRoot),
      `.codex-chef-restore-current-${plan.replaceRoot.skill}-${process.pid}-${Date.now()}`
    );
    assertManagedRestoreTarget(targetRoot);
    assertManagedRestoreTarget(displaced);
    let displacedCurrent = false;
    try {
      if (fs.existsSync(targetRoot)) {
        const targetStat = fs.lstatSync(targetRoot);
        if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
          throw new Error(`Refusing pinned skill restore over unsafe target: ${redactLocalPaths(targetRoot)}`);
        }
        fs.renameSync(targetRoot, displaced);
        displacedCurrent = true;
      }
      fs.mkdirSync(targetRoot, { recursive: true });
      let writeCount = 0;
      for (const item of verified) {
        fs.mkdirSync(path.dirname(item.target), { recursive: true });
        fs.writeFileSync(item.target, item.data);
        writeCount += 1;
        if (
          process.env.CODEX_CHEF_TEST_MODE === "1"
          && Number(process.env.CODEX_CHEF_TEST_PINNED_RESTORE_FAIL_AFTER_WRITES) === writeCount
        ) {
          throw new Error("Injected pinned restore write failure.");
        }
      }
      if (displacedCurrent) fs.rmSync(displaced, { recursive: true, force: false });
    } catch (error) {
      if (fs.existsSync(targetRoot)) fs.rmSync(targetRoot, { recursive: true, force: false });
      if (displacedCurrent && fs.existsSync(displaced)) fs.renameSync(displaced, targetRoot);
      throw error;
    }
    return { restored: verified.length, rollbackPath };
  }

  const originals = verified.map((item) => ({
    item,
    existed: fs.existsSync(item.target),
    rollbackRelative: isInside(item.target, codexHome())
      ? path.join("codex", path.relative(codexHome(), item.target))
      : path.join("agents", path.relative(agentsHome(), item.target))
  }));
  const staged = [];
  try {
    for (const original of originals) {
      fs.mkdirSync(path.dirname(original.item.target), { recursive: true });
      original.stagePath = stageRestoreFile(original.item.target, original.item.data);
      staged.push(original);
      if (
        process.env.CODEX_CHEF_TEST_MODE === "1"
        && Number(process.env.CODEX_CHEF_TEST_RESTORE_FAIL_AFTER_STAGING) === staged.length
      ) {
        throw new Error("Injected restore staging failure.");
      }
      if (
        process.env.CODEX_CHEF_TEST_MODE === "1"
        && Number(process.env.CODEX_CHEF_TEST_RESTORE_FAIL_DURING_WRITE) === staged.length
      ) {
        throw new Error("Injected restore in-write failure.");
      }
    }
  } catch (error) {
    for (const original of staged) fs.rmSync(original.stagePath, { force: true });
    throw error;
  }

  const touched = [];
  try {
    for (const original of originals) {
      touched.push(original);
      fs.renameSync(original.stagePath, original.item.target);
      if (
        process.env.CODEX_CHEF_TEST_MODE === "1"
        && Number(process.env.CODEX_CHEF_TEST_RESTORE_FAIL_AFTER_WRITES) === touched.length
      ) {
        throw new Error("Injected restore write failure.");
      }
    }
  } catch (error) {
    for (const original of [...touched].reverse()) {
      if (original.existed && rollbackPath) {
        const rollbackSource = path.join(rollbackPath, original.rollbackRelative);
        fs.copyFileSync(rollbackSource, original.item.target);
      } else if (fs.existsSync(original.item.target)) {
        const targetStat = fs.lstatSync(original.item.target);
        if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
          throw new Error(`Restore rollback found an unsafe target: ${redactLocalPaths(original.item.target)}`);
        }
        fs.rmSync(original.item.target, { force: false });
      }
    }
    throw error;
  } finally {
    for (const original of originals) {
      if (original.stagePath && fs.existsSync(original.stagePath)) {
        fs.rmSync(original.stagePath, { force: true });
      }
    }
  }
  return { restored: verified.length, rollbackPath };
}

function restoreBackupArchive(archivePath, plan) {
  const lock = acquireOperationLock({ root: codexHome(), operation: "backup-restore" });
  try {
    return restoreBackupArchiveUnlocked(archivePath, plan);
  } finally {
    lock.release();
  }
}

function deleteBackupArchive(archivePath) {
  const lock = acquireOperationLock({ root: codexHome(), operation: "backup-delete" });
  try {
    const rootReal = safeRealpath(backupRootPath());
    const archiveReal = safeRealpath(archivePath);
    if (!isInside(archiveReal, rootReal)) {
      throw new Error(`Refusing backup archive deletion outside canonical backup root: ${path.basename(archivePath)}`);
    }
    fs.rmSync(archivePath, { recursive: true, force: false });
  } finally {
    lock.release();
  }
}

function summarizeBackupArchive(id, archivePath) {
  const stat = fs.statSync(archivePath);
  const manifest = readBackupManifest(archivePath);
  const { files } = listArchiveFiles(archivePath);
  let plan;
  try {
    plan = restoreBackupPlan(archivePath);
  } catch (error) {
    plan = {
      files: [],
      unsupported: [],
      issues: [error.message],
      manifestVerified: false
    };
  }
  const verifiedRestorable = plan.manifestVerified
    && plan.unsupported.length === 0
    && plan.files.length > 0;
  const restorableCount = verifiedRestorable ? plan.files.length : 0;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return {
    id,
    kind: id.startsWith("codex-chef-repair-")
      ? "repair"
      : id.startsWith("codex-chef-restore-")
        ? "restore-rollback"
        : id.startsWith("codex-chef-skill-")
          ? "pinned-skill"
        : "install",
    path: archivePath,
    fileCount: files.length,
    restorableCount,
    verifiedRestorable,
    totalBytes,
    modified: stat.mtime.toISOString(),
    manifest: manifest
      ? {
        present: true,
        schemaVersion: manifest.schemaVersion || null,
        operation: manifest.operation || null,
        packageVersion: manifest.packageVersion || null,
        invalid: manifest.invalid === true
      }
      : { present: false },
    issues: [
      ...plan.issues,
      ...plan.unsupported.map((relative) => `Unsupported backup entry: ${relative}`)
    ]
  };
}

function listBackupArchives() {
  const backupRoot = backupRootPath();
  if (!fs.existsSync(backupRoot)) return [];
  const rootReal = safeRealpath(backupRoot);
  return fs.readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BACKUP_ID_PATTERN.test(entry.name))
    .map((entry) => {
      const archivePath = path.join(backupRoot, entry.name);
      const archiveReal = safeRealpath(archivePath);
      if (!isInside(archiveReal, rootReal)) {
        throw new Error(`Refusing backup archive outside backup root: ${entry.name}`);
      }
      return summarizeBackupArchive(entry.name, archivePath);
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

function resolveBackupArchive(id) {
  validateBackupId(id);
  const backupRoot = backupRootPath();
  const archivePath = path.join(backupRoot, id);
  assertInside(archivePath, backupRoot, "backup archive");
  if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isDirectory()) {
    throw new Error(`Backup archive not found: ${id}`);
  }
  const rootReal = safeRealpath(backupRoot);
  const archiveReal = safeRealpath(archivePath);
  if (!isInside(archiveReal, rootReal)) {
    throw new Error(`Refusing backup archive outside canonical backup root: ${id}`);
  }
  return archivePath;
}

function backupJsonPayload(backups) {
  return {
    schemaVersion: 1,
    backupRoot: redactLocalPaths(backupRootPath()),
    codexHome: redactLocalPaths(codexHome()),
    agentsHome: redactLocalPaths(agentsHome()),
    backups: backups.map((backup) => ({
      ...backup,
      path: redactLocalPaths(backup.path)
    }))
  };
}

function printRows(rows, columns, emptyMessage = null) {
  if (rows.length === 0) {
    if (emptyMessage) console.log(`${ICONS.info} ${emptyMessage}`);
    return;
  }
  const width = terminalWidth();
  const compactRows = rows.map((row) => Object.fromEntries(
    columns.map((column) => [column.key, displayValue(row[column.key], column)])
  ));
  const primary = columns[0];
  const secondary = columns.slice(1);
  const primaryWidth = Math.min(
    Math.max(primary.label.length, ...compactRows.map((row) => visualLength(row[primary.key]))) + 5,
    Math.max(width < 90 ? 18 : 22, Math.floor(width * 0.34))
  );
  const detailWidth = Math.max(20, width - primaryWidth - 7);
  const widths = [primaryWidth, detailWidth];
  console.log(tableBorder(widths));
  console.log(tableRow([
    styleMuted(primary.label),
    styleMuted(localText("Details", "Ayrıntı"))
  ], widths));
  console.log(tableBorder(widths));
  compactRows.forEach((row, index) => {
    const primaryValue = `${index + 1}. ${row[primary.key]}`;
    const details = secondary.length > 0
      ? secondary.map((column) => `${styleMuted(`${column.label}:`)} ${row[column.key]}`)
      : [""];
    console.log(tableRow([primaryValue, details[0]], widths));
    for (const detail of details.slice(1)) {
      console.log(tableRow(["", detail], widths));
    }
    console.log(tableBorder(widths));
  });
}

function printBackupTable(backups, interaction = {}) {
  printSurfaceHeader(
    localText("Backup library", "Yedek kütüphanesi"),
    localText("Read-only backup inventory. Menu restore and delete use scoped typed confirmation.", "Yazmasız yedek envanteri. Menüde geri yükleme ve silme hedefe bağlı yazılı onay kullanır."),
    ICONS.logs
  );
  printSurfaceNote(localText("Backup root", "Yedek kök dizini"), redactLocalPaths(backupRootPath()));
  console.log(`${ICONS.info} ${localText(
    "No files are changed from this list screen.",
    "Bu liste ekranında dosya değişmez."
  )}`);
  if (backups.length === 0) {
    console.log(`${ICONS.info} ${localText("No backup archives found.", "Yedek arsivi bulunamadi.")}`);
    return;
  }
  const latestRestorable = backups.find((backup) => backup.restorableCount > 0);
  if (latestRestorable) {
    console.log(`${ICONS.info} ${localText(
      `Latest restorable backup: ${latestRestorable.id} (${latestRestorable.restorableCount} managed files).`,
      `Son geri yüklenebilir yedek: ${latestRestorable.id} (${latestRestorable.restorableCount} managed dosya).`
    )}`);
  }
  const visibleLimit = options.details ? (options.plain ? 10 : backups.length) : 5;
  const visibleBackups = backups.slice(0, visibleLimit);
  if (backups.length > visibleBackups.length) {
    console.log(`${ICONS.info} ${localText(
      `Showing latest ${visibleBackups.length} of ${backups.length}; use --details or --json for the full list.`,
      `${backups.length} yedeğin son ${visibleBackups.length} girdisi gösteriliyor; tam liste için --details veya --json kullan.`
    )}`);
  }
  printRows(
    visibleBackups.map((backup) => ({
      id: backup.id,
      kind: backup.kind,
      files: backup.fileCount,
      restorable: backup.restorableCount,
      bytes: backup.totalBytes,
      manifest: backup.manifest.present ? backup.manifest.schemaVersion || "present" : localText("missing", "legacy/yok"),
      modified: backup.modified
    })),
    isTr()
      ? [
          { key: "id", label: "id" },
          { key: "kind", label: "Tür" },
          { key: "files", label: "Dosya" },
          { key: "restorable", label: "Geri yüklenir" },
          { key: "bytes", label: "Boyut" },
          { key: "manifest", label: "Manifest" },
          { key: "modified", label: "Güncellendi" }
        ]
      : [
          { key: "id", label: "Archive" },
          { key: "kind", label: "Type" },
          { key: "files", label: "Files" },
          { key: "restorable", label: "Can restore" },
          { key: "bytes", label: "Size" },
          { key: "manifest", label: "Manifest" },
          { key: "modified", label: "Updated" }
        ]
  );
  if (!isMenuInteraction(interaction)) {
    console.log(`${ICONS.info} ${localText(
      "Inspect one archive: npm run chef -- --backups --backup <id>",
      "Bir arşivi incele: npm run chef -- --backups --backup <id>"
    )}`);
    console.log(`${ICONS.info} ${localText(
      "Preview a restore: npm run chef -- --backups --backup <id> --restore",
      "Geri yüklemeyi ön izle: npm run chef -- --backups --backup <id> --restore"
    )}`);
    console.log(`${ICONS.info} ${localText(
      "Preview a delete: npm run chef -- --backups --backup <id> --delete",
      "Silmeyi ön izle: npm run chef -- --backups --backup <id> --delete"
    )}`);
  }
}

function printBackupInspect(archivePath, plan, interaction = {}) {
  printSurfaceHeader(
    localText("Backup details", "Yedek ayrıntısı"),
    path.basename(archivePath),
    ICONS.logs
  );
  printSurfaceNote(localText("Location", "Konum"), redactLocalPaths(archivePath));
  if (plan.issues.length > 0) {
    console.log(`${ICONS.warn} ${localText("Archive issues:", "Arsiv sorunlari:")}`);
    for (const issue of plan.issues) console.log(`- ${issue}`);
  }
  if (plan.unsupported.length > 0) {
    console.log(`${ICONS.warn} ${localText(
      `Unsupported entries are not restorable by this CLI: ${plan.unsupported.join(", ")}`,
      `Bu CLI tarafindan geri yuklenemeyen girdiler: ${plan.unsupported.join(", ")}`
    )}`);
  }
  if (plan.files.length === 0) {
    console.log(`${ICONS.info} ${localText("No restorable managed Codex Chef files found.", "Geri yuklenebilir managed Codex Chef dosyasi bulunamadi.")}`);
    return;
  }
  printRows(
    plan.files.map((file) => ({
      archiveFile: toPosix(file.relative),
      target: redactLocalPaths(file.target),
      exists: file.targetExists ? localText("yes", "evet") : localText("no", "hayir"),
      bytes: file.size,
      sha256: file.sha256.slice(0, 12)
    })),
    isTr()
      ? [
          { key: "archiveFile", label: "Arşiv dosyası" },
          { key: "target", label: "Hedef" },
          { key: "exists", label: "Hedef var" },
          { key: "bytes", label: "Boyut" },
          { key: "sha256", label: "sha256" }
        ]
      : [
          { key: "archiveFile", label: "Archive file" },
          { key: "target", label: "Target" },
          { key: "exists", label: "Target exists" },
          { key: "bytes", label: "Size" },
          { key: "sha256", label: "sha256" }
        ]
  );
  if (!isMenuInteraction(interaction)) {
    console.log(`${ICONS.info} ${localText(
      `Preview restore: npm run chef -- --backups --backup ${path.basename(archivePath)} --restore`,
      `Geri yüklemeyi ön izle: npm run chef -- --backups --backup ${path.basename(archivePath)} --restore`
    )}`);
    console.log(`${ICONS.info} ${localText(
      `Preview delete: npm run chef -- --backups --backup ${path.basename(archivePath)} --delete`,
      `Silmeyi ön izle: npm run chef -- --backups --backup ${path.basename(archivePath)} --delete`
    )}`);
  }
}

async function runBackups(interaction = {}, requested = {}) {
  try {
    const backupId = requested.backupId || options.backupId;
    const restore = requested.restore ?? options.restore;
    const deleteBackup = requested.deleteBackup ?? options.deleteBackup;
    if (!backupId) {
      if (restore || deleteBackup) {
        console.error(`${ICONS.warn} ${localText("--restore and --delete require --backup ID.", "--restore ve --delete için --backup ID gerekir.")}`);
        return { ok: false };
      }
      const backups = listBackupArchives();
      if (options.json) {
        console.log(JSON.stringify(backupJsonPayload(backups), null, 2));
      } else {
        printBackupTable(backups, interaction);
      }
      if (isMenuInteraction(interaction) && backups.length > 0) {
        const selectableBackups = options.details
          ? (options.plain ? backups.slice(0, 10) : backups)
          : backups.slice(0, 5);
        const selected = await askSelection(
          selectableBackups,
          localText("\nChoose a backup number, or press Enter to return: ", "\nBir yedek numarası seçin veya dönmek için Enter'a basın: "),
          interaction
        );
        if (!selected) return { ok: true, skipped: true };
        console.log("");
        console.log(`${paint("◆", "brightBlue")} ${styleHeading(localText("Backup action", "Yedek işlemi"))}`);
        printChoiceRow(1, localText("Inspect", "İncele"), localText("read-only", "yazmaz"), "brightGreen", "◉");
        printChoiceRow(2, localText("Restore", "Geri yükle"), localText("typed APPLY confirmation", "yazılı APPLY onayı"), "brightYellow", "↺");
        printChoiceRow(3, localText("Delete archive", "Arşivi sil"), localText(`type DELETE ${selected.id}`, `DELETE ${selected.id} yaz`), "brightRed", "×");
        const action = await askInteractive(
          localText("Choose 1-3, or press Enter to return: ", "1-3 seçin veya dönmek için Enter'a basın: "),
          interaction
        );
        if (action.trim() === "1") return runBackups(interaction, { backupId: selected.id });
        if (action.trim() === "2") return runBackups(interaction, { backupId: selected.id, restore: true });
        if (action.trim() === "3") return runBackups(interaction, { backupId: selected.id, deleteBackup: true });
        console.log(`${ICONS.info} ${localText("No backup action selected; nothing changed.", "Yedek işlemi seçilmedi; hiçbir şey değişmedi.")}`);
        return { ok: true, skipped: true };
      }
      return { ok: true };
    }

    const archivePath = resolveBackupArchive(backupId);
    const plan = restoreBackupPlan(archivePath);
    if (restore && deleteBackup) {
      console.error(`${ICONS.warn} ${localText("Choose either --restore or --delete for one backup archive.", "Tek yedek arşivi için --restore veya --delete seçin; ikisini birlikte kullanmayın.")}`);
      return { ok: false };
    }
    if (options.json) {
      const payload = {
        schemaVersion: 1,
        backup: path.basename(archivePath),
        backupPath: redactLocalPaths(archivePath),
        restore,
        delete: deleteBackup,
        applyRequested: options.apply,
        applied: false,
        outcome: "preview",
        restorableFiles: plan.files.map((file) => ({
          archiveFile: file.relative,
          target: redactLocalPaths(file.target),
          targetExists: file.targetExists,
          bytes: file.size,
          sha256: file.sha256
        })),
        unsupported: plan.unsupported,
        issues: plan.issues,
        manifestVerified: plan.manifestVerified
      };
      if (restore && (plan.issues.length > 0 || plan.unsupported.length > 0)) {
        payload.outcome = "blocked";
        console.log(JSON.stringify(payload, null, 2));
        return { ok: false };
      }
      if (deleteBackup && options.apply) {
        deleteBackupArchive(archivePath);
        payload.applied = true;
        payload.outcome = "deleted";
      } else if (restore && options.apply) {
        const result = restoreBackupArchive(archivePath, plan);
        payload.applied = true;
        payload.outcome = "restored";
        payload.restored = result.restored;
        payload.rollbackPath = result.rollbackPath
          ? redactLocalPaths(result.rollbackPath)
          : null;
      }
      console.log(JSON.stringify(payload, null, 2));
      return { ok: true };
    }

    if (deleteBackup) {
      printSurfaceHeader(
        localText("Backup delete preview", "Yedek silme ön izlemesi"),
        path.basename(archivePath),
        ICONS.warn
      );
      printSurfaceNote(localText("Location", "Konum"), redactLocalPaths(archivePath));
      console.log(`${ICONS.info} ${localText(
        "Deletion is limited to this resolved Codex Chef backup archive under the canonical backup root.",
        "Silme yalnız canonical backup root altında resolve edilen bu Codex Chef yedek arşiviyle sınırlıdır."
      )}`);
      if (!writeFlowRequested(interaction)) {
        console.log(`${ICONS.info} ${localText("No backup archive deleted. Rerun with --apply to delete this archive.", "Yedek arşivi silinmedi. Bu arşivi silmek için --apply ile tekrar çalıştırın.")}`);
        return { ok: true };
      }
      const allowed = isMenuInteraction(interaction)
        ? (await askInteractive(
          `${ICONS.warn} ${localText(
            `Delete permanently removes only ${path.basename(archivePath)}. Type DELETE ${path.basename(archivePath)} to continue, or press Enter to cancel:`,
            `Silme yalnız ${path.basename(archivePath)} arşivini kalıcı kaldırır. Devam etmek için DELETE ${path.basename(archivePath)} yazın veya iptal için Enter'a basın:`
          )} `,
          interaction
        )).trim() === `DELETE ${path.basename(archivePath)}`
        : await confirmWriteAction(
          localText("Backup delete", "Yedek silme"),
          localText(
            "Delete removes the selected Codex Chef backup archive. This does not touch live managed files, but the deleted archive cannot be restored unless you have another copy.",
            "Silme seçili Codex Chef yedek arşivini kaldırır. Live managed dosyalara dokunmaz, ama başka kopya yoksa bu arşivden geri dönemezsiniz."
          ),
          interaction
        );
      if (!allowed) return { ok: false, skipped: true };
      deleteBackupArchive(archivePath);
      console.log(`${ICONS.ok} ${localText(`Backup archive deleted: ${path.basename(archivePath)}.`, `Yedek arsivi silindi: ${path.basename(archivePath)}.`)}`);
      return { ok: true };
    }

    if (!restore) {
      printBackupInspect(archivePath, plan, interaction);
      return { ok: true };
    }

    printSurfaceHeader(
      localText("Backup restore preview", "Yedek geri yükleme ön izlemesi"),
      path.basename(archivePath),
      ICONS.info
    );
    printBackupInspect(archivePath, plan, interaction);
    if (plan.issues.length > 0 || plan.unsupported.length > 0) {
      console.error(`${ICONS.warn} ${localText("Restore blocked because the archive is unverified or contains unsupported entries.", "Arşiv doğrulanmadığı veya desteklenmeyen girdiler içerdiği için geri yükleme engellendi.")}`);
      return { ok: false };
    }
    if (!writeFlowRequested(interaction)) {
      console.log(`${ICONS.info} ${localText("No files restored. Rerun with --apply to restore this backup.", "Dosya geri yüklenmedi. Bu yedeği geri yüklemek için --apply ile tekrar çalıştırın.")}`);
      return { ok: true };
    }
    const allowed = await confirmWriteAction(
      localText("Backup restore", "Yedek geri yukleme"),
      localText(
        "Restore copies selected managed Codex Chef files from the backup archive after creating a rollback backup of current targets.",
        "Geri yukleme, mevcut hedeflerin rollback yedegini olusturduktan sonra secili managed Codex Chef dosyalarini arsivden kopyalar."
      ),
      interaction
    );
    if (!allowed) return { ok: false, skipped: true };
    const result = restoreBackupArchive(archivePath, plan);
    console.log(`${ICONS.ok} ${localText(
      `Restore applied: ${result.restored} managed file(s) copied from ${path.basename(archivePath)}.`,
      `Geri yukleme uygulandi: ${path.basename(archivePath)} arsivinden ${result.restored} managed dosya kopyalandi.`
    )}`);
    if (result.rollbackPath) {
      console.log(`${ICONS.info} ${localText("Rollback backup", "Rollback yedegi")}: ${redactLocalPaths(result.rollbackPath)}`);
    } else {
      console.log(`${ICONS.info} ${localText(
        "Rollback backup: none needed because no current targets existed.",
        "Rollback yedeği: mevcut hedef olmadığı için gerekmedi."
      )}`);
    }
    console.log(`${ICONS.info} ${localText("Restart Codex, then run npm run chef -- --status --repo-only --no-log.", "Codex'i yeniden başlatın, sonra npm run chef -- --status --repo-only --no-log çalıştırın.")}`);
    return { ok: true };
  } catch (error) {
    if (isUserInterrupt(error)) throw error;
    if (options.json) {
      console.log(JSON.stringify({
        schemaVersion: 1,
        applyRequested: options.apply,
        applied: false,
        outcome: "failed",
        error: redactSensitiveOutput(error.message)
      }, null, 2));
    } else {
      console.error(`${ICONS.warn} ${error.message}`);
    }
    return { ok: false };
  }
}

async function askSelection(items, prompt, interaction = {}) {
  if (!process.stdin.isTTY && !interaction.question) return null;
  const answer = await askInteractive(prompt, interaction);
  const index = Number(answer.trim());
  if (!Number.isInteger(index) || index < 1 || index > items.length) return null;
  return items[index - 1];
}

async function installSelectedSkill(skill, interaction = {}) {
  const allowed = await confirmWriteAction(
    "Skill install",
    `Install selected global skill ${skill.name} from ${skill.source}.`,
    interaction
  );
  if (!allowed) return { ok: false, skipped: true };
  const catalog = readJson("catalog/skills.json");
  return runLoggedCommand("skill-install", process.execPath, [
    path.join(root, "scripts", "install-pinned-skill.mjs"),
    "--package",
    skill.package,
    "--commit",
    skill.commit,
    "--skill",
    skill.skill,
    "--cli-version",
    catalog.skillsCliVersion,
    ...(skill.fullDepth ? ["--full-depth"] : []),
  ], { timeout: 300000 });
}

function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.category || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([category, entries]) => ({ category, entries }));
}

function summarizeNames(entries, limit = 3) {
  const names = entries.map((entry) => entry.name);
  const visible = names.slice(0, limit).join(", ");
  const hidden = names.length > limit ? ` +${names.length - limit}` : "";
  return `${visible}${hidden}`;
}

function inspectInstallState() {
  const result = runNode("install-state", "scripts/repair-install.mjs", [
    "--json",
    "--redact-paths"
  ], { quiet: true });
  if (!result.ok) return result;
  let report;
  try {
    report = JSON.parse(result.output);
  } catch (error) {
    console.error(`${ICONS.warn} ${localText(
      `Could not read the installation state: ${error.message}`,
      `Kurulum durumu okunamadı: ${error.message}`
    )}`);
    return { ok: false, error: error.message };
  }
  const managed = report.managedFiles || {};
  const skills = report.skills || {};
  const skillCatalog = readJson("catalog/skills.json");
  const curatedSkillState = inspectCuratedSkillStatus(
    (skillCatalog.skills || []).filter((skill) => skill.install === true || skill.directInstall === true),
    skillCatalog.skillsCliVersion
  );
  const current = Number(managed.current || 0);
  const expected = Number(managed.expected || 0);
  const planned = Number(managed.planned || 0);
  const missingSkills = curatedSkillState.missing;
  const invalidSkills = curatedSkillState.invalid;
  const kind = planned === 0 && missingSkills === 0 && invalidSkills === 0
    ? "current"
    : current === 0
      ? "fresh"
      : planned > 0
        ? "repair"
        : invalidSkills > 0
          ? "skill_attention"
        : "incomplete";
  return {
    ok: true,
    kind,
    managed: { current, expected, planned },
    skills: {
      installed: Number(skills.installed || 0),
      expected: Number(skills.expected || 0),
      missing: missingSkills,
      invalid: invalidSkills,
      extra: Number(skills.extraCount || 0)
    }
  };
}

function printInstallState(installation) {
  const labels = {
    current: localText("Current setup", "Güncel kurulum"),
    fresh: localText("Fresh setup", "Sıfırdan kurulum"),
    repair: localText("Existing setup needs repair", "Mevcut kurulum onarım istiyor"),
    skill_attention: localText("Skill installation needs attention", "Skill kurulumu dikkat istiyor"),
    incomplete: localText("Incomplete setup", "Eksik kurulum")
  };
  console.log("");
  console.log(styleHeading(localText("Installation state", "Kurulum durumu")));
  console.log(`${styleLabel(labels[installation.kind])}: ${localText(
    `${installation.managed.current}/${installation.managed.expected} managed files current; ${installation.managed.planned} planned change(s); ${installation.skills.missing} Chef-managed skill(s) missing; ${installation.skills.invalid} invalid.`,
    `${installation.managed.current}/${installation.managed.expected} yönetilen dosya güncel; ${installation.managed.planned} planlı değişiklik; ${installation.skills.missing} Chef yönetimli skill eksik; ${installation.skills.invalid} geçersiz.`
  )}`);
}

function inspectCuratedSkillStatus(managedSkills, skillsCliVersion = "") {
  const roots = [
    path.join(codexHome(), "skills"),
    path.join(agentsHome(), "skills")
  ];
  const discoveredNames = new Set();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) discoveredNames.add(entry.name);
    }
  }
  const states = new Map();
  const readyNames = new Set();
  const invalidNames = new Set();
  const missingNames = new Set();
  const reasons = new Map();
  for (const skill of managedSkills) {
    const matchingRoots = roots.filter((skillRoot) => fs.existsSync(path.join(skillRoot, skill.name)));
    let state = "missing";
    let reason = "missing";
    if (matchingRoots.length > 1) {
      state = "invalid";
      reason = "duplicate-global-roots";
    } else if (matchingRoots.length === 1) {
      const target = path.join(matchingRoots[0], skill.name);
      try {
        const inspection = skill.directInstall === true
          ? inspectDirectSkillTarget(
              path.join(root, "plugins", "codex-chef-workflows", "skills", skill.name),
              target
            )
          : inspectPinnedSkillTarget(target, {
              package: skill.package,
              commit: skill.commit,
              skill: skill.skill,
              cliVersion: skillsCliVersion
            });
        const valid = skill.directInstall === true
          ? inspection.status === "managed"
          : inspection.valid === true;
        state = valid ? "ready" : "invalid";
        reason = valid ? "verified" : inspection.reason || inspection.status || "invalid";
      } catch (error) {
        state = "invalid";
        reason = error.message;
      }
    }
    states.set(skill.name, state);
    reasons.set(skill.name, reason);
    if (state === "ready") readyNames.add(skill.name);
    else if (state === "invalid") invalidNames.add(skill.name);
    else missingNames.add(skill.name);
  }
  const curatedNames = new Set(managedSkills.map((skill) => skill.name));
  const otherNames = [...discoveredNames].filter((name) => !curatedNames.has(name)).sort();
  const summarize = (predicate) => {
    const entries = managedSkills.filter(predicate);
    return {
      expected: entries.length,
      ready: entries.filter((skill) => states.get(skill.name) === "ready").length,
      invalid: entries.filter((skill) => states.get(skill.name) === "invalid").length,
      missing: entries.filter((skill) => states.get(skill.name) === "missing").length
    };
  };
  return {
    states,
    reasons,
    readyNames,
    invalidNames,
    missingNames,
    otherNames,
    installedNames: readyNames,
    installed: readyNames.size,
    ready: readyNames.size,
    invalid: invalidNames.size,
    missing: missingNames.size,
    expected: managedSkills.length,
    upstream: summarize((skill) => skill.install === true),
    bundled: summarize((skill) => skill.directInstall === true),
    totalVisible: discoveredNames.size,
    roots
  };
}

function skillStateText(state) {
  if (state === "ready") return localText("Installed (ready)", "Kurulu (hazır)");
  if (state === "invalid") return localText("Invalid installation", "Geçersiz kurulum");
  return localText("Missing", "Eksik");
}

function printCuratedSkillStates(installable, installation) {
  console.log("");
  console.log(styleHeading(localText("Codex Chef-managed skill status", "Codex Chef yönetimli skill durumu")));
  installable.forEach((skill, index) => {
    const state = installation.states.get(skill.name);
    const color = state === "ready" ? "brightGreen" : state === "invalid" ? "brightYellow" : "brightMagenta";
    printChoiceRow(index + 1, skill.name, skillStateText(state), color, "✦");
  });
}

async function selectSkill(installable, installation, interaction = {}) {
  printSurfaceHeader(
    localText("Choose a skill to install", "Kurulacak skill'i seç"),
    localText(
      isMenuInteraction(interaction)
        ? "Choose a skill, then confirm its installation with typed APPLY. Press Enter to keep everything unchanged."
        : "Selection only installs after --apply. Press Enter to keep everything unchanged.",
      isMenuInteraction(interaction)
        ? "Bir skill seçin, ardından kurulumu yazılı APPLY ile onaylayın. Her şeyi olduğu gibi bırakmak için Enter'a basın."
        : "Kurulum yalnız --apply ile yapılır. Her şeyi olduğu gibi bırakmak için Enter'a basın."
    ),
    ICONS.docs
  );
  installable.forEach((skill, index) => {
    const status = skillStateText(installation.states.get(skill.name));
    printChoiceRow(index + 1, skill.name, `${skill.source} | ${status}`, "brightMagenta", "✦");
  });
  const selected = await askSelection(
    installable,
    localText(
      "\nSelect a skill number, or press Enter to leave everything unchanged: ",
      "\nSkill numarası seçin veya her şeyi olduğu gibi bırakmak için Enter'a basın: "
    ),
    interaction
  );
  if (!selected) {
    console.log(`${ICONS.info} ${localText("No skill selected; nothing changed.", "Skill seçilmedi; hiçbir şey değişmedi.")}`);
    return { ok: true };
  }
  if (!writeFlowRequested(interaction)) {
    console.log(`${ICONS.warn} ${localText(`Selected ${selected.name}. Re-run npm run chef -- --skills --apply and choose it to install.`, `${selected.name} seçildi. Kurmak için npm run chef -- --skills --apply çalıştırıp tekrar seçin.`)}`);
    return { ok: false, skipped: true };
  }
  return installSelectedSkill(selected, interaction);
}

async function runSkills(interaction = {}) {
  const catalog = readJson("catalog/skills.json");
  const routing = readJson("catalog/routing-profiles.json");
  const installable = (catalog.skills || []).filter((skill) => skill.install === true);
  const bundled = (catalog.skills || []).filter((skill) => skill.directInstall === true);
  const managedSkills = [...installable, ...bundled];
  const profileCount = (routing.profiles || []).length;
  const installation = inspectCuratedSkillStatus(managedSkills, catalog.skillsCliVersion);
  if (options.json) {
    console.log(JSON.stringify({
      schemaVersion: "codex-chef.skills.v1",
      generatedAt: new Date().toISOString(),
      managed: {
        expected: managedSkills.length,
        ready: installation.ready,
        missing: installation.missing,
        invalid: installation.invalid,
        upstream: installation.upstream,
        bundled: installation.bundled
      },
      otherUserInstalled: installation.otherNames,
      totalVisible: installation.totalVisible,
      routingProfiles: profileCount,
      skills: managedSkills.map((skill) => ({
        name: skill.name,
        sourceType: skill.directInstall === true ? "bundled-direct" : "commit-pinned-upstream",
        state: installation.states.get(skill.name),
        reason: installation.reasons.get(skill.name),
        source: skill.source
      }))
    }, null, 2));
    return { ok: installation.missing === 0 && installation.invalid === 0 };
  }
  printSurfaceHeader(
    localText("Skill status & catalog", "Skill durumu ve katalog"),
    localText(
      `${managedSkills.length} Codex Chef-managed skills: ${installable.length} commit-pinned upstream and ${bundled.length} bundled/direct.`,
      `${managedSkills.length} Codex Chef yönetimli skill: ${installable.length} commit-pinned upstream ve ${bundled.length} bundled/direct.`
    ),
    ICONS.docs
  );
  console.log(styleHeading(localText("Installation status", "Kurulum durumu")));
  printWrapped(`${stripAnsi(ICONS.info)} ${localText(
    `${installation.ready} of ${managedSkills.length} Chef-managed skills ready; ${installation.missing} missing; ${installation.invalid} invalid.`,
    `${managedSkills.length} Chef yönetimli skill'in ${installation.ready} tanesi hazır; ${installation.missing} tanesi eksik; ${installation.invalid} tanesi geçersiz.`
  )}`);
  printWrapped(`${stripAnsi(ICONS.info)} ${localText(
    `Upstream: ${installation.upstream.ready}/${installation.upstream.expected} ready. Bundled/direct: ${installation.bundled.ready}/${installation.bundled.expected} ready.`,
    `Upstream: ${installation.upstream.ready}/${installation.upstream.expected} hazır. Bundled/direct: ${installation.bundled.ready}/${installation.bundled.expected} hazır.`
  )}`);
  printWrapped(`${stripAnsi(ICONS.info)} ${localText(
    `${installation.otherNames.length} other/user-installed skill(s) are preserved; ${installation.totalVisible} total skills are visible across global roots.`,
    `${installation.otherNames.length} diğer/kullanıcı kurulu skill korunuyor; global köklerde toplam ${installation.totalVisible} skill görünür.`
  )}`);
  printWrapped(localText(
    "Installed means ready for task-based activation; skills do not run continuously in the background.",
    "Kurulu, görevle eşleştiğinde kullanıma hazır demektir; skill'ler arka planda sürekli çalışmaz."
  ), { styler: styleMuted });
  if (!options.details) {
    printCuratedSkillStates(managedSkills, installation);
    const counts = groupByCategory(managedSkills)
      .map(({ category, entries }) => `${category}: ${entries.length}`)
      .join(" | ");
    printWrapped(counts);
    printWrapped(`${stripAnsi(ICONS.info)} ${localText("Skills activate only when named or clearly matched to the task.", "Skill'ler yalnız adı söylendiğinde veya görevle açıkça eşleştiğinde etkinleşir.")}`);
    printWrapped(`${stripAnsi(ICONS.info)} ${localText(`${profileCount} routing profiles are available. Use --details for the full catalog.`, `${profileCount} routing profili var. Tam katalog için --details kullanın.`)}`);
    const verification = runNode("skills", "scripts/verify-skill-sources.mjs", [], { quiet: true });
    if (!verification.ok || (!process.stdin.isTTY && !interaction.question)) return verification;
    if (installation.missing === 0 && installation.invalid === 0) {
      console.log(`${ICONS.ok} ${localText(
        "All Codex Chef-managed skills are installed and ready.",
        "Tüm Codex Chef yönetimli skill'ler kurulu ve hazır."
      )}`);
      return { ok: true };
    }
    const actionable = installable.filter((skill) => installation.states.get(skill.name) !== "ready");
    if (actionable.length === 0) {
      console.log(`${ICONS.warn} ${localText(
        "Bundled/direct skill repair is required; run npm run chef -- --repair --apply.",
        "Bundled/direct skill onarımı gerekiyor; npm run chef -- --repair --apply çalıştırın."
      )}`);
      return { ok: false };
    }
    return selectSkill(actionable, installation, interaction);
  }
  printRows(
    groupByCategory(managedSkills).map(({ category, entries }) => ({
      category,
      count: entries.length,
      examples: summarizeNames(entries),
      auth: entries.some((skill) => skill.authRequired) ? "yes" : "no",
      risk: entries.some((skill) => skill.risk === "high")
        ? "high"
        : entries.every((skill) => skill.directInstall === true)
          ? "bundled-local"
          : "medium",
      checked: entries.map((skill) => skill.lastChecked).filter(Boolean).sort().at(-1) || "bundled"
    })),
    isTr()
      ? [
          { key: "category", label: "Akış" },
          { key: "count", label: "Skill sayısı" },
          { key: "examples", label: "Örnekler" },
          { key: "risk", label: "Risk" },
          { key: "auth", label: "Auth gerekir" },
          { key: "checked", label: "Son kontrol" }
        ]
      : [
          { key: "category", label: "Workflow" },
          { key: "count", label: "Skills" },
          { key: "examples", label: "Examples" },
          { key: "risk", label: "Risk" },
          { key: "auth", label: "Needs auth" },
          { key: "checked", label: "Last checked" }
        ]
  );
  printRows(
    managedSkills.map((skill) => ({
      skill: skill.name,
      category: skill.category,
      source: skill.directInstall === true
        ? localText("Bundled/direct", "Bundled/direct")
        : localText("Commit-pinned upstream", "Commit-pinned upstream"),
      status: skillStateText(installation.states.get(skill.name)),
      activation: localText("Task matched", "Görev eşleşince")
    })),
    isTr()
      ? [
          { key: "skill", label: "Skill" },
          { key: "category", label: "Akış" },
          { key: "source", label: "Kaynak tipi" },
          { key: "status", label: "Durum" },
          { key: "activation", label: "Aktivasyon" }
        ]
      : [
          { key: "skill", label: "Skill" },
          { key: "category", label: "Workflow" },
          { key: "source", label: "Source type" },
          { key: "status", label: "Status" },
          { key: "activation", label: "Activation" }
        ]
  );
  console.log("");
  console.log(styleHeading(localText("How skill activation works", "Skill aktivasyonu nasıl çalışır")));
  printWrapped(localText(
    "Installed skills do not run by themselves or grant hidden permissions.",
    "Kurulu skill'ler kendiliğinden çalışmaz ve gizli yetki vermez."
  ), { indent: "- " });
  printWrapped(localText(
    "A skill enters context when the user names it, for example $SkillName, or when the task clearly matches its description.",
    "Skill, kullanıcı adını söylediğinde veya görev açıkça açıklamasına uyduğunda context'e girer."
  ), { indent: "- " });
  printWrapped(localText(
    "Codex reads the selected skill's SKILL.md before acting, then loads only referenced files needed for the task.",
    "Codex harekete geçmeden önce seçilen skill'in SKILL.md dosyasını okur, sonra yalnız görev için gereken referansları yükler."
  ), { indent: "- " });
  printWrapped(localText(
    `${profileCount} routing profiles map task shapes to recommended skills; inspect them with npm run chef -- --routing.`,
    `${profileCount} routing profile'i görev tiplerini önerilen skill'lere bağlar; npm run chef -- --routing ile inceleyin.`
  ), { indent: "- " });
  printWrapped(localText(
    "Offline verification runs by default. Online resolution: npm run verify:skills:online -- --timeout-ms=90000",
    "Varsayılan doğrulama offline çalışır. Online çözümleme: npm run verify:skills:online -- --timeout-ms=90000"
  ), { indent: `${ICONS.info} ` });
  const verification = runNode("skills", "scripts/verify-skill-sources.mjs", [], { captureOnly: true });
  for (const line of String(verification.output || "").split(/\r?\n/).filter((entry) => entry.trim())) {
    printWrapped(line);
  }
  if (!verification.ok || (!process.stdin.isTTY && !interaction.question)) return verification;
  if (installation.missing === 0 && installation.invalid === 0) {
    console.log(`${ICONS.ok} ${localText(
      "All Codex Chef-managed skills are installed and ready.",
      "Tüm Codex Chef yönetimli skill'ler kurulu ve hazır."
    )}`);
    return { ok: true };
  }
  const actionable = installable.filter((skill) => installation.states.get(skill.name) !== "ready");
  if (actionable.length === 0) {
    console.log(`${ICONS.warn} ${localText(
      "Bundled/direct skill repair is required; run npm run chef -- --repair --apply.",
      "Bundled/direct skill onarımı gerekiyor; npm run chef -- --repair --apply çalıştırın."
    )}`);
    return { ok: false };
  }
  return selectSkill(actionable, installation, interaction);
}

function explainMcpServer(server) {
  printSurfaceHeader(
    localText("Connector details", "Bağlayıcı ayrıntısı"),
    server.name,
    ICONS.docs
  );
  const rows = [
    {
      field: localText("Catalog status", "Katalog durumu"),
      value: server.sourceKind === "user"
        ? localText("User-added; not in the curated catalog", "Kullanıcı ekledi; curated katalogda yok")
        : displayValue(server.defaultEnabled ? "ready_by_default" : "disabled_by_default")
    },
    { field: localText("Installed config", "Kurulu config"), value: mcpInstalledStateText(server) },
    { field: localText("Transport", "Taşıma"), value: server.transport || localText("Defined in user config", "Kullanıcı config dosyasında tanımlı") },
    { field: localText("Target", "Hedef"), value: mcpTarget(server) },
    { field: localText("Auth boundary", "Auth sınırı"), value: displayValue(server.auth) },
    { field: localText("Approval mode", "Onay modu"), value: server.approval || localText("Read from user config at runtime", "Çalışırken kullanıcı config dosyasından okunur") },
    { field: localText("Risk", "Risk"), value: server.risk || localText("Not cataloged", "Katalogda yok") },
    {
      field: localText("Setup", "Kurulum"),
      value: server.setupKind
        ? `${server.setupKind} - ${translateSetupHint(server.setupHint)}`
        : localText("User-managed configuration", "Kullanıcının yönettiği yapılandırma")
    },
    { field: localText("Why it exists", "Neden var"), value: server.defaultReason || localText("User-added connector", "Kullanıcının eklediği bağlayıcı") },
    { field: localText("Source", "Kaynak"), value: server.sourceUrl || localText("Not present in the curated catalog", "Curated katalogda bulunmuyor") },
    {
      field: localText("Config reference", "Config referansı"),
      value: localText("See templates/codex/config.windows.toml and templates/codex/config.unix.toml for timeouts and per-tool exposure.", "Timeout ve tool bazlı yetkiler için templates/codex/config.windows.toml ve templates/codex/config.unix.toml dosyalarına bakın.")
    },
    {
      field: localText("Live verification", "Canlı doğrulama"),
      value: localText("Not live-checked until /mcp, codex mcp, or a safe read-only probe succeeds.", "/mcp, codex mcp veya güvenli read-only kontrol başarılı olana kadar canlı durum ölçülmez.")
    },
    {
      field: localText("Rollback", "Geri alma"),
      value: localText("Set this connector's enabled flag to false and restart Codex.", "Bu connector için enabled flag'ini false yapın ve Codex'i yeniden başlatın.")
    }
  ];
  printRows(rows, [
    { key: "field", label: localText("Field", "Alan") },
    { key: "value", label: localText("Value", "Değer") }
  ]);
}

function mcpTarget(server) {
  if (server.url) return server.url;
  if (server.package) return server.package;
  if (server.command) return server.sourceRef ? `${server.command} @ ${server.sourceRef}` : server.command;
  if (server.sourceKind === "user") return localText("Defined in user config; target not printed", "Kullanıcı config dosyasında tanımlı; hedef yazdırılmadı");
  return "configured in template";
}

function parseInstalledMcpConfig() {
  const configPath = path.join(codexHome(), "config.toml");
  const configured = new Map();
  if (!fs.existsSync(configPath)) return { configPath, configured };
  let current = null;
  for (const rawLine of fs.readFileSync(configPath, "utf8").split(/\r?\n/)) {
    const section = rawLine.match(/^\s*\[mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\]\s*(?:#.*)?$/);
    if (section) {
      current = section[1] || section[2] || section[3];
      configured.set(current, { name: current, enabled: true });
      continue;
    }
    if (/^\s*\[/.test(rawLine)) {
      current = null;
      continue;
    }
    if (!current) continue;
    const enabled = rawLine.match(/^\s*enabled\s*=\s*(true|false)\s*(?:#.*)?$/i);
    if (enabled) configured.get(current).enabled = enabled[1].toLowerCase() === "true";
  }
  return { configPath, configured };
}

function inspectMcpInstallation(servers) {
  const { configPath, configured } = parseInstalledMcpConfig();
  const catalogNames = new Set(servers.map((server) => server.name));
  const catalogStates = servers.map((server) => {
    const installed = configured.get(server.name);
    return {
      ...server,
      sourceKind: "catalog",
      configured: Boolean(installed),
      enabled: installed?.enabled ?? null,
      installedState: !installed ? "not_configured" : installed.enabled ? "enabled" : "disabled"
    };
  });
  const userAdded = [...configured.values()]
    .filter((server) => !catalogNames.has(server.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((server) => ({
      ...server,
      sourceKind: "user",
      configured: true,
      installedState: server.enabled ? "user_enabled" : "user_disabled"
    }));
  return {
    configPath,
    configured,
    catalogStates,
    userAdded,
    enabled: catalogStates.filter((server) => server.installedState === "enabled").length,
    disabled: catalogStates.filter((server) => server.installedState === "disabled").length,
    notConfigured: catalogStates.filter((server) => server.installedState === "not_configured").length
  };
}

function mcpInstalledStateText(server) {
  const labels = {
    enabled: localText("Configured (enabled)", "Yapılandırılmış (açık)"),
    disabled: localText("Configured (disabled)", "Yapılandırılmış (kapalı)"),
    not_configured: localText("Cataloged (not configured)", "Katalogda (yapılandırılmamış)"),
    user_enabled: localText("User-added (enabled)", "Kullanıcı ekledi (açık)"),
    user_disabled: localText("User-added (disabled)", "Kullanıcı ekledi (kapalı)")
  };
  return labels[server.installedState] || localText("Unknown", "Bilinmiyor");
}

function printMcpInstallationSummary(installation) {
  console.log(`${styleLabel(localText("Configured and enabled", "Yapılandırılmış ve açık"))}: ${installation.enabled}`);
  console.log(`${styleLabel(localText("Configured but disabled", "Yapılandırılmış ama kapalı"))}: ${installation.disabled}`);
  console.log(`${styleLabel(localText("Cataloged but not configured", "Katalogda ama yapılandırılmamış"))}: ${installation.notConfigured}`);
  console.log(`${styleLabel(localText("User-added", "Kullanıcı ekledi"))}: ${installation.userAdded.length}`);
  console.log(styleMuted(localText(
    "Live status was not probed; these states come from the installed config only.",
    "Canlı durum ölçülmedi; bu durumlar yalnız kurulu config dosyasından okunur."
  )));
}

function inspectGlobalSkill(name) {
  const matches = [
    path.join(codexHome(), "skills", name),
    path.join(agentsHome(), "skills", name)
  ].filter((target) => fs.existsSync(target));
  if (matches.length === 0) return { ready: false, state: "missing" };
  if (matches.length > 1) return { ready: false, state: "duplicate-global-roots" };
  try {
    const state = inspectSkillTree(matches[0], name);
    return {
      ready: state.valid === true,
      state: state.valid ? "ready" : state.reason,
      path: redactLocalPaths(matches[0])
    };
  } catch (error) {
    return {
      ready: false,
      state: sanitizeCliError(error, { root }),
      path: redactLocalPaths(matches[0])
    };
  }
}

function inspectBrainContinuity() {
  const source = path.join(root, "plugins", "codex-chef-workflows", "skills", "codex-chef-brain");
  const installedAgentsHome = agentsHome();
  const target = path.join(installedAgentsHome, "skills", "codex-chef-brain");
  const skillErrorOptions = {
    root,
    pathRedactions: [{ target: installedAgentsHome, replacement: "${AGENTS_HOME}" }]
  };
  let skill = { ready: false, state: "missing" };
  try {
    const state = inspectDirectSkillTarget(source, target);
    skill = {
      ready: state.status === "managed",
      state: state.status === "managed"
        ? "ready"
        : sanitizeCliError(state.reason || state.status, skillErrorOptions)
    };
  } catch (error) {
    skill = { ready: false, state: sanitizeCliError(error, skillErrorOptions) };
  }

  const configuredTarget = String(process.env.CODEX_CHEF_BRAIN_HOME || "").trim();
  const vault = {
    configured: Boolean(configuredTarget),
    exists: configuredTarget ? fs.existsSync(configuredTarget) : false,
    target: configuredTarget ? redactLocalPaths(path.resolve(configuredTarget)) : null,
    status: configuredTarget ? "not-checked" : "not-configured"
  };
  if (configuredTarget) {
    const result = spawnSync(process.execPath, [
      path.join(root, "scripts", "brain-cli.mjs"),
      "status",
      "--target",
      configuredTarget,
      "--json"
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      windowsHide: true
    });
    if (!result.error && String(result.stdout || "").trim()) {
      try {
        const report = JSON.parse(result.stdout);
        vault.status = report.ok === true ? "ok" : "attention";
        vault.contentOk = report.contentStatus?.ok ?? null;
        vault.securityOk = report.securityStatus?.ok ?? null;
        if (result.status !== 0) {
          vault.error = Array.isArray(report.errors) && report.errors.length > 0
            ? report.errors.map((message) => sanitizeCliError(message, { root })).join("; ")
            : `exit ${result.status}`;
        }
      } catch (error) {
        vault.status = "invalid-status-output";
        vault.error = sanitizeCliError(error, { root });
      }
    } else {
      vault.status = "attention";
      vault.error = sanitizeCliError(
        result.error?.message || result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`,
        { root }
      );
    }
  }
  return { skill, vault };
}

function runContinuity() {
  const { configured } = parseInstalledMcpConfig();
  const controlConfig = configured.get("codex_control");
  const control = {
    router: inspectGlobalSkill("codex-control-router"),
    configured: Boolean(controlConfig),
    enabled: controlConfig?.enabled ?? false,
    liveStatus: "session-MCP-only",
    liveProbe: {
      cliSubprocessCanProbe: false,
      availableFrom: "current-codex-session-mcp",
      explanation: "This CLI verifies installed configuration only; live project health must be queried through the current Codex session's Control MCP."
    }
  };
  const brain = inspectBrainContinuity();
  brain.vault.scope = "local CODEX_CHEF_BRAIN_HOME only; separate from Control project Brain mappings";
  const payload = {
    schemaVersion: "codex-chef.continuity.v1",
    control,
    brain,
    boundaries: {
      immediateWork: "current-session",
      controlActivation: "explicit delayed, background, recurring, restart-resilient, monitored, or Control-managed request",
      controlProposalIsExecutionAuthority: false,
      brainAutomaticCapture: false,
      brainWritesRequirePreviewAndExplicitApply: true,
      controlBrainBridge: "bounded read-only context only when explicitly requested and project-mapped",
      controlProjectBrainMappingIsSeparateFromLocalVault: true
    }
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return { ok: true };
  }

  printSurfaceHeader(
    localText("Control & Brain continuity", "Control ve Brain sürekliliği"),
    localText(
      "Read-only visibility for background routing and durable project knowledge. Neither surface runs automatically.",
      "Arka plan yönlendirmesi ve kalıcı proje bilgisi için yazmasız görünürlük. İki yüzey de kendiliğinden çalışmaz."
    ),
    ICONS.docs
  );
  console.log(styleHeading("Codex Chef Control"));
  printWrapped(`${localText("Router skill", "Router skill")}: ${control.router.ready ? localText("ready", "hazır") : localText(`attention (${control.router.state})`, `dikkat (${control.router.state})`)}`);
  printWrapped(`codex_control MCP: ${control.configured ? (control.enabled ? localText("configured and enabled", "yapılandırılmış ve açık") : localText("configured but disabled", "yapılandırılmış ama kapalı")) : localText("not configured", "yapılandırılmamış")}`);
  printWrapped(localText(
    "This CLI verifies installed Control configuration only. Live project health is queried by the current Codex session through the Control MCP.",
    "Bu CLI yalnızca kurulu Control yapılandırmasını doğrular. Canlı proje sağlığı, mevcut Codex oturumundan Control MCP ile sorgulanır."
  ), { indent: "- " });
  printWrapped(localText(
    "Immediate work stays in the current session. Control activates only for an explicit delayed, background, recurring, restart-resilient, monitored, or Control-managed request.",
    "Anlık işler mevcut oturumda kalır. Control yalnız açıkça gecikmeli, arka plan, tekrarlı, yeniden başlatmaya dayanıklı, izlenen veya Control yönetimli isteklerde etkinleşir."
  ), { indent: "- " });
  printWrapped(localText(
    "A prepared Control proposal is not execution approval; the Control console remains the authority.",
    "Hazırlanmış Control önerisi çalıştırma onayı değildir; yetki Control konsolunda kalır."
  ), { indent: "- " });

  console.log("");
  console.log(styleHeading("Codex Chef Brain"));
  printWrapped(`${localText("Brain skill", "Brain skill")}: ${brain.skill.ready ? localText("ready", "hazır") : localText(`attention (${brain.skill.state})`, `dikkat (${brain.skill.state})`)}`);
  printWrapped(`${localText("Vault target", "Vault hedefi")}: ${brain.vault.configured ? `${brain.vault.status} (${brain.vault.target})` : localText("not configured; set CODEX_CHEF_BRAIN_HOME or pass --target explicitly", "yapılandırılmamış; CODEX_CHEF_BRAIN_HOME ayarlayın veya açıkça --target verin")}`);
  printWrapped(localText(
    "The local CODEX_CHEF_BRAIN_HOME vault is separate from any Brain mapping owned by a Control project.",
    "Yerel CODEX_CHEF_BRAIN_HOME vault'u, Control projesinin yönettiği Brain eşlemesinden ayrıdır."
  ), { indent: "- " });
  printWrapped(localText(
    "Automatic chat capture and automatic Brain writes are disabled by design. Capture, backup, and restore are preview-first and require explicit apply.",
    "Otomatik sohbet kaydı ve otomatik Brain yazması tasarım gereği kapalıdır. Capture, backup ve restore önce ön izleme yapar ve açık apply ister."
  ), { indent: "- " });
  printWrapped(localText(
    "Control may read only a bounded project-mapped Brain context when the user explicitly requests it; Control never writes to Brain.",
    "Control yalnız kullanıcı açıkça istediğinde proje eşlemeli sınırlı Brain bağlamını okuyabilir; Brain'e asla yazmaz."
  ), { indent: "- " });

  console.log("");
  console.log(styleHeading(localText("Safe next checks", "Güvenli sonraki kontroller")));
  printWrapped("codex-control console", { indent: "- " });
  printWrapped("npm run brain -- status --target <vault> --json", { indent: "- " });
  printWrapped("npm run test:brain", { indent: "- " });
  return { ok: true };
}

async function runMcp(interaction = {}) {
  const catalog = readJson("catalog/mcp-servers.json");
  const servers = catalog.servers || [];
  const installation = inspectMcpInstallation(servers);
  const displayServers = [...installation.catalogStates, ...installation.userAdded];
  printSurfaceHeader(
    localText("MCP connectors", "MCP bağlayıcıları"),
    localText(
      `${servers.length} connectors in the curated catalog; ${installation.userAdded.length} user-added. Default-safe tooling first; account connectors stay disabled until needed.`,
      `Curated katalogda ${servers.length} bağlayıcı; kullanıcı tarafından eklenen ${installation.userAdded.length}. Önce varsayılan güvenli tooling; hesap bağlayıcıları gerekene kadar kapalı kalır.`
    ),
    ICONS.docs
  );
  printMcpInstallationSummary(installation);
  if (!options.details) {
    const isReady = (server) => server.defaultEnabled ?? server.enabledByDefault;
    const ready = servers.filter(isReady).map((server) => server.name);
    const optIn = servers.filter((server) => !isReady(server)).map((server) => server.name);
    console.log(`${styleLabel(localText("Catalog default-enabled", "Katalogda varsayılan açık"))}: ${ready.join(", ") || localText("none", "yok")}`);
    console.log(`${styleLabel(localText("Catalog opt-in", "Katalogda isteğe bağlı"))}: ${optIn.join(", ") || localText("none", "yok")}`);
    console.log(styleMuted(localText("Account, database, production, and broad-filesystem connectors stay disabled until needed.", "Hesap, veritabanı, production ve geniş dosya sistemi bağlayıcıları gerekene kadar kapalı kalır.")));
    console.log(`${ICONS.info} ${localText("Use --details for setup and safety notes.", "Kurulum ve güvenlik notları için --details kullanın.")}`);
    if (process.stdin.isTTY || interaction.question) {
      console.log("");
      displayServers.forEach((server, index) => {
        const color = ["enabled", "user_enabled"].includes(server.installedState) ? "brightGreen" : "brightYellow";
        printChoiceRow(index + 1, server.name, mcpInstalledStateText(server), color, "●");
      });
      const selected = await askSelection(displayServers, localText(
        "\nSelect a connector number for details, or press Enter to leave: ",
        "\nAyrıntı için bağlayıcı numarası seçin veya çıkmak için Enter'a basın: "
      ), interaction);
      if (selected) explainMcpServer(selected);
    }
    return { ok: true };
  }
  console.log(styleMuted(localText(
    "Evidence levels: documented=catalog, configured=template/installed config, verified=only after /mcp or codex mcp live check.",
    "Kanıt seviyeleri: doc=catalog, config=template/kurulu config, canlı=yalnız /mcp veya codex mcp live check başarılıysa."
  )));
  printRows(
    displayServers.map((server) => ({
      connector: server.name,
      source: server.sourceKind === "catalog" ? localText("Curated catalog", "Curated katalog") : localText("User-added", "Kullanıcı ekledi"),
      status: mcpInstalledStateText(server),
      live: localText("Not probed", "Ölçülmedi")
    })),
    isTr()
      ? [
          { key: "connector", label: "Bağlayıcı" },
          { key: "source", label: "Kaynak" },
          { key: "status", label: "Kurulu durum" },
          { key: "live", label: "Canlı durum" }
        ]
      : [
          { key: "connector", label: "Connector" },
          { key: "source", label: "Source" },
          { key: "status", label: "Installed state" },
          { key: "live", label: "Live status" }
        ]
  );
  printRows(
    groupByCategory(servers).map(({ category, entries }) => ({
      category,
      connectors: summarizeNames(entries, 4),
      ready: entries.filter((server) => server.defaultEnabled).length,
      disabled: entries.filter((server) => !server.defaultEnabled).length,
      auth: entries.some((server) => server.auth !== "none") ? localText("Some need account/env auth", "Bazıları hesap/env auth ister") : localText("No credential needed", "Kimlik bilgisi gerekmez"),
      risk: entries.some((server) => server.risk === "critical") ? "critical" : entries.some((server) => server.risk === "high") ? "high" : entries.some((server) => server.risk === "medium") ? "medium" : "low"
    })),
    isTr()
      ? [
          { key: "category", label: "Kategori" },
          { key: "connectors", label: "Bağlayıcılar" },
          { key: "ready", label: "Varsayılan açık" },
          { key: "disabled", label: "Varsayılan kapalı" },
          { key: "auth", label: "Kimlik" },
          { key: "risk", label: "Risk" }
        ]
      : [
          { key: "category", label: "Category" },
          { key: "connectors", label: "Connectors" },
          { key: "ready", label: "Ready by default" },
          { key: "disabled", label: "Disabled by default" },
          { key: "auth", label: "Credential need" },
          { key: "risk", label: "Risk" }
        ]
  );
  console.log(styleMuted(localText(
    "Timeouts and per-tool exposure live in templates/codex/config.windows.toml and templates/codex/config.unix.toml.",
    "Timeout ve tool bazlı yetkiler templates/codex/config.windows.toml ve templates/codex/config.unix.toml içindedir."
  )));
  for (const server of servers.filter((item) => item.setupHint)) {
    console.log(`- ${styleAction(server.name)}: ${translateSetupHint(server.setupHint)}`);
  }
  console.log("");
  console.log(colorize(localText(
    "Authenticated account, database, production, broad filesystem, and graph-indexing MCP connectors stay disabled by default.",
    "Auth isteyen hesap, database, production, geniş filesystem ve graph-indexing MCP connector'ları varsayılan olarak kapalı kalır."
  ), "yellow"));
  console.log(styleMuted(localText(
    "Enable them only for a concrete task in ~/.codex/config.toml, restart Codex, then verify with /mcp or codex mcp.",
    "Yalnız somut bir görev için ~/.codex/config.toml içinde açın, Codex'i yeniden başlatın, sonra /mcp veya codex mcp ile doğrulayın."
  )));
  console.log(styleMuted(localText(
    "Rollback: set the connector's enabled flag back to false and restart Codex.",
    "Rollback: connector enabled flag'ini tekrar false yapın ve Codex'i yeniden başlatın."
  )));
  if (process.stdin.isTTY || interaction.question) {
    console.log("");
    displayServers.forEach((server, index) => {
      const color = ["enabled", "user_enabled"].includes(server.installedState) ? "brightGreen" : "brightYellow";
      const state = mcpInstalledStateText(server);
      printChoiceRow(index + 1, server.name, state, color, "●");
    });
    const selected = await askSelection(displayServers, localText(
      "\nSelect a connector number for details, or press Enter to leave this screen unchanged: ",
      "\nAyrıntı için bağlayıcı numarası seçin veya ekranı değiştirmeden bırakmak için Enter'a basın: "
    ), interaction);
    if (selected) explainMcpServer(selected);
  }
  return { ok: true };
}

function runRouting() {
  const profileArgs = options.profile
    ? ["--profile", options.profile]
    : options.details
      ? []
      : ["--profile", "starter-health"];
  if (!options.profile && !options.details && !options.json) {
    const profileCount = (readJson("catalog/routing-profiles.json").profiles || []).length;
    console.log(`${ICONS.info} ${localText(`${profileCount} routing profiles available; showing starter-health. Use --details for all.`, `${profileCount} routing profili var; starter-health gösteriliyor. Tümü için --details kullanın.`)}`);
  }
  return runNode("routing", "scripts/codex-routing-board.mjs", [
    ...profileArgs,
    ...(options.json ? ["--json"] : [])
  ], {
    waitNote: localText(
      "Showing the agent, skill, MCP, and wait-policy routing contract.",
      "Agent, skill, MCP ve bekleme politikasi routing kontrati gosteriliyor."
    )
  });
}

function runAuth() {
  printSurfaceHeader(
    localText("Authentication notes", "Kimlik doğrulama notları"),
    localText("Public-safe guidance only. This screen never prints account tokens or credential-helper commands.", "Yalnız public-safe rehberlik. Bu ekran account token'i veya credential-helper komutu basmaz."),
    ICONS.lock
  );
  console.log(styleMuted(localText(
    "This public CLI does not print account-scoped re-auth or global Git credential-helper commands.",
    "Bu public CLI account-scope re-auth veya global Git credential-helper komutları basmaz."
  )));
  console.log(styleMuted(localText(
    "If GitHub release, push, or workflow checks fail because local auth is stale, refresh GitHub CLI or Git Credential Manager according to your organization policy.",
    "GitHub release, push veya workflow kontrolleri lokal auth bayat olduğu için fail olursa GitHub CLI veya Git Credential Manager'i kendi kurum politikanıza göre yenileyin."
  )));
  console.log(styleMuted(localText(
    "After refresh, use a read-only remote check such as `git ls-remote origin HEAD` from the target repository before retrying a publish step.",
    "Yenilemeden sonra publish adımını tekrar denemeden önce hedef repoda `git ls-remote origin HEAD` gibi read-only remote check kullanın."
  )));
  console.log("");
  console.log(styleHeading(localText("Notes:", "Notlar:")));
  console.log(`- ${colorize(localText("Do not paste tokens", "Token yapıştırmayın"), "yellow")} ${localText("into repo files, AGENTS.md, skills, rules, or shell history.", "repo dosyalarına, AGENTS.md'ye, skill'lere, rule'lara veya shell history'ye.")}`);
  console.log(`- ${localText("Keep personal account repair, token scope decisions, and global Git credential configuration outside this public repo.", "Kişisel account repair, token scope kararları ve global Git credential config'i bu public repo dışında tutun.")}`);
  console.log(`- ${localText("Do not store workflow or release tokens in Codex Chef templates, examples, logs, or docs.", "Workflow veya release token'larını Codex Chef template, example, log veya docs içinde saklamayın.")}`);
  console.log(`- ${localText("Authenticated MCP connectors still remain disabled until a task needs them.", "Auth isteyen MCP connector'ları bir task gerek duyana kadar disabled kalır.")}`);
  return { ok: true };
}

function recentCliLogs(limit = 12) {
  if (!fs.existsSync(logRoot)) {
    return [];
  }
  return fs.readdirSync(logRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
    .map((entry) => {
      const fullPath = path.join(logRoot, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        file: toPosix(path.relative(root, fullPath)),
        size: stat.size,
        modified: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, limit);
}

function printRecentCliLogs(logs) {
  printRows(
    logs,
    [
      { key: "file", label: localText("file", "dosya") },
      { key: "size", label: localText("size", "boyut") },
      { key: "modified", label: localText("modified", "değişti") }
    ],
    localText("No logs yet.", "Henuz log yok.")
  );
}

function readRepoStatusSnapshot() {
  const result = spawnSync(process.execPath, [
    "scripts/codex-status.mjs",
    "--redact-paths",
    "--skip-runtime",
    "--skip-codex-doctor-checks",
    "--skip-codex-cli",
    "--json"
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
    windowsHide: true,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1"
    }
  });
  if (result.error) {
    return {
      ok: false,
      status: "attention",
      attentionReasons: [`Repo-only status could not run: ${result.error.message}`],
      nextActions: ["Run npm run chef -- --status --repo-only --no-log for details."]
    };
  }
  const output = redactSensitiveOutput([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
  try {
    const parsed = JSON.parse(result.stdout || "{}");
    return {
      ok: result.status === 0,
      status: parsed.status || (result.status === 0 ? "ok" : "attention"),
      git: parsed.gitRepository || null,
      repoDoctor: parsed.repoDoctor ? {
        status: parsed.repoDoctor.status,
        failures: parsed.repoDoctor.failures || []
      } : null,
      attentionReasons: parsed.attentionReasons || [],
      failures: parsed.failures || [],
      nextActions: parsed.nextActions || [],
      generatedAt: parsed.generatedAt || null
    };
  } catch (error) {
    return {
      ok: false,
      status: "attention",
      attentionReasons: [`Repo-only status did not emit parseable JSON: ${error.message}`],
      nextActions: ["Run npm run chef -- --status --repo-only --no-log for text details."],
      outputPreview: output.split(/\r?\n/).slice(0, 6)
    };
  }
}

function backupSummary(backups) {
  const latest = backups[0] || null;
  const latestRestorable = backups.find((backup) => backup.restorableCount > 0) || null;
  return {
    count: backups.length,
    latest: latest ? {
      id: latest.id,
      kind: latest.kind,
      files: latest.fileCount,
      restorable: latest.restorableCount,
      modified: latest.modified
    } : null,
    latestRestorable: latestRestorable ? {
      id: latestRestorable.id,
      files: latestRestorable.fileCount,
      restorable: latestRestorable.restorableCount,
      modified: latestRestorable.modified
    } : null
  };
}

function logSummary(logs) {
  return {
    count: logs.length,
    latest: logs[0] || null,
    contentPrinted: false,
    note: "Only repo-local log metadata is shown; raw log contents are intentionally not printed."
  };
}

function translateCliMessage(message) {
  let text = String(message || "");
  if (!isTr()) return text;
  return text
    .replace("No action needed.", "Ek aksiyon gerekmiyor.")
    .replace("Review attention items; they do not necessarily mean Codex Chef install is broken.", "Dikkat maddelerini inceleyin; bunlar her zaman Codex Chef kurulumunun bozuk olduğu anlamına gelmez.")
    .replace("git status --short is clean.", "git status --short temiz.")
    .replace(/git status --short reports (\d+) changed line\(s\)\./, "git status --short $1 değişen satır bildiriyor.")
    .replace("Runtime, MCP, Git, routing, and log metadata checks.", "Kurulu ortam, MCP, Git, yönlendirme ve log metadata kontrolleri.")
    .replace("Fast repo health without installed runtime probes.", "Kurulu ortam probu olmadan hızlı repo sağlığı.")
    .replace("Repo doctor plus install/runtime expectations.", "Repo doctor ve kurulum/kurulu ortam beklentileri.")
    .replace("Source/runtime managed file, agent, MCP, and skill parity.", "Kaynak/kurulu ortam yönetilen dosya, agent, MCP ve skill eşliği.")
    .replace("Owner-aware process audit; cleanup stays preview-only until --cleanup-stale --apply.", "Sahiplik farkındalıklı süreç denetimi; temizlik --cleanup-stale --apply verilene kadar yalnız önizlemedir.")
    .replace("Recent repo-local CLI log metadata; file contents are not printed.", "Son repo-local CLI log metadata'si; dosya içeriği basılmaz.")
    .replace("Backup archive inventory and restore/delete preview entry points.", "Yedek arşiv envanteri ve restore/delete preview girişleri.")
    .replace("Shows drift repair actions before any backup-backed write.", "Yedekli write öncesi drift onarım adımlarını gösterir.")
    .replace("Shows repo/global refresh plan and validation gates without changing managed files.", "Managed dosyaları değiştirmeden repo/global refresh planı ve validation gate'lerini gösterir.")
    .replace("Agent, skill, MCP, and wait-policy routing contract.", "Agent, skill, MCP ve bekleme politikası yönlendirme kontratı.");
}

function translateSetupHint(message) {
  if (!isTr()) return String(message || "");
  return String(message || "")
    .replace("No credential or extra input is required.", "Kimlik bilgisi veya ek girdi gerekmez.")
    .replace("Requires npm/npx network access on first startup; no credential is required.", "İlk çalışmada npm/npx ağ erişimi gerekir; kimlik bilgisi gerekmez.")
    .replace("Requires npm/npx network access and local browser control; no credential is required.", "npm/npx ağ erişimi ve lokal browser kontrolü gerekir; kimlik bilgisi gerekmez.")
    .replace("Requires npm/npx network access and starts an isolated Chrome/DevTools bridge; no credential is required.", "npm/npx ağ erişimi gerekir ve izole Chrome/DevTools köprüsü başlatır; kimlik bilgisi gerekmez.")
    .replace("Requires uvx and the pinned Serena git source; disable if uvx is unavailable.", "uvx ve pinlenmiş Serena git kaynağı gerekir; uvx yoksa kapalı tutun.")
    .replace("No credential is required; use only for non-secret local memory.", "Kimlik bilgisi gerekmez; yalnız gizli olmayan lokal memory için kullanın.")
    .replace("Requires Node/npx first-run package download; keeps local repository graph state on this machine. Indexing, destructive graph, and admin tools stay prompt-gated or disabled.", "İlk çalışmada Node/npx paket indirmesi gerekir; lokal repo graph state'i bu makinede kalır. Indexing, destructive graph ve admin tool'ları prompt-gated veya disabled kalır.")
    .replace("Requires Node/npx first-run package download; indexes local repositories into a persistent graph. Enable only for tasks that need graph-backed code intelligence.", "İlk çalışmada Node/npx paket indirmesi gerekir; lokal repoları kalıcı bir grafa indexler. Yalnız graph destekli code intelligence gereken işlerde açın.")
    .replace("Choose a deliberate local root path in config args before enabling.", "Açmadan önce config argümanlarında bilinçli bir lokal kök path seçin.")
    .replace("Requires GitHub/Copilot account authorization; keep disabled until private GitHub context is needed.", "GitHub/Copilot hesap yetkilendirmesi gerekir; private GitHub context gerekene kadar kapalı tutun.")
    .replace("Requires Figma account or workspace authorization.", "Figma hesap veya workspace yetkilendirmesi gerekir.")
    .replace("Requires Linear workspace authorization.", "Linear workspace yetkilendirmesi gerekir.")
    .replace("Requires Notion workspace authorization.", "Notion workspace yetkilendirmesi gerekir.")
    .replace("Requires Sentry organization authorization and may expose production error data.", "Sentry organization yetkilendirmesi gerekir ve production hata verisini açığa çıkarabilir.")
    .replace("Requires Vercel account/team authorization and may expose project or deployment data.", "Vercel hesap/team yetkilendirmesi gerekir ve proje veya deployment verisini açığa çıkarabilir.")
    .replace("Before enabling, add a task-specific project_ref query parameter, keep read_only=true, retain only the required feature groups, and complete Supabase OAuth.", "Etkinleştirmeden önce göreve özel project_ref query parametresini ekleyin, read_only=true ayarını koruyun, yalnız gerekli feature group'larını bırakın ve Supabase OAuth akışını tamamlayın.");
}

function scanRecentCliLogSignals(logs) {
  const patterns = [
    { kind: "failure", pattern: /^(?:Failure|Error|Hata):|Overall:\s*fail\b|Status:\s*fail\b|exitCode=(?!0\b)|\b(?:EPERM|ETIMEDOUT)\b|Command failed/i },
    { kind: "warning", pattern: /^(?:Warning|Uyari):|\[warn\]|Overall:\s*warning\b/i },
    { kind: "attention", pattern: /^(?:Attention|Dikkat):|Overall:\s*attention\b|Repo Git:\s*attention\b|Codex CLI:\s*attention\b|Codex doctor checks:\s*attention\b/i },
    { kind: "legacy-raw-value", pattern: /\b(none|null|not_checked|configured_unverified|skipped\/skipped|MCP 0)\b/i }
  ];
  const counts = Object.fromEntries(patterns.map((item) => [item.kind, 0]));
  const newest = [];
  for (const log of logs) {
    const filePath = path.join(root, log.file);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      for (const item of patterns) {
        if (!item.pattern.test(line)) continue;
        counts[item.kind] += 1;
        if (newest.length < 8) {
          newest.push({
            file: log.file,
            kind: item.kind,
            line: truncateVisual(redactSensitiveOutput(line.trim()), 120)
          });
        }
      }
    }
  }
  return {
    scannedFiles: logs.length,
    counts,
    newest,
    rawContentsPrinted: false
  };
}

function printLogSignalSummary(signalSummary) {
  console.log(`${styleLabel(localText("Historical log signal scan", "Geçmiş log sinyal taraması"))}: ${localText(
    `${signalSummary.scannedFiles} recent files; failures=${signalSummary.counts.failure}, warnings=${signalSummary.counts.warning}, attention=${signalSummary.counts.attention}, legacy raw values=${signalSummary.counts["legacy-raw-value"]}`,
    `${signalSummary.scannedFiles} son dosya; hata=${signalSummary.counts.failure}, uyarı=${signalSummary.counts.warning}, dikkat=${signalSummary.counts.attention}, eski ham değer=${signalSummary.counts["legacy-raw-value"]}`
  )}`);
  console.log(styleMuted(localText(
    "These counts are historical log evidence; current health is reported by Status and Doctor.",
    "Bu sayılar geçmiş log kanıtıdır; güncel sağlık Durum ve Doctor tarafından raporlanır."
  )));
}

function diagnosticCommandRows() {
  return [
    {
      area: localText("Repo status", "Repo durumu"),
      command: "npm run chef -- --status --repo-only --no-log",
      writes: localText("Read-only", "Yazmaz"),
      reason: localText("Fast repo health without installed runtime probes.", "Kurulu runtime probu olmadan hızlı repo sağlığı.")
    },
    {
      area: localText("Full status", "Tam durum"),
      command: "npm run chef -- --status --no-log",
      writes: localText("Read-only", "Yazmaz"),
      reason: localText("Runtime, MCP, Git, routing, and log metadata checks.", "Runtime, MCP, Git, routing ve log metadata kontrolleri.")
    },
    {
      area: "Doctor",
      command: "npm run chef -- --doctor --no-log",
      writes: localText("Read-only", "Yazmaz"),
      reason: localText("Repo doctor plus install/runtime expectations.", "Repo doctor ve kurulum/runtime beklentileri.")
    },
    {
      area: localText("Routing", "Yönlendirme"),
      command: "npm run chef -- --routing --no-log",
      writes: localText("Read-only", "Yazmaz"),
      reason: localText("Agent, skill, MCP, and wait-policy routing contract.", "Agent, skill, MCP ve bekleme politikası routing kontratı.")
    },
    {
      area: localText("Update preview", "Güncelleme preview"),
      command: "npm run chef -- --update --no-log",
      writes: localText("Read-only until --apply", "--apply yoksa yazmaz"),
      reason: localText("Shows repo/global refresh plan and validation gates without changing managed files.", "Managed dosyaları değiştirmeden repo/global refresh planı ve validation gate'lerini gösterir.")
    },
    {
      area: localText("Repair preview", "Onarım preview"),
      command: "npm run chef -- --repair --no-log",
      writes: localText("Read-only until --apply", "--apply yoksa yazmaz"),
      reason: localText("Shows drift repair actions before any backup-backed write.", "Yedekli write öncesi drift onarım adımlarını gösterir.")
    },
    {
      area: localText("Backups", "Yedekler"),
      command: "npm run chef -- --backups --no-log",
      writes: localText("Read-only", "Yazmaz"),
      reason: localText("Backup archive inventory and restore/delete preview entry points.", "Yedek arşiv envanteri ve restore/delete preview girişleri.")
    },
    {
      area: localText("CLI logs", "CLI logları"),
      command: "npm run chef -- --logs --no-log",
      writes: localText("Read-only", "Yazmaz"),
      reason: localText("Recent repo-local CLI log metadata; file contents are not printed.", "Son repo-local CLI log metadata'si; dosya içeriği basılmaz.")
    },
    {
      area: localText("Runtime parity", "Runtime eşliği"),
      command: "npm run verify:install:runtime -- --expect-skills --redact-paths",
      writes: localText("Read-only", "Yazmaz"),
      reason: localText("Source/runtime managed file, agent, MCP, and skill parity.", "Source/runtime managed file, agent, MCP ve skill eşliği.")
    },
    {
      area: localText("Serena/MCP process audit", "Serena/MCP süreç denetimi"),
      command: "npm run chef -- --processes --no-log",
      writes: localText("Read-only; exact cleanup is separately gated", "Yazmaz; tam hedefli temizlik ayrıca onaylıdır"),
      reason: localText(
        "Owner-aware process audit; cleanup stays preview-only until --cleanup-stale --apply.",
        "Sahiplik farkındalıklı süreç denetimi; temizlik --cleanup-stale --apply verilene kadar yalnız önizlemedir."
      )
    }
  ];
}

function processAuditPayload() {
  const payload = buildProcessAudit();
  if (options.cleanupStale && options.apply && payload.detailAvailable) {
    return {
      ...payload,
      cleanupResults: terminateCleanupPlan(payload.cleanupCandidates)
    };
  }
  return payload;
}

function runProcesses() {
  const payload = processAuditPayload();
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return { ok: !payload.cleanupResults?.some((item) => !item.ok) };
  }

  printSurfaceHeader(
    localText("Process audit", "Süreç denetimi"),
    options.cleanupStale && options.apply
      ? localText(
          "Approved stale-MCP cleanup. Active Codex trees and unrelated runtimes stay protected.",
          "Onaylı eski MCP temizliği. Aktif Codex ağaçları ve ilgisiz runtime'lar korunur."
        )
      : localText(
          "Parent/child audit. No process is stopped unless --cleanup-stale --apply is explicit.",
          "Parent/child denetimi. --cleanup-stale --apply açıkça verilmedikçe hiçbir süreç durdurulmaz."
        ),
    ICONS.docs
  );
  printSurfaceNote(localText("Evidence source", "Kanıt kaynağı"), payload.source);
  if (payload.error) {
    console.log(`${ICONS.warn} ${localText(
      "Detailed process audit could not run:",
      "Ayrıntılı süreç denetimi çalışamadı:"
    )} ${payload.error}`);
  }
  console.log(`${styleLabel(localText("Codex sessions", "Codex oturumları"))}: ${payload.codexSessions}`);
  console.log(`${styleLabel(localText("Local MCP instances", "Yerel MCP instance'ları"))}: ${payload.localMcpInstances} (${payload.activeMcpInstances} ${localText("active", "aktif")}, ${payload.orphanCandidates} ${localText("orphan candidates", "yetim adayı")}, ${payload.graceInstances} ${localText("in grace", "bekleme süresinde")})`);
  console.log(`${styleLabel(localText("MCP helper processes", "MCP yardımcı süreçleri"))}: ${payload.mcpHelperProcesses} (${payload.mcpWorkingSetMb} MB)`);
  console.log(`${styleLabel(localText("Unrelated runtimes", "İlgisiz runtime'lar"))}: node=${payload.unrelatedRuntimes.node}, python=${payload.unrelatedRuntimes.python}, serena=${payload.unrelatedRuntimes.serena}, uvx=${payload.unrelatedRuntimes.uvx}`);
  printRows(
    payload.servers,
    isTr()
      ? [
          { key: "server", label: "MCP" },
          { key: "instances", label: "Instance" },
          { key: "active", label: "Aktif" },
          { key: "orphanCandidates", label: "Yetim" },
          { key: "processes", label: "Süreç" }
        ]
      : [
          { key: "server", label: "MCP" },
          { key: "instances", label: "Instances" },
          { key: "active", label: "Active" },
          { key: "orphanCandidates", label: "Orphan" },
          { key: "processes", label: "Processes" }
        ],
    localText("No local MCP instances were identified.", "Yerel MCP instance'ı belirlenmedi.")
  );
  if (Array.isArray(payload.cleanupResults)) {
    const stopped = payload.cleanupResults.filter((item) => item.stopped).length;
    const skipped = payload.cleanupResults.filter((item) => item.ok && !item.stopped).length;
    const failed = payload.cleanupResults.filter((item) => !item.ok).length;
    console.log(`${styleLabel(localText("Cleanup result", "Temizlik sonucu"))}: ${stopped} ${localText("stopped", "durduruldu")}, ${skipped} ${localText("skipped after recheck", "yeniden kontrolde atlandı")}, ${failed} ${localText("failed", "başarısız")}`);
  } else if (payload.orphanCandidates > 0) {
    console.log(`${ICONS.info} ${localText(
      "Preview cleanup with --cleanup-stale; execute only with --cleanup-stale --apply.",
      "Temizliği --cleanup-stale ile önizleyin; yalnız --cleanup-stale --apply ile uygulayın."
    )}`);
  }
  console.log("");
  console.log(styleHeading(localText("Safety notes", "Güvenlik notları")));
  for (const item of payload.safety) console.log(`- ${item}`);
  return { ok: !payload.cleanupResults?.some((item) => !item.ok) };
}

function runDiagnostics() {
  const commands = diagnosticCommandRows();
  const logs = recentCliLogs(12);
  const logSignals = scanRecentCliLogSignals(logs);
  const status = readRepoStatusSnapshot();
  const backups = listBackupArchives();
  const attentionReasons = [
    ...(status.attentionReasons || []),
    ...(status.failures || [])
  ];
  const nextActions = [
    ...(status.nextActions || []),
    "npm run chef -- --update --no-log",
    "npm run chef -- --repair --no-log",
    "npm run chef -- --backups --no-log",
    "npm run verify:install:runtime -- --expect-skills --redact-paths"
  ].filter((value, index, array) => array.indexOf(value) === index);
  const payload = {
    schemaVersion: 1,
    logRoot: redactLocalPaths(logRoot),
    backupRoot: redactLocalPaths(backupRootPath()),
    status: {
      source: "repo-only",
      overall: status.status,
      generatedAt: status.generatedAt,
      git: status.git,
      repoDoctor: status.repoDoctor
    },
    attentionReasons,
    nextActions,
    backupSummary: backupSummary(backups),
    logSummary: logSummary(logs),
    logSignals,
    commands,
    recentLogs: logs,
    safety: [
    localText("Read-only by default.", "Varsayılan olarak yazmasız."),
    localText("Use --apply only on explicit install, update, repair, restore, or delete flows.", "--apply yalnız açık install, update, repair, restore veya delete akışlarında kullanılır."),
    localText("Ask before stopping persistent MCP/browser/process state.", "Kalıcı MCP/browser/süreç durumunu durdurmadan önce onay isteyin.")
    ]
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return { ok: true };
  }

  printSurfaceHeader(
    localText("Diagnostics hub", "Tanılama merkezi"),
    localText("Read-only evidence hub. It reports safe commands, log metadata, backups, and cleanup notes without changing global files.", "Yazmasız kanıt merkezi. Global dosya değiştirmeden güvenli komutları, log metadata bilgisini, yedekleri ve temizlik notlarını raporlar."),
    ICONS.docs
  );
  printSurfaceNote(localText("Log root", "Log kök dizini"), payload.logRoot);
  printSurfaceNote(localText("Backup root", "Yedek kök dizini"), payload.backupRoot);
  console.log("");
  console.log(styleHeading(localText("Current health", "Canlı sağlık")));
  console.log(`${styleLabel(localText("Overall", "Genel"))}: ${displayValue(payload.status.overall)}`);
  if (payload.status.git?.summary) {
    console.log(`${styleLabel("Git")}: ${translateCliMessage(payload.status.git.summary)}`);
  }
  if (payload.attentionReasons.length > 0) {
    console.log(`${ICONS.warn} ${localText("Attention reasons:", "Dikkat nedenleri:")}`);
    for (const reason of payload.attentionReasons) console.log(`- ${translateCliMessage(reason)}`);
  } else {
    console.log(`${ICONS.ok} ${localText("No repo-only attention reasons.", "Repo-only dikkat nedeni yok.")}`);
  }
  console.log(`${styleLabel(localText("Backups", "Yedekler"))}: ${payload.backupSummary.count}${payload.backupSummary.latestRestorable ? `; ${localText("latest restorable", "son geri yüklenebilir")}: ${payload.backupSummary.latestRestorable.id}` : ""}`);
  console.log(`${styleLabel(localText("CLI logs", "CLI logları"))}: ${payload.logSummary.count}${payload.logSummary.latest ? `; ${localText("latest", "son")}: ${payload.logSummary.latest.file}` : ""}`);
  printLogSignalSummary(payload.logSignals);
  console.log("");
  console.log(styleHeading(localText("Next safe actions", "Sonraki güvenli adımlar")));
  for (const action of payload.nextActions.slice(0, 6)) console.log(`- ${translateCliMessage(action)}`);
  if (!options.details) {
    console.log(styleMuted(localText(
      "Use --details for diagnostic commands, historical signals, and lifecycle notes.",
      "Tanılama komutları, geçmiş sinyaller ve lifecycle notları için --details kullanın."
    )));
    return { ok: true };
  }
  console.log("");
  console.log(styleHeading(localText("Diagnostic evidence commands", "Tanılama kanıt komutları")));
  printRows(
    commands,
    isTr()
      ? [
          { key: "area", label: "Alan" },
          { key: "command", label: "Komut" },
          { key: "writes", label: "Etki" },
          { key: "reason", label: "Neden" }
        ]
      : [
          { key: "area", label: "Area" },
          { key: "command", label: "Command" },
          { key: "writes", label: "Impact" },
          { key: "reason", label: "Why" }
        ]
  );
  console.log("");
  console.log(styleHeading(localText("Recent historical log signals", "Son geçmiş log sinyalleri")));
  printRows(
    payload.logSignals.newest,
    isTr()
      ? [
          { key: "kind", label: "Tür" },
          { key: "file", label: "Dosya" },
          { key: "line", label: "Satır" }
        ]
      : [
          { key: "kind", label: "Signal" },
          { key: "file", label: "File" },
          { key: "line", label: "Line" }
        ],
    localText("No fail/warn/attention signals in scanned recent logs.", "Taranan son loglarda fail/warn/attention sinyali yok.")
  );
  console.log(styleMuted(localText(
    "Raw log contents stay local and are not printed by diagnostics.",
    "Raw log içeriği lokal kalır ve diagnostics tarafından basılmaz."
  )));
  console.log("");
  console.log(styleHeading(localText("Recent CLI logs", "Son CLI logları")));
  printRecentCliLogs(logs);
  console.log("");
  console.log(styleHeading(localText("Lifecycle cleanup notes", "Lifecycle temizlik notları")));
  console.log(`- ${localText("Use /agent to inspect and close completed agent threads.", "Tamamlanan agent thread'lerini incelemek ve kapatmak için /agent kullan.")}`);
  console.log(`- ${localText("Use /ps and /stop for live Codex tasks before starting another long operation.", "Yeni uzun işleme başlamadan önce live Codex task'ları için /ps ve /stop kullan.")}`);
  console.log(`- ${localText("The reviewed SessionEnd hook waits 45 seconds and stops only exact captured MCP descendants after their Codex owner is gone.", "İncelenmiş SessionEnd hook'u 45 saniye bekler ve yalnız Codex sahibi gittikten sonra tam yakalanmış MCP alt süreçlerini durdurur.")}`);
  console.log(`- ${localText("For manual cleanup, audit first; preview with --processes --cleanup-stale and apply only after reviewing exact candidates.", "Manuel temizlikte önce denetle; --processes --cleanup-stale ile ön izle ve yalnız tam adayları inceledikten sonra uygula.")}`);
  console.log(`- ${localText("Do not paste raw logs publicly; redaction covers common tokens but local logs can still contain machine context.", "Raw logları public paylaşma; redaction yaygın tokenları kapsar ama lokal loglar makine bağlamı içerebilir.")}`);
  return { ok: true };
}

function runLogs() {
  const logs = recentCliLogs(options.details ? 12 : 5);
  printSurfaceHeader(
    localText("Recent logs", "Son loglar"),
    localText("Metadata and signal counts only. Raw log contents stay local.", "Yalnız metadata ve sinyal sayıları. Raw log içeriği lokal kalır."),
    ICONS.logs
  );
  printLogSignalSummary(scanRecentCliLogSignals(logs));
  console.log(styleMuted(localText(
    "Raw log contents stay local; this screen shows metadata and signal counts only.",
    "Raw log içeriği lokal kalır; bu ekran yalnız metadata ve sinyal sayılarını gösterir."
  )));
  console.log("");
  printRecentCliLogs(logs);
  return { ok: true };
}

async function runAction(action, interaction = {}) {
  switch (action) {
    case "status":
      return runStatus();
    case "status:repo-only":
      return runStatus({ repoOnly: true });
    case "doctor":
      return runDoctor();
    case "preview":
      return runPreview();
    case "update":
      return runUpdate(interaction);
    case "reset":
      return runReset(interaction);
    case "install":
      return runInstall(interaction);
    case "repair":
      return runRepair(interaction);
    case "backups":
      return runBackups(interaction);
    case "skills":
      return runSkills(interaction);
    case "mcp":
      return runMcp(interaction);
    case "routing":
      return runRouting();
    case "continuity":
      return runContinuity();
    case "diagnostics":
      return runDiagnostics();
    case "processes":
      return runProcesses();
    case "auth":
      return runAuth();
    case "logs":
      return runLogs();
    case "language":
      return toggleLanguage();
    case "exit":
      return { ok: true };
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function runMenu() {
  printHeader();
  const scriptedMenu = process.env.CODEX_CHEF_TEST_MENU === "1"
    ? fs.readFileSync(0, "utf8").split(/\r?\n/)
    : null;
  const rl = scriptedMenu ? null : createInterface({ input: process.stdin, output: process.stdout });
  const question = async (prompt) => {
    if (scriptedMenu) {
      return normalizeQuestionAbort(async () => {
        process.stdout.write(prompt);
        const answer = scriptedMenu.length > 0 ? scriptedMenu.shift() : "q";
        if (answer === "__ABORT__") throw questionAbortError();
        return answer;
      });
    }
    return readQuestion(rl, prompt);
  };
  const interaction = { question, fromMenu: true };
  // Existing transcript smokes intentionally retain the historical flat menu.
  // Real interactive sessions use the task-oriented command center below.
  const legacyTranscriptMode = process.env.CODEX_CHEF_TEST_MENU === "1"
    && process.env.CODEX_CHEF_TEST_MENU_V2 !== "1";
  const navigationOnly = process.env.CODEX_CHEF_TEST_MENU_NAV_ONLY === "1";
  try {
    let shouldRenderMenu = true;
    let activeGroup = null;
    while (true) {
      if (shouldRenderMenu) {
        if (legacyTranscriptMode) printLegacyMenu();
        else if (activeGroup) printHubMenu(activeGroup);
        else printMenu();
        shouldRenderMenu = false;
      }
      const promptUpperBound = legacyTranscriptMode
        ? MENU_ITEMS.length
        : activeGroup
          ? activeGroup.itemIds.length
          : MENU_GROUPS.length;
      const answer = await question(operatorPrompt(promptUpperBound, !legacyTranscriptMode && Boolean(activeGroup)));
      const normalizedAnswer = answer.trim().toLowerCase();
      if (!normalizedAnswer) {
        console.log(`${ICONS.warn} ${localText(`Choose 1-${promptUpperBound}, l for language, or q to quit.`, `1-${promptUpperBound} arasında bir işlem seçin, dil için l, çıkış için q yazın.`)}`);
        continue;
      }
      if (["q", "quit", "exit"].includes(normalizedAnswer)) break;
      if (!legacyTranscriptMode && ["b", "back", "geri"].includes(normalizedAnswer)) {
        activeGroup = null;
        shouldRenderMenu = true;
        continue;
      }
      if (["l", "lang", "language", "dil"].includes(normalizedAnswer)) {
        const languageItem = MENU_ITEMS.find((candidate) => candidate.id === "language");
        printActionStart(languageItem);
        const result = toggleLanguage();
        printActionEnd(languageItem, result);
        console.log("");
        shouldRenderMenu = true;
        continue;
      }
      const index = Number(normalizedAnswer);
      if (!legacyTranscriptMode && !activeGroup) {
        activeGroup = MENU_GROUPS[index - 1];
        if (!activeGroup) {
          console.log(`${ICONS.warn} ${localText(`Choose 1-${MENU_GROUPS.length}, l for language, or q to quit.`, `1-${MENU_GROUPS.length} arasında bir alan seçin, dil için l, çıkış için q yazın.`)}`);
          continue;
        }
        shouldRenderMenu = true;
        continue;
      }
      const item = legacyTranscriptMode
        ? MENU_ITEMS[index - 1]
        : MENU_ITEMS.find((candidate) => candidate.id === activeGroup.itemIds[index - 1]);
      if (!item) {
        const upperBound = legacyTranscriptMode ? MENU_ITEMS.length : activeGroup.itemIds.length;
        console.log(`${ICONS.warn} ${localText(`Choose 1-${upperBound}, b for back, or q to quit.`, `1-${upperBound} arasında bir işlem seçin, geri için b, çıkış için q yazın.`)}`);
        continue;
      }
      if (item.id === "exit") break;
      printActionStart(item);
      const result = navigationOnly
        ? (console.log(`[route] ${item.id}`), { ok: true, skipped: true })
        : await runAction(item.id, interaction);
      printActionEnd(item, result);
      if (!navigationOnly && item.id !== "language") await pauseBeforeMenu(question);
      else console.log("");
      shouldRenderMenu = true;
    }
  } finally {
    if (rl) rl.close();
  }
  if (!legacyTranscriptMode) {
    console.log("");
    printBrandSignature();
    console.log(styleMuted(localText(
      "U.C.S. Codex Chef session closed.",
      "U.C.S. Codex Chef oturumu kapatıldı."
    )));
  }
}

try {
  if (options.help) {
    printHelp();
  } else if (options.action) {
    const result = await runAction(options.action);
    if (result?.ok === false && !result.skipped) process.exit(1);
  } else if (!process.stdin.isTTY && process.env.CODEX_CHEF_TEST_MENU !== "1") {
    printHelp();
  } else {
    await runMenu();
  }
} catch (error) {
  if (isUserInterrupt(error)) {
    console.log("");
    console.log(`${ICONS.info} ${localText("Interrupted by user.", "Kullanici tarafindan kesildi.")}`);
    process.exitCode = 130;
  } else {
    process.exitCode = emitCliError({
      tool: "chef",
      error,
      argv: args,
      root,
      prefix: localText("Codex Chef CLI error", "Codex Chef CLI hatasi")
    });
  }
}
