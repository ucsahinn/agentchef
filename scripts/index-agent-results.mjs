import fs from "node:fs";
import path from "node:path";
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
const reports = fs.readdirSync(resultsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^(?:TASK|ADP)-.+\.md$/.test(entry.name))
  .map((entry) => entry.name)
  .sort(compareNames);
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
