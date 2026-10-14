# Frontend migration

Implemented locally on 2026-10-14 after the user's request to set up this repository, migrate the existing clinic frontend, and base it on the listed issues. This is the separate frontend build instruction; it does not authorize backend implementation, remote publication, or deployment.

After migration, the user authorized cleanup of the old prototype. Automatic approval review blocked deletion, so the 26 old entries were moved to the temporary recovery directory `C:/Users/Acer/AppData/Local/Temp/OHMO-prototype-archive-20261014`; they were not deleted. Supplied original reference documents were also preserved inside this repository under `docs/references/prototype-inputs/` with SHA-256 verification; editor settings were retained in `.vscode/`. The reference inputs remain ignored by Git. The user subsequently moved verification and test results outside the repository into sibling `../verification/` and `../test-results/`. See the [local cleanup record](../../verification/cleanup-result.json).

This checkout follows the owning repository's Electron + React + Tailwind + shadcn foundation. The search, patient identity, simple forms, and paper previews are adapted to the approved clinic contracts. Next.js, Arc's second component system, localStorage records, dashboard/reports, dispensing, and renderer-driven sync were not transferred because they conflict with the destination issue scope.

## Issue coverage

| Issue                                                         | Renderer implemented                                                                                                                                                                                         | Integration still required                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [#2](https://github.com/aandremillan10/health-ier/issues/2)   | Named sign-in form; principal identity; scoped chart navigation; own-author controls; read-only explanations; logout/remount; permission checks on focus and interval                                        | Backend #1 real authentication, filtered responses, main-memory session and validated preload |
| [#4](https://github.com/aandremillan10/health-ier/issues/4)   | Name/number search; duplicate-name review; registration/edit; optional/unknown values; field errors; expected revision and explicit latest-version review                                                    | Backend #3 shared PostgreSQL persistence and second-client proof                              |
| [#6](https://github.com/aandremillan10/health-ier/issues/6)   | Timestamped nullable vitals; medical draft; finalized same-patient vital selection or none; finalization confirmation; original plus attributed corrections; conflict recovery                               | Backend #5 lifecycle, author checks, transactional versions and preserved references          |
| [#8](https://github.com/aandremillan10/health-ier/issues/8)   | Fixed local prescription/certificate previews; supplied unified header; editable document wording/purpose; review before issue; issued read-only copy; printer selection/confirmation and retry with same ID | Backend #7 trusted issuer/snapshot validation, native printer adapter and physical output     |
| [#10](https://github.com/aandremillan10/health-ier/issues/10) | Repeatable headless frontend evidence, eight staff views, isolated dental/lab views, explicit demo outage/conflict/print states                                                                              | Integrated LAN/auth/persistence/print evidence from #9; real cloud evidence from #11          |

These issues are **not marked complete**. Contract fixtures cannot meet integrated acceptance. The live #11 and amended #2/#4 include one-way Backend mirroring; older v1 docs in this checkout still defer cloud work. The renderer remains an edge client and adds no cloud transport or portal.

## Frontend completion

The user authorized finishing the frontend on 2026-10-14, with integration only when Backend is available. The issues were read with `gh issue list --repo aandremillan10/health-ier --state all --limit 50 --json number,title,state,body`; the snapshot is in sibling `../verification/github-issues.json`.

The renderer work for #2, #4, #6 and #8 is implemented. Frontend verification for #10 covers the synthetic staff flow, session expiry and permission changes, loading/empty/denied/error states, field-level errors, unsaved-input protection, revision review, both document templates, and printer retry. New corrections start from the last accepted correction, while chart history retains the original. Failed or missing latest-version reads keep Save blocked. Existing documents are fetched again before view/reprint. Header failures block issue/print and offer a retry without losing document text.

Headless Chrome checks include 200% text sizing through a 32px root size, keyboard focus, reduced motion, 1024px reflow, rendered contrast, and long-document PDF output. This is frontend evidence, not a test on the clinic's actual desktops or printer. Repeatable commands and results are in the [external frontend report](../../verification/frontend-report.md).

The first migration used a contract fixture because clinic operations were absent. After pulling master at `2713bb3`, the backend and typed `window.desktop.clinic` bridge became available. The renderer now uses `createDesktopClient` to map authorized DTOs, corrections, immutable documents, errors, printer calls, and session resets. The explicit browser demo remains synthetic and in memory. Named-bridge fixture checks are separate from live login, persistence, LAN operation, printer submission, physical paper and cloud recovery. No tracker state was changed.

## AMLIG interface update

The user supplied the app logo and selected the name **AMLIG**. The logo is bundled locally without alteration; app/window titles and the browser icon use AMLIG. The GitHub repository and clinic document headers retain their existing identifiers.

Two Luna Max research agents inspected the eight requested UI sites through Exa. The renderer adapts UIArc's free search-field behavior: a fixed clear slot, focus restoration, Escape to clear, and an accessible search input. Breadcrumbs follow BoardUI's current-page pattern using native controls. The app keeps its shadcn foundation, uses readable chart grids, and keeps repeated actions immediate. No second theme, animation engine, paid component or analytics dashboard was added. The UIArc notice is in `app/src/renderer/components/ui/UIARC-LICENSE.txt`.

The shipped backend searches patient names only and has no document-list or patient-by-ID read operation. The adapter refreshes a known patient by name and matches the returned ID; it reports a failure if that identity is absent. Its issued-document list is scoped to the current session. Authorized staff can open an earlier document by its known ID; the UI checks that it belongs to the selected patient before displaying it. These backend gaps remain unresolved. The adapter does not add renderer networking or pretend to have a complete document history.

Repeatable renderer checks and the interface review are saved outside the repo in [ui-overhaul-report.md](../../verification/ui-overhaul-report.md). Real clinic hardware and live service verification remain separate.

## Run

From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm dev:frontend
```

Open `http://127.0.0.1:5175`. Select a synthetic staff member under **Frontend demo**, then select **Open frontend demo**. The patient list appears on entry; open a record directly or search `DEMO-0001` or `Lina`. Only registry identity is loaded for this list. Changes remain in memory across demo staff switches and are lost on reload. The demo selector is not authentication and does not accept passwords.

Use `pnpm dev:app` for the Electron client on its existing port 5173. `pnpm dev:server` starts the clinic backend after its dedicated synthetic database and account setup. Follow `server/README.md`; do not reuse or reset an unrelated database. Docker/database setup is not needed to review the renderer fixtures.

## Backend handoff

The user's later age-field change removes manual age entry. The renderer derives `ageAtConsultation` from DOB and the selected consultation date (today by default). Unknown DOB leaves age null. Existing issued documents retain their stored age; reopening them later does not recalculate the snapshot. Backend should verify the derived value when clinical operations are implemented.

`app/src/shared/clinic-api.ts` is the implemented named bridge contract. `app/src/renderer/clinic/contract.ts` is the renderer view model used by the explicit demo and the desktop adapter. The earlier `window.clinicApi` fixture remains supported for regression checks; Electron uses `window.desktop.clinic` first. The renderer never calls fetch, raw IPC, arbitrary URLs, shell commands, file paths, or token APIs.

Each operation resolves `{ ok: true, data }` or `{ ok: false, error: { code, message, fieldErrors?, latestRevision? } }`. DTOs must already be filtered before reaching the renderer. `latestRevision` alone never enables a silent retry: the user reads the authorized latest record, then explicitly keeps their input against its revision. Revalidate that revision on the server.

Example renderer calls after an authenticated principal is returned:

```ts
const result = await window.desktop?.clinic.searchPatients({
  search: 'Synthetic',
});
// Registry identity only, never mixed provider notes.

await window.desktop?.clinic.updatePatient({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', // Synthetic example ID.
  expectedRevision: 1,
  fullName: 'Synthetic Patient',
  sex: null,
  dateOfBirth: null,
  address: null,
  patientCategory: null,
  employeeIdentifier: null,
});
```

The backend owns issuer license/PTR strings, clinical snapshots, session cleanup, printer IDs, and real submission results. Only successful server responses show `Saved on this clinic server`. Fixture successes explicitly say `in memory`; fixture print requests explicitly say no job was sent. Final printer layouts must use the same approved local assets and be verified on the assigned printer.

No new server routes, database schema, main/preload business IPC, cloud resources, credentials, commits, pushes, PRs, or issue-status changes are part of this migration.
