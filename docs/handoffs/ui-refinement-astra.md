# Clinic UI refinement handoff

Prepared 2026-10-15, Asia/Manila. The user selected **a ready-to-paste prompt, not implementation in the preparation task**. Copy the prompt below into the task that will perform the work. Preparing this file does not start that work.

---

Refine the existing AMLIG clinic UI in `D:/health-ier` and finish its integration with the implemented backend. This is my explicit instruction to implement the bounded improvements below. Use **Astra High** for UI implementation through the local `handoff-ui-to-astra` skill: `model: "gpt-6-astra"`, `reasoning_effort: "high"`, `fork_turns: "none"`. Create a self-contained UI worker contract. Keep necessary Backend/API/privileged-bridge integration in a separate bounded contract using **GPT-6.1 Sol High** (`gpt-6.1-sol`, `high`, `fork_turns: "none"`), and coordinate the shared contract before parallel writers diverge. These model selections are explicit for this run. Deliver a modern, calm, coherent interface that non-technical clinic staff can understand and use repeatedly without hesitation.

## Establish the current baseline

Identify the repository root, current branch/commit, remote, worktrees, and user changes. Read root and scoped `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, `CONTEXT.md`, `docs/agents/skills.md`, and the approved specification index/permissions/demo flow/API and document baseline. Use CodeGraph first only if `.codegraph/` exists. Preserve user edits, existing private configuration, databases, credentials, and running services.

The reviewed UI is commit `f4ba486` (`feat: enhance clinic UI with loading states and command palette`), based on the frontend migration integrated by PR #13. Reconcile later changes before treating a finding as current. Historical specification language saying screens are unimplemented is approval provenance; inspect present code for actual behavior.

Read these preparation artifacts before defining the implementation contract:

- `docs/research/clinic-ui-libraries.md`: cited comparison of all eight supplied libraries, source/license limitations, and recommendations.
- `docs/research/clinic-ui-review.md`: combined findings, confirmed patient-switch reproduction, test results, palette/motion direction, and visual evidence manifest.
- `docs/research/clinic-ui-design-assessment.md` and `clinic-ui-evidence-assessment.md`: independent design and mechanical/source assessments. Their limits are part of the evidence.

Use `using-git-worktrees` to isolate implementation from the user's checkout, record its actual parent branch, and reuse a suitable already isolated checkout. Do not create nested worktrees. After checks pass, follow `finishing-a-development-branch`. My established integration preference is a PR against `master`, then merge to `master` after successful checks; carry this explicit choice into the coordinator contract so it does not ask the same question again. Workers return evidence and the integration decision to the coordinator; they do not independently push, merge, delete branches, or remove worktrees. Use conventional commits and normal hooks.

## Read the actual design sources and pixels

Invoke the local `handoff-ui-to-astra` skill and pass resolved **absolute** paths for these sources into Astra's contract. On the source checkout they are:

- `D:/health-ier/.agents/skills/handoff-ui-to-astra/SKILL.md`
- `D:/health-ier/.agents/skills/design-taste-frontend/SKILL.md`
- `D:/health-ier/.agents/skills/impeccable/SKILL.md`
- `D:/health-ier/.agents/skills/impeccable/reference/operate.md`
- `D:/health-ier/.agents/skills/emil-design-eng/SKILL.md`
- `D:/health-ier/.agents/skills/apple-design/SKILL.md`
- `D:/health-ier/.agents/skills/find-animation-opportunities/SKILL.md`
- `D:/health-ier/.agents/skills/animate/SKILL.md`, including the relevant `RECIPES.md` when building motion.

Resolve equivalent absolute paths in the assigned checkout. Skill names or the coordinator's summaries do not replace reading their content. Run Impeccable's context launcher once with cwd at the assigned project, load its applicable Operate/refinement playbook, and read `reference/craft-floor.md` immediately before UI edits. Preserve the incumbent visual system; missing PRODUCT.md is not permission to replace it or expand scope.

Inventory the review screenshots from `docs/research/clinic-ui-review.md`. View the actual pixels with an image-capable tool before editing the corresponding surface. Those files are local, ignored evidence under `D:/health-ier/docs/verification/ui-review-2026-10-15/`; they are not shipped assets or portable Git attachments. If working on another host, obtain authorized copies or regenerate fresh screenshots of the same committed baseline. Do not claim inaccessible references were viewed. The eight reference websites are candidate inspiration, not a demand to reproduce their appearance.

Before editing, send a readiness report identifying sources/supporting references read, image IDs viewed, actual branch/parent/worktree, Operate mode, intended direction, and access gaps. A missing reference blocks only work dependent on it; report the gap rather than reconstructing unseen pixels from prose.

## Preserve the visual world and application boundaries

Keep React, Tailwind, existing shadcn New York controls, Windows system/Segoe UI, and the approved neutral palette. Body/input text is 16px, help/labels 14px, section headings 20px, and page headings 24px. Use the 4px spacing scale, 40px minimum controls with 44px prominent actions, predictable focus, and structural reflow. Retain the supplied clinic logo and print headers.

The current foundation matches DESIGN.md: white surfaces, near-black primary actions, muted neutral layers, success `#166534` on `#f0fdf4`, warning `#92400e` on `#fffbeb`, error `#b91c1c` on `#fef2f2`. Extend existing tokens and semantic roles. Check the local `.saved-check` color on its dark button and `.draft-mark` warning color before consolidating them; blindly putting dark success text on a dark button would reduce contrast. Do not recolor the clinic logo or replace the scheme with a library theme.

Keep explicit patient identity, discipline, staff role/head status, author attribution, server-derived permissions, and plain lifecycle verbs. Keep context isolation, disabled renderer Node integration, narrow preload/IPC APIs, session isolation and clearing, and the existing `desktop-client` mapping. Frontend demo fixtures must remain clearly labeled memory-only; they are not live authorization or persistence proof.

Astra owns `app/src/renderer/App.tsx`, `clinic/*`, renderer styles, shared renderer UI controls, meaningful frontend tests, and narrowly necessary help/documentation. Report missing backend interfaces to the coordinator rather than implementing them in the UI worker. The Backend worker owns only necessary contract/API, DTO, named main/preload mapping/validation, and integration-test changes supporting the approved flows. Preserve authentication, permission and lifecycle invariants, renderer privilege restrictions, and mirror behavior. Unrelated backend/schema redesign, cloud deployment, independent workstation persistence, analytics dashboards, print-template redesign and physical printing are outside this task.

## Complete the real frontend/backend integration

The renderer is already wired through `createDesktopClient(window.desktop.clinic)` and the typed preload/main broker to NestJS. Reuse that path. `docs/frontend-migration.md` reports a previous real Electron integration run, but its external evidence files were not present on the preparation host; re-run the real proof for the final source instead of treating that historical statement as current validation.

Trace every approved screen operation from the renderer view model through shared types, preload allowlist, main-process payload validation, broker HTTP mapping, Nest route/service, filtered DTO and PostgreSQL result. Account for caller/tests/examples together. Complete the specific gaps already visible in the current adapter:

- Patient search in the live backend is name-only, while the frontend promises name/number lookup. A UUID search currently returns an unavailable message. Make name/approved patient-number lookup consistent with the shared registry contract without fetching broader clinical data.
- `getPatient` currently refreshes a cached identity by its old name and searches the response for its ID. Add/use an authorized identity-by-ID read through the complete named boundary so rename, stale cache, duplicate names and fresh clients do not depend on an old search result.
- `listDocuments` currently returns only the current session's in-memory cache. Replace that shortcut with a real authorized patient-scoped history/list read. Previously issued prescriptions/certificates must be discoverable after sign-out, client restart and from a fresh authorized client, and reprint must read the same immutable ID/snapshot. Enforce existing document visibility rules on the server, and distinguish loading, empty and failed reads.
- Preserve actual author/correction metadata and permitted minimal identities when mapping server DTOs. Do not invent an author name, infer editing rights from clinic-head status, or broaden a DTO just to simplify a component.

Prefer existing responsible handlers/types/services; add the smallest missing read contract only where required. The server remains the authorization and validation authority. Every added/changed public route needs a working usage example in the API documentation and real end-to-end verification. Extend the exact named IPC operations and input/output validation; never add a generic URL/fetch/IPC passthrough or put tokens in the renderer. Update fixtures/tests to match intentional contract changes, keeping synthetic mode explicit.

Check configured development envs and restarts on the actual host. `app/scripts/verify-integration.mts` already builds/launches a hidden Electron window and exercises real renderer/preload/main/API/database operations; reuse and extend it. Its current setup reads `app/.env`, `server/.env` and that server file's private credential path, and verifies a dedicated loopback `healthier_demo_*` EDGE database and matching API port. The preparation host lacked `app/.env`, so this runner was not executed there. Prepare matching ignored test configuration safely in the isolated checkout; do not overwrite the user's existing private files, reset data or reuse an evidence directory belonging to another database.

Final real integration proof must cover eight named roles; login/current user/logout/session or permission invalidation; patient lookup/create/update; attendant vitals and doctor draft/finalize/correction with valid same-patient linkage; both document preview/issue/read/history and immutable reprint after client restart; stale-revision review; filtered cross-role data; and connection-failure behavior preserving unsaved input without false saves. Check unsaved patient switching through the real bridge as well as the fixture. Use actual local NestJS/PostgreSQL and real named IPC, not injected mock bridges, for these integration claims. Keep LAN/TLS on a second machine and physical printer output explicitly pending unless the actual resources are separately available. Add no renderer mirroring transport; preserve Backend-owned nonblocking one-way delivery.

## Fix interrupted-work safety before visual polish

The preparation task confirmed this regression in a headless Chrome memory-demo test:

1. Open the frontend demo as the default head doctor.
2. Open Lina Marquez `DEMO-0001`, Medical chart, New medical entry.
3. Enter `Synthetic unsaved text for DEMO-0001` in Reason / symptoms.
4. Press Ctrl+K, search Mateo, select Mateo Ramos `DEMO-0003`.
5. Decline `Discard unsaved changes?`.
6. Actual: the header becomes Mateo/`DEMO-0003`, while Lina's unsaved text remains in the existing form. No save was attempted during the proof.

`Workspace.select()` currently calls `setPatient(result)` before `navigate()` resolves the dirty guard. New-entry save uses the current patient prop. Fix the shared navigation/selection owner so **declining a discard preserves patient, screen, form contents and draft ownership together**. Apply that invariant to patient switching, register shortcuts, registry exits, and all affected draft surfaces. Keep failed/stale asynchronous selection from committing a new patient context. Avoid sprinkling separate guards across callers or masking the defect with a banner.

Add meaningful regression tests for decline/accept, existing/new medical drafts, vital drafts, patient edits, and document preparation where affected. A declined switch must make no mutation for another patient. Accepted navigation clears old draft context exactly once. Preserve server authorization, same-patient finalized-vitals linkage, original/history immutability, and revisions. The browser proof establishes mismatched context; it does not claim a real wrong-patient database write occurred.

## Refine the specific workflow gaps

- **Quick patient search:** preserve immediate Ctrl+K/arrows/Enter/Escape behavior and focus restoration. Give duplicate-name results the same authorized identity cues as the registry, including birth date when present in that role's DTO and an honest unknown state. Respect medtech's reduced identity contract. Fix role-inappropriate empty instructions: a doctor must not be told to choose an unavailable Register patient action. Use a correct named combobox/listbox or another coherent accessible pattern; `aria-selected` on plain buttons is not a complete selection model. Keep stale/rejected searches safe and announcements useful.
- **Empty medical chart:** the existing age test fails because header and empty state both render `New medical entry`. Resolve the redundant action hierarchy, or scope the test to a deliberate named region if two actions are justified. Do not hide the symptom with an unexplained `.first()` selector. Preserve the age calculation assertions for known and unknown birth dates.
- **Reading vital signs:** reuse the existing measurement presentation instead of joining labels/units/values into one long sentence inside a consultation. Keep timestamp/author as metadata and distinguish Not taken, None selected, and unavailable. Add no clinical interpretation or generated advice.
- **Draft completion:** keep patient identity visible and make Save draft/Cancel easy to locate at 1280×720, 1024px width and 200% text zoom. Keep long clinical text editable/readable. Distinguish draft save, finalization and immutable issuance. Review the current 700ms delayed form completion: use immediate completion with persistent honest feedback when sufficient, rather than forcing a daily action to wait for a decorative state. Do not add autosave or change lifecycle semantics.
- **Document preparation:** preserve reviewed-preview gating, field edits invalidating review, safe conflict/retry behavior, immutable ID/snapshot after issue, clipboard errors, authorized printer selection, and honest submission wording. Make Fit width/100% and draft-versus-issued status discoverable. Validate long content, preview scaling and scrolling without changing fixed print bodies or claiming physical paper output.
- **Help:** retain optional `CS` as the photographed field until the clinic clarifies it; the approved specs explicitly defer its meaning. Do not silently expand it to an assumed phrase. Improve surrounding task help within confirmed terminology, using visible concise instructions instead of hover-only essentials.

Use judgment to make these fixes coherent in the existing components. Do not add unrelated screens, new promotional copy or bespoke abstractions.

## Use research selectively and motion sparingly

Start with existing components/CSS. Of the researched references, beUI free Alert/Tooltip patterns are the strongest conditional candidates, Transitions.dev offers restrained CSS ideas, and BoardUI offers table/layout inspiration. No library is approved for blanket installation. Inspect the exact component imports, license, keyboard behavior, reduced motion and token changes before copying it; preserve required notices.

Kobra's source/use restrictions and personal-only free tier, Kinetics' unverified reuse license, Transitions' custom license versus MIT marketing, and separate Pro terms are documented in the research. Avoid paid/public-source conflicts. Arc/BoardUI foundation tokens must not replace the clinic system. Evil Charts stays deferred without an approved chart-reading task. Reverse UI's motion/hover patterns and visual component names do not implement clinic functionality.

Invoke `find-animation-opportunities` when planning the refinement. Report high-confidence opportunities and rejected candidates; a conclusion that no new motion is needed is valid. Invoke `animate` before implementing any accepted motion and load the matching recipes. Follow DESIGN.md's 150–200ms brief feedback budget and existing tokens. Keyboard shortcuts, palette toggles, routine navigation, patient rows and clinical values remain immediate. Prefer CSS explicit opacity/transform transitions; keep them interruptible, respect reduced motion and gate hover movement by pointer capability. No spring package for a fade, count-up clinical values, ambient shimmer choreography, sound effects, or decorative page entrances.

## Verify the actual shipped paths and return evidence

The preparation run passed normal `pnpm check` and the Electron build. That ordinary check skipped one configured live app test and seven live mirror e2e tests because their private env was absent; it is not an all-live backend proof. The frontend suite passed 22/23; the duplicate-action case and separate patient-guard probe failed as described. Fix the affected behavior and make its regression checks pass before reporting success.

Run relevant lint/format/type checks, `pnpm test:frontend`, app tests, `pnpm --filter app build`, and normal `pnpm check` for the final integrated source. Use deliberate frontend regression tests; do not weaken assertions just to obtain green output. Distinguish existing/env-dependent skips from executed live tests.

Run frontend and backend locally as needed, using existing setup guides. Preserve private envs and existing volumes; never reseed/reset the original demo or overwrite its evidence. Keep credentials out of screenshots, logs, Git, renderer variables and prompts. Browser `dev:frontend` uses the labeled memory fixture; actual backend/IPC behavior must be checked through the real Electron bridge and its existing integration verification where configured. Backend health alone does not prove UI integration.

Before later interactive QA, confirm that the current shared Chrome/Electron resource is available and identify its exact session/device. The 2026-10-15 preparation approval covered that earlier session, not a future run. Use computer-use and Chrome for web QA. Do not reuse another agent's tab or navigate its unsaved form. Exercise all eight role views, duplicate identities, keyboard-only search/navigation, focus restoration, loading/empty/error/disconnect recovery, draft/conflict/correction behavior, document preview/issue/reprint and account/session clearing within the authorized synthetic environment. Printer submission and physical output need their own actual-resource scope; do not claim them from mocks.

Capture one bounded before/after round at the supported desktop targets, batch corrections, then at most one confirmation round. Check 1280×720, 1920×1080, 1024px width, 200% text zoom, reduced motion and rendered contrast. Run Impeccable's mechanical detector once on completed changed markup and triage its findings against the approved Operate baseline. Record screenshots with stable IDs and exact accessible paths, tested flows, command results/skips/failures, library decisions, intentional deviations and any remaining blockers. Stop only when the bounded safety/UX improvements and required checks are complete; give the coordinator reviewable evidence before integration.
