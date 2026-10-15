# Clinic interface direction

Status: **clinic-demo-v1.1 staff-tool baseline with a user-requested clinic-demo-v1.2 color and toast refinement, 2026-10-15, Asia/Manila**. See [approval record](docs/specs/approval.md). The v1.2 change keeps the existing component system and workflow boundaries.

## Approved system baseline

| Area           | Baseline                                                                                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type           | Windows system/Segoe UI via `system-ui, "Segoe UI", sans-serif`; body and input text 16px (1rem), 1.5 line-height. Labels/help 14px (0.875rem), section titles 20px, page titles 24px. Weight 400 body, 500 labels/actions, 600 headings. No marketing display type.                                                  |
| Spacing        | 4px base; standard steps 4, 8, 12, 16, 24, 32, 48px. 8px label/control gap; 16px field/group gap; 24px panel padding, reduced to 16px in narrow windows.                                                                                                                                                              |
| Foundation     | Existing shadcn New York, neutral CSS variables in `app/src/renderer/styles.css`; one component vocabulary, no second design system.                                                                                                                                                                                  |
| Surfaces       | Pale sage canvas `#eef4f2` / `#e8f0ed`, warm ivory card `#fbfcf9`, ink `#1c3038`, and deep blue-teal primary `#154d64` with `#f8fcfb` text. Muted text is `#4f6668`; input boundary is `#7a8e8a`; focus ring is `#15556a`. Keep semantic success, warning, and error colors in their existing pairs.                  |
| Shape          | Base radius 10px (0.625rem), small 6px, medium 8px, large 10px. Buttons and inputs follow medium; panels large. Elevation only for real overlays, not every chart section.                                                                                                                                            |
| Controls       | Standard button/input height at least 40px; 44px target preferred for prominent routine actions. Visible verb/noun labels. Primary action filled blue-teal; secondary outlined/quiet; destructive action named explicitly.                                                                                            |
| Focus          | Visible 3px high-contrast primary-colored ring with 2px offset, never hidden. Approved product focus upgrades the scaffold's lighter ring for reliable contrast. Verify rendered contrast rather than treating token values as proof.                                                                                 |
| Semantics      | Success dark green `#166534` on `#f0fdf4`, warning `#92400e` on `#fffbeb`, error `#b91c1c` on `#fef2f2`, info/neutral foreground on muted surface. Pair state text/icon with color. Keep destructive primary token separate from informational alerts. Verify WCAG AA text and control contrast in actual components. |
| Motion         | Immediate routine/keyboard actions; optional 150-200ms state/overlay feedback with explicit opacity/transform properties. Reduced motion uses static or brief fades. No page-load choreography.                                                                                                                       |
| Windows/layout | Readable at 1280×720 and 1920×1080, tolerate 1024px-wide windows and 200% text zoom through structural reflow. Keep patient/chart identity visible; allow table overflow deliberately. These are approved QA targets, not observed device resolutions.                                                                |

Use shadcn Button, Input, Label, Textarea, Select, Table, Tabs, Alert, Tooltip, Dialog/Popover where their standard behavior fits. Install only components required by the approved feature. Each interactive component covers default/hover/focus/active/disabled/loading and applicable error/success. Read-only information remains legible. Dark mode and mobile are deferred; no unsupported theme promise is made.

Clinic tasks use a stable task-oriented shell, selected patient identity, clear Medical/Dental/Laboratory chart labels, and named staff role/head status. Routine navigation is consistent. A section becomes visible only under server-authorized data; hiding tabs cannot secure broad responses. No unrequested statistics dashboard.

Sonner is mounted once at the renderer root for brief, noncritical feedback such as a copied document ID. Save confirmations, server failures, and recovery steps remain visible in the page.

## Users and setting

v1.1 adds Backend-owned one-way cloud mirroring; clinic users stay on the edge/LAN. Cloud lag/outage must not turn a locally saved action into failure or block the clinic flow. Frontend integrated proof distinguishes edge save status from Backend/operator delivery evidence; no sync transport, cloud portal or new cloud navigation is added. Existing staff design tokens/screens remain the selected baseline.

The app serves a small clinic with 2 medical doctors, 2 dentists, 2 medical technologists, 1 nursing attendant, and 1 clerk. Staff use 4 Windows 10/11 desktops and a printer connected through the office LAN/Wi-Fi. Design for staff who are not technical: familiar controls, readable text, clear next actions, and feedback that explains what happened.

## Task clarity

- Name an action for its outcome: for example, `Save medical entry` rather than `Submit`, or `Print prescription` rather than an unlabeled printer icon. Use these meaningful outcome labels within the approved feature scope.
- Keep patient identity and the current medical/dental chart apparent when viewing or editing a record. Use the approved identity/field contract.
- Place visible labels above inputs and instructions near the relevant task. A placeholder is supplementary, not a label.
- Group related information and reveal uncommon options progressively. Keep routine paths short without hiding information needed for a clinical decision.
- Explain read-only access in context. Clinic head oversight must never imply permission to edit another person's entries.
- Give helpful empty, loading, error, disconnected, disabled, and success states. Distinguish unsaved work, a successful server save, and a failed operation in plain language.
- Provide keyboard-accessible tooltips and help with adequate contrast and focus behavior. Essential instructions remain visible; hover-only help cannot be the only explanation.
- Consider an optional, skippable, replayable demonstration/onboarding flow. Keep this optional and skippable; use synthetic data only.

## Consistent components and accessibility

Use the user's selected React, Tailwind CSS, and shadcn/ui foundation. Keep a consistent vocabulary for buttons, inputs, tables, alerts, navigation, and status. Reuse appropriate existing components rather than adding a second design system. Maintain readable contrast, visible focus, sensible tab order, accessible names, and layouts that tolerate text zoom and smaller desktop windows. Color supplements text or shape for state information.

The approved baseline develops the existing technical defaults without claiming that the static scaffold is an approved product screen. Optimize and verify on the actual clinic desktops and agreed window/zoom targets.

## Feedback and motion

Respond immediately to input. Keep routine and keyboard actions immediate. Motion must explain a state change or preserve spatial understanding; repeated clinic tasks do not need decoration. Use brief, interruptible transitions where useful, explicit animated properties, and reduced-motion alternatives. Gesture physics and translucent materials are conditional techniques, not requirements for this desktop clinic app. Protect legibility and performance before adding visual effects.

## Sources and scope

| Local source                                                                                                            | Application here                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Impeccable](.agents/skills/impeccable/SKILL.md) and [Operate guidance](.agents/skills/impeccable/reference/operate.md) | Task-oriented product UI: familiar components, scanability, complete states, restrained color and motion. Load its relevant playbook before design work.                                                                             |
| [Emil design engineering](.agents/skills/emil-design-eng/SKILL.md)                                                      | Frequency-based motion decisions, responsive feedback, consistent component behavior, and reduced motion.                                                                                                                            |
| [Apple design](.agents/skills/apple-design/SKILL.md)                                                                    | Predictability, user control, familiarity, readable typography, feedback, spatial consistency, and restraint. Its web techniques do not require copying macOS visuals on Windows.                                                    |
| [Design taste frontend](.agents/skills/design-taste-frontend/SKILL.md)                                                  | Brief fidelity and avoiding generic marketing templates. Its own scope excludes dashboards, data tables, and multi-step product UI; marketing hero, imagery, display-font, and choreography defaults do not govern clinic workflows. |
| [Astra UI handoff](.agents/skills/handoff-ui-to-astra/SKILL.md)                                                         | For an explicitly authorized UI handoff: pass actual skill sources, interfaces, user references, scope, and QA authorization. Copying this skill alone does not invoke it.                                                           |

User needs and approved product specifications govern. Resolve source differences by scope; surface material unresolved conflicts. Use approved flattened forms and unified header under `docs/headers/`; other source/UI references remain evidence rather than requirements. Follow [AGENTS.md](AGENTS.md) for interactive QA resource confirmation and Chrome use.

Latest user assets under `docs/headers/` establish flattened prescription/certificate form bodies plus a unified header for both, superseding earlier distinct-header guidance. Use high-resolution `header.jpg` for white-paper print; lower-resolution transparent PNG is useful for small preview unless replaced. Preserve editable certificate purpose and handwritten signatures without stored signature images. Astra handoff is preauthorized only for future print-template implementation after a separate build instruction; other frontend work stays with the teammate. See [document baseline](docs/specs/demo-data-and-documents.md). Builder UI reference identifiers must not be published unchanged or copied into fixtures.
