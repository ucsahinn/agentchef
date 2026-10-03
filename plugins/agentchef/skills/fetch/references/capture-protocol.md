# Reference Capture Protocol

Capture the rendered product, not merely the initial HTML response.

## 1. Establish The Matrix

Record:

- canonical target URL and exact origins that are in scope
- public-only or explicitly authorized private-test mode
- output application and its existing framework
- desktop viewport, mobile viewport, and any breakpoint that visibly changes
  composition
- route list and repeatable UI states for each route

Start with the supplied route. Add only same-site routes reached through the
visible navigation, sitemap, or an explicit user list. Do not crawl unrelated
subdomains or unbounded calendars, search results, faceted URLs, or user
content.

## 2. Install Guards Before Navigation

Do not open the target until the selected browser path can enforce the passive
capture boundary. Create a fresh ephemeral context first, then:

1. Disable service workers and downloads. Close or block new pages, popups,
   dialogs, WebRTC, EventSource, and WebSocket sends.
2. Install request interception before the first navigation. Allow only the
   exact approved origins and bounded `GET` or `HEAD`; abort other methods,
   action-like URLs, unapproved frames, analytics, beacons, and trackers.
3. Resolve the destination and validate every redirect before continuing.
   Abort loopback, private, link-local, multicast, reserved, metadata, or
   newly unapproved destinations.
4. Apply finite navigation, redirect, route, response-size, total-byte,
   concurrency, and wall-clock budgets.
5. Keep authentication empty in `public-only`. Do not preload a profile,
   cookies, local storage, headers, or a saved Playwright storage state.

If the available browser tool cannot establish these controls before its first
request, stop and report the capture as blocked. Do not use a less controlled
client to work around the boundary.

## 3. Capture In A Real Browser

For every route:

1. Reuse only the guarded ephemeral context for the approved origin.
2. Set a fixed viewport, CSS screenshot scale, and reduced-motion preference,
   then wait for fonts,
   critical images, and the observed loading transition to settle.
3. Save a viewport screenshot and a full-page screenshot.
4. Record title, landmark structure, heading order, visible text, link targets,
   form controls, accessible names, focus order, and keyboard behavior.
5. Exercise reversible states: menu open, accordion expanded, tab selected,
   carousel position, modal open, hover, focus, validation error, empty state,
   loading state, and error state when safely reproducible.
6. Repeat at the mobile viewport and any layout-changing breakpoint.

Use a source/local filename convention that pairs evidence, for example:

```text
evidence/source/home--desktop--default.png
evidence/local/home--desktop--default.png
```

Keep generated screenshots, traces, and reports out of source control. Prefer an
existing ignored evidence directory; otherwise use a task-owned temporary
directory and report its location. Do not silently add broad ignore rules.

## 4. Record Visual Tokens

Observe or compute:

- font family, weight, size, line height, letter spacing, and text transform
- foreground, background, border, focus, overlay, and shadow colors
- content max width, grids, gaps, padding, margins, radii, and border widths
- image aspect ratios, crop positions, object-fit behavior, and responsive
  sources
- sticky, fixed, clipped, overflow, and stacking behavior
- transition duration, easing, transform, opacity, and reduced-motion behavior

Prefer a small reusable token layer over one-off pixel nudges.

## 5. Inventory Assets

For each image, icon, font, video, animation, manifest, and downloadable file,
record:

- source URL and owning host
- resource type, dimensions, MIME type, and visible use
- whether it is user-owned, licensed, public-domain, replaceable, or blocked
- intended local path or lawful replacement

Do not infer reuse permission from public accessibility. Avoid hotlinking.
Preserve exact assets only when rights are established.

## 6. Inspect Observable Requests Safely

Use the browser network panel or request/response events to identify:

- public read-only endpoint URLs and methods
- response status and MIME type
- public response shape needed to reproduce the UI
- caching, pagination, loading, and error behavior
- WebSocket presence without saving private frames

Retain only a sanitized inventory. Do not persist headers, cookies, request
bodies, signed URLs, credentials, CSRF data, personal data, or full production
responses. Prefer metadata over HAR. If a HAR is essential for an authorized
public route, use a sanitized export, omit content, filter to the exact host and
path, keep it untracked, and delete it after extracting the safe inventory.

## 7. Note What A Browser Cannot Reveal

Mark these as unknown unless the user provides owned source:

- server implementation and database schema
- secret configuration, queues, cron jobs, webhooks, and admin behavior
- authorization policy beyond observable public responses
- unavailable edge cases, feature flags, regional variants, and A/B tests
- third-party service internals

Unknown behavior becomes a fixture, a safe local implementation, or a reported
gap. It never becomes an invented claim about the reference.
