# JavaScript and Rendering

## Verification sequence

For each important template:

1. inspect the initial HTML response;
2. inspect rendered DOM and visible text in a real browser;
3. review console, failed resources, network redirects, and hydration errors;
4. follow important links and forms with JavaScript enabled;
5. use a JavaScript-disabled check as a diagnostic, not as the sole rule for
   modern framework compatibility.

Search engines can render JavaScript, but rendering cost, blocked resources,
late content, errors, and client-only links can still reduce reliability.

## Architecture choices

- Prefer server rendering, static generation, streaming, or framework-supported
  hybrid rendering for public discovery pages when it fits freshness and
  interaction needs.
- Hydration itself is not a complete SEO strategy. The initial response should
  contain meaningful public content and links, while client code should enhance
  the experience without erasing or contradicting them.
- Dynamic rendering is a workaround, can create crawler/user parity risk, and
  is not Google’s recommended long-term solution.
- Do not replace an established framework architecture merely to satisfy a
  generic SEO checklist. Prove the actual rendering defect first.

## Performance

- Measure before changing. Identify LCP candidates, long tasks, render-blocking
  resources, third-party scripts, font behavior, image dimensions, and
  hydration cost.
- Use responsive, appropriately encoded images and stable intrinsic dimensions.
  Apply preload or high fetch priority only to confirmed critical resources;
  overuse competes with other downloads.
- Split or defer non-critical JavaScript and reduce main-thread work where the
  measured bottleneck supports it. Web Workers are one option, not a default
  prescription.
- Keep lab and field metrics separate. Lab results aid debugging; CrUX or
  PageSpeed field data describes eligible real-user history.
