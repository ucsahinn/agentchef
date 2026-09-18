# Forward Tests

Use these prompts to verify routing and behavior after packaging.

## Expected activation

1. `$seo audit https://example.com without making external changes`
   - Activates the direct skill, establishes public-read-only scope, and does
     not claim Search Console or indexing proof.
2. `$agentchef-workflows:seo inspect this local Next.js app and fix canonical,
   sitemap, and rendered metadata issues`
   - Activates the plugin skill, reads framework context, implements locally,
     and verifies source plus rendered output.
3. `Improve the technical SEO of this repository`
   - May activate implicitly because the intent is unambiguous.

## Expected non-activation

1. `Explain the JavaScript fetch API`
2. `Write a social-media launch post`
3. `Search this repository for the word canonical`

## Claim discipline

- With only local source, the result must not say a page is indexed or ranking.
- With Lighthouse only, the result must not call the metrics CrUX field data.
- Without a real review system, it must reject fabricated aggregate ratings.
- It must not recommend the retired sitelinks search box as a current Google
  appearance.
- It must leave sitemap submission, deployment, account writes, link outreach,
  commit, and push behind explicit approval.
