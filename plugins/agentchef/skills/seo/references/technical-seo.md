# Technical SEO

## Discovery, crawlability, and indexability

- Confirm important URLs are reachable through real `<a href>` links and are
  not orphaned.
- Inspect final HTTP status, redirect hops, robots directives, response headers,
  canonical tags, sitemap membership, and authentication barriers separately.
- `robots.txt` controls crawling, not guaranteed de-indexing. A blocked URL can
  still be known from links; use supported index controls on crawlable
  responses when removal is intended.
- Include only canonical, indexable, successful URLs in sitemaps. Treat
  `lastmod` as a meaningful content-change signal; do not manufacture it.
- Do not treat `changefreq` or `priority` as Google ranking controls.
- A page is not "indexed" merely because it returns 200, appears in a sitemap,
  or passes a local test. Confirm property state through authorized Search
  Console or URL Inspection evidence.

## URL and canonical policy

- Derive the canonical policy from framework, host, locale, and product
  behavior. Do not impose a universal trailing-slash rule.
- Redirect alternate hosts, schemes, and path variants consistently when the
  product has one canonical form.
- Use absolute canonical URLs. A canonical is a hint for consolidation, not a
  permission to make dissimilar pages duplicates.
- Pagination usually needs discoverable unique URLs and self-consistent
  canonicalization. Do not canonicalize all pages to page one.
- Decide whether filter combinations are useful landing pages, crawl-only
  navigation, or neither. Avoid infinite crawl spaces and contradictory
  `noindex`, robots, and canonical signals.

## Status and errors

- Preserve meaningful 404/410 responses for missing content; avoid soft 404s.
- Avoid redirect chains and blanket redirects to unrelated destinations.
- Ensure rate limits, bot protection, and server errors do not accidentally
  block normal crawling. Production changes require approval.

## Internal architecture

- Build an understandable hierarchy around user tasks and entities, not a fixed
  click-count slogan.
- Use descriptive anchors and breadcrumbs where they help users.
- Link supporting content to its natural hub and conversion path; avoid
  repetitive exact-match anchor stuffing.
