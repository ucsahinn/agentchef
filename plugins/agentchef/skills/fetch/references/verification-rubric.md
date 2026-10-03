# Fidelity Verification Rubric

Use matched source/local evidence. A visual impression from memory is not a
verification result.

## Required Evidence Matrix

For each claimed route, collect at least:

- source and local desktop screenshots at the same viewport and state
- source and local mobile screenshots at the same viewport and state
- source and local full-page screenshots for the baseline state at each
  viewport
- source and local interaction evidence for every declared control and its
  applicable states
- local console, failed-request, and accessibility review evidence for every
  claimed state
- relevant lint, typecheck, test, build, smoke, or runtime command result

Add evidence for modal, menu, tab, carousel, form error, loading, empty, error,
and permission states when they exist.

## Per-Route Checks

Score each as `pass`, `gap`, or `blocked`:

| Check | Pass condition |
| --- | --- |
| `visual` | Layout, typography, color, spacing, borders, shadows, imagery, and layering have no material mismatch at matched viewports. |
| `responsive` | Composition, overflow, sticky behavior, touch targets, and breakpoint transitions match across the required matrix. |
| `interaction` | Navigation, controls, keyboard behavior, focus, state transitions, and reversible flows work locally. |
| `content` | Authorized copy, labels, metadata, route titles, and accessible names are present without invented claims. |
| `assets` | Every visible asset is exact and authorized or has an explicit lawful replacement gap. |
| `console` | No unexplained runtime error, hydration failure, CSP error, or repeated warning remains. |
| `network` | Local runtime has no unexplained failed request and does not depend on production mutation endpoints. |
| `accessibility` | Landmarks, headings, labels, focus visibility, keyboard access, reduced motion, and contrast remain usable. |

## Fix Loop

1. Compare paired screenshots at the exact viewport and UI state.
2. Identify the largest perceptual or functional mismatch.
3. Fix the responsible token, component, state, or asset.
4. Rerun the narrow behavior check.
5. Recapture local evidence.
6. Continue until all in-scope checks pass or the remaining item is a genuine
   authorization, rights, or technical blocker.

Do not hide gaps with screenshot cropping, different viewport sizes, different
content, loading placeholders, or disabled interactions.

## Status Rules

- `complete`: every in-scope route check is `pass`, evidence files exist, repo
  checks pass, and there are no known gaps.
- `partial`: the working reconstruction is useful, but at least one route check
  is `gap`; list the exact difference and next action.
- `blocked`: authorization, target access, asset rights, required user choice,
  or an external dependency prevents meaningful completion; name the blocker.

Validate the final JSON report with the bundled validator. The validator checks
exact-origin scope, safe evidence paths, unique viewport identities, PNG
dimensions and decodability, the paired screenshot matrix, and check-specific
interaction, console, network, and accessibility evidence. Each non-pass check
also needs an explanation and next action. The validator does not replace human
or browser review.
