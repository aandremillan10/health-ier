# Issues #17 and #19: source audit

Latest authorization: after this baseline audit the user explicitly requested implementing the gaps in #17/#19, selected local MinIO/S3 and discipline ACL, then approved one-way scan mirroring to read-only Railway. The cloud storage choice is Railway managed S3 after the archive warning. See [the approval amendment](../../specs/approval.md#historical-scans-and-audit-implementation-amendment-2026-10-15) and [current source contract](../../features/historical-documents.md). Findings below describe the untouched `97fd447` baseline, not the later implementation's status. The proposed PostgreSQL bytea/storage alternatives below were not selected; user-selected S3 supersedes them.

Audit snapshot date: 2026-10-15, Asia/Manila. Baseline source: `master` at `97fd447c4852f554c26e384f288b54efe880283a`. Source investigation and baseline tests ran in `D:/health-ier`; this report is saved in the guided-onboarding worktree, whose starting HEAD was independently confirmed at the same commit. CodeGraph was absent in both checkouts. The read-only baseline audit made no backend, contract, database, privilege, topology or tracker changes; later implementation is recorded separately above.

At the baseline audit checkpoint, the user had confirmed that both tickets should be audited and the build should remain focused on onboarding. That checkpoint was later superseded by the explicit build authorization above. Proposed future decisions below are historical recommendations rather than selected designs. Desktop/browser/Electron QA remains pending the user's explicit continuation.

## Tracker evidence

Fetched complete issue bodies and comments with `gh issue view <number> --repo aandremillan10/health-ier --json number,title,body,comments`.

| Ticket                                                        | Exact title                                            | Comments | Stated scope                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#17](https://github.com/aandremillan10/health-ier/issues/17) | [P0] Attach digitized legacy paper records to patients | None     | Post-v1.1 extension; ticket creation does not authorize implementation. Scanned attachments remain outside cloud mirroring without a separate amendment.         |
| [#19](https://github.com/aandremillan10/health-ier/issues/19) | [P1] Add staff-facing patient record audit trail       | None     | Post-v1.1 extension; ticket creation does not authorize implementation. Cross-cutting audit coverage should follow later import/export/print/document workflows. |

The bodies link the approved specifications but are acceptance plans, not evidence that their unchecked criteria remain wholly absent. Actual source is authoritative for current behavior. The [specification approval history](../../specs/approval.md) and `docs/verification/guided-onboarding-handoff-2026-10-15.md` govern current authorized scope. The handoff is an ignored local evidence file read from the original workspace, not a tracked file available in every checkout.

## #17 baseline acceptance audit

All five Backend criteria are **missing**. Existing issued prescription/certificate documents are not historical uploads.

| Backend criterion from ticket                                                                                                          | Status and evidence                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient-linked PDF/JPG/JPEG with type, date, description, uploader, timestamp and immutable file identity/checksum                     | Missing. [Prisma Document](../../../server/prisma/schema.prisma#L142) models issued clinical document snapshots linked to a consultation/issuer, without uploaded binary identity or scan metadata. |
| Approved managed storage, server authorization, type/size validation, safe filename/content handling, no renderer filesystem privilege | Missing. No historical-upload route, storage service, file validation or privileged attachment picker was found in server/app source. Existing print privilege is not an upload boundary.           |
| Authorized listing/retrieval and unrelated-role denial                                                                                 | Missing for scans. [ClinicService.listDocuments](../../../server/src/clinic.service.ts#L141) and [ClinicController](../../../server/src/clinic.controller.ts) list issued documents.                |
| Replacement/correction preserves prior provenance                                                                                      | Missing for uploads. Existing clinical correction and issued snapshot preservation concern other resources.                                                                                         |
| Successful document imports recorded in audit                                                                                          | Missing. `import` is an accepted [AuditAction](../../../server/src/audit/audit.service.ts#L9), but no implemented upload/import producer calls it.                                                  |

| Frontend criterion from ticket                                                            | Status                                                                                                                      |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Attach/import selected-patient PDF/JPG/JPEG with required metadata and signed-in uploader | Frontend-owned; missing.                                                                                                    |
| Patient historical-document list, metadata and safe preview/open                          | Frontend-owned; missing. [Documents.tsx](../../../app/src/renderer/clinic/Documents.tsx) handles issued clinical documents. |
| Validation/progress/success/failure and wrong-patient protection                          | Frontend-owned; missing for uploads. Existing issued-document safeguards do not satisfy this criterion.                     |
| Privileged file picker and keyboard/accessibility                                         | Frontend-owned; missing for uploads.                                                                                        |

Shared integration criterion is **missing**: attach a synthetic file, retrieve the same file/metadata on another authorized client after restart, and deny an unauthorized role. No existing test proves this absent flow.

### Minimum decisions before a separately authorized #17 build

These are bounded proposals to review, not selected designs:

1. Approve a server-managed EDGE attachment directory/volume and its backup/recovery responsibility. Keep the renderer on narrow fixed IPC operations; it must never select arbitrary server paths. Use opaque server-generated storage identities and retain a sanitized original display filename separately.
2. Agree a precise upload/list/retrieve role matrix and whether document type affects discipline visibility. Existing patient access alone does not decide historical clinical-file access.
3. Agree required metadata vocabulary, date format, per-file byte limit and accepted PDF/JPEG detection rules, including safe handling of malformed files and active PDF content. JPG and JPEG are extensions of the same image format.
4. Agree a typed patient-linked upload/list/retrieve contract, including bounded binary transfer, pagination, content type/disposition, checksum/immutable identity, validation errors and selected-patient mismatch protection. Exact route names remain undecided.
5. Preserve each imported record; model replacement as a new attributed record referencing the prior identity rather than overwriting bytes. Agree whether annotations or withdrawal are permitted and what readers see.
6. Define the consistency boundary for file persistence, metadata and successful `import` audit: failures must not expose partial records or claim a completed import. Keep files outside mirroring until a separate explicit amendment changes that scope.

Current onboarding action: explain that historical chart attachments are unavailable. Do not imply that practicing an issued prescription/certificate teaches an implemented scan-upload capability.

## #19 baseline acceptance audit

| Backend criterion from ticket                                                                                                                 | Classification and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Append-only events for open/view, create/change/correction, import/export/print, including actor/action/patient-resource/time/context/outcome | Implemented/unverified for most operations; import missing. [AuditInterceptor](../../../server/src/audit/audit.interceptor.ts#L15) records successful GET/preview views and handled controller failures. [ClinicService](../../../server/src/clinic.service.ts#L164) records transactional patient/clinical writes; [ReportsService.export](../../../server/src/reports/reports.service.ts#L258) records export. [AuditService.print](../../../server/src/audit/audit.service.ts#L128) records desktop print outcomes. See limitations below. |
| Minimal traceability metadata without full note/file contents or secrets                                                                      | Implemented/unverified. [recordAudit](../../../server/src/audit/audit.service.ts#L37) explicitly constructs a metadata-only object. Dedicated credential/clinical-content exclusion assertions are missing.                                                                                                                                                                                                                                                                                                                                   |
| Protect ordinary-user mutation/deletion and authorize audit queries server-side                                                               | Implemented/proven for ordinary-staff query denial. [AuditService.authorize](../../../server/src/audit/audit.service.ts#L59) requires head status; controller exposes no update/delete route. [Migration](../../../server/prisma/migrations/20261015190000_audit_trail/migration.sql#L18) blocks UPDATE/DELETE. Actual PostgreSQL trigger behavior is implemented/unverified by this run.                                                                                                                                                     |
| Typed date/actor/patient-resource/action filtering                                                                                            | Implemented/proven in part. Shared [AuditQuery](../../../app/src/shared/operations-api.ts#L13) and [AuditService.list](../../../server/src/audit/audit.service.ts#L79) validate filter fields, UUIDs, dates, action and cursor. Existing test proves patient/action/date criteria, bounded query and invalid date order; remaining filter/cursor permutations are unverified.                                                                                                                                                                 |
| Tests for sensitive-operation audit creation, denied audit access and absence of secrets                                                      | Partly implemented/proven; coverage gaps remain. Query denial, report export event creation and broker print-audit submission have tests. Dedicated open/edit/correction creation, real append-only persistence and secret-exclusion assertions are missing; import cannot be tested end-to-end until implemented.                                                                                                                                                                                                                            |

The core metadata boundary is explicit in `recordAudit`:

```ts
actorId: staff.id,
actorName: staff.displayName,
actorRole: staff.role,
action: input.action,
patientId: input.patientId,
resourceType: input.resourceType,
resourceId: input.resourceId,
outcome: input.outcome ?? 'success',
source: input.source ?? 'clinic-api',
workstation: input.workstation ?? workstations.get(staff),
```

The schema supplies creation time. Append-only protection is a real database trigger, not just disabled UI:

```sql
CREATE TRIGGER "AuditEvent_immutable" BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION preserve_audit_event();
```

| Frontend criterion from ticket                                                                  | Classification and evidence                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized staff/head viewer with date/action/actor/patient filters and readable timeline/table | Frontend-owned; implemented/unverified on this run. [AuditViewer](../../../app/src/renderer/clinic/AuditViewer.tsx#L21) provides these plus record ID filtering. [App](../../../app/src/renderer/App.tsx#L647) exposes Audit navigation only to the head. |
| Distinguish view/change/import/export/print without unauthorized clinical contents              | Frontend-owned; implemented/unverified. Metadata table displays action, actor, time, identity, outcome and context. `import` can be selected but has no live producer.                                                                                    |
| Bounded large-result handling                                                                   | Frontend-owned; implemented/unverified. Server returns up to 50 events using a 51-row lookahead and cursor; viewer exposes Load more. Repeated pagination appends rows locally; it is not virtualization.                                                 |
| Empty/loading/denied/error/disconnected states                                                  | Frontend-owned; implemented/unverified. Viewer has loading/empty text, ErrorNotice and connection/retry guidance; authentication expiry triggers its existing callback.                                                                                   |

The shared integration criterion is **incomplete**: no current test traces the full synthetic open/edit/import/export/print sequence to an authorized viewer, and import is absent. Historical local evidence at `docs/verification/laptop-edge-tls-2026-10-15/packaged/qa-results.md` reports head filtered Audit and ordinary-doctor denial, but is not fresh verification of the onboarding source/package. That ignored evidence was read from the original workspace and is absent from the clean worktree.

### Material limits and bounded next actions

- Workstation context is the request IP (maximum 64 characters); no dedicated session identifier is stored. The ticket says context "where available". Clarify any stronger need before adding identifiers; never log bearer tokens or credentials.
- The interceptor runs after guards: failed authentication is not covered by its controller-failure recording. Successful mutation events come from individual service transactions, while views/failures use the interceptor. Do not describe this as proof of every possible denied request or every sensitive operation.
- Metadata extraction uses result IDs and route parameters, not arbitrary request bodies. Resource identity is available for individual reads; collection events can be broader. A future coverage audit should assert expected patient/resource attribution for each supported operation before changing this behavior.
- Print success means submission to the printer API, not physical output. The [broker](../../../app/src/privileged/broker.ts#L438) records success/failure after the print attempt and returns `auditRecorded: false` if submission succeeded but audit recording failed. Printer selection/authorization failures before an attempt are not equivalent to failed print submissions.
- Minimum future #19 verification: exercise interceptor view/failure events, transactional create/change/correction events, exact minimal fields/no secrets, cursor/filter boundaries, head actors/events access denial, and real PostgreSQL UPDATE/DELETE rejection. Integrate `import` only when #17 is separately built. Preserve current head-only permissions unless explicitly changed.
- Current onboarding can teach the existing head-only viewer using isolated synthetic events, filters and readable action/outcome explanations. Practice exports, printing and imports must initiate no real API/IPC/filesystem/clipboard effects. Do not broaden permissions or promise missing imports.

## Actual noninteractive verification

Inspected root/server/app package scripts and server Vitest configs first. Tests below ran on the audited `D:/health-ier` source; they did not launch Electron or control a graphical browser. Test database dependencies are stubs, so these passes do not prove real PostgreSQL persistence or deployed behavior.

| Command                                                                                                            | Actual result           | Evidence scope                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --dir server exec vitest run --config vitest.e2e.config.mts test/audit.e2e-spec.ts test/reports.e2e-spec.ts` | 2 files, 2 tests passed | [Audit test](../../../server/test/audit.e2e-spec.ts#L12): head bounded metadata query, ordinary-staff denial, date validation. [Reports test](../../../server/test/reports.e2e-spec.ts#L12): totals/export snapshot and one event created. |
| `pnpm --dir app exec vitest run src/privileged/broker.spec.ts`                                                     | 1 file, 23 tests passed | [Broker tests](../../../app/src/privileged/broker.spec.ts#L624): immutable document reauthorization, submitted print distinction and exact print-audit success POST; other session/IPC boundary tests also passed.                         |

The environment rejected the non-Node `pnpm.CMD` shim before execution. Its contents point to the installed native executable; commands were then run using `C:/Users/ajapa/AppData/Local/pnpm/.tools/pnpm-exe/10.30.1/pnpm.exe` in place of `pnpm`.

An initial `pnpm --filter server test:e2e -- test/audit.e2e-spec.ts test/reports.e2e-spec.ts` invocation forwarded an extra `--` and ran the existing full server e2e selection instead: 5 files passed, 3 skipped; 11 tests passed, 9 skipped. The explicit targeted commands above were run afterwards and are the focused evidence. Skipped tests remain skipped, not passes.

No public route changed, so no new usage example was required. No live upload, cross-client/restart, real print submission, cloud delivery, browser, packaged Electron or new UI flow was exercised. Both issues remain open audit findings; no label, comment, status or issue body was mutated.

## Later implementation and new noninteractive evidence

The later authorized source implementation is described in [historical-documents.md](../../features/historical-documents.md), including all four public staff-route usage examples and the companion machine intake example. It adds immutable historical metadata, local S3 storage and bucket-scoped setup, opaque session/patient-bound Electron file selections, checksum-verified retrieval, transactional import/audit/outbox and one-way bounded file mirroring. The approved historical attachment category is now mirrored; older exclusion statements above belong to the baseline audit. Tracker state remains unchanged.

Fresh worktree checks after these changes:

| Check                         | Result actually executed                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server unit suite             | 68 passed across9 files. Includes metadata/no-secret allowlist, audit query/print/interceptor, exact10MiB base64 framing, S3 immutable conditional put/replay/length/cleanup and historical mirror dependency/hash/ACK tests.              |
| Server HTTP suite             | 41 passed,9 skipped across11 files. Added23 historical staff-route tests,3 machine companion boundary tests and4 actual patient-open/edit/correction/audit-rollback path tests. Existing skipped real-PostgreSQL suites remain unverified. |
| App unit suite                | 83 passed,1 skipped across13 files. Added6 token/patient/expiry/JPEG-dimension and stale-picker/upload/session tests.                                                                                                                      |
| Focused changed-source ESLint | Passed.                                                                                                                                                                                                                                    |
| Server typecheck              | Passed.                                                                                                                                                                                                                                    |
| App typecheck checkpoint      | Passed before the last nonoverlapping UI edits; final integrated check is delegated to verification.                                                                                                                                       |

Test dependencies use stubs unless explicitly identified as real runtime evidence elsewhere. These passes do not establish real PostgreSQL trigger behavior, actual local MinIO/managed Railway transfer, cross-workstation/restart behavior or packaged PDF/JPEG preview. The dedicated desktop checkpoint remains pending. Additive setup files were written without running/reconfiguring the retained clinic infrastructure. Cloud resource provisioning evidence belongs to the separate verification worker's record; this report does not claim application deployment or real cloud-file delivery.

## Final integrated verification

The final source commit is `5631a43fa8dcfcd233762ae7bf063d3440da4f83`. Final integrated `pnpm check` supersedes the earlier implementation checkpoints above: app84 passed/1 optional skip, server69 unit passed, HTTP41 passed/9 optional PostgreSQL-suite skips, lint/format/both TypeScript checks and server build passed. Independent renderer tests passed60 cases plus2 behavior tests against the actual packaged renderer. The final Windows ZIP and source/content hashes are recorded in `results.md` and `packaged-provenance.json`.

The verifier additionally ran eleven actual invariant groups against uniquely named fresh scratch PostgreSQL and exact pinned MinIO/mc containers, including historical/audit append-only triggers, real SDK checksum/conditional-put semantics, restart persistence, scoped/anonymous access denial, first/repeated initialization and fail-closed refusal, and one-way bootstrap/replay into separate cloud scratch database/bucket. All owned scratch resources were removed with label verification. These are independent real-runtime proofs, not a reclassification of the nine optional skipped suites. A real pinned-container missing-tool regression was corrected and the final runtime proof reran successfully.

The source/build and four human-facing reports are reviewable without implying a deployed attachment feature: existing Railway application source was not redeployed and no managed-bucket object transfer occurred. Local command logs, full manifests/diffs and scratch helpers named in the reports are ignored workstation evidence, not checked-in attachments. Native picker, packaged `file:` rendering, dedicated desktop QA and real printer proof remain pending explicit continuation.
