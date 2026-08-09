import crypto from "node:crypto";
import zlib from "node:zlib";

const MAX_ENTRIES = 2_000;
const MAX_UNCOMPRESSED_BYTES = 450_000_000;
const MAX_ARCHIVE_BYTES = 500_000_000;
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    table[value] = crc >>> 0;
  }
  return table;
})();

function fail(message) { throw new Error(`ZIP archive error: ${message}`); }

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function safeEntryName(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) fail(`unsafe entry name: ${value}`);
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) fail(`unsafe entry name: ${value}`);
  return value;
}

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

function header(signature, size) {
  const buffer = Buffer.alloc(size);
  buffer.writeUInt32LE(signature, 0);
  return buffer;
}

export function createZip(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > MAX_ENTRIES) fail("entry count is invalid");
  const seen = new Set();
  let totalUncompressed = 0;
  const normalized = entries.map((entry) => {
    const name = safeEntryName(entry?.name);
    const key = name.toLowerCase();
    if (seen.has(key)) fail(`duplicate entry name: ${name}`);
    seen.add(key);
    const data = Buffer.isBuffer(entry?.data) ? entry.data : Buffer.from(entry?.data ?? "", "utf8");
    totalUncompressed += data.length;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) fail("uncompressed content exceeds delivery limit");
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    return { name, nameBuffer: Buffer.from(name, "utf8"), data, compressed, crc32: crc32(data) };
  });

  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of normalized) {
    const local = header(0x04034b50, 30);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(entry.crc32, 14);
    local.writeUInt32LE(entry.compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(entry.nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, entry.nameBuffer, entry.compressed);

    const central = header(0x02014b50, 46);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(entry.crc32, 16);
    central.writeUInt32LE(entry.compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(entry.nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, entry.nameBuffer);
    offset += local.length + entry.nameBuffer.length + entry.compressed.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = header(0x06054b50, 22);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(normalized.length, 8);
  end.writeUInt16LE(normalized.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  const archive = Buffer.concat([...localParts, ...centralParts, end]);
  if (archive.length > MAX_ARCHIVE_BYTES) fail("compressed delivery exceeds the 500 MB upload safety limit");
  return { data: archive, entries: normalized.map((entry) => ({ name: entry.name, bytes: entry.data.length, sha256: sha256(entry.data) })) };
}

export { sha256 };
