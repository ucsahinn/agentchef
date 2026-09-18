# Intake and Evidence

## Minimum intake

Discover these from the repository or supplied target before asking:

- product and value proposition;
- target URL or local application;
- audience, countries, languages, and business model;
- primary conversion and highest-value route families;
- canonical host, deployment platform, and rendering architecture;
- available Search Console, analytics, PageSpeed, CrUX, crawl, or log evidence;
- known competitors and legal or YMYL constraints.

Unknowns do not justify pretending the site was audited. Continue with the
strongest safe surface and record the missing inputs. Ask only when the answer
would materially change implementation or authorization.

## Evidence ladder

| Grade | Can prove | Cannot prove |
|---|---|---|
| `technical-local` | Source, config, generated files, route logic | Deployed behavior, indexing, rankings |
| `local-rendered` | Browser-rendered content and interactions on the local app | Production response behavior or field performance |
| `deployed-public` | Public HTTP responses, rendered pages, public structured data | Search Console status, private traffic, conversions |
| `account-verified` | Authorized property metrics and platform-reported state | Future ranking or causality by itself |
| `official-current` | Current platform documentation | Target-specific implementation or performance |

Every material statement needs a classification:

- `proven`: directly supported by cited evidence;
- `inferred`: a reasonable conclusion from cited evidence, explicitly labeled;
- `hypothesis`: plausible and testable, but not established;
- `not-checked`: outside authorization, access, or current scope.

## Sampling

Inventory route templates before choosing examples. Cover at least one page per
important template and include exceptional states such as pagination,
parameters, alternate locales, out-of-stock or empty collections, redirects,
and error routes when they exist. State the sample and never generalize beyond
it without template-level proof.
