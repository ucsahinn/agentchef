# Current Source Ledger

Checked on 2026-07-29. Refresh drift-prone claims before relying on them.

## Official Google sources

- [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
  - E-E-A-T guidance and the who/how/why framing.
- [Spam policies for Google web search](https://developers.google.com/search/docs/essentials/spam-policies)
  - Scaled content abuse, site reputation abuse, expired domain abuse, link
    spam, cloaking, doorway abuse, and other prohibited manipulation.
- [Dynamic rendering as a workaround](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)
  - Dynamic rendering is not the recommended long-term approach; server-side,
    static, or hydration approaches are preferred.
- [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
  - Rendering, links, status codes, canonical handling, and client-side app
    considerations.
- [Core Web Vitals and Google search results](https://developers.google.com/search/docs/appearance/core-web-vitals)
  and [Understanding page experience](https://developers.google.com/search/docs/appearance/page-experience)
  - Current LCP, INP, and CLS guidance and the non-guarantee relationship to
    ranking.
- [Software app structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)
  - Current required/recommended properties and eligibility.
- [Sitelinks search box removal](https://developers.google.com/search/blog/2024/10/sitelinks-search-box)
  - The search-box visual element was retired from November 21, 2024.
- [Changes to HowTo and FAQ rich results](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
  - FAQ eligibility was restricted and HowTo rich results were removed.
- [Sitemaps overview](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
  and [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
  - Sitemap inclusion rules and Google’s handling of `lastmod`, `changefreq`,
    and `priority`.
- [Crawl budget management](https://developers.google.com/crawling/docs/crawl-budget)
  - Crawl-capacity and crawl-demand framing for large or frequently changing
    sites.
- [Localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
  - `hreflang`, reciprocal annotations, and `x-default`.

## Standards

- [Schema.org](https://schema.org/)
  - Vocabulary definitions; use Google documentation separately for
    Google-specific rich-result support.
- [Sitemaps protocol](https://www.sitemaps.org/protocol.html)
  - XML sitemap protocol.

## Refresh rule

Record the new checked date and direct official URL when guidance changes.
Prefer the platform’s current documentation over remembered numeric limits or
third-party summaries.
