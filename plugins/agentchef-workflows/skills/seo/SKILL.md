---
name: seo
description: Audit, implement, and verify evidence-backed search optimization for websites and web applications. Use for technical SEO, crawlability, indexing readiness, rendering, metadata, canonical and hreflang policy, structured data, content intent, internal linking, Core Web Vitals, local or international SEO, measurement design, and prioritized growth roadmaps.
---

# SEO

Improve organic-search readiness without inventing rankings, traffic, indexing,
or business outcomes.

## Invocation

- Direct: `$seo <target or request>`.
- Plugin: `$agentchef-workflows:seo <target or request>`.
- Implicit activation is allowed only for unambiguous SEO work.

## Evidence Contract

Read [intake-and-evidence.md](references/intake-and-evidence.md) first. Declare
the strongest authorized scope: `local-source`, `local-rendered`,
`deployed-public`, or `authorized-private`. Source, browser, deployed HTTP,
field, Search Console, and analytics evidence are not interchangeable.
Unknown market or account inputs become explicit gaps; they never become
fabricated conclusions.

For research-heavy market, competitor, or literature work, route collection to
`$evidence-research` and bring only traceable claims back into the SEO decision.

## Workflow

1. Read repo instructions, stack, routes, deployment assumptions, and dirty
   state. Inventory templates before sampling pages.
2. Audit discovery, status, redirects, robots, sitemap, canonicalization,
   internal links, and indexability using
   [technical-seo.md](references/technical-seo.md).
3. Compare initial HTML with a real rendered browser and inspect hydration,
   links, console, resources, mobile states, and measured performance using
   [javascript-and-rendering.md](references/javascript-and-rendering.md).
4. Inspect visible meaning, metadata, headings, images, truthful schema,
   locale alternates, and intent fit using
   [structured-data.md](references/structured-data.md),
   [content-and-growth.md](references/content-and-growth.md), and
   [international-and-local.md](references/international-and-local.md).
5. When implementation is requested, fix the smallest coherent root cause in
   the existing stack. Then run repo checks and the evidence-specific browser,
   HTTP, schema, lab, field, or account validation.
6. Classify findings as `proven`, `inferred`, `hypothesis`, or `not-checked`;
   prioritize them with
   [measurement-and-roadmap.md](references/measurement-and-roadmap.md).

Refresh drift-prone platform claims against the official ledger in
[sources.md](references/sources.md). In particular, do not treat E-E-A-T as a
standalone ranking factor, Core Web Vitals as a ranking guarantee, retired
`SearchAction` sitelinks UI as current, restricted FAQ or removed HowTo rich
results as universal tactics, or dynamic rendering as the preferred
architecture.

## Tools, Safety, and Completion

Use source inspection for code facts, Playwright or Chrome DevTools for rendered
facts, official docs or Context7 for version-sensitive behavior, and authorized
account tools only when approved. Keep Lighthouse lab data separate from CrUX
or PageSpeed field data. A read-only SEO, performance, or frontend specialist
may isolate an independent audit surface; the main thread owns implementation.

Follow [safety-and-approvals.md](references/safety-and-approvals.md). Never
guarantee rankings or indexing, fabricate metrics/reviews/schema, create spam or
link schemes, expose credentials, or perform Search Console, analytics, DNS,
publication, outreach, deploy, commit, or push actions without the required
approval.

Complete means the authorized template sample is covered, requested fixes work,
applicable repo/browser checks pass, every claim cites evidence at the right
grade, lab and field data remain distinct, and gaps are explicit. Apply the
[verification rubric](references/verification-rubric.md), create the report
from [seo-audit-report.template.json](assets/seo-audit-report.template.json),
and run:

```text
node <skill-dir>/scripts/validate-seo-report.mjs --report <report.json>
```

Use [keyword-intent-map.template.csv](assets/keyword-intent-map.template.csv)
only for evidence-backed keyword or content architecture work.
