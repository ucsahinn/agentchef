# Offline Diagram Contract

Use this reference when creating, validating, or extending the offline diagram
triplet workflow.

## Output Contract

For each diagram request, the workflow should be able to produce:

- Mermaid source: `.mmd`
- Editable Excalidraw scene: `.excalidraw`
- Rendered vector asset: `.svg`
- Rendered raster asset: `.png`
- Markdown snippet: `.md`

All outputs must be generated locally. Do not call remote Mermaid or Excalidraw
rendering services.

## Supported Mermaid Subset

The bundled renderer is intentionally smaller than Mermaid itself. Use:

- `flowchart TD`
- `flowchart TB`
- `flowchart BT`
- `flowchart LR`
- `flowchart RL`
- Node forms:
  - `A[Rectangle]`
  - `B(Rounded)`
  - `C((Ellipse))`
  - `D{Decision}`
  - bare identifiers, converted to rectangles
- Edge forms:
  - `A --> B`
  - `A -->|label| B`
  - `A -.-> B`
  - `A ==> B`
  - `A --- B`
- Mermaid comments beginning with `%%`
- Optional trailing semicolons

The renderer rejects cyclic graphs and enforces input, node, edge, and pixel
limits to keep local rendering predictable.

## Unsupported Unless Implemented

Do not imply support for these without extending and validating the renderer:

- Subgraphs
- Class definitions and theme blocks
- HTML labels
- Icons and font-awesome markers
- Click handlers
- Sequence, state, ER, class, Gantt, or mind-map diagrams
- Remote images or external renderers
- Advanced Mermaid shape syntax beyond the supported forms

## Excalidraw Scene Contract

The `.excalidraw` output should remain an editable JSON scene with:

- top-level `type: "excalidraw"`
- numeric `version`
- `source`
- `elements`
- `appState`
- `files`

Use Excalidraw element types that map cleanly from the supported Mermaid subset:
rectangle, diamond, ellipse, text, and arrow elements. Preserve editability; do
not flatten the scene into an image.

## Safety

- Keep labels short and public-safe.
- Do not include secrets, tokens, credential material, private hostnames, or
  private local paths in labels, filenames, or snippets.
- Keep artifacts local unless the user explicitly asks to version them.
- If a diagram describes a sensitive system, summarize trust boundaries without
  leaking implementation secrets.

## Validation

Run:

```bash
npm run validate:diagram
```

For manual checks:

- Parse the `.excalidraw` file as JSON.
- Confirm the SVG starts with `<svg`.
- Confirm the PNG has a valid PNG signature.
- Open the `.excalidraw` file on excalidraw.com only when the user wants a
  manual editability check.
