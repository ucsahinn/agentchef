import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class CliUsageError extends Error {
  constructor(message, code = "invalid-argument") {
    super(message);
    this.name = "CliUsageError";
    this.code = code;
    this.exitCode = 2;
  }
}

export function requireCliValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new CliUsageError(`${flag} requires a value.`);
  }
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePath(value, target, replacement) {
  if (!target) return value;
  const resolved = path.resolve(target);
  const flags = process.platform === "win32" ? "gi" : "g";
  return value
    .replace(new RegExp(escapeRegExp(resolved), flags), replacement)
    .replace(new RegExp(escapeRegExp(resolved.replaceAll("\\", "/")), flags), replacement);
}

export function redactCliPaths(value, { root = process.cwd(), pathRedactions = [] } = {}) {
  let redacted = String(value ?? "");
  redacted = replacePath(redacted, root, "${REPO}");
  for (const entry of pathRedactions) {
    if (!entry?.target || !entry?.replacement) continue;
    redacted = replacePath(redacted, entry.target, entry.replacement);
  }
  redacted = replacePath(redacted, os.homedir(), "${HOME}");
  return redacted;
}

function redactSecrets(value) {
  return value
    .replace(/(--[A-Za-z0-9][A-Za-z0-9_-]*)=[^\s,;]+/g, "$1=[REDACTED]")
    .replace(
      /-----BEGIN (?:(?:ENCRYPTED |RSA |EC |OPENSSH |DSA )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----[\s\S]*?(?:-----END (?:(?:ENCRYPTED |RSA |EC |OPENSSH |DSA )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----|$)/gi,
      "[REDACTED_PRIVATE_KEY]"
    )
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_OPENAI_KEY]")
    .replace(/\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g, "[REDACTED_SLACK_TOKEN]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, "Bearer [REDACTED]")
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp|amqps|mssql):\/\/[^\s"'`]+/gi, "[REDACTED_CONNECTION_STRING]")
    .replace(
      /(["']?)\b(aws[_-]?secret[_-]?access[_-]?key|aws[_-]?session[_-]?token|password|passwd|secret|secret[_-]?key|client[_-]?secret|consumer[_-]?secret|signing[_-]?key|token|access[_-]?token|refresh[_-]?token|auth[_-]?token|credential|api[_-]?key|authorization|cookie|private[_-]?key|database[_-]?url)\b\1\s*[:=]\s*[\s\S]*/gi,
      "$1$2$1=[REDACTED]"
    )
    .replace(/(--(?:password|passwd|secret|token|credential|api[_-]?key|authorization|cookie)[A-Za-z0-9_-]*)=[\s\S]*/gi, "$1=[REDACTED]");
}

function stripTerminalControls(value) {
  return value
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, "");
}

export function sanitizeCliError(error, { root = process.cwd(), pathRedactions = [] } = {}) {
  let message = "Unknown error";
  try {
    message = String(error?.message || error || "Unknown error");
  } catch {
    message = "Unable to inspect the original error safely.";
  }
  message = redactCliPaths(message, { root, pathRedactions });
  message = stripTerminalControls(redactSecrets(message)).replace(/\s+/g, " ").trim();
  if (message.length > 1000) return `${message.slice(0, 997)}...`;
  return message;
}

function normalizeErrorCode(error) {
  let raw = "";
  try {
    raw = String(error?.code || (error instanceof CliUsageError ? "invalid-argument" : "unexpected-error"));
  } catch {
    raw = "unexpected-error";
  }
  return /^[A-Za-z0-9_.-]{1,64}$/.test(raw) ? raw : "unexpected-error";
}

function wrapPlainError(prefix, message) {
  const requested = Number(process.stderr.columns || process.env.COLUMNS || 96);
  const width = Math.max(40, Math.min(120, Number.isFinite(requested) ? requested : 96));
  const words = `${prefix}: ${message}`.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const originalWord of words) {
    let word = originalWord;
    while (word.length > 0) {
      if (!current && word.length > width) {
        lines.push(word.slice(0, width));
        word = word.slice(width);
        continue;
      }
      if (!current) {
        current = word;
        word = "";
      } else if (current.length + 1 + word.length <= width) {
        current += ` ${word}`;
        word = "";
      } else {
        lines.push(current);
        current = "";
      }
    }
  }
  if (current) lines.push(current);
  return `${lines.join("\n")}\n`;
}

export function emitCliError({
  tool,
  error,
  argv = process.argv.slice(2),
  root = process.cwd(),
  json = argv.includes("--json"),
  prefix = `${tool} error`
}) {
  const message = sanitizeCliError(error, { root });
  const code = normalizeErrorCode(error);
  const exitCode = Number.isInteger(error?.exitCode)
    ? error.exitCode
    : error instanceof CliUsageError
      ? 2
      : 1;

  try {
    if (json) {
      fs.writeSync(1, `${JSON.stringify({
        schemaVersion: "agentchef.cli-error.v1",
        status: "error",
        tool: String(tool || "agentchef").slice(0, 64),
        error: { code, message }
      }, null, 2)}\n`);
    } else {
      fs.writeSync(2, wrapPlainError(stripTerminalControls(String(prefix || "AgentChef error")), message));
    }
  } catch {
    try {
      fs.writeSync(2, "AgentChef error: Unable to render a safe error message.\n");
    } catch {
      // The process still exits nonzero when even the fixed fallback cannot be written.
    }
  }

  return exitCode;
}

export function installCliErrorBoundary(options) {
  let handling = false;
  const handle = (error) => {
    if (handling) {
      fs.writeSync(2, `${options.tool} error: Unable to render CLI failure.\n`);
      process.exit(1);
    }
    handling = true;
    process.exit(emitCliError({ ...options, error }));
  };

  process.on("uncaughtException", handle);
  process.on("unhandledRejection", (reason) => {
    handle(reason instanceof Error ? reason : new Error(String(reason)));
  });
}
