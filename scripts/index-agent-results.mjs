import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let root = defaultRoot;
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === "--root" && process.argv[index + 1]) {
    root = path.resolve(process.argv[index + 1]);
    index += 1;
  } else {
    throw new Error(`Unknown or incomplete argument: ${process.argv[index]}`);
  }
}

const resultsDirectory = path.join(root, "docs", "agent-results");
const indexPath = path.join(resultsDirectory, "INDEX.md");
const compareNames = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const requiredHeadings = [
  "Ne yapıldı",
  "Kanıt",
  "Değişen dosyalar",
  "Riskler",
  "Açık sorular",
  "Sonraki adım"
];
function trackedReports() {
  const probe = spawnSync("git", ["-C", root, "ls-files", "--", "docs/agent-results"], { encoding: "utf8", windowsHide: true });
  if (probe.status !== 0) return null;
  const names = probe.stdout.split(/\r?\n/).filter((entry) => entry && /^(?:docs\/agent-results\/)(?:TASK|ADP)-.+\.md$/.test(entry)).map((entry) => entry.slice("docs/agent-results/".length));
  return names.length > 0 ? names : [];
}
const reports = (trackedReports() ?? fs.readdirSync(resultsDirectory, { withFileTypes: true }).filter((entry) => entry.isFile() && /^(?:TASK|ADP)-.+\.md$/.test(entry.name)).map((entry) => entry.name)).sort(compareNames);
function reportContractFailure(report) {
  const text = fs.readFileSync(path.join(resultsDirectory, report), "utf8");
  for (const heading of requiredHeadings) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`^##\\s+${escaped}\\s*$`, "m").test(text)) {
      return `${report} missing required heading: ${heading}`;
    }
  }
  const evidence = text.match(/^##\s+Kanıt\s*\r?\n([\s\S]*?)(?=^##\s+|$(?![\s\S]))/m)?.[1]?.trim();
  if (!evidence || /^(?:yok|n\/?a|none|todo|tbd|-)\.?$/i.test(evidence)) {
    return `${report} has empty evidence`;
  }
  return null;
}
const reportsByTask = new Map();
for (const report of reports) {
  const taskId = report.match(/^((?:TASK|ADP)-[^-]+)-/)?.[1];
  const taskReports = reportsByTask.get(taskId) || [];
  taskReports.push(report);
  reportsByTask.set(taskId, taskReports);
}
for (const [taskId, taskReports] of reportsByTask) {
  const failures = taskReports.map(reportContractFailure);
  if (failures.every(Boolean)) {
    throw new Error(`${taskId} has no compliant result report: ${failures.join("; ")}`);
  }
}
const contents = [
  "# Agent Results Index",
  "",
  "Bu indeks `docs/agent-results/` altındaki görev sonuçlarını dosya adına göre sıralar.",
  "",
  ...reports.map((report) => `- [${report}](${report})`),
  ""
].join("\n");

const existing = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : null;
if (existing === contents) {
  console.log(`Agent results index is current (${reports.length} reports).`);
} else {
  fs.writeFileSync(indexPath, contents, "utf8");
  console.log(`Agent results index updated (${reports.length} reports).`);
}
