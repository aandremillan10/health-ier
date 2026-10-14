# UI refinement integration evidence

Date: 2026-10-15, Asia/Manila. Backend worker branch `feat/clinic-api-refinement` forked from `master` at `e89bac0b421ceab3a5973a7c6d76b2d9bed02d46`. Isolated checkout: `C:/Users/ajapa/.codex/worktrees/clinic-api-refinement/health-ier`. This report distinguishes preliminary API checks from the completed final integrated Electron proof below.

## Changed contracts

The renderer `ClinicApi` signatures stay intact. The named wire operations add `readPatient({id})` and `readDocuments({patientId})`; preload exposes those exact operations, the main process registers only `operationNames`, guards reject extra keys/invalid UUIDs, and the broker constructs fixed GET routes. Main/preload never expose a token, generic HTTP/IPC, filesystem access or renderer persistence. Response guards preserve medtech's five-field identity and check requested patient identity on both new reads, including every returned history row and snapshot reference.

`GET /patients?search=` now accepts a full UUID patient number as well as a name. The existing registry uses its UUID as that number; this change adds no new identifier or eligibility rule. `GET /patients/:id` uses the authorized registry DTO directly, so fresh clients, rename and duplicate names do not depend on a cached old name. `GET /patients/:id/documents` checks medical chart read permission before reading the patient/history, and returns persisted issued snapshots ordered newest first. Empty success is `[]`; denied/unavailable reads remain errors. Authorized colleagues/head can read/reprint the same immutable IDs; issue remains the original doctor's operation.

Vitals, entries and corrections now return `authorName` selected from the author's staff display metadata, retaining existing ID, timestamps, source revisions and correction content. No credential/login metadata is selected. The renderer adapter preserves it instead of inventing another clinician's display name. The adapter's patient/document session caches and their lookup shortcuts are removed. Session isolation remains in the broker's generation/token invalidation and the existing renderer reset owner. No schema/mirror transport or stored document snapshot changed.

The UI and API workers agreed these contracts before implementation. UI-owned `app/e2e/desktop.spec.ts`'s four fixture compatibility lines were transferred to this worker by the coordinator; the UI worker restored its baseline so the final cherry-pick is clean. The fixture remains explicitly synthetic and is not live proof.

## Operation trace

Every operation retains this path: staff view/form → renderer adapter → named `window.desktop.clinic` preload → main `operationNames` handler → sender/request guards and broker route → Nest `StaffGuard`/controller → service authorization/validation/DTO → PostgreSQL. Print adds privileged authorization/document reread and isolated template window.

| Screen operation | Renderer adapter → wire operation | HTTP/service/storage boundary |
| --- | --- | --- |
| Sign in/current user/sign out | `login/me/logout` → `login/currentStaff/logout` | `/auth/login`, `/auth/me`, `/auth/logout`; named Staff/Session, token held in broker only |
| Connection status | `health` → `health` | `/health`; PostgreSQL readiness; no false save on transport failure |
| Registry/quick lookup/open | `findPatients/getPatient` → `searchPatients/readPatient` | GET `/patients?search=`, `/patients/:id`; registry DTO, minimum medtech identity |
| Register/edit demographics | `createPatient/updatePatient` → same names | POST/PATCH Patient; clerk/attendant, expected revision, atomic outbox |
| Read vital signs | `listVitals` → `readVitals` | `/patients/:id/vitals`; attendant/care readers, actual author and correction metadata |
| Vital draft/finalize/correct | `saveVitals/finalizeVitals/correctVitals` → `createVitals/updateVitals/finalizeVitals/correctVitals` | Patient/Vitals/Correction; attendant author, draft/finalized checks, revision locks, atomic outbox |
| Discipline chart/history | `listEntries` → `readEntries` then `readCorrections` | `/patients/:id/charts/:discipline/entries`, `/entries/:id/corrections`; discipline/head filtered server reads |
| Medical draft/finalize/correct | `saveEntry/finalizeEntry/correctEntry` → `createMedicalEntry/updateMedicalEntry/finalizeEntry/correctEntry` | Entry/Correction; original doctor only, same-patient finalized vitals, immutable original, revisions/outbox |
| Prepare/issue either document | `previewDocument/issueDocument` → same names | `/documents/preview`, `/documents`; original finalized consultation author, trusted issuer, immutable Document snapshot/outbox on issue |
| Issued history/open/reprint data | `listDocuments/getDocument` → `readDocuments/readDocument` | `/patients/:id/documents`, `/documents/:id`; medical chart readers, exact immutable persisted document |
| Printer selection/submission | `listPrinters/printDocument` → same names | Local printer allowlist; broker rereads authorized Document; copies/duplex/printer guarded; submission wording only |

## Owned runtime and preservation

Source private files were inspected without printing secrets. `D:/health-ier/server/.env` existed but contained obsolete development connection settings; source app settings were absent. Existing portable PostgreSQL was located at `C:/Users/ajapa/.codex/healthier-runtime/pgsql`, with an unrelated running cluster on port 55432. Its existing private admin file did not authenticate. That cluster, source environment files, original data and services were preserved.

Used the already installed PostgreSQL binaries to initialize a separate disposable synthetic cluster at this checkout's ignored `.private/postgres-data`, bound only to `127.0.0.1:55447`. Database: `healthier_demo_refinement_20261015_api`, EDGE, clinic `synthetic-refinement`. New ignored `server/.env` and `app/.env` agree on API `http://127.0.0.1:3047`; eight new synthetic accounts live in `.private/refinement-credentials.json`. No existing configuration was overwritten and no original demo was reset/reseeded. This loopback development setup is not production transport/authentication approval.

Owned Nest process initially PID 9772, restarted from the final server build as PID 26372 on port 3047. Owned PostgreSQL postmaster PID 23988 on port 55447. After final proof, owned Nest PID 26372 was stopped and owned PostgreSQL PID 23988 was shut down gracefully with `pg_ctl stop -m fast -w`. Ports 3047 and 55447 were verified closed; pre-existing PostgreSQL PID 37748 remained listening on 127.0.0.1:55432. Ignored cluster data/env/account files and all evidence remain available for replay. The runner writes a fresh evidence directory per database/per run outside the repository at `../verification/<database>/<run UUID>/`; it never overwrites a previous run. Test-only private DB access expires synthetic sessions for invalidation proof; it is never exposed in the renderer.

## Preliminary executed checks

- `pnpm install --frozen-lockfile`: passed, no lockfile change.
- `pnpm check`: passed lint, format, app/server types, 43 app unit tests, 27 server unit tests, 7 HTTP e2e tests and server build. The normal run skipped 1 optional live app test and 7 live mirror tests because those process envs were not supplied.
- `pnpm --filter app build`: passed main/preload/renderer production build.
- Configured app test run with `HEALTH_IER_LIVE_CREDENTIALS` and `HEALTH_IER_LIVE_SERVER`: all 44 tests executed and passed, including real named broker→Nest→PostgreSQL operations; its printer is explicitly a test adapter and does not prove Electron/physical printing.
- Three additional adapter regression tests subsequently passed (46 normal tests, 1 optional skip): fresh direct identity after rename/no cached search, UUID forwarding, persisted history after logout/fresh client with failed-versus-empty reads, actual author/correction attribution. The final configured suite executed all 47 tests; see below.
- `server/scripts/verify-live.ps1` against owned API/private account file: 102 authenticated HTTP assertions passed, including exact UUID search, by-ID allowed/minimum/missing/malformed/unauthenticated reads, persistent history, doctor/head allowed and clerk/attendant/dentist/medtech denied history. Executable authenticated examples are in `server/API.md`; the script prints no credentials/tokens and writes only synthetic IDs to ignored `.private/api-evidence.json`.
- `node dist/live-db-checks.js` from `server/`: passed atomic outbox rollback, exact whitelist payloads, expired-session denial and database immutability for finalized originals/issued documents.
- Original hidden Electron runner with the API changes: passed 5 real flow checks (clerk identity, attendant lifecycle/correction, doctor lifecycle/correction, both documents and fresh-client by-ID reads). Preliminary evidence: `C:/Users/ajapa/.codex/worktrees/clinic-api-refinement/verification/electron-integration.json`. This older run does not prove the expanded scope. Launcher startup was delayed but completed; no replacement mock or launcher workaround was used.

## Final integrated proof

UI commits `d09d17d` and `b4ad5fd` were cherry-picked as `36fbee2` and `2e01002` into the API branch with coordinator authorization. Final integrated checks passed: `pnpm test:frontend` on isolated port 5188 (33/33); normal `pnpm check` (46 app tests, 27 server tests, 7 HTTP e2e tests; normal optional 1 app + 7 mirror live skips); Electron production build; configured live app suite (47/47, no optional app skip). After restarting the owned Nest process from the final server build, the 102 authenticated API assertions and fresh-client persistence script also passed.

The expanded `app/scripts/verify-integration.mts` now requires all eight role sign-ins/current-user/logout/filtered chart reads and views; current identity/rename/UUID lookup; stale revision rejection and live UI conflict review/rebase/retry; attendant/doctor lifecycle/corrections with same-patient linkage; both document preview/issuance/history and exact snapshots after a fresh Electron restart; head forbidden corrections/issuance; real network cancellation retaining unsaved input/no mutation; declined patient switching; and real DB session expiry clearing renderer context. It uses the actual local Nest/PostgreSQL/named IPC path. Final execution **passed all 12 flow checks**, with all eight named roles recorded and `rendererErrors: []`. The UI source at `2e01002` was built and tested; the final runner additionally records the real printer enumeration count and explicitly false submission flags. The later UI QA report-only cherry-pick `63e29e4` changed no application/test source and required no duplicate code-suite run.

Authoritative final machine-readable evidence: `C:/Users/ajapa/.codex/worktrees/clinic-api-refinement/verification/healthier_demo_refinement_20261015_api/f4d4d4da-df19-4f18-a44a-2ddc89c904f0/electron-integration.json`.

| Evidence | Observed value |
| --- | --- |
| Synthetic persisted patient | `d018c0b1-8ee9-426a-988d-a5fa265ee004` |
| Prescription ID | `8463605d-4c2f-41fc-b634-483e9d682442` |
| Certificate ID | `4d0424db-ce2c-4289-af52-7a2bb6f03657` |
| Named roles | `demo.doctor.head`, `demo.doctor`, `demo.dentist.one`, `demo.dentist.two`, `demo.medtech.one`, `demo.medtech.two`, `demo.attendant`, `demo.clerk` |
| Fresh-client history | Both issued IDs discovered through the patient history UI, then authorized reads equal the original issued objects/snapshots |
| Conflict recovery | External named-bridge update makes the open UI draft stale; failed UI save retains input; Review latest version shows concurrent content/revision; explicit Use latest revision and keep my input followed by Save draft persists intended content at the next revision |
| Connection failure method | Scoped Electron default-session `webRequest` cancellation for this owned API origin; UI Save draft runs through the actual named IPC/broker `net.fetch` and fails. No mock bridge or HTTP response is injected. Removing cancellation restores reads; input/patient remain and database entry count does not advance |
| Declined live switch | Quick search selects the second patient's exact UUID; native dialog is dismissed through the hidden runner; original patient/heading/form text remain, both original and target chart rows remain unchanged; accepted Cancel clears the draft |
| Invalidation | Test-only direct DB session expiry for the synthetic account causes real `/auth/me` 401, broker generation reset, sign-in screen and no patient banner; protected history fails unauthenticated |
| Printers | 4 actual local printers enumerated through the privileged boundary; `printerSubmissionTested: false`, `physicalPrintTested: false` |

The separate fresh interactive Chrome pass and its explicitly inconclusive native-dialog automation are documented in `docs/verification/ui-refinement-ui.md`. Its memory-demo scope is separate from this real hidden Electron/API/PostgreSQL pass; the latter supplies the live declined-switch proof.

LAN/TLS from a second machine, actual clinic workstation calibration, physical printer submission/paper output and real cloud catch-up remain pending. No print job is sent by this runner. Mirror code was not changed; the seven env-dependent live mirror tests were not run and local PostgreSQL proof does not establish real-cloud delivery.

## Replay and integration

Preserve the ignored matching env/account files and owned cluster when replaying this checkout. Start only this cluster with the existing `pg_ctl` binary, its absolute `.private/postgres-data` directory and `-h 127.0.0.1 -p 55447`; start `node dist/main.js` from `server/` after build. Run the live HTTP script with `-BaseUrl http://127.0.0.1:3047 -CredentialsFile .private/refinement-credentials.json` from the repository root. Run `pnpm --filter app test:integration` with the API ready. Every run creates new synthetic records and a unique evidence directory; never reset the original demo. Private settings and credentials must remain outside Git/evidence/screenshots.

The user's selected integration is coordinator-owned PR against `master`, then merge after successful final checks. Workers do not push, merge, publish a PR, delete a branch or remove a worktree. Worktree and ignored test data are preserved for the coordinator.
