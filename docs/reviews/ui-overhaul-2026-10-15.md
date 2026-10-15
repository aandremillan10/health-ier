# Clinic interface overhaul

Date: 2026-10-15, Asia/Manila.

## Scope and coverage

Implemented the requested overhaul of the existing clinic interface. Scope covers sign-in, clinic navigation, quick patient search, patient navigation, the registry, and shared presentation used by charts and operational screens. The existing React, Tailwind 4, shadcn Button/Input, and CSS token system remain in use. No dependency was added.

Project sources: `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, `CONTEXT.md`, and `docs/specs/README.md`. The current request authorizes UI implementation. Backend contracts, permissions, clinical content, and print form bodies remain outside the change.

| Domain        | Evidence inspected                                                                                                                                              | Result                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Accessibility | `App.tsx`, `Registry.tsx`, `ui.tsx`, `CommandPalette.tsx`; browser focus return, menu disclosure, eight staff views, table accessibility tree, print visibility | Addressed focus and announcement details; screen reader speech not verified           |
| Layout        | `clinic.css`, registry and chart layouts; desktop captures, 320px captures, 1024/1280/1920px form tests and doubled text                                        | Reworked navigation and narrow registry layout                                        |
| Writing       | Sign-in, search guidance, disconnected notice, appointment table guidance; existing empty/error/save messages                                                   | Added specific instructions and recovery text                                         |
| Typography    | `styles.css`, `clinic.css`, `DESIGN.md`; rendered headings, labels, identifiers, and doubled text                                                               | Kept the system font and approved scale; added tabular numerals to identifiers/counts |
| Colors        | Existing semantic tokens; rendered text, input, focus, and sign-in pairs                                                                                        | Sampled pairs pass; kept the approved palette                                         |
| UI polish     | Shared buttons, navigation state, patient banner, skeletons, dialogs and pointer states                                                                         | Removed routine motion; made selection immediate; contained overlay scrolling         |

All six owning better-interface domain skills were loaded. This is a review of the above interface scope, not a claim that every clinical subflow or every assistive technology has been audited.

## Findings and changes

These findings are resolved in the working tree. Locations refer to the resulting implementation.

| Severity | Domain        | Location                                                             | Before                                                                                    | After                                                                                                     | Why                                                                                   |
| -------- | ------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| MEDIUM   | Layout        | `app/src/renderer/App.tsx:785`                                       | Quick patient search opened only through Ctrl+K                                           | A named Search patients button opens the same dialog and restores focus on dismissal                      | Staff can discover and use quick search with a pointer or keyboard                    |
| MEDIUM   | Layout        | `app/src/renderer/App.tsx:857`                                       | Patient chart controls shared the clinic sidebar                                          | Patient navigation sits directly below patient identity; clinic tools stay in the sidebar                 | Patient context and clinic context are easier to distinguish                          |
| MEDIUM   | Layout        | `app/src/renderer/App.tsx:616`, `app/src/renderer/clinic.css:1483`   | Narrow windows showed the full sidebar and wide registry rows                             | A labeled menu expands clinic tools; registry rows stack with labels and a full-width Open record action  | Routine controls fit a 320px window without page overflow                             |
| MEDIUM   | Layout        | `app/src/renderer/App.tsx:829`                                       | Reports and audit screens retained the selected patient banner                            | Those clinic-wide screens omit patient identity and patient navigation                                    | A patient banner must not imply that a clinic-wide report is filtered to that patient |
| MEDIUM   | Writing       | `app/src/renderer/App.tsx:808`                                       | Server-unavailable text did not give a recovery step                                      | The notice tells staff to check the clinic connection and retry                                           | Staff have a stated next action; save success is still required                       |
| MEDIUM   | UI polish     | `app/src/renderer/clinic.css:295`, `app/src/renderer/clinic.css:327` | Navigation color transitions briefly retained the previous selection                      | Navigation state changes immediately                                                                      | Repeated navigation should give a clear current location                              |
| LOW      | Accessibility | `app/src/renderer/clinic/Registry.tsx:117`                           | The result count live region mounted with its result                                      | A stable status region receives result-count updates                                                      | The announcement region exists before its content changes                             |
| LOW      | UI polish     | `app/src/renderer/clinic.css:134`, `app/src/renderer/clinic.css:762` | A centered sign-in card, animated loading stripes, error shake, and global button scaling | A structured sign-in layout, static loading shapes, persistent error text, and immediate routine controls | Staff tasks need readable state and predictable controls                              |

## Motion review

No new animation was accepted. Frequency below is a design estimate, not measured staff usage.

| Candidate                     | Purpose                   | Expected frequency           | Decision                                                             |
| ----------------------------- | ------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| Quick search opening          | Access to another patient | Keyboard initiated; frequent | Reject movement; keep immediate                                      |
| Clinic and patient navigation | Show current location     | Frequent                     | Reject transitions; retain label, fill/underline, and `aria-current` |
| Search result rows            | Show available records    | Frequent                     | Reject entrance effects; preserve readable content                   |
| Loading placeholders          | Show a request is pending | Repeated                     | Keep the status text and static shapes; remove continuous sweeping   |
| Sign-in errors                | Explain a failed request  | Occasional                   | Keep the actionable error; remove the panel shake                    |

## Verification

Checks used synthetic browser fixtures and headless Chrome. No shared graphical browser was controlled.

Passed:

- `pnpm --filter app exec playwright test`: **45 passed** on the final implementation. This includes the two new interface tests, eight staff views, session changes, dirty draft protection, document issuance/retry, contrast, and the existing desktop/doubled-text layout checks.
- The two new interface tests first failed against the original interface because Search patients and Clinic menu were absent. Both now pass. They also check focus return, patient navigation, report context, print visibility, narrow controls, and dialog width.
- `pnpm --filter app test`: **64 passed, 1 skipped**. These are existing tests; no unit tests were added after implementation.
- `pnpm --filter app typecheck`: passed.
- ESLint on the changed TypeScript files: passed.
- Prettier on the changed source and this report: passed.
- `pnpm --filter app build`: passed for Electron main, preload, and renderer.
- `git diff --check`: passed.
- Headless render checks: no page overflow on the captured desktop screens or the five clinic tool screens at 320px. The stacked registry retains five column headers and four rows in Chrome's accessibility tree.
- Sampled rendered text contrast: minimum **5.49:1**; input boundary **3.49:1**; focus **8.95:1**; sign-in introduction **8.92:1**. These measurements cover the sampled pairs, not every possible server-supplied state.

The Impeccable mechanical detector reported two font warnings for Arial in the existing print form rules. The approved print specification requires Arial. Those rules were kept; the detector reported no other findings.

Not verified:

- Screen reader speech, actual Windows text scaling, RTL/localized strings, touch hardware, and the clinic's physical desktops.
- Live sign-in, server/database changes, LAN/cloud behavior, or a physical printer. Browser bridge fixtures do not establish live behavior.
- One existing test remains skipped by the app test suite.

## Evidence

Screenshots and generated results are local verification files. The repository already ignores `docs/verification/`; they are not staged or committed.

- [Registry before](../verification/ui-overhaul-2026-10-15/before-registry.png) and [after](../verification/ui-overhaul-2026-10-15/after-registry.png).
- [Medical chart before](../verification/ui-overhaul-2026-10-15/before-chart.png) and [after](../verification/ui-overhaul-2026-10-15/after-chart.png).
- [Sign-in](../verification/ui-overhaul-2026-10-15/after-signin.png), [320px registry](../verification/ui-overhaul-2026-10-15/after-registry-320.png), and [320px quick search](../verification/ui-overhaul-2026-10-15/after-search-320.png).
- [Render checks](../verification/ui-overhaul-2026-10-15/render-checks.json), [contrast measurements](../verification/ui-overhaul-2026-10-15/contrast-results.json), [table accessibility tree](../verification/ui-overhaul-2026-10-15/registry-320-accessibility.yml), and [browser test results](../verification/ui-overhaul-2026-10-15/frontend-results.json).

To repeat the automated checks, run the commands above from the repository root. To repeat visual inspection, run `pnpm dev:frontend`, open the local address, select the labeled frontend demo, and inspect the registry, a medical chart, and each clinic tool. Use only the fictional demo records. The interface tests save the 320px captures; the refinement layout tests save the desktop and doubled-text captures.

## Verdict

**Approve** for the inspected scope and tested states. No confirmed HIGH finding remains within that scope. The unverified behavior above still needs its own checks before a clinic deployment.
