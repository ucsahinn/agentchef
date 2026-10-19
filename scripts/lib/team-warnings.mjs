// Collect-time warnings for team-run workers; see collectWarnings in scripts/team-run.mjs.
export function quotedNativeCalls(eventsText) {
  const calls = [];
  for (const line of String(eventsText).split(/\r?\n/)) {
    let event; try { event = JSON.parse(line); } catch { continue; }
    const item = event?.item;
    if (event?.type !== "item.completed" || item?.type !== "command_execution" || typeof item.command !== "string") continue;
    const match = /powershell(?:\.exe)?"?\s+(?:-NoProfile\s+)?-Command\s+(["'])([\s\S]*)\1\s*$/i.exec(item.command);
    if (!match) continue;
    const script = match[1] === "\"" ? match[2].replace(/\\"/g, "\u0000") : match[2];
    const quotedRg = /(?:^|[;|&]\s*)rg\s[^;|&]*(?:\u0000|")/.test(script);
    const nodeEval = /(?:^|[;|&]\s*)node\s+-e\b/.test(script);
    if (quotedRg || nodeEval) calls.push({ kind: quotedRg ? "quoted-rg" : "node-e", exitCode: item.exit_code ?? null });
  }
  return calls;
}
// A finding is an evidence or risk entry that starts with "finding"/"bulgu" or points at one line (`path:line`,
// "line N", "satır N"); a block range such as `topics.ts:3979–4059` only says what was read. Checked against run
// R20261019-acd4, where workers wrote both forms: only TASK-VP-TR52, whose report lists nothing, is flagged.
const FINDING = /^(?:finding|bulgu)\b|[\w./-]+\.\w+:\d+(?![\d–-])|\b(?:line|satır)\s+\d+(?![\d–-])/iu;
export function handoffWarnings(handoff) {
  const warnings = [];
  const claimsList = /(?:listed below|below with|see below|aşağıda|listeledim|listelen|belirttim)/i.test(handoff.outcome);
  const findings = [...handoff.evidence, ...handoff.risks].filter((item) => FINDING.test(String(item).trim()));
  if (handoff.verdict !== "pass" && claimsList && !findings.length) warnings.push("The outcome says the findings are listed, but no evidence entry names a finding (\"finding:\" or a path:line); the report and its verdict do not match.");
  return warnings;
}
