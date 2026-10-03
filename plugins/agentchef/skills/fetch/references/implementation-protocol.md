# Reconstruction Implementation Protocol

Implement the captured experience as a maintainable local product, not a
bundle of copied minified code.

## Existing Project First

1. Read repo instructions and package scripts.
2. Identify the active application, routing, styling, asset, test, and auth
   conventions.
3. Preserve the current framework, package manager, dependency versions, and
   user-owned changes.
4. Add a dependency only after proving the existing stack cannot express the
   required behavior and receiving approval for the install.

If the workspace has no clear application target, ask for the output path.
Do not silently scaffold into an unrelated repository root.

## Build Order

1. Establish tokens: typography, color, spacing, width, radius, border,
   shadow, and motion.
2. Build the shared shell: document metadata, header, navigation, footer,
   overlays, and responsive containers.
3. Implement routes in visible-navigation order.
4. Add reversible interactive states and keyboard behavior.
5. Add public data fixtures or local mocks for unavailable backends.
6. Add loading, empty, error, validation, disabled, permission, and offline
   states that were observed or required for safe local behavior.
7. Add route and behavior tests before final visual tuning.

## JavaScript And Interaction Parity

- Reimplement observable behavior with readable local code. Do not paste
  minified bundles or execute downloaded scripts in the project.
- Match navigation, drawers, modals, tabs, accordions, carousels, filters,
  validation, keyboard shortcuts, scroll effects, and animation timing.
- Preserve deep links, back/forward behavior, query parameters, hash targets,
  and focus restoration when observed.
- Avoid dead buttons. A control must work locally, be visibly disabled with a
  reason, or be listed as a gap.
- Respect `prefers-reduced-motion` and avoid motion that blocks input.

## Assets And Fonts

- Localize user-owned or licensed assets using stable, descriptive paths.
- Preserve responsive image sizing and cropping.
- Prefer an existing icon system. Do not substitute unrelated emoji or generic
  icons when shape materially affects fidelity.
- Use installed or licensed fonts. If the reference font cannot be reused,
  select the closest lawful fallback, tune metrics, and record the difference.
- Optimize files only when the visible result remains equivalent.

## Data, APIs, And Authentication

- A public response shape may inform a local fixture, but do not copy private
  production datasets.
- Default forms to local validation and a non-network success fixture.
- Mock read APIs locally or with browser routing. Do not replay captured write
  requests.
- Recreate the public login screen and validation behavior without collecting
  credentials.
- Implement real authentication only when the current repo already owns an
  auth backend or the user explicitly requests a separate authorized auth
  feature. That work follows the repo's security review and test gates.
- Never proxy a login form to the reference site's endpoint.

## Responsive And Browser Behavior

- Use layout rules that explain the observed breakpoints; do not hard-code only
  the captured viewport.
- Check narrow mobile, target desktop, zoom or text expansion, touch targets,
  overflow, sticky elements, and virtual keyboard impact where relevant.
- Preserve semantics, labels, focus visibility, contrast, and screen-reader
  relationships while matching appearance.

## Honest Fidelity

The reconstruction can be called complete only for the authorized, observed
matrix. When a server-only feature, protected route, asset right, regional
variant, or third-party dependency is unavailable, implement a clearly local
equivalent when safe and record the remaining difference.
