# Clinic workflow and flat interface review

Date: 2026-10-15, Asia/Manila.

The user requested a UI/UX overhaul, removal of cards inside cards, and use of minimalist UI and UIArc components. They later removed GPT Taste from the requested direction. This pass builds on the existing uncommitted interface work and adds no dependency, backend route, storage change, or permission.

## Findings and changes

| Finding                                                                       | Change                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduling required leaving clinic flow to find a patient and then returning. | Choose patient opens the existing search dialog in place. Selection keeps clinic flow and its date filters.                                                                 |
| Laboratory entry without a selected patient was a dead end.                   | A named empty state provides Choose patient and returns to laboratory orders.                                                                                               |
| Creating a referral required a separate trip to patient records.              | Choose patient for referral keeps the referral task active.                                                                                                                 |
| Patient-specific referral and laboratory views had no direct queue return.    | View work queue clears patient scope for referrals and the medical technologist's laboratory queue. Server access rules still apply.                                        |
| A disabled registration save did not state the next step beside the action.   | Persistent text explains the record check, identity confirmation, and ready-to-save states. Existing duplicate protection remains.                                          |
| Repeated panel outlines made sections compete with form controls.             | Shared panels, queue rows, summary editors, family forms, corrections, and vital signs use spacing and dividers. Print paper and overlays retain their functional surfaces. |
| Clinical summary preceded identity details.                                   | Patient details now come first so staff can check identity.                                                                                                                 |
| Family search had a separate control style.                                   | It uses the existing UIArc search field with clear and focus return.                                                                                                        |

The scope reaches Workspace callers, scheduling, laboratory, referrals, registry, family selection, the shared Empty helper, UIArc attribution, and shared/screen CSS. Existing role checks, confirmation dialogs, revision conflicts, and document controls remain in place. A separate Chrome review found a wrapped sidebar label; the original 248px sidebar width was restored.

## Component sources

- [UIArc search field](https://uiarc.dev/r/search-field.json): existing local adaptation, reused in family selection.
- [UIArc empty state](https://uiarc.dev/r/empty-state.json): new static local adaptation, used through the existing Empty helper. It retains optional actions and descriptions and adds an optional title. The clinic does not need the upstream motion or icon dependencies.
- MIT attribution remains in `app/src/renderer/components/ui/UIARC-LICENSE.txt`.

## Motion review

No new animation was accepted. The required find-animation-opportunities review applied the frequency and purpose gates:

| Candidate                                               | Frequency / purpose                                 | Decision                                                                   |
| ------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Patient picker, keyboard selection, and task navigation | Frequent; selection feedback                        | Reject added motion. Show the result immediately.                          |
| Registration next-step text                             | Every registration; state indication                | Reject added motion. Keep instructions still and announce the state.       |
| Queue selection and report values                       | Repeated throughout the day; functional information | Reject added motion. Keep data stationary.                                 |
| Empty-state content                                     | Whenever a task has no records; recovery guidance   | Reject added motion. The action and clear text supply the needed feedback. |

## Verification

The workflow checks were written before behavioral changes. The scheduling check first failed because Choose patient was absent. New checks cover scheduling without navigation, date retention, laboratory creation and draft guards, referral creation and queue return, family search and focus return, laboratory queue scope, registration record checks, and flat responsive sections.

Commands from the repository root:

```sh
pnpm --filter app test:e2e
pnpm --filter app typecheck
pnpm --filter app lint
pnpm --filter app test
pnpm --filter app build
git diff --check
```

The final complete browser run passed **56 checks**, including seven workflow checks. Type checks, app lint, formatting checks on changed files, the Electron build, and `git diff --check` passed. Existing app tests passed **64 checks**, with **one pre-existing skip**. No unit tests were added after implementation.

The first complete browser run passed 54 checks. The expanded workflow checks also exercise referral creation and family search. Their first run exposed two incorrect test assumptions: referral button text starts with the patient name, and the fixture has no membership to link dependents from. The corrected checks use the rendered labels and the available member-link action.

Chrome graphical QA was authorized by the user in this chat. The separate Clinic UX session exercised laboratory entry, in-place search, keyboard selection, and the order form. Automated Chrome checks also cover 1280px, 1024px, 390px, the existing 320px layout, and doubled text. These are browser fixtures, not live clinic operations.

Evidence:

- [Complete browser results](../../../verification/frontend-results.json)
- [Scheduling](../../../verification/workflow-ux/clinic-flow.png)
- [Laboratory](../../../verification/workflow-ux/laboratory.png)
- [Patient details at 1280px](../../../verification/workflow-ux/patient-1280.png)
- [Patient details at 1024px](../../../verification/workflow-ux/patient-1024.png)
- [Patient details at 390px](../../../verification/workflow-ux/patient-390.png)

Live server/database behavior, physical printing, screen reader speech, and clinic hardware were not checked. One pre-existing app test is skipped. No files were committed.
