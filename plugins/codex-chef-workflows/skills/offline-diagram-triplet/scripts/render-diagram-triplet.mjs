#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);

function arg(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function has(name) {
  return args.includes(name);
}

function usage() {
  console.log([
    "Usage:",
    "  node render-diagram-triplet.mjs --mermaid diagram.mmd --out-dir artifacts/diagrams --name diagram",
    "",
    "Options:",
    "  --mermaid <file>   Mermaid source file. If omitted, stdin is used.",
    "  --out-dir <dir>    Output directory. Default: current directory.",
    "  --name <name>      Output basename. Default: diagram.",
    "  --markdown <file>  Optional Markdown snippet output.",
    "  --help             Show this help."
  ].join("\n"));
}

if (has("--help")) {
  usage();
  process.exit(0);
}

const LIMITS = Object.freeze({
  maxInputBytes: 100_000,
  maxNodes: 200,
  maxEdges: 400,
  maxPixels: 8_000_000
});

function main() {
  try {
    const mermaidFile = arg("--mermaid");
    const outDir = path.resolve(arg("--out-dir", "."));
    const baseName = sanitizeName(arg("--name", "diagram"));
    const markdownFile = arg("--markdown");

    const source = mermaidFile
      ? fs.readFileSync(mermaidFile, "utf8")
      : fs.readFileSync(0, "utf8");

    const parsed = parseMermaid(source);
    const layout = layoutGraph(parsed);

    fs.mkdirSync(outDir, { recursive: true });

    const mmdPath = path.join(outDir, `${baseName}.mmd`);
    const excalidrawPath = path.join(outDir, `${baseName}.excalidraw`);
    const svgPath = path.join(outDir, `${baseName}.svg`);
    const pngPath = path.join(outDir, `${baseName}.png`);
    const mdPath = markdownFile ? path.resolve(markdownFile) : path.join(outDir, `${baseName}.md`);
    const normalized = normalizeMermaid(source);

    fs.writeFileSync(mmdPath, normalized, "utf8");
    fs.writeFileSync(excalidrawPath, JSON.stringify(toExcalidraw(layout), null, 2), "utf8");
    fs.writeFileSync(svgPath, toSvg(layout), "utf8");
    fs.writeFileSync(pngPath, toPng(layout));
    fs.writeFileSync(mdPath, toMarkdown(baseName, normalized, svgPath, pngPath, excalidrawPath), "utf8");

    console.log(JSON.stringify({
      schemaVersion: "codex-chef.diagram-triplet.v1",
      files: {
        mermaid: mmdPath,
        excalidraw: excalidrawPath,
        svg: svgPath,
        png: pngPath,
        markdown: mdPath
      },
      nodes: layout.nodes.length,
      edges: layout.edges.length
    }, null, 2));
  } catch (error) {
    console.error(`Diagram renderer failed: ${error.message}`);
    process.exitCode = 1;
  }
}

function sanitizeName(value) {
  return String(value || "diagram")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "diagram";
}

function normalizeMermaid(text) {
  return text
    .replace(/^```mermaid\s*/i, "")
    .replace(/^```\s*$/m, "")
    .trim()
    .concat("\n");
}

function cleanLabel(value) {
  return String(value || "")
    .replace(/^["']|["']$/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNodeToken(token) {
  const text = token.trim();
  const patterns = [
    [/^([A-Za-z0-9_.-]+)\s*\(\((.+)\)\)$/, "ellipse"],
    [/^([A-Za-z0-9_.-]+)\s*\{(.+)\}$/, "diamond"],
    [/^([A-Za-z0-9_.-]+)\s*\((.+)\)$/, "round"],
    [/^([A-Za-z0-9_.-]+)\s*\[(.+)\]$/, "rectangle"]
  ];
  for (const [pattern, shape] of patterns) {
    const match = text.match(pattern);
    if (match) return { id: match[1], label: cleanLabel(match[2]), shape };
  }
  const bare = text.match(/^([A-Za-z0-9_.-]+)$/);
  if (bare) return { id: bare[1], label: bare[1], shape: "rectangle" };
  const fallback = sanitizeName(text).replaceAll("-", "_") || `node_${hash(text).slice(0, 6)}`;
  return { id: fallback, label: cleanLabel(text), shape: "rectangle" };
}

function upsertNode(nodes, token) {
  const parsed = parseNodeToken(token);
  const existing = nodes.get(parsed.id);
  if (!existing) {
    nodes.set(parsed.id, parsed);
  } else {
    if (parsed.label && parsed.label !== parsed.id) existing.label = parsed.label;
    if (parsed.shape) existing.shape = parsed.shape;
  }
  return parsed.id;
}

function parseMermaid(text) {
  const source = normalizeMermaid(text);
  if (Buffer.byteLength(source, "utf8") > LIMITS.maxInputBytes) {
    throw new Error(`Mermaid source is too large. Max ${LIMITS.maxInputBytes} bytes.`);
  }
  const nodes = new Map();
  const edges = [];
  let direction = "TD";

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/%%.*$/, "").replace(/;$/, "").trim();
    if (!line) continue;
    const directionMatch = line.match(/^flowchart\s+(TD|TB|BT|LR|RL)$/i);
    if (directionMatch) {
      direction = directionMatch[1].toUpperCase();
      continue;
    }
    if (/^(graph|flowchart)\b/i.test(line)) continue;

    const edgeMatch = line.match(/^(.+?)\s*(?:-->|==>|-.->|---)\s*(?:\|([^|]+)\|\s*)?(.+)$/);
    if (edgeMatch) {
      const from = upsertNode(nodes, edgeMatch[1]);
      const to = upsertNode(nodes, edgeMatch[3]);
      edges.push({ from, to, label: cleanLabel(edgeMatch[2] || "") });
      if (edges.length > LIMITS.maxEdges) {
        throw new Error(`Mermaid graph has too many edges. Max ${LIMITS.maxEdges}.`);
      }
      if (nodes.size > LIMITS.maxNodes) {
        throw new Error(`Mermaid graph has too many nodes. Max ${LIMITS.maxNodes}.`);
      }
      continue;
    }

    upsertNode(nodes, line);
    if (nodes.size > LIMITS.maxNodes) {
      throw new Error(`Mermaid graph has too many nodes. Max ${LIMITS.maxNodes}.`);
    }
  }

  if (nodes.size === 0) {
    throw new Error("No supported Mermaid nodes were found.");
  }

  return { direction, nodes: [...nodes.values()], edges };
}

function wrapText(text, maxChars = 18) {
  const words = cleanLabel(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current.length + word.length + 1) <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [cleanLabel(text)];
}

function layoutGraph(graph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, { ...node }]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const rank = new Map(graph.nodes.map((node) => [node.id, 0]));
  const queue = graph.nodes.filter((node) => (incoming.get(node.id) || 0) === 0).map((node) => node.id);
  const topologicalOrder = [];
  const remainingIncoming = new Map(incoming);
  while (queue.length > 0) {
    const id = queue.shift();
    topologicalOrder.push(id);
    for (const to of outgoing.get(id) || []) {
      remainingIncoming.set(to, (remainingIncoming.get(to) || 0) - 1);
      if ((remainingIncoming.get(to) || 0) === 0) {
        queue.push(to);
      }
    }
  }

  if (topologicalOrder.length !== graph.nodes.length) {
    throw new Error("Cyclic Mermaid graphs are not supported by the offline renderer.");
  }

  for (const id of topologicalOrder) {
    const nextRank = (rank.get(id) || 0) + 1;
    for (const to of outgoing.get(id) || []) {
      rank.set(to, Math.max(rank.get(to) || 0, nextRank));
    }
  }

  const groups = new Map();
  for (const node of graph.nodes) {
    const item = nodeById.get(node.id);
    item.lines = wrapText(item.label);
    item.width = Math.max(150, Math.min(260, Math.max(...item.lines.map((line) => line.length)) * 9 + 44));
    item.height = Math.max(64, item.lines.length * 18 + 32);
    const r = rank.get(node.id) || 0;
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(item);
  }

  const margin = 48;
  const gapX = 78;
  const gapY = 64;
  const lr = graph.direction === "LR" || graph.direction === "RL";
  const orderedRanks = [...groups.keys()].sort((a, b) => a - b);
  let maxX = 0;
  let maxY = 0;

  for (const r of orderedRanks) {
    const group = groups.get(r);
    for (let i = 0; i < group.length; i += 1) {
      const node = group[i];
      if (lr) {
        node.x = margin + r * (230 + gapX);
        node.y = margin + i * (110 + gapY);
      } else {
        node.x = margin + i * (230 + gapX);
        node.y = margin + r * (110 + gapY);
      }
      maxX = Math.max(maxX, node.x + node.width + margin);
      maxY = Math.max(maxY, node.y + node.height + margin);
    }
  }

  const nodes = graph.nodes.map((node) => nodeById.get(node.id));
  const edges = graph.edges.map((edge) => ({
    ...edge,
    fromNode: nodeById.get(edge.from),
    toNode: nodeById.get(edge.to)
  }));

  const width = Math.max(420, Math.ceil(maxX));
  const height = Math.max(260, Math.ceil(maxY));
  assertPixelBudget(width, height);

  return {
    direction: graph.direction,
    width,
    height,
    nodes,
    edges
  };
}

function assertPixelBudget(width, height) {
  const pixels = width * height;
  if (!Number.isFinite(pixels) || pixels > LIMITS.maxPixels) {
    throw new Error(`Rendered diagram is too large. Max ${LIMITS.maxPixels} pixels.`);
  }
}

function hash(value) {
  let h = 2166136261;
  for (const char of String(value)) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function toExcalidraw(layout) {
  const elements = [];
  for (const node of layout.nodes) {
    const id = `node_${hash(node.id)}`;
    const type = node.shape === "diamond" ? "diamond" : node.shape === "ellipse" ? "ellipse" : "rectangle";
    elements.push({
      id,
      type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      angle: 0,
      strokeColor: "#1f2937",
      backgroundColor: "#fff7ed",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: node.shape === "round" || node.shape === "rectangle" ? { type: 3 } : null,
      seed: parseInt(hash(node.id).slice(0, 6), 16),
      versionNonce: parseInt(hash(`${node.id}:v`).slice(0, 6), 16),
      isDeleted: false,
      boundElements: [],
      updated: 1,
      link: null,
      locked: false
    });
    elements.push({
      id: `text_${hash(node.id)}`,
      type: "text",
      x: node.x + 16,
      y: node.y + Math.max(10, (node.height - node.lines.length * 18) / 2),
      width: node.width - 32,
      height: node.lines.length * 18,
      angle: 0,
      strokeColor: "#111827",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      seed: parseInt(hash(`${node.id}:text`).slice(0, 6), 16),
      versionNonce: parseInt(hash(`${node.id}:text:v`).slice(0, 6), 16),
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
      text: node.lines.join("\n"),
      fontSize: 16,
      fontFamily: 1,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: id,
      originalText: node.lines.join("\n"),
      lineHeight: 1.25
    });
  }

  for (const edge of layout.edges) {
    const a = center(edge.fromNode);
    const b = center(edge.toNode);
    elements.push({
      id: `edge_${hash(`${edge.from}->${edge.to}:${edge.label}`)}`,
      type: "arrow",
      x: a.x,
      y: a.y,
      width: b.x - a.x,
      height: b.y - a.y,
      angle: 0,
      strokeColor: "#374151",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      seed: parseInt(hash(`${edge.from}->${edge.to}`).slice(0, 6), 16),
      versionNonce: parseInt(hash(`${edge.from}->${edge.to}:v`).slice(0, 6), 16),
      isDeleted: false,
      boundElements: [],
      updated: 1,
      link: null,
      locked: false,
      points: [[0, 0], [b.x - a.x, b.y - a.y]],
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow"
    });
  }

  return {
    type: "excalidraw",
    version: 2,
    source: "codex-chef/offline-diagram-triplet",
    elements,
    appState: {
      gridSize: null,
      viewBackgroundColor: "#ffffff"
    },
    files: {}
  };
}

function center(node) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function edgePoints(edge) {
  const a = center(edge.fromNode);
  const b = center(edge.toNode);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const startPad = Math.min(edge.fromNode.width, edge.fromNode.height) / 2 + 8;
  const endPad = Math.min(edge.toNode.width, edge.toNode.height) / 2 + 8;
  return {
    x1: a.x + (dx / length) * startPad,
    y1: a.y + (dy / length) * startPad,
    x2: b.x - (dx / length) * endPad,
    y2: b.y - (dy / length) * endPad
  };
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function toSvg(layout) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-labelledby="title desc">`,
    "<title id=\"title\">Offline diagram triplet render</title>",
    "<desc id=\"desc\">Diagram rendered from Mermaid source by the AgentChef offline diagram skill.</desc>",
    "<defs><marker id=\"arrow\" markerWidth=\"10\" markerHeight=\"10\" refX=\"8\" refY=\"3\" orient=\"auto\" markerUnits=\"strokeWidth\"><path d=\"M0,0 L0,6 L9,3 z\" fill=\"#374151\" /></marker></defs>",
    "<rect width=\"100%\" height=\"100%\" fill=\"#ffffff\" />"
  ];

  for (const edge of layout.edges) {
    const p = edgePoints(edge);
    parts.push(`<line x1="${p.x1.toFixed(1)}" y1="${p.y1.toFixed(1)}" x2="${p.x2.toFixed(1)}" y2="${p.y2.toFixed(1)}" stroke="#374151" stroke-width="2" marker-end="url(#arrow)" />`);
    if (edge.label) {
      parts.push(`<text x="${((p.x1 + p.x2) / 2).toFixed(1)}" y="${((p.y1 + p.y2) / 2 - 6).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#374151">${xmlEscape(edge.label)}</text>`);
    }
  }

  for (const node of layout.nodes) {
    const labelY = node.y + (node.height - node.lines.length * 18) / 2 + 16;
    if (node.shape === "diamond") {
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      parts.push(`<polygon points="${cx},${node.y} ${node.x + node.width},${cy} ${cx},${node.y + node.height} ${node.x},${cy}" fill="#fff7ed" stroke="#1f2937" stroke-width="2" />`);
    } else if (node.shape === "ellipse") {
      parts.push(`<ellipse cx="${node.x + node.width / 2}" cy="${node.y + node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}" fill="#fff7ed" stroke="#1f2937" stroke-width="2" />`);
    } else {
      const rx = node.shape === "round" ? 18 : 8;
      parts.push(`<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${rx}" fill="#fff7ed" stroke="#1f2937" stroke-width="2" />`);
    }
    node.lines.forEach((line, index) => {
      parts.push(`<text x="${node.x + node.width / 2}" y="${labelY + index * 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#111827">${xmlEscape(line)}</text>`);
    });
  }

  parts.push("</svg>");
  return `${parts.join("\n")}\n`;
}

const FONT = {
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"]
};

function toPng(layout) {
  const width = layout.width;
  const height = layout.height;
  assertPixelBudget(width, height);
  const rgba = Buffer.alloc(width * height * 4, 255);

  function pixel(x, y, color) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4;
    rgba[index] = color[0];
    rgba[index + 1] = color[1];
    rgba[index + 2] = color[2];
    rgba[index + 3] = color[3] ?? 255;
  }

  function fillRect(x, y, w, h, color) {
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(height, Math.ceil(y + h)); yy += 1) {
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(width, Math.ceil(x + w)); xx += 1) {
        pixel(xx, yy, color);
      }
    }
  }

  function line(x1, y1, x2, y2, color) {
    x1 = Math.round(x1); y1 = Math.round(y1); x2 = Math.round(x2); y2 = Math.round(y2);
    const dx = Math.abs(x2 - x1);
    const sx = x1 < x2 ? 1 : -1;
    const dy = -Math.abs(y2 - y1);
    const sy = y1 < y2 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      for (let ox = -1; ox <= 1; ox += 1) for (let oy = -1; oy <= 1; oy += 1) pixel(x1 + ox, y1 + oy, color);
      if (x1 === x2 && y1 === y2) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x1 += sx; }
      if (twice <= dx) { error += dx; y1 += sy; }
    }
  }

  function strokeRect(x, y, w, h, color) {
    line(x, y, x + w, y, color);
    line(x + w, y, x + w, y + h, color);
    line(x + w, y + h, x, y + h, color);
    line(x, y + h, x, y, color);
  }

  function diamond(x, y, w, h, color) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    line(cx, y, x + w, cy, color);
    line(x + w, cy, cx, y + h, color);
    line(cx, y + h, x, cy, color);
    line(x, cy, cx, y, color);
  }

  function ellipse(x, y, w, h, color) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    for (let i = 0; i < 360; i += 2) {
      const radians = i * Math.PI / 180;
      pixel(cx + Math.cos(radians) * rx, cy + Math.sin(radians) * ry, color);
      pixel(cx + Math.cos(radians) * (rx - 1), cy + Math.sin(radians) * (ry - 1), color);
    }
  }

  function drawChar(ch, x, y, scale, color) {
    const rows = FONT[ch.toUpperCase()] || FONT["?"];
    for (let row = 0; row < rows.length; row += 1) {
      for (let col = 0; col < rows[row].length; col += 1) {
        if (rows[row][col] === "1") fillRect(x + col * scale, y + row * scale, scale, scale, color);
      }
    }
  }

  function drawText(text, x, y, scale, color) {
    let cursor = x;
    for (const ch of text.toUpperCase()) {
      drawChar(ch, cursor, y, scale, color);
      cursor += 6 * scale;
    }
  }

  fillRect(0, 0, width, height, [255, 255, 255, 255]);

  for (const edge of layout.edges) {
    const p = edgePoints(edge);
    line(p.x1, p.y1, p.x2, p.y2, [55, 65, 81, 255]);
    const angle = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
    line(p.x2, p.y2, p.x2 - Math.cos(angle - 0.5) * 13, p.y2 - Math.sin(angle - 0.5) * 13, [55, 65, 81, 255]);
    line(p.x2, p.y2, p.x2 - Math.cos(angle + 0.5) * 13, p.y2 - Math.sin(angle + 0.5) * 13, [55, 65, 81, 255]);
  }

  for (const node of layout.nodes) {
    fillRect(node.x, node.y, node.width, node.height, [255, 247, 237, 255]);
    if (node.shape === "diamond") diamond(node.x, node.y, node.width, node.height, [31, 41, 55, 255]);
    else if (node.shape === "ellipse") ellipse(node.x, node.y, node.width, node.height, [31, 41, 55, 255]);
    else strokeRect(node.x, node.y, node.width, node.height, [31, 41, 55, 255]);
    const scale = 2;
    const lineHeight = 16;
    const startY = node.y + (node.height - node.lines.length * lineHeight) / 2;
    node.lines.forEach((lineText, index) => {
      const textWidth = lineText.length * 6 * scale;
      drawText(lineText, node.x + (node.width - textWidth) / 2, startY + index * lineHeight, scale, [17, 24, 39, 255]);
    });
  }

  return encodePng(width, height, rgba);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

let crcTable = null;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let c = index;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const body = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([u32(data.length), body, u32(crc32(body))]);
}

function toMarkdown(title, mermaid, svgPath, pngPath, excalidrawPath) {
  return [
    `# ${title}`,
    "",
    "```mermaid",
    mermaid.trim(),
    "```",
    "",
    `- SVG: [${path.basename(svgPath)}](${path.basename(svgPath)})`,
    `- PNG: [${path.basename(pngPath)}](${path.basename(pngPath)})`,
    `- Editable Excalidraw: [${path.basename(excalidrawPath)}](${path.basename(excalidrawPath)})`,
    ""
  ].join("\n");
}

main();
