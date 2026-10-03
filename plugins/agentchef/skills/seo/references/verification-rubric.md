# Verification Rubric

## Required checks by evidence surface

### Local source

- route and template inventory;
- status/redirect implementation where locally testable;
- robots, sitemap, metadata, canonical, alternate, and schema generation;
- semantic links and visible page meaning;
- existing lint, typecheck, tests, and build proportional to the change.

### Local rendered

- representative desktop and mobile routes in a real browser;
- rendered title, visible heading/content, canonical and structured data;
- navigation and important interactions;
- hydration, console, resource, layout, focus, and responsive failures;
- before/after screenshots for visible changes.

### Deployed public

- final HTTPS response, redirects, headers, robots, sitemap, canonical host;
- rendered public content and assets;
- public structured-data validation;
- bounded lab tests, clearly labeled as lab evidence.

### Authorized private

- property and date range stated without exposing private values unnecessarily;
- Search Console page/query/indexing evidence and analytics definitions;
- field-versus-lab distinction;
- access and export handling consistent with user authorization.

## Completion scoring

A finding is resolved only when:

1. its root cause is changed or intentionally accepted;
2. the named validation is rerun;
3. the evidence reference points to an existing artifact, URL, command result,
   or authorized report;
4. the claim does not exceed the evidence grade.

Use `partial` when valuable work is finished but unresolved gaps remain. Use
`blocked` only when a required target or authority prevents meaningful
progress. A passing validator proves report shape and claim discipline, not SEO
performance.
