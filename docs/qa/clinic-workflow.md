# Clinic workflow QA: registry, attendant, clinician and head

Historical audit baseline: merged `7352c0767fe4fb8f602cc9366b45b17ce371377b`, 2026-10-15. Counts explicitly labeled Baseline below belong to that historical source. Later verification is identified separately. For every later checkout, record its exact commit and new results; the historical counts are neither a future quota nor proof of the current branch.

Later source `b974375123c5afa5be2721d69cffc8c68d945811` includes laboratory, referral and other clinic operations beyond the original audit baseline. The [laboratory workflow](laboratory-workflow.md), [referral workflow](referral-workflow.md) and [clinical summary](../features/clinical-summary.md) describe those current contracts. The [laptop EDGE HTTPS run](laptop-edge-tls.md) records the retained two-machine deployment and current packaged QA results; the older paragraphs below describe their named historical runs rather than a permanent deferral of implemented modules.

The primary workflow in this guide uses **the real Electron client, NestJS EDGE API and PostgreSQL**. Browser memory fixtures support regression testing; they do not prove shared records, authorization, persistence, IPC or printer submission. Complete each test with synthetic records and named accounts, recording actual outcomes rather than checking boxes from this guide alone.

Baseline known defects: **F01** rejects a contract-valid negative Celsius value in the UI and remains open. **F02** previously returned a successfully authenticated user to Staff sign-in after a delayed reset. F02 was fixed and replayed on clean **`a2c1ba1`**; its baseline failure remains recorded. Treat recurrence as a regression; repeated credential entry is not an accepted workaround.

Later verification, separate from the historical baseline: final UI `350f650` passed 43 frontend tests, two checks of the actual built Electron renderer served to headless Chrome, and `pnpm check` (63 app tests plus one optional live skip, 27 server unit tests, seven HTTP tests plus seven optional mirror skips, and server build). The configured shared boundary fix passed 64 app tests including real EDGE. The combined clean `a2c1ba1` actual Electron replay passed 12 flow groups across all eight named accounts with zero renderer errors, persisted document IDs/snapshot hashes after client restart, and genuine session expiry clearing the record. Four printers were enumerated; no print job or physical output was tested. These completed runs do not prove packaged trusted-HTTPS EDGE connectivity or cloud delivery.

Known sign-in feedback limitation: an actual invalid-credential response currently displays “Sign in to continue.” and may also show “Your session changed or expired. Sign in again.” The password clears and rejection remains visible, but this wording does not clearly explain incorrect credentials. Record it as a clarity limitation; do not claim that the more specific fixture-only error text was observed against the real server.

## Prepare the assigned environment

Use Node 24.13+ within major 24, pnpm 10.30.1 and the repository root as the working directory. For a fresh Docker setup, follow [development setup](../development.md) and [server setup](../../server/README.md). For an existing environment, reuse its assigned configuration and data instead of running fresh setup over it.

1. Confirm the exact checkout/commit, assigned database/API ports, data owner and other active workers. Reserve the graphical Electron/Chrome resource before interactive QA. Identify the exact application window/session before acting.
2. Use a dedicated synthetic `healthier_demo_*` EDGE database. Preserve existing root/server/app environment files, credentials and volumes. Never reset/reseed the original demo, use `demo:reset`, delete a volume, or share one evidence directory between different databases as part of this workflow.
3. The assigned `server/.env` must contain the correct private database connection and credential-file path. The Electron main-process clinic origin must match the API. Open the assigned credential file privately to obtain the eight generated account passwords; the usual default is `.private/demo-credentials.json`, but `DEMO_CREDENTIALS_FILE` may select another path. Never copy its contents, passwords, session tokens, database URLs or machine credentials into screenshots, logs, this guide, chat or Git.
4. For a **new, explicitly assigned fresh environment only**, the documented commands are:

   ```powershell
   pnpm install --frozen-lockfile
   docker compose -f compose.dev.yaml up -d --wait
   pnpm --filter server prisma:migrate
   pnpm --filter server demo:seed
   ```

   First follow the development guide's non-overwriting environment-file setup. Existing volumes keep their original credentials; changing example settings does not change a populated database. If a separate project is required, the guide documents `docker compose -p health-ier-fresh-dev -f compose.dev.yaml up -d --wait`; choose free ports and matching configuration first. The portable PostgreSQL setup is an alternative, not a second database to start on top of an existing one.

5. Start the assigned API and real Electron client in separate root terminals:

   ```powershell
   # Terminal A
   pnpm dev:server
   ```

   ```powershell
   # Terminal B: actual Electron, not the browser fixture server
   pnpm dev:app
   ```

   The development loader reads only the named app connection settings into Electron main. Restart Electron after changing them. If a port override is necessary, use the assigned values consistently; do not assume port 3000 is free or change another application's port.

6. In a third terminal, enter the assigned nonsecret API origin and check readiness:

   ```powershell
   $qaApiOrigin = Read-Host 'Assigned clinic API origin, for example http://127.0.0.1:3000'
   curl.exe --fail --silent --show-error "$qaApiOrigin/health"
   ```

   Expect `{"status":"ok","mode":"EDGE"}`. A reachable `mode:"CLOUD"` service is the read-only application mirror and cannot serve this writable clinic workflow. This is a readiness check, not proof of login or clinical integration. Sign in through the real Electron credential form and confirm the clinic/LAN context; do not select a memory-demo entry. If valid sign-in returns immediately to sign-in, record an F02 regression and stop dependent manual steps until investigated.

For Windows export, run this command from the repository root:

```powershell
pnpm --filter app package:windows
```

It creates an unsigned portable folder, ZIP and SHA-256 file under a fresh timestamped `app/dist/windows/` directory. Follow [Windows desktop export and launch](windows-desktop.md) to verify the hash, extract the complete folder and start the executable from the actual extracted location. Keep the whole folder together; copying only `AMLIG.exe` is insufficient.

Packaged clients require a trusted **HTTPS EDGE** origin supplied through the launcher/process `HEALTH_IER_SERVER_URL`; packaged `.env` is not automatically loaded. A public HTTPS CLOUD mirror does not satisfy that requirement. The historical audit above had no verified trusted HTTPS EDGE endpoint and used the unpackaged local Electron workflow. The later [laptop EDGE run](laptop-edge-tls.md) separately records the real HTTPS deployment, approved certificate trust and packaged results. The synthetic HTTP exception is only for unpackaged loopback development. Keep TLS validation, context isolation and disabled renderer Node integration. The [LAN/TLS guide](../lan-tls-setup.md) describes separate certificate/firewall prerequisites; authorized clinic certificate setup must verify the endpoint/certificate and follow the clinic's approved trust process. No automatic trust change or certificate-verification bypass is part of this workflow.

## Accounts and evidence ledger

| Account                                | Role to verify                                               |
| -------------------------------------- | ------------------------------------------------------------ |
| `demo.clerk`                           | Registry demographics only                                   |
| `demo.attendant`                       | Nursing attendant; registry and own vital signs              |
| `demo.doctor`                          | Medical author; own edits/finalization/corrections/documents |
| `demo.doctor.head`                     | Medical doctor plus head oversight; others remain read-only  |
| `demo.dentist.one`, `demo.dentist.two` | Shared isolated dental reads                                 |
| `demo.medtech.one`, `demo.medtech.two` | Minimum identity and shared isolated lab reads               |

Create a unique run label such as `QA-<date>-<run>` and a synthetic patient name containing it. Record that patient's actual returned UUID, the finalized vital ID, consultation ID/revisions and both issued document IDs. Keep these separate from the seeded authorization patient `20000000-0000-4000-8000-000000000001`, which has the isolated dental/lab proof records. A dental/lab proof on that seed is not a new referral or a fabricated continuation of the newly registered patient's care.

Use an ignored evidence folder such as `docs/verification/qa-<date>/<run>/`. For each case record: ID, commit, environment/mode, account/role, patient ID, steps actually exercised, expected/observed result, pass/fail/not-run, screenshot path and limitation. Capture credentials only after fields are empty or after successful sign-in; never screenshot a filled password field. Record screenshots by the stable case IDs below. View the image and confirm it actually shows the claimed state; a screenshot filename is not proof.

## Real staff workflow

### QA-01 — Clerk registers the shared patient

Sign in as `demo.clerk`. In Patient records, search the unique QA name before registration. Select Register patient; enter synthetic full name, optional known birth date or leave it unknown, sex/category/address and an optional synthetic employee reference. Select Check existing records. If a same-name result exists, compare its UUID and birth date; open it or explicitly confirm a different patient. Save patient.

Expect the persisted patient's name/UUID in the banner and honest server-save feedback, with no medical/dental/laboratory provider navigation for the clerk. Edit a synthetic address, save, return to the registry and find the patient by both name and its full UUID. The current backend patient number is its UUID. Record `QA-01-registry.png` and `QA-01-patient.png`; do not invent a separate patient-number scheme.

Sign out before changing accounts. Expect Staff sign-in and no prior patient/chart/document view.

### QA-02 — Attendant retrieves the same identity and records vitals

Sign in as `demo.attendant`, find the QA patient by UUID and compare the banner before typing measurements. Open Vital signs, then Record vital signs. Use synthetic values only; leave at least one untaken measurement blank. Verify labels/units and the Asia/Manila timestamp. Save draft, reopen Edit draft, change one synthetic measurement and save again.

Expect the same patient/author, a draft revision that advances, null/Not taken for blanks and no provider-note access. Record `QA-02-vital-draft.png`. Select Finalize entry and Confirm finalization. Expect Finalized; ordinary draft editing is no longer offered. Record the finalized vital ID/revision and `QA-02-vital-finalized.png`.

An optional correction must name a reason, preserve the original and show separate attributed correction content. Do not overwrite the finalized original. The clinician's selected finalized vital reference continues to identify that preserved original.

### QA-03 — Interrupted work keeps patient and owner together

On an unsaved new vital draft, enter distinct synthetic text/value. Use Ctrl+K to select a different synthetic patient. **Decline** discard. Expect the original patient, screen, field values and ownership together; no mutation should occur for the other patient. Repeat with a medical draft, a patient edit and document preparation where the role permits them. Also check register shortcuts and All patient records.

Then **accept** a deliberate navigation. Expect the old editor/review context to clear once; starting a new draft must not contain old patient text. Record `QA-03-decline-preserved.png` and the observed patient IDs. A dialog automation timeout is not proof of decline or acceptance; mark an inconclusive manual attempt as not verified and use the real integration runner's completed guard assertions as separate evidence.

### QA-04 — Doctor selects the finalized same-patient vital record

Sign in as `demo.doctor`, find the same QA patient, and open Medical chart → New medical entry. Verify the patient banner and consultation date. Select the finalized vital record from QA-02 by timestamp/author; do not choose another patient's record. None selected is valid when no measurement is appropriate. Enter synthetic reason/findings/impression/plan. Keep optional CS unchanged or blank; its expansion is unconfirmed.

Save draft. Expect immediate completion, server-save feedback and correct author/patient. Reopen Edit draft and verify the persisted text. The chart should present selected measurements with units, recorder and timestamp; distinguish None selected, Not taken and unavailable. Record `QA-04-medical-draft.png`.

### QA-05 — Real stale revision review

Use two independently configured authorized test clients as the **same original medical author**, with the same draft open. In the second client change and save synthetic findings. In the first client change findings and attempt Save draft using its older revision.

Expect a recoverable conflict, preserved first-client input and disabled Save until review. Select Review latest version; verify the latest revision and the second client's content. Select Use latest revision and keep my input, compare deliberately, then Save draft. Expect the intended text persisted at the next revision. Record `QA-05-conflict.png` and `QA-05-reviewed-retry.png`.

If a second real client is unavailable, mark this manual subcase not run and execute `pnpm --filter app test:integration` below: its real named IPC update deliberately makes the open UI draft stale and verifies the complete UI review/rebase/retry. Do not use a memory-demo Simulate conflict control to claim real backend conflict proof, and do not expose tokens through developer tools.

### QA-06 — Finalize and add an attributed medical correction

From the persisted doctor draft select Finalize entry, then Confirm finalization. Expect Finalized and the original text preserved. Select Add correction, give a synthetic reason, change a finding and Save correction.

Expect original content plus a separate correction showing author, timestamp and source revision. Record `QA-06-correction.png` with both original and correction visible, or use two explicit screenshots if scrolling is needed. No new diagnosis/advice should be generated by the application.

### QA-07 — Prescription preview, review and issue

On the doctor's own finalized consultation select Prepare prescription. Enter synthetic medication instructions and an issue date. Select Preview prescription. Verify the supplied unified clinic header, patient/source/issuer, optional unknown fields, body and handwritten-signature area. Use Fit width and 100%; scroll through long content.

Check I have reviewed this document. Edit the wording; expect the prior preview/review to become invalid and issuance to require a new reviewed preview. After a complete review select Issue prescription.

Expect an immutable issued copy, document ID and trusted doctor identity. Record `QA-07-prescription-preview.png` and `QA-07-prescription-issued.png`; record the exact ID. Do not interpret issuance as printing. Header failure must block issue/print and offer retry without losing entered text.

### QA-08 — Medical certificate preview and issue

Return to the chart; select Prepare certificate on the same own finalized consultation. Enter synthetic findings, remarks and the permitted editable purpose. Preview and review the fixed wording/header, source consultation, purpose and handwritten-signature area, then issue.

Expect a distinct immutable certificate ID. Document wording/purpose edits must not change patient demographics or the consultation. Record `QA-08-certificate.png` and its ID.

### QA-09 — Restart, persistent history and same-ID reprint view

Sign out and fully close this assigned Electron client, then relaunch with the same configured API. Sign in again, find the patient by UUID and open Medical chart → Issued documents. Discover both documents through the list without relying on remembered IDs. Use View / reprint.

Expect both exact prior IDs and stored snapshots; no Issue action on an issued copy. Reopening later must not recalculate its age/source or silently incorporate new demographic/correction text. Record `QA-09-history.png` and `QA-09-reopened.png`. Restart only the owned API if additionally testing server-process persistence; retain the database/volume. The automated persistence script below uses its own generated evidence.

### QA-10 — Colleague read-only and server denial

Sign in as the other named doctor, `demo.doctor.head`, and retrieve the QA patient's medical record and issued documents. Expect read-only controls on the first doctor's entries: no edit/finalize/correct/issue-as-another-author action. Authorized document view/reprint remains allowed.

UI absence alone does not prove authorization. Run the controlled live API checks below to verify forbidden cross-author mutation and issuance requests are rejected without changing records. Record `QA-10-colleague-readonly.png`. A head may still author their **own** medical entry; that authority does not extend to another author.

### QA-11 — Dentist: care context plus isolated dental proof

Sign in as `demo.dentist.one`. Retrieve the newly registered patient and read the allowed vital-sign context; medical/laboratory provider notes must not be available. Then deliberately switch to the seeded authorization patient and open Dental chart. Repeat the shared dental read as `demo.dentist.two`.

Expect the isolated synthetic dental text with actual author/status/revision and read-only explanation. There is no complete dental authoring workflow in this narrow demo; its absence is expected, not a failed button. The live API script proves that the second dentist cannot mutate the first author's seed. Record `QA-11-dental.png` with the correct seed patient banner.

### QA-12 — Medtech: minimum identity and isolated laboratory proof

Sign in as `demo.medtech.one`, find the seeded authorization patient and open Laboratory chart. Repeat as `demo.medtech.two`. Expect minimum identity (ID/revision/name/sex/DOB), no address/category/provider-note disclosure, shared isolated lab text and attributed history. The server-filtered DTO checks in live automation complement what is visible.

Medical/dental notes and general vital-sign navigation must not appear. In the original audit baseline, no order/referral/result-sharing or complete laboratory authoring UI was expected; that statement does not describe the later implemented modules. Retain this isolated seeded-chart permission check, and use the current [laboratory workflow](laboratory-workflow.md) and [referral workflow](referral-workflow.md) for their separate order/result/referral paths. The live API script verifies denied cross-author mutation. Record `QA-12-laboratory.png` and identify which baseline and current module paths were actually exercised.

### QA-13 — Head checks across disciplines and own-author limits

Sign in as `demo.doctor.head`. On the seeded patient read Dental and Laboratory charts; on the QA patient read vitals, medical entries/corrections and issued documents. Confirm the head designation is distinct from the Medical doctor role. Others' work remains read-only.

Create a separate clearly synthetic **own** medical draft if testing the head's authorship. It may be edited/finalized/corrected through their medical authority; this must not enable changes to the first doctor's entry. An ordinary doctor's later read of the head's entry should likewise be read-only. Use the live API script for direct denial proof. Record `QA-13-head-oversight.png` and the actor/author IDs.

### QA-14 — Logout, account clearing and invalidation

Sign out from an open chart/document and sign in as clerk, attendant and a different discipline in turn. Expect no prior patient, chart, preview or document content to remain. Reopen only data authorized for the new account. Record `QA-14-cleared-signin.png` with empty credential fields.

Repeat sign-in/account switching. Successful sign-in must stay authenticated when an older account-switch notification arrives. Genuine newer expiry/logout/replacement must still clear the view, and a pending older login must not restore a replaced session. Failed credentials must retain server-rejection feedback after reset delivery and clear the password. Record the tested commit and new focused/real Electron regression results; never suppress all reset events to make this check appear to pass.

The application validates current staff on focus and every 60 seconds; server requests always enforce current authority. Use the real integration runner for controlled session expiry/reset, rather than manually changing a shared database or copying a session token into the renderer.

### QA-15 — WAN failure differs from LAN/server failure

For actual WAN-off proof, keep the clinic LAN and assigned local API/database reachable. Repeat local login, lookup, save and document read/issue; record the real network conditions. A checkbox in a memory fixture is not a real WAN test. Actual cloud delivery/catch-up is a separate Backend/operator check, not a frontend sync button.

For LAN/server failure, coordinate stopping only the owned API or use the real integration runner's API-origin transport cancellation. Keep an unsaved synthetic draft open and attempt Save. Expect an honest unavailable/no-save-confirmed result and preserved patient/input. Restore the assigned connection and explicitly retry; verify persisted data afterwards. Never infer successful durable saving from retained text alone. Record `QA-15-disconnected-retained.png` and `QA-15-restored-save.png`.

### QA-16 — Keyboard, window size and text sizing

Verify Ctrl+K, duplicate-name DOB cues, ArrowUp/Down, Enter, Escape, exact focus restoration, Tab/Shift+Tab, labeled controls and visible focus. Declining a switch must retain the same owner even when selected through the keyboard.

Check 1280×720, 1920×1080, 1024px width and 200% text sizing. Keep patient identity and Save/Cancel reachable; focus each long clinical field and ensure its label/control are not covered by sticky identity/actions. Reduced motion must keep routine actions immediate. The existing renderer suite doubles root text size; record that method distinctly from Windows display scaling/browser zoom. Record `QA-16-draft-<size>.png`, the actual viewport and the sizing method.

### QA-17 — Printer gate and truthful submission

Opening an issued document should enumerate actual installed printers. Refresh printers and select an authorized printer. Verify empty/error recovery and that the confirmation names the selected printer/document. Cancel the confirmation during the ordinary no-print QA path.

Only test Confirm print after separate permission for the actual printer/resource and output. Expect Sent to printer only for accepted submission; it still does not prove correct paper, margins, legibility or signature space. A failure/retry must reuse the same issued document ID, never silently issue another. Record `QA-17-printer-controls.png`, whether submission was attempted, callback result and separately observed paper result. Printer doubles in tests and enumeration alone are not physical output proof.

### QA-18 — Known audit defect: Celsius lower bound

On source baseline `7352c076`, the attendant Temperature (°C) input has `min=0`, while the privileged/server contract permits values down to -273.15. A no-save test entering `-1` yields `rangeUnderflow=true` and invalid browser state. Record this as **known failure F01**, not a successful clinical path or a medical interpretation. The current G01 evidence is in the frontend gap audit. After an authorized fix, verify the agreed boundary in a regression and update this case; do not weaken it to obtain a pass.

## Automated smoke, full and live checks

Use a dedicated terminal and the assigned synthetic configuration. Commands that write create additional synthetic records/evidence; they must target the assigned database, not production or the original shared demo. Counts below are the recorded `7352c076` baseline, not quotas for later feature branches.

### Fast readiness and static/unit checks

```powershell
curl.exe --fail --silent --show-error "$qaApiOrigin/health"
pnpm --filter app typecheck
pnpm --filter app test
```

Normal app tests at the baseline: 46 passed, one optional live test skipped unless its private live environment is supplied. Readiness is nonclinical; these commands do not replace the real workflow above.

### Full repository and supporting renderer regressions

```powershell
pnpm check
pnpm test:frontend
pnpm --filter app build
```

Baseline: frontend 33/33; normal `check` passes lint/format/types, 46 app tests, 27 server unit tests, seven HTTP e2e tests and server build, with one optional app live skip and seven mirror live skips. `check` does **not** include the frontend Playwright suite or Electron production build; run those separately as shown. Renderer tests use memory/injected bridges and are supporting evidence, not primary staff QA against the backend.

The default renderer test port is 5175. If reserved, select an assigned free port using `CLINIC_FRONTEND_PORT` in that dedicated test terminal. Do not attach to another worker's server/tab or alter their unsaved editor.

### Configured real broker/API/database checks

```powershell
$qaCredentialPath = Read-Host 'Absolute path to the assigned private synthetic credential file'
$env:HEALTH_IER_LIVE_CREDENTIALS = (Resolve-Path -LiteralPath $qaCredentialPath).Path
$env:HEALTH_IER_LIVE_SERVER = $qaApiOrigin
pnpm --filter app test
powershell -NoProfile -ExecutionPolicy Bypass -File server/scripts/verify-live.ps1 -BaseUrl $qaApiOrigin -CredentialsFile $qaCredentialPath
```

Baseline: configured app suite 47/47, including real broker→Nest→PostgreSQL. Its printer is a test adapter. The live HTTP script passed 102 assertions covering allowed/denied roles, versions, source linkage and immutable document reads. It stores synthetic API evidence beside that credential file; never share that evidence directory between databases. Seven mirror live tests still require their own dedicated EDGE/CLOUD settings; no cloud result follows from the app suite.

### Actual Electron end-to-end proof

With matching ignored `app/.env`, `server/.env`, private account file and the local API ready:

```powershell
pnpm --filter app test:integration
```

This builds/launches hidden real Electron and uses the named preload/main path with Nest/PostgreSQL. The baseline completed 12 flow groups across eight accounts: lookup/create/rename/update, vitals and medical lifecycle/corrections, same-patient linkage, both documents, persistent history/snapshots after restart, real stale UI review/retry, transport failure retaining input, declined patient switching and session invalidation. It sends no print job. Record the newly printed unique evidence directory and read its `electron-integration.json`; do not reuse an older pass for changed application code.

### Database immutability and post-restart persistence

After the assigned server build and live HTTP script, from the same configured checkout:

```powershell
Push-Location server
try { node dist/live-db-checks.js } finally { Pop-Location }
# Coordinate restart of only the owned API; retain PostgreSQL/data.
powershell -NoProfile -ExecutionPolicy Bypass -File server/scripts/verify-persistence.ps1 -BaseUrl $qaApiOrigin -CredentialsFile $qaCredentialPath
```

The database check is a synthetic live check, not a reset. The persistence script expects the matching `api-evidence.json` produced by the live HTTP script. Restarting an unrelated process or deleting/reseeding data invalidates this proof.

## Completion record

Return the current commit, exact accounts/roles exercised, synthetic IDs/revisions, commands/results/skips, screenshot manifest, native-dialog failures, known F01/F02 status and the division between fixture, real IPC/API/database, actual printer submission and physical paper. Do not mark not-run resources as passed. Keep packaged trusted-HTTPS EDGE connectivity, second-machine LAN/TLS, actual WAN/cloud catch-up and clinic printer calibration open until executed in their authorized resource scope.

Retain owned synthetic data/evidence for replay. Stop only services and windows this QA run owns, coordinate shared resources, and record cleanup. The [development guide](../development.md) explains volume-preserving stops; normal cleanup never uses `--volumes`.
