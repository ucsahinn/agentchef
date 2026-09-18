#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const failures = [];
const allowedAuthorizationModes = new Set(["public-only", "owned-private-test", "owned-source"]);
const allowedStatuses = new Set(["pass", "gap", "blocked"]);
const allowedEvidenceRoles = new Set(["source", "local"]);
const allowedEvidenceTypes = new Set([
  "viewport-screenshot",
  "full-page-screenshot",
  "interaction",
  "console",
  "network",
  "accessibility"
]);
const maxEvidenceBytes = 50 * 1024 * 1024;
const maxDecodedPngBytes = 128 * 1024 * 1024;
const requiredChecks = [
  "visual",
  "responsive",
  "interaction",
  "content",
  "assets",
  "console",
  "network",
  "accessibility"
];

function usage() {
  console.error("Usage: node validate-fetch-report.mjs --report <file> [--check-files]");
}

function fail(message) {
  failures.push(message);
}

function valueFor(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${flag} requires a value.`);
    return null;
  }
  return value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function secretCategory(value) {
  const text = JSON.stringify(value);
  const patterns = [
    ["authorization credential", /\bauthorization\s*[:=]\s*["']?(?:bearer|basic)\s+[A-Za-z0-9+/_=-]{12,}/i],
    ["bearer credential", /\bbearer\s+[A-Za-z0-9+/_=-]{20,}/i],
    ["cookie credential", /\b(?:cookie|set-cookie)\s*[:=]\s*["']?[^"'\s,;]{12,}/i],
    ["private key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i],
    ["provider token", /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/],
    ["URL userinfo", /https?:\/\/[^/\s:@]+:[^/\s@]+@/i],
    ["secret assignment", /\b(?:api[_-]?key|access[_-]?token|password|private[_-]?key|client[_-]?secret)\s*[:=]\s*["']?[^"'\s,}]{12,}/i]
  ];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

function requireBoolean(object, key, label) {
  if (typeof object?.[key] !== "boolean") fail(`${label}.${key} must be boolean.`);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string.`);
    return false;
  }
  return true;
}

function normalizedHostname(hostname) {
  let normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
}

function isValidHostname(hostname) {
  const normalized = normalizedHostname(hostname);
  if (!normalized || normalized.length > 253) return false;
  if (net.isIP(normalized)) return true;
  return normalized.split(".").every((label) =>
    label.length > 0
      && label.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  );
}

function ipv6Bytes(address) {
  const normalized = address.toLowerCase();
  if (normalized.includes("%")) return null;
  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  function parseHalf(value) {
    if (!value) return [];
    const parts = value.split(":");
    const result = [];
    for (const part of parts) {
      if (part.includes(".")) {
        const octets = part.split(".").map(Number);
        if (octets.length !== 4 || octets.some((octet) =>
          !Number.isInteger(octet) || octet < 0 || octet > 255
        )) return null;
        result.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else if (!/^[0-9a-f]{1,4}$/i.test(part)) {
        return null;
      } else {
        result.push(Number.parseInt(part, 16));
      }
    }
    return result;
  }

  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] || "");
  if (!left || !right) return null;
  const zeroCount = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (zeroCount < 0 || (halves.length === 1 && left.length !== 8)) return null;
  const groups = [...left, ...Array(zeroCount).fill(0), ...right];
  if (groups.length !== 8) return null;
  return groups.flatMap((group) => [(group >> 8) & 0xff, group & 0xff]);
}

function isNonPublicIpv4(address) {
  const [a, b, c] = address.split(".").map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function isNonPublicHost(hostname) {
  const normalized = normalizedHostname(hostname);
  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) return isNonPublicIpv4(normalized);
  if (ipVersion === 6) {
    const bytes = ipv6Bytes(normalized);
    if (!bytes) return true;
    const isUnspecified = bytes.every((byte) => byte === 0);
    const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
    const isUniqueLocal = (bytes[0] & 0xfe) === 0xfc;
    const isLinkLocal = bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80;
    const isMulticast = bytes[0] === 0xff;
    const isDocumentation = bytes[0] === 0x20
      && bytes[1] === 0x01
      && bytes[2] === 0x0d
      && bytes[3] === 0xb8;
    const isIpv4Mapped = bytes.slice(0, 10).every((byte) => byte === 0)
      && bytes[10] === 0xff
      && bytes[11] === 0xff;
    const mappedIpv4 = bytes.slice(12).join(".");
    return isUnspecified
      || isLoopback
      || isUniqueLocal
      || isLinkLocal
      || isMulticast
      || isDocumentation
      || (isIpv4Mapped && isNonPublicIpv4(mappedIpv4));
  }
  return !normalized.includes(".")
    || normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".local")
    || normalized.endsWith(".internal")
    || normalized.endsWith(".home.arpa");
}

function parseHttpUrl(value, label, originOnly = false) {
  if (!requireNonEmptyString(value, label)) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      fail(`${label} must use http or https.`);
    }
    if (url.username || url.password) {
      fail(`${label} must not contain credentials.`);
    }
    if (!isValidHostname(url.hostname)) {
      fail(`${label} must contain a valid IDNA host name or IP literal.`);
    }
    if (originOnly && (url.pathname !== "/" || url.search || url.hash)) {
      fail(`${label} must be an origin without a path, query, or fragment.`);
    }
    return url;
  } catch {
    fail(`${label} must be a valid URL.`);
    return null;
  }
}

function isSafeRelativePath(value) {
  if (!requireNonEmptyString(value, "Evidence path")) return false;
  if (value !== value.trim() || value.includes("\0") || value.includes(":")) return false;
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) return false;
  if (/^[\\/]/.test(value) || /^[A-Za-z]:/.test(value)) return false;
  const segments = value.replaceAll("\\", "/").split("/");
  return segments.length > 0
    && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative));
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  if (buffer.length < 57 || !buffer.subarray(0, 8).equals(signature)) return null;

  let offset = 8;
  let dimensions = null;
  const imageData = [];
  let hasEnd = false;
  let isFirstChunk = true;
  while (offset + 12 <= buffer.length) {
    const dataLength = buffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > buffer.length) return null;
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + dataLength);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + dataLength);
    if (crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) !== expectedCrc) return null;
    if (isFirstChunk && type !== "IHDR") return null;
    isFirstChunk = false;
    if (type === "IHDR") {
      if (dataLength !== 13 || dimensions) return null;
      dimensions = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12]
      };
    } else if (type === "IDAT") {
      imageData.push(data);
    } else if (type === "IEND") {
      if (dataLength !== 0 || chunkEnd !== buffer.length) return null;
      hasEnd = true;
      break;
    }
    offset = chunkEnd;
  }

  if (!dimensions || imageData.length === 0 || !hasEnd
      || dimensions.width < 1 || dimensions.height < 1
      || dimensions.compression !== 0 || dimensions.filter !== 0 || dimensions.interlace !== 0) {
    return null;
  }
  const channelsByColorType = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);
  const validDepthsByColorType = new Map([
    [0, new Set([1, 2, 4, 8, 16])],
    [2, new Set([8, 16])],
    [3, new Set([1, 2, 4, 8])],
    [4, new Set([8, 16])],
    [6, new Set([8, 16])]
  ]);
  const channels = channelsByColorType.get(dimensions.colorType);
  if (!channels || !validDepthsByColorType.get(dimensions.colorType)?.has(dimensions.bitDepth)) {
    return null;
  }
  const rowBytes = Math.ceil((dimensions.width * channels * dimensions.bitDepth) / 8);
  const expectedDecodedBytes = (rowBytes + 1) * dimensions.height;
  if (!Number.isSafeInteger(expectedDecodedBytes) || expectedDecodedBytes > maxDecodedPngBytes) {
    return null;
  }
  try {
    const decoded = zlib.inflateSync(Buffer.concat(imageData), {
      maxOutputLength: maxDecodedPngBytes
    });
    if (decoded.length !== expectedDecodedBytes) return null;
  } catch {
    return null;
  }
  return dimensions;
}

function validateEvidenceFile(evidence, label, reportDir, viewport) {
  const safeSegments = evidence.path.replaceAll("\\", "/").split("/");
  const lexicalRoot = path.resolve(reportDir);
  const resolved = path.resolve(lexicalRoot, ...safeSegments);
  if (!isContained(lexicalRoot, resolved)) {
    fail(`${label}.path resolves outside the report directory.`);
    return;
  }
  if (!fs.existsSync(resolved)) {
    fail(`${label}.path does not exist: ${evidence.path}`);
    return;
  }

  let stats;
  try {
    stats = fs.lstatSync(resolved);
  } catch (error) {
    fail(`${label}.path cannot be inspected: ${error.message}`);
    return;
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    fail(`${label}.path must be a regular, non-link file.`);
    return;
  }
  if (stats.size < 1 || stats.size > maxEvidenceBytes) {
    fail(`${label}.path must be between 1 byte and 50 MiB.`);
    return;
  }

  try {
    const realRoot = fs.realpathSync(reportDir);
    const realEvidence = fs.realpathSync(resolved);
    if (!isContained(realRoot, realEvidence)) {
      fail(`${label}.path resolves outside the report directory.`);
      return;
    }
  } catch (error) {
    fail(`${label}.path cannot be canonicalized: ${error.message}`);
    return;
  }

  if (evidence.type === "viewport-screenshot") {
    if (path.extname(resolved).toLowerCase() !== ".png") {
      fail(`${label}.path must be a PNG for viewport-screenshot evidence.`);
      return;
    }
    const dimensions = readPngDimensions(resolved);
    if (!dimensions) {
      fail(`${label}.path must contain a complete, decodable PNG.`);
      return;
    }
    if (dimensions.width !== viewport.width || dimensions.height !== viewport.height) {
      fail(`${label}.path dimensions must match viewport ${viewport.name} (${viewport.width}x${viewport.height}).`);
    }
  } else if (evidence.type === "full-page-screenshot") {
    if (path.extname(resolved).toLowerCase() !== ".png") {
      fail(`${label}.path must be a PNG for full-page-screenshot evidence.`);
      return;
    }
    const dimensions = readPngDimensions(resolved);
    if (!dimensions) {
      fail(`${label}.path must contain a complete, decodable PNG.`);
      return;
    }
    if (dimensions.width !== viewport.width || dimensions.height < viewport.height) {
      fail(`${label}.path must match viewport ${viewport.name} width and be at least its height.`);
    }
  }
}

function validateEvidence(
  route,
  label,
  reportDir,
  checkFiles,
  viewports,
  states,
  controls,
  requireMatrix,
  seenPaths
) {
  if (!Array.isArray(route?.evidence)) {
    fail(`${label}.evidence must be an array.`);
    return;
  }

  const viewportMatrixCounts = new Map();
  const fullPageCounts = new Map();
  const interactionCounts = new Map();
  const localSupportCounts = new Map();
  for (const [index, evidence] of route.evidence.entries()) {
    const evidenceLabel = `${label}.evidence[${index}]`;
    if (!isPlainObject(evidence)) {
      fail(`${evidenceLabel} must be an object.`);
      continue;
    }
    if (!allowedEvidenceRoles.has(evidence.role)) {
      fail(`${evidenceLabel}.role must be source or local.`);
    }
    if (!allowedEvidenceTypes.has(evidence.type)) {
      fail(`${evidenceLabel}.type is not supported.`);
    }
    if (!requireNonEmptyString(evidence.viewport, `${evidenceLabel}.viewport`)
        || !viewports.has(evidence.viewport.toLowerCase())) {
      fail(`${evidenceLabel}.viewport must name a declared viewport.`);
    }
    if (!requireNonEmptyString(evidence.state, `${evidenceLabel}.state`)
        || !states.has(evidence.state.toLowerCase())) {
      fail(`${evidenceLabel}.state must name a declared route state.`);
    }
    if (!isSafeRelativePath(evidence.path)) {
      fail(`${evidenceLabel}.path must be a safe relative path.`);
      continue;
    }
    const portablePath = evidence.path.replaceAll("\\", "/").toLowerCase();
    if (seenPaths.has(portablePath)) {
      fail(`${evidenceLabel}.path must not duplicate another evidence file.`);
    } else {
      seenPaths.add(portablePath);
    }

    const viewport = typeof evidence.viewport === "string"
      ? viewports.get(evidence.viewport.toLowerCase())
      : null;
    if (checkFiles && viewport) {
      validateEvidenceFile(evidence, evidenceLabel, reportDir, viewport);
    }
    if (evidence.type === "viewport-screenshot"
        && allowedEvidenceRoles.has(evidence.role)
        && viewport
        && typeof evidence.state === "string"
        && states.has(evidence.state.toLowerCase())) {
      const key = `${evidence.role}|${evidence.viewport.toLowerCase()}|${evidence.state.toLowerCase()}`;
      viewportMatrixCounts.set(key, (viewportMatrixCounts.get(key) || 0) + 1);
    } else if (evidence.type === "full-page-screenshot"
        && allowedEvidenceRoles.has(evidence.role)
        && viewport
        && typeof evidence.state === "string"
        && states.has(evidence.state.toLowerCase())) {
      const key = `${evidence.role}|${evidence.viewport.toLowerCase()}|${evidence.state.toLowerCase()}`;
      fullPageCounts.set(key, (fullPageCounts.get(key) || 0) + 1);
    } else if (evidence.type === "interaction") {
      if (!requireNonEmptyString(evidence.control, `${evidenceLabel}.control`)
          || !controls.has(evidence.control.toLowerCase())) {
        fail(`${evidenceLabel}.control must name a declared route control.`);
      } else if (allowedEvidenceRoles.has(evidence.role)
          && typeof evidence.state === "string"
          && states.has(evidence.state.toLowerCase())) {
        const control = controls.get(evidence.control.toLowerCase());
        if (!control.states.has(evidence.state.toLowerCase())) {
          fail(`${evidenceLabel}.state is not declared for control "${evidence.control}".`);
        } else {
          const key = `${evidence.role}|${evidence.control.toLowerCase()}|${evidence.state.toLowerCase()}`;
          interactionCounts.set(key, (interactionCounts.get(key) || 0) + 1);
        }
      }
    } else if (["console", "network", "accessibility"].includes(evidence.type)
        && evidence.role === "local"
        && typeof evidence.state === "string"
        && states.has(evidence.state.toLowerCase())) {
      const key = `${evidence.type}|${evidence.state.toLowerCase()}`;
      localSupportCounts.set(key, (localSupportCounts.get(key) || 0) + 1);
    }
  }

  if (requireMatrix) {
    for (const role of allowedEvidenceRoles) {
      for (const viewport of viewports.values()) {
        for (const state of states) {
          const key = `${role}|${viewport.name.toLowerCase()}|${state}`;
          const count = viewportMatrixCounts.get(key) || 0;
          if (count !== 1) {
            fail(`${label}.evidence must contain exactly one ${role} viewport-screenshot for state "${state}" at viewport "${viewport.name}".`);
          }
        }
      }
    }
  }

  if (route?.checks?.visual === "pass") {
    const baselineState = states.values().next().value;
    for (const role of allowedEvidenceRoles) {
      for (const viewport of viewports.values()) {
        const key = `${role}|${viewport.name.toLowerCase()}|${baselineState}`;
        if ((fullPageCounts.get(key) || 0) !== 1) {
          fail(`${label}.evidence must contain exactly one ${role} full-page-screenshot for baseline state "${baselineState}" at viewport "${viewport.name}".`);
        }
      }
    }
  }
  if (route?.checks?.interaction === "pass") {
    if (controls.size === 0) {
      fail(`${label}.controls must inventory at least one interaction scope when interaction passes.`);
    }
    for (const control of controls.values()) {
      for (const state of control.states) {
        for (const role of allowedEvidenceRoles) {
          const key = `${role}|${control.id.toLowerCase()}|${state}`;
          if ((interactionCounts.get(key) || 0) < 1) {
            fail(`${label}.evidence must contain ${role} interaction evidence for control "${control.id}" in state "${state}".`);
          }
        }
      }
    }
  }
  for (const type of ["console", "network", "accessibility"]) {
    if (route?.checks?.[type] !== "pass") continue;
    for (const state of states) {
      if ((localSupportCounts.get(`${type}|${state}`) || 0) < 1) {
        fail(`${label}.evidence must contain local ${type} evidence for state "${state}".`);
      }
    }
  }
}

const reportArg = valueFor("--report");
const checkFiles = args.includes("--check-files");
const supportedArgs = new Set(["--report", "--check-files"]);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg.startsWith("--")) continue;
  if (!supportedArgs.has(arg)) fail(`Unknown argument: ${arg}`);
  if (arg === "--report") index += 1;
}

if (!reportArg) {
  usage();
  process.exit(2);
}

const reportPath = path.resolve(process.cwd(), reportArg);
if (!fs.existsSync(reportPath)) {
  fail(`Report does not exist: ${reportArg}`);
}

let report = null;
if (failures.length === 0) {
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (error) {
    fail(`Report must be valid JSON: ${error.message}`);
  }
}

if (report) {
  if (report.schemaVersion !== "agentchef.fetch-report.v1") {
    fail("schemaVersion must be agentchef.fetch-report.v1.");
  }

  let sourceUrl = null;
  if (!isPlainObject(report.source)) {
    fail("source must be an object.");
  } else {
    sourceUrl = parseHttpUrl(report.source.url, "source.url");
    if (requireNonEmptyString(report.source.capturedAt, "source.capturedAt")
        && Number.isNaN(Date.parse(report.source.capturedAt))) {
      fail("source.capturedAt must be an ISO-compatible date.");
    }
  }

  if (!isPlainObject(report.scope)) {
    fail("scope must be an object.");
  } else {
    if (!allowedAuthorizationModes.has(report.scope.authorizationMode)) {
      fail("scope.authorizationMode must be public-only, owned-private-test, or owned-source.");
    }
    requireBoolean(report.scope, "explicitPrivateAuthorization", "scope");
    requireBoolean(report.scope, "explicitInsecureHttpAuthorization", "scope");
    requireBoolean(report.scope, "explicitNonPublicAuthorization", "scope");
    if (report.scope.authorizationMode !== "public-only"
        && report.scope.explicitPrivateAuthorization !== true) {
      fail("Owned modes require scope.explicitPrivateAuthorization=true.");
    }
    if (report.scope.authorizationMode === "public-only"
        && report.scope.explicitPrivateAuthorization !== false) {
      fail("public-only requires scope.explicitPrivateAuthorization=false.");
    }
    if (report.scope.authorizationMode === "public-only"
        && report.scope.explicitNonPublicAuthorization !== false) {
      fail("public-only requires scope.explicitNonPublicAuthorization=false.");
    }

    const allowedOrigins = new Set();
    let hasNonPublicOrigin = false;
    let hasInsecureOrigin = false;
    if (!Array.isArray(report.scope.allowedOrigins) || report.scope.allowedOrigins.length === 0) {
      fail("scope.allowedOrigins must be a non-empty array of exact HTTP(S) origins.");
    } else {
      for (const [index, originValue] of report.scope.allowedOrigins.entries()) {
        const origin = parseHttpUrl(originValue, `scope.allowedOrigins[${index}]`, true);
        if (!origin) continue;
        if (allowedOrigins.has(origin.origin)) {
          fail(`scope.allowedOrigins[${index}] duplicates another origin.`);
        }
        allowedOrigins.add(origin.origin);
        hasNonPublicOrigin ||= isNonPublicHost(origin.hostname);
        hasInsecureOrigin ||= origin.protocol === "http:";
      }
    }
    if (sourceUrl && !allowedOrigins.has(sourceUrl.origin)) {
      fail("scope.allowedOrigins must include the exact source origin.");
    }
    if (sourceUrl) {
      hasNonPublicOrigin ||= isNonPublicHost(sourceUrl.hostname);
      hasInsecureOrigin ||= sourceUrl.protocol === "http:";
    }
    if (hasInsecureOrigin && report.scope.explicitInsecureHttpAuthorization !== true) {
      fail("HTTP origins require scope.explicitInsecureHttpAuthorization=true.");
    }
    if (hasNonPublicOrigin && report.scope.authorizationMode === "public-only") {
      fail("public-only must not target a non-public destination.");
    }
    if (hasNonPublicOrigin && report.scope.explicitNonPublicAuthorization !== true) {
      fail("Non-public destinations require scope.explicitNonPublicAuthorization=true.");
    }
  }

  if (!isPlainObject(report.safety)) {
    fail("safety must be an object.");
  } else {
    for (const key of [
      "credentialsCaptured",
      "authStatePersisted",
      "unsanitizedHarPersisted",
      "productionWrites",
      "protectedAssetsCopied"
    ]) {
      requireBoolean(report.safety, key, "safety");
      if (report.safety[key] === true) fail(`safety.${key} must remain false.`);
    }
  }

  const viewports = new Map();
  const dimensions = new Set();
  if (!Array.isArray(report.viewports) || report.viewports.length < 2) {
    fail("viewports must include at least two entries.");
  } else {
    for (const [index, viewport] of report.viewports.entries()) {
      const nameIsValid = requireNonEmptyString(viewport?.name, `viewports[${index}].name`);
      if (!Number.isInteger(viewport?.width) || viewport.width < 240 || viewport.width > 7680) {
        fail(`viewports[${index}].width must be an integer from 240 to 7680.`);
      }
      if (!Number.isInteger(viewport?.height) || viewport.height < 240 || viewport.height > 7680) {
        fail(`viewports[${index}].height must be an integer from 240 to 7680.`);
      }
      if (nameIsValid) {
        const key = viewport.name.toLowerCase();
        if (viewports.has(key)) fail(`viewports[${index}].name must be unique.`);
        viewports.set(key, viewport);
      }
      const dimensionKey = `${viewport?.width}x${viewport?.height}`;
      if (dimensions.has(dimensionKey)) fail(`viewports[${index}] dimensions must be unique.`);
      dimensions.add(dimensionKey);
    }
  }

  if (!Array.isArray(report.routes) || report.routes.length === 0) {
    fail("routes must be a non-empty array.");
  } else {
    const reportDir = path.dirname(reportPath);
    const seenEvidencePaths = new Set();
    for (const [index, route] of report.routes.entries()) {
      const label = `routes[${index}]`;
      requireNonEmptyString(route?.sourcePath, `${label}.sourcePath`);
      requireNonEmptyString(route?.localPath, `${label}.localPath`);
      const states = new Set();
      if (!Array.isArray(route?.states) || route.states.length === 0
          || route.states.some((state) => typeof state !== "string" || !state.trim())) {
        fail(`${label}.states must be a non-empty string array.`);
      } else {
        for (const state of route.states) {
          const normalized = state.toLowerCase();
          if (states.has(normalized)) fail(`${label}.states must not contain duplicates.`);
          states.add(normalized);
        }
      }

      const controls = new Map();
      if (!Array.isArray(route?.controls)) {
        fail(`${label}.controls must be an array.`);
      } else {
        for (const [controlIndex, control] of route.controls.entries()) {
          const controlLabel = `${label}.controls[${controlIndex}]`;
          if (!isPlainObject(control)) {
            fail(`${controlLabel} must be an object.`);
            continue;
          }
          const idIsValid = requireNonEmptyString(control.id, `${controlLabel}.id`);
          if (idIsValid && !/^[a-z0-9][a-z0-9._-]*$/i.test(control.id)) {
            fail(`${controlLabel}.id must be a stable alphanumeric identifier.`);
          }
          const controlStates = new Set();
          if (!Array.isArray(control.states) || control.states.length === 0) {
            fail(`${controlLabel}.states must be a non-empty array.`);
          } else {
            for (const controlState of control.states) {
              if (typeof controlState !== "string"
                  || !states.has(controlState.toLowerCase())) {
                fail(`${controlLabel}.states must name declared route states.`);
                continue;
              }
              const normalized = controlState.toLowerCase();
              if (controlStates.has(normalized)) {
                fail(`${controlLabel}.states must not contain duplicates.`);
              }
              controlStates.add(normalized);
            }
          }
          if (idIsValid) {
            const key = control.id.toLowerCase();
            if (controls.has(key)) fail(`${controlLabel}.id must be unique.`);
            controls.set(key, { id: control.id, states: controlStates });
          }
        }
      }

      if (!isPlainObject(route?.checks)) {
        fail(`${label}.checks must be an object.`);
      } else {
        for (const check of requiredChecks) {
          if (!allowedStatuses.has(route.checks[check])) {
            fail(`${label}.checks.${check} must be pass, gap, or blocked.`);
          }
        }
      }

      const issueKeys = new Set();
      if (!Array.isArray(route?.gaps)) {
        fail(`${label}.gaps must be an array.`);
      } else {
        for (const [gapIndex, gap] of route.gaps.entries()) {
          const gapLabel = `${label}.gaps[${gapIndex}]`;
          if (!isPlainObject(gap)) {
            fail(`${gapLabel} must be an object.`);
            continue;
          }
          if (!new Set(["gap", "blocked"]).has(gap.status)) {
            fail(`${gapLabel}.status must be gap or blocked.`);
          }
          if (!requiredChecks.includes(gap.check)) {
            fail(`${gapLabel}.check must name a required route check.`);
          }
          requireNonEmptyString(gap.explanation, `${gapLabel}.explanation`);
          requireNonEmptyString(gap.nextAction, `${gapLabel}.nextAction`);
          const issueKey = `${gap.check}|${gap.status}`;
          if (issueKeys.has(issueKey)) fail(`${gapLabel} duplicates another route issue.`);
          issueKeys.add(issueKey);
          if (route?.checks?.[gap.check] !== gap.status) {
            fail(`${gapLabel} must match ${label}.checks.${gap.check}.`);
          }
        }
      }
      for (const check of requiredChecks) {
        const status = route?.checks?.[check];
        if ((status === "gap" || status === "blocked") && !issueKeys.has(`${check}|${status}`)) {
          fail(`${label}.checks.${check} requires a matching explained route gap.`);
        }
      }

      const requireMatrix = report.summary?.status !== "blocked" || route?.checks?.visual !== "blocked";
      validateEvidence(
        route,
        label,
        reportDir,
        checkFiles,
        viewports,
        states,
        controls,
        requireMatrix,
        seenEvidencePaths
      );
    }
  }

  if (!Array.isArray(report.commands) || report.commands.length === 0) {
    fail("commands must be a non-empty array.");
  } else {
    for (const [index, command] of report.commands.entries()) {
      requireNonEmptyString(command?.command, `commands[${index}].command`);
      if (!allowedStatuses.has(command?.status)) {
        fail(`commands[${index}].status must be pass, gap, or blocked.`);
      }
      if (command?.status === "gap" || command?.status === "blocked") {
        requireNonEmptyString(command.explanation, `commands[${index}].explanation`);
        requireNonEmptyString(command.nextAction, `commands[${index}].nextAction`);
      }
    }
  }

  if (!isPlainObject(report.summary)) {
    fail("summary must be an object.");
  } else {
    const summaryStatuses = new Set(["complete", "partial", "blocked"]);
    if (!summaryStatuses.has(report.summary.status)) {
      fail("summary.status must be complete, partial, or blocked.");
    }
    if (!Array.isArray(report.summary.knownGaps)
        || report.summary.knownGaps.some((gap) => typeof gap !== "string" || !gap.trim())) {
      fail("summary.knownGaps must be a string array.");
    }
    if (typeof report.summary.nextAction !== "string") {
      fail("summary.nextAction must be a string.");
    }

    const routeStatuses = (report.routes || []).flatMap((route) =>
      Object.values(route?.checks || {})
    );
    const commandStatuses = (report.commands || []).map((command) => command?.status);
    const allStatuses = [...routeStatuses, ...commandStatuses];
    const hasGap = allStatuses.includes("gap");
    const hasBlocked = allStatuses.includes("blocked");
    const hasKnownGaps = Array.isArray(report.summary.knownGaps)
      && report.summary.knownGaps.length > 0;

    if (report.summary.status === "complete") {
      if (hasGap || hasBlocked || hasKnownGaps) {
        fail("summary.status cannot be complete while checks, commands, or known gaps are non-pass.");
      }
    } else {
      requireNonEmptyString(report.summary.nextAction, "summary.nextAction");
    }
    if (report.summary.status === "partial" && (!hasGap || hasBlocked || !hasKnownGaps)) {
      fail("partial reports require an explained gap, no blocked item, and a known gap summary.");
    }
    if (report.summary.status === "blocked" && (!hasBlocked || !hasKnownGaps)) {
      fail("blocked reports require an explained blocked item and a named blocker.");
    }
  }

  const detectedSecretCategory = secretCategory(report);
  if (detectedSecretCategory) {
    fail(`secret-like material is not allowed in Fetch reports (${detectedSecretCategory}).`);
  }
}

if (failures.length > 0) {
  console.error("Fetch report validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Fetch report validation passed: ${path.relative(process.cwd(), reportPath) || path.basename(reportPath)}`);
