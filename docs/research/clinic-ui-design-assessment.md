# Clinic UI design assessment A

Independent design review, 2026-10-15. Target: `app/src/renderer/App.tsx` and its `clinic/*`, `clinic.css`, and `styles.css` surface at committed UI `f4ba486` supplied by the coordinator. This is Assessment A for a later dual-agent synthesis, not the combined Impeccable critique. No detector results or other research reports were read.

## Design specificity and direction

The interface is recognizably a clinic work tool. Its patient banner, explicit chart disciplines, author attribution, finalized state, and contextual read-only explanation earn their place. The Windows system type, neutral surfaces, conventional inputs, and restrained semantic colors suit staff who are not technical. Familiarity is useful here; there is no reason to replace this with a marketing visual language, a colored dashboard, or a new component system.

The largest opportunity is to make clinical scanning and interrupted work safer. The current white panels are coherent, but measurement prose and unexplained fields make staff translate the UI during a consultation. Preserve `DESIGN.md`, the current neutral palette, identity visibility, and immediate routine navigation. This assessment proposes no new motion.

## Nielsen scores

Scores are provisional design judgments on the inspected demo and source, not a WCAG audit or proof of backend integration. All ten heuristics apply to this Operate surface.

| Heuristic                       |       0–4 | Evidence and limits                                                                                                                                                                                                                            |
| ------------------------------- | --------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visibility of system status     |         3 | Observed demo/memory labeling, current navigation, staff identity, Finalized and Draft. Source contains loading, saved, disconnected, and error feedback; those transitions were not completed in browser.                                     |
| Match with real world           |         3 | Medical chart, consultation date, symptoms, findings, and specific document verbs fit clinic work. `CS (optional)` has no explanation.                                                                                                         |
| User control and freedom        |         2 | Cancel and return navigation exist; entering synthetic text then Cancel triggered a discard warning. Source suggests patient identity can change before the dirty guard resolves. The warning could not be dismissed through the browser tool. |
| Consistency and standards       |         3 | Consistent neutral buttons, inputs, panels, labels, and semantic badges. Native unsaved confirmation differs from the contextual in-app finalize/print confirmations.                                                                          |
| Error prevention                |         2 | Same-name registry warning, birth date comparison, author restrictions, lifecycle labels, and dirty warning are valuable. Source-derived patient-switch concern and sparse quick-search identity weaken prevention.                            |
| Recognition rather than recall  |         3 | Labeled chart navigation, visible patient details, and meaningful actions reduce recall. Unexplained CS and keyboard-only discovery of quick search outside registry are gaps.                                                                 |
| Flexibility and efficiency      |         3 | Source provides Ctrl+K, arrow/Enter selection, Escape dismissal, and regular keyboard controls. Registry visibly advertises Ctrl+K; actual palette and full keyboard flow remain untested.                                                     |
| Aesthetic and minimalist design |         3 | Calm, coherent type and surfaces; main tasks stand out. Medical chart measurement prose is harder to scan than the rest of the layout.                                                                                                         |
| Error diagnosis and recovery    |         3 | Source has retry actions, revision review, preserved document text, inline field errors, and a plain disconnected warning. Browser recovery checks remained incomplete.                                                                        |
| Help and documentation          |         2 | Useful inline vital-sign guidance and read-only explanation. No visible general task help; draft/finalize meaning is communicated primarily through state/action labels.                                                                       |
| **Total**                       | **27/40** | **Acceptable; improve the specific weak areas. This score does not override clinical safety findings.**                                                                                                                                        |

## Strengths to retain

1. **Patient disambiguation has a strong baseline.** Registry visibly warns about the two Lina Marquez records and places patient number and birth date beside the name. The opened record repeats name, number, and birth date in the patient banner. `Registry.tsx:140`, `App.tsx:629`.
2. **Permissions are explained in the work context.** The doctor's medical chart shows authored actions on her own finalized entry and explicitly explains that the colleague's entry is read-only. This supports trust without suggesting clinic-head status grants editing rights. `Chart.tsx:398`, `Chart.tsx:439`.
3. **The visual world is appropriate.** Readable system type, large controls, strong focus treatment observed in registry, and neutral filled primary actions give staff familiar affordances. Status text accompanies semantic color. `styles.css:12`, `clinic.css:29`.

## Priority issues

### P1 — Patient switching must resolve unsaved work before changing identity

**Source-derived safety concern, not browser-reproduced.** `App.tsx:429` fetches a selected patient and calls `setPatient(result)` before `navigate()` checks dirty state at `App.tsx:422`. If the user selects another patient via quick search and declines discard, the screen can remain on the existing form while the patient prop/banner changes. `ClinicalForms.tsx:40` retains local form state; new-entry save uses the current `patient.id` at `ClinicalForms.tsx:108`.

**Required outcome:** declining discard must preserve the original patient, form contents, screen, and draft ownership together. Resolve the dirty decision before committing selection, and apply the same invariant to register shortcuts. Add a meaningful regression check for dirty entry → different patient → decline discard. Keep the existing server authorization and lifecycle rules. Suggested work: **harden**, before visual refinement.

### P1 — Quick search loses the registry's birth-date disambiguation

**Source-only observation.** `CommandPalette.tsx:168` renders name and number, while the registry deliberately displays birth dates and a same-name warning. With the two synthetic Lina Marquez records, the fast path asks staff to distinguish IDs without the familiar date comparison. The full palette interaction was not exercised.

**Required outcome:** carry the same authorized identity cues into each quick-search result, including birth date with a clear missing-date state. Keep results compact and keyboard selection immediate; do not add a confirmation to every ordinary selection. Suggested work: **clarify/adapt**.

### P2 — Selected vital signs read as a sentence instead of measurements

**Observed:** demo doctor → Lina Marquez DEMO-0001 → Medical chart. The selected measurements appear as one wrapping line: author, Systolic, unit, value, Diastolic, unit, value, and five further measurements separated by dots. This forces sequential reading to locate one value. `Chart.tsx:382` constructs the joined prose at `Chart.tsx:390`; the separate Vital signs view already has a measurement layout at `Chart.tsx:293`.

**Required outcome:** use a compact, labeled measurement grid/list with clear values and units, keeping recorded time and author as metadata. Preserve “Not taken”, “None selected”, and unavailable states distinctly. Do not interpret measurements or introduce medical advice. Suggested work: **layout/typeset**.

### P2 — CS asks staff to recall an unexplained abbreviation

**Observed:** Medical chart → New medical entry shows `CS (optional)` beside Consultation date, without help. `ClinicalForms.tsx:262`. The supplied glossary does not establish its expansion; document conflict review also uses CS at `Documents.tsx:268`.

**Required outcome:** obtain the domain-approved meaning before changing factual copy. Show the familiar full label or concise inline explanation consistently. Do not guess the expansion or remove the contract field. Suggested work: **clarify** with domain confirmation.

### P2 — New entry hides its completion path on the first view

**Observed:** at the naturally inherited desktop viewport, the new medical form shows date, CS, vital selection, symptoms, and Findings, while the remaining textareas and Cancel/Save draft lie below the viewport. `ClinicalForms.tsx:306`, `ClinicalForms.tsx:328`, `clinic.css:557`. This is not proof of a responsive failure, but an interrupted novice must discover where saving happens.

**Required outcome:** make the form's completion path easier to locate without compressing clinical text or obscuring patient identity. Consider concise draft guidance and a clearly located action region after assessing the agreed 1280×720/1024px/zoom targets. Preserve explicit Save draft versus Finalize entry; do not introduce autosave or change lifecycle semantics. Suggested work: **layout/onboard**.

## Cognitive load, personas, and emotional journey

- The selected-patient shell exposes six navigation choices including registry. They are familiar, task-specific choices, not six competing primary actions. Preserve the discipline labels rather than hiding them simply to meet an option-count rule.
- The form has seven clinical inputs, which are justified by the domain. The burden comes from unclear CS, hidden completion actions, and selecting a vital record by date/author without measurements visible in the selection control. Avoid a multi-step wizard unless staff testing demonstrates an advantage.
- **Jordan, first-time staff user:** the obvious patient search and labels help. CS and Draft-versus-Finalized meaning create hesitation; no general task help was visible.
- **Alex, frequent clinician:** Ctrl+K is a useful source-backed accelerator. The quick result should be as safe to recognize as the registry, and repeated navigation must remain immediate. Do not slow it with decorative transitions or routine confirmations.
- **Sam, keyboard/low-vision user:** strong focus was visible around registry search and controls have accessible names in the AX tree. Full keyboard-only work, screen-reader announcements, contrast measurements, required sizes, and 200% text zoom were not verified in this pass.
- The registry begins with reassurance through duplicate-name guidance; the chart reinforces authorship and finalization. The emotional valley is interrupted drafting: the generic native discard question offers less context than the rest of the application. The saved/finalized/issued end of a task remains browser-unverified; do not infer success from source alone.

## Run notes and limits

- Read root `AGENTS.md`, forwarding `CLAUDE.md`, `DESIGN.md`, `CONTEXT.md`, spec README, agent skill/domain guidance, Impeccable skill plus Operate/critique references, and computer-use skill/guidance/confirmation policy. No narrower context files were found under `app`. `.codegraph/` was reported absent by the coordinator; no CodeGraph indexing was performed. No critique ignore list exists.
- Coordinator had already run Impeccable context; it was not repeated. PRODUCT.md absence does not prevent this narrow incumbent assessment. No UI code, design tokens, backend, Git state, or server process was changed. Only this report was written.
- User's shared Chrome confirmation and synthetic-interaction authorization were supplied by the coordinator. Created dedicated **Chrome tab 1347446186**, session `🏥 Clinic design assessment`, URL `http://127.0.0.1:5175/`. Parent tab **1347446180 was not touched**. No browser-global viewport setting changed.
- Observed screenshots in tool output: Staff sign-in; registry with two same-name records; medical chart; new medical entry. Screenshots were not saved as files; no screenshot paths are claimed. Natural screenshot size was approximately 1733×806 for the workspace, not the agreed QA targets.
- Exercised: open explicitly labeled memory demo as Dr. Mira Dalisay; inspect registry identities; open DEMO-0001 details; open Medical chart; open New medical entry; type synthetic text into Reason/symptoms; choose Cancel.
- **Browser blocker:** Cancel opened native JavaScript confirm `Discard unsaved changes?`. Documented `getJsDialog()`, AX refresh, Escape, and own-tab close each timed out before execution at `Emulation.setFocusEmulationEnabled`. Browser troubleshooting documentation offered no additional recovery. Stopped UI inputs and alerted coordinator. **Own-tab cleanup was attempted but not confirmed; tab may still hold the synthetic unsaved form and native dialog.** No further tab was created.
- **Untested browser flows:** sign-in submission; other staff roles; registration/editing; saving/finalizing/corrections; quick palette; empty searches/charts; documents/preview/issuance; disconnect/reconnect; conflict recovery; printing. Relevant source was inspected, but no LAN/server, cloud, Electron IPC, authorization enforcement, or real printer integration is proved by this browser-only memory demo. No real patient data, external publication, or print submission was used.
- Questions skipped: this isolated Assessment A returns its findings to the coordinator; the user requested a researched, ready-to-paste handoff prompt rather than a new design-decision interview.
