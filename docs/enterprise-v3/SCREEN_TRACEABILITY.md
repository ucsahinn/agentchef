# Enterprise v3 screen traceability

## Scope and acceptance contract

This document translates the 25 user-supplied reference screenshots into independent implementation targets. It is a traceability contract, not a replacement for the source images: no screenshot, crop, collage, third-party asset, or machine-specific path is stored in this repository.

Each target preserves the capability visible in its source. A later implementation may improve structure or accessibility, but must not remove a visible navigation destination, filter, status cue, detail area, or empty-state recovery path without an explicit product decision.

## Evidence method

- Source set: 25 separate user-owned PNG files, reviewed one-by-one at original pixel dimensions on 2026-08-14.
- Source identity: the filename and dimensions below are sufficient to distinguish each supplied asset; the external storage location is intentionally omitted.
- Review rule: every row maps to exactly one target screen. No crop or composite was used for analysis.
- Target status: documentation only. No existing UI or source file was modified by this task.

## Corpus boundary

`C:\\ss` contains a broader user-owned screenshot corpus. This document deliberately records the 25 sources selected for FND-02 only; it is not a complete inventory of that external folder. The complete-folder inventory belongs to the separate FND-02B catalogue task. Neither boundary permits committing source screenshots, crops, composites, or third-party assets here.

## 25/25 unique-source matrix

| ID | Unique source file | Original px | Target screen | Visible state that must survive |
| --- | --- | ---: | --- | --- |
| S01 | `Ekran görüntüsü 2026-08-12 134654.png` | 1913 x 996 | Hermes welcome, compact rail | New-session landing, four-item rail, hero and composer entry point |
| S02 | `Ekran görüntüsü 2026-08-12 134707.png` | 1869 x 855 | Hermes capabilities, skills | Skill catalogue with search, selected item detail and per-item enable control |
| S03 | `Ekran görüntüsü 2026-08-12 134711.png` | 1886 x 839 | Hermes capabilities, tools | Tool catalogue with category rows, counts, descriptions and controls |
| S04 | `Ekran görüntüsü 2026-08-12 134715.png` | 1912 x 793 | Hermes MCP empty state | MCP destination, explicit no-server state and recovery action |
| S05 | `Ekran görüntüsü 2026-08-12 134718.png` | 1864 x 824 | Hermes Browse Hub empty state | Hub search shell and connected-hub discovery empty state |
| S06 | `Ekran görüntüsü 2026-08-12 134803.png` | 1434 x 976 | Hermes welcome, project rail | Project/session navigation, pinned area, branch status and full composer |
| S07 | `Ekran görüntüsü 2026-08-12 134842.png` | 1190 x 717 | Hermes welcome, reduced width | Responsive welcome composition with centred hero and bottom composer |
| S08 | `Ekran görüntüsü 2026-08-12 174337.png` | 1836 x 1003 | AgentSpace reports index | Office scene, report filters, report metrics and two-column report feed |
| S09 | `Ekran görüntüsü 2026-08-12 174345.png` | 1836 x 925 | AgentSpace memory map, focused | Office scene, selected-agent inspector, graph and legend |
| S10 | `Ekran görüntüsü 2026-08-12 174355.png` | 1823 x 887 | AgentSpace task board | Team/sprint/search controls and five status columns |
| S11 | `Ekran görüntüsü 2026-08-12 174403.png` | 1715 x 881 | AgentSpace task detail, summary | Kanban context plus selected-task summary, assignment, launch and reports |
| S12 | `Ekran görüntüsü 2026-08-12 174407.png` | 1737 x 851 | AgentSpace task detail, requirements | Selected-task scrolled content with validation, rules and DoD sections |
| S13 | `Ekran görüntüsü 2026-08-12 174411.png` | 1742 x 871 | AgentSpace task detail, DoD | Checklist completion state and comments composer in detail pane |
| S14 | `Ekran görüntüsü 2026-08-12 180851.png` | 1887 x 998 | AgentSpace terminal mosaic | Office rail and multi-pane terminal supervision view |
| S15 | `Ekran görüntüsü 2026-08-12 233045.png` | 1879 x 928 | AgentSpace code plus terminals | Repository tree/editor launch surface beside active terminal panes |
| S16 | `Ekran görüntüsü 2026-08-12 233054.png` | 1910 x 1013 | AgentSpace reports, agent chat | Report index paired with an active agent conversation and compose controls |
| S17 | `Ekran görüntüsü 2026-08-12 233100.png` | 1892 x 1066 | AgentSpace memory map, full | Large multi-agent relationship map with zoom affordances and ownership legend |
| S18 | `Ekran görüntüsü 2026-08-12 233108.png` | 1914 x 947 | AgentSpace skill draft plus browser | Skill-centre empty/draft form alongside embedded browser workspace |
| S19 | `Ekran görüntüsü 2026-08-12 233124.png` | 1852 x 945 | AgentSpace skill draft plus board | Draft form remains available while the task board is the primary work surface |
| S20 | `Ekran görüntüsü 2026-08-12 233132.png` | 710 x 809 | AgentSpace task detail modal, checklist | Narrow modal detail with report links, identity note and description entry |
| S21 | `Ekran görüntüsü 2026-08-12 233138.png` | 690 x 804 | AgentSpace task detail modal, metadata | Narrow modal detail with project, area, priority, assignee and launch action |
| S22 | `Ekran görüntüsü 2026-08-13 072631.png` | 1108 x 868 | Agent instruction transcript, lead | Terminal transcript containing coordinator role and durable-memory guidance |
| S23 | `Ekran görüntüsü 2026-08-13 072642.png` | 1120 x 608 | Agent instruction transcript, continuation | Continuation of coordinator task-board/reporting rules |
| S24 | `Ekran görüntüsü 2026-08-13 072704.png` | 1114 x 836 | Agent instruction transcript, designer | Designer role, memory and evidence-first operating guidance |
| S25 | `Ekran görüntüsü 2026-08-13 072709.png` | 1122 x 437 | Agent instruction transcript, mobile DoD | Mobile verification requirement, output path and device-limitation notes |

## Independent target briefs

### S01 — Hermes welcome, compact rail

Keep the dark image-led landing canvas, compact left rail, four primary destinations, prominent wordmark, explanatory line, and clear hand-off into a new-session composer. The welcome state must remain useful before any session exists.

### S02 — Hermes capabilities, skills

Keep discoverability as a three-part relationship: searchable catalogue, selected skill detail, and an enable/disable control. The selected item must expose its name, category, description, and current state without hiding the list.

### S03 — Hermes capabilities, tools

Keep the tool catalogue distinct from skills. Category rows need visible tool counts, explanatory metadata, and state controls; the right detail pane must explain the selected category rather than merely repeat its name.

### S04 — Hermes MCP empty state

Keep MCP as a first-class destination even when no server exists. Preserve the direct recovery path to add a server and the catalogue route; do not turn an empty configuration into a dead end.

### S05 — Hermes Browse Hub empty state

Keep the hub search field and the empty connected-hubs state. The copy must say what can be found and where the user should begin, while avoiding a false claim that a hub is connected.

### S06 — Hermes welcome, project rail

Keep the expanded session/project rail, pinned section, project scope, branch/change summary, and bottom composer together in the welcome state. This is the richer desktop variant of S01, not a separate capability.

### S07 — Hermes welcome, reduced width

At the narrower reference width, keep the hero readable, centred, and visually calm; retain the full composer and model/control area rather than collapsing it out of view. The rail may be absent, but session creation must remain obvious.

### S08 — AgentSpace reports index

Keep the office context visible while reports remain scannable: report total metrics, team filter chips, agent filter, text search, recency filters, report cards, author/status pills, time cues, and two-column density. Cards must open a report rather than acting as inert summaries.

### S09 — AgentSpace memory map, focused

Keep the selected agent as the focal point, with a colour-coded relationship graph, inspector panel, graph controls, and legend. The view must distinguish a selected agent's knowledge from the broader graph instead of flattening all nodes into one undifferentiated map.

### S10 — AgentSpace task board

Keep the board’s operational model: team and sprint filters, search, backlog/todo/in-progress/review/done columns, item counts, priority, assignee identity, task ID, project label, and keyboard affordance. Status progression must remain legible at a glance.

### S11 — AgentSpace task detail, summary

Keep the selected task attached to board context and expose task ID/status, project, area, priority, assignee, pane-launch action, linked reports, identity note, dates, and long description. Launching a worker/pane must remain a deliberate action, not an automatic side effect of selection.

### S12 — AgentSpace task detail, requirements

Keep long-form task instructions readable through explicit sections. Validation instructions, rules, and Definition of Done must be visually separable and retain their substantive guidance; scroll position must never erase the task's identity and status context.

### S13 — AgentSpace task detail, DoD

Keep checkable DoD rows and a comments composer in the detail surface. The UI must distinguish incomplete criteria from completed work and let a reviewer leave a follow-up without leaving the task context.

### S14 — AgentSpace terminal mosaic

Keep concurrent work observable: labelled terminal panes, per-pane state/output, working-directory/status cues, and the office context. Density is intentional here, but terminal output must remain readable enough to support supervision.

### S15 — AgentSpace code plus terminals

Keep code navigation and terminal supervision co-present. The repository tree/editor launch state must not displace the terminal grid; this is an operational workspace, not a code editor-only screen.

### S16 — AgentSpace reports, agent chat

Keep report browsing alongside a directly addressable agent panel. Preserve run/status indication, conversation prompt, talk/start-conversation actions, keyboard hint, and configuration warning state, while making the report feed independently usable.

### S17 — AgentSpace memory map, full

Keep the graph scalable: relationship nodes, agent-colour legend/counts, zoom/pan instruction, and a large unobstructed canvas. Graph navigation must work without requiring the narrow focused inspector from S09.

### S18 — AgentSpace skill draft plus browser

Keep skill authoring intentionally gated: name, one-line description, Markdown body, draft-save/cancel controls, publication explanation, and a separate embedded browser work area. Saving a draft must not imply publishing it.

### S19 — AgentSpace skill draft plus board

Keep the draft form persistent while the task board is active. The board retains its full workflow controls and columns; the skill form must not become a blocking modal that hides task context.

### S20 — AgentSpace task detail modal, checklist

For narrow layouts, preserve the modal's task identity/status, close control, report links, identity/memory input, descriptive content, validation/rules/DoD sections, and comments. Content must scroll inside the modal without clipped controls.

### S21 — AgentSpace task detail modal, metadata

For the alternate narrow scroll position, preserve project, area, priority, assignee, explicit pane-launch control, report links, identity note, timestamps, and description. These administrative details remain available before the long brief.

### S22 — Agent instruction transcript, lead

Keep monospaced transcript readability, hierarchy for role/memory/task-board instructions, and clear separation between system guidance and the agent response. Long lines should wrap without destroying command/path legibility.

### S23 — Agent instruction transcript, continuation

Keep the same transcript surface across continuation content. Dense rule sections, outcome-report requirements, and task-board conventions need semantic structure, not a visually anonymous wall of terminal text.

### S24 — Agent instruction transcript, designer

Keep role-specific operating guidance distinguishable from shared instructions, including durable memory, evidence-first verification, and the designer’s UI/brand responsibility. The transcript must preserve names and emphasis without exposing private local details in exported artefacts.

### S25 — Agent instruction transcript, mobile DoD

Keep mobile verification as an explicit, testable requirement. The transcript must preserve the simulator-launch evidence requirement, output-location convention, and distinction between simulator-appropriate checks and real-device-only capabilities.

## Cross-screen design-system contract

- **Theme and hierarchy:** preserve the charcoal/slate application base, restrained cool-grey text, violet active/identity accent, cyan/teal operational accents, and status-specific green/yellow/red cues. Status cannot rely on colour alone.
- **Navigation:** retain the global product band, workspace tabs, left office/rail context, and clear active state. Surface changes must not strand users without a return route.
- **Density:** use compact operational density for boards, graphs, and terminal mosaics; use spacious centring for Hermes welcome and empty states. Do not force one density model everywhere.
- **Typography:** preserve strong functional hierarchy, mono treatment for IDs/terminal content, and display treatment only for the Hermes welcome wordmark. Maintain readable wrapping at reduced widths.
- **States:** empty, selected, active, warning, blocked/configuration-needed, and done states are all represented in the source set and must remain explicit.
- **Accessibility:** controls need visible focus and text labels or accessible names; status labels, counts, and success/error cues need non-colour redundancy; modal focus management and keyboard board navigation must be retained or improved.

## Definition of done for a future implementation

- [ ] Every S01–S25 target has an independently verifiable implementation or documented, approved non-applicability.
- [ ] All 25 source identities remain one-to-one with targets; no source is represented by a crop or collage.
- [ ] Visible capabilities in the matrix remain available, including empty-state recovery routes and task/agent workflow controls.
- [ ] Desktop, reduced-width, and narrow-modal variants have interactive evidence.
- [ ] No source screenshot, third-party asset, user path, secret, or session transcript is committed solely to satisfy traceability.
