const MAX_COUNT = 100_000;
const METRICS = ["itemCount", "sandboxReadOnlyItemCount", "sandboxWriteItemCount", "reparsePointCount"];
const AUDIT_COUNTS = ["canonicalNoteCount", "collectionCount", "resolvedLinkCount", "brokenLinkCount", "orphanNoteCount", "staleNoteCount"];
const UNAVAILABLE = Object.freeze({
  schemaVersion: 1,
  status: "unavailable",
  securityStatus: "unavailable",
  observedAt: null
});

function validTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function validMetric(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT;
}

function auditAggregate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.ok !== "boolean") return null;
  const total = value.notes?.total;
  const projects = value.notes?.projectIds;
  const stale = value.freshness?.stale;
  const relationships = value.relationships;
  if (!validMetric(total) || !Array.isArray(projects) || !Array.isArray(stale)
    || !relationships || typeof relationships !== "object" || Array.isArray(relationships)
    || !Array.isArray(relationships.resolvedLinks) || !Array.isArray(relationships.brokenLinks) || !Array.isArray(relationships.orphanNotes)) return null;
  const counts = {
    canonicalNoteCount: total,
    collectionCount: projects.length,
    resolvedLinkCount: relationships.resolvedLinks.length,
    brokenLinkCount: relationships.brokenLinks.length,
    orphanNoteCount: relationships.orphanNotes.length,
    staleNoteCount: stale.length
  };
  if (AUDIT_COUNTS.some((name) => !validMetric(counts[name]))) return null;
  return { auditStatus: value.ok ? "ok" : "attention", ...counts };
}

/**
 * Builds the sole Kitchen-safe Brain owner contract. It accepts only status
 * aggregates and deliberately excludes all vault, note, link, and error data.
 */
export function projectBrainHealth({ contentStatus, securityStatus, audit, observedAt } = {}) {
  const timestamp = validTimestamp(observedAt);
  if (!timestamp || !contentStatus || typeof contentStatus !== "object" || Array.isArray(contentStatus)
    || contentStatus.ok !== true || !securityStatus || typeof securityStatus !== "object" || Array.isArray(securityStatus)
    || typeof securityStatus.ok !== "boolean") return { ...UNAVAILABLE };

  const metrics = securityStatus.metrics;
  if (metrics !== undefined && (!metrics || typeof metrics !== "object" || Array.isArray(metrics)
    || METRICS.some((name) => metrics[name] !== undefined && !validMetric(metrics[name])))) return { ...UNAVAILABLE };

  const topology = auditAggregate(audit);
  if (!topology) return { ...UNAVAILABLE };
  const projection = {
    schemaVersion: 1,
    status: "available",
    securityStatus: securityStatus.ok ? "ok" : "attention",
    observedAt: timestamp
  };
  for (const name of METRICS) if (metrics?.[name] !== undefined) projection[name] = metrics[name];
  return { ...projection, ...topology };
}
