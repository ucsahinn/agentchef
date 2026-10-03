# Structured Data

## Rules

- Select types supported by the page’s real purpose and visible content.
- Use JSON-LD when it fits the stack, but keep it synchronized with the page.
- Provide required and useful recommended properties from current official
  documentation. Validate syntax and Google eligibility separately.
- Never add invented ratings, reviews, prices, availability, authors,
  credentials, FAQs, events, or organization facts.
- A valid schema.org graph does not guarantee a Google rich result.

## Product and software pages

Use `SoftwareApplication`, `Product`, `Offer`, `Organization`, `Article`,
`BreadcrumbList`, or another type only when the page and current Google feature
documentation support it. Price currency and availability must match visible,
current product data. Add ratings only from an authentic, visible review
system.

## Retired or restricted appearances

- Google retired the sitelinks search box visual element in November 2024.
  `SearchAction` may still be valid schema.org vocabulary, but do not implement
  it to promise that retired Search appearance.
- FAQ rich results are generally limited to well-known authoritative health or
  government sites.
- Google no longer shows HowTo rich results. How-to markup may still serve
  non-Google consumers, but it is not a Google rich-result tactic.

## Validation

Use both:

1. a schema parser or Schema.org validator for graph validity; and
2. Google Rich Results Test for Google-supported eligibility when applicable.

Record warnings, errors, page URL, checked time, and tool used. Never report a
rich result as live unless deployed search evidence shows it.
