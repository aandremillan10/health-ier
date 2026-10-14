# Clinic source analysis

Reviewed 2026-10-14. This note records source evidence, verified technical facts, and proposed decisions. It does not authorize implementation or deployment. Current direct user answers govern over historical prompts and generated suggestions inside the attached Gemini transcript.

## Current confirmed decisions

- The app serves clinic staff: two doctors, two dentists, two medical technologists, one nursing attendant, and one clerk, using four Windows 10/11 desktops with printers on office LAN/Wi-Fi.
- Offline means the internet can fail while the office LAN and clinic server remain available. Per-workstation operation during LAN or server failure is outside the selected requirement.
- Use React, Tailwind, shadcn/ui, Electron, and NestJS. The selected persistence architecture is clinic-server PostgreSQL, without WatermelonDB on workstations.
- Medical and dental charts remain separate. Staff share charts within their discipline, but each author controls their own entries. The head can read all charts and cannot modify other people's entries.
- The patient registry is shared while clinical charts remain isolated. The recommended clerk/nursing-attendant/medical-technologist access plan is accepted: administrative identity handling, vitals by the attendant, and minimum test-order context/result authoring for laboratory staff. Keep the precise access matrix explicit in the specification.
- The head is one of the medical doctors with an additive oversight flag, retaining authorship rights for their own medical work and read-only oversight of other entries. Finalized originals are preserved, with author-attributed corrections.
- Prescriptions and medical certificates use fixed templates with an editable certificate purpose. The demo uses synthetic data. A visual template builder is excluded.
- The user subsequently supplied two blank flattened form references and two versions of a unified header under `docs/headers/`. These replace the older photos as the current reproduction inputs. The proposed current header baseline is the supplied unified header for both documents, replacing the earlier distinct-header assumption in the final reviewed specification.
- The primary demo covers registration, vitals, medical consultation, prescription, and printing, with dental/laboratory access restrictions demonstrated. Have the demo ready October 15 and present October 16 in the morning, Asia/Manila.
- Scaffold and specifications come before health-feature implementation. Cloud deployment and provincial replication remain separate scope decisions.

## Source inventory and provenance

| Source | Location | Evidence type and limits |
| --- | --- | --- |
| Hackathon challenge deck | `E:/Downloads/HMO_Clinic_Hackathon-edit.pptx` | Twelve slides, extracted text and notes. Challenge requirements and aspirations, not a complete specification. |
| Earlier architecture discussion | `E:/Downloads/Offline-First Clinic App Architecture.pdf` | Twenty-seven pages of a Gemini conversation. Historical human preferences and generated proposals require current confirmation where material. Selected complete pages were also rendered and inspected. Code blocks are visibly clipped at the right edge. |
| Posted medical-service workflow | Supplied clipboard photograph | A photographed Province of Iloilo service workflow. Describes medical service delivery, not a dental chart schema or complete access matrix. |
| Medical certificate | `docs/references/medical-certificate.jpg` | Blank photographed form. Provides wording, fields, and approximate layout. Physical sheet size, current official approval, and print margins remain unverified. |
| Prescription | `docs/references/prescription.jpg` | Blank photographed form. Provides fields, approximate layout, and follow-up note. Physical sheet size remains unverified. |
| Certificate-builder UI example | `docs/references/possible-ui-for-cert-builder.png` | Layout inspiration with demonstration content. Its identifiers, credentials, dates, diagnoses, branding, and approval claims are not clinic facts. |
| Current medical-certificate reference | `docs/headers/flattened_medcert.jpg` | New user-supplied blank form, visually inspected. Current reference for body wording/layout; lower signature area is faint and photographic artifacts remain. |
| Current prescription reference | `docs/headers/flattened_prescription.jpg` | New user-supplied blank form, visually inspected. Current reference for body wording/layout; remaining skew and shading make it a reference rather than a clean printable page background. |
| Unified header, white background | `docs/headers/header.jpg` | New user-supplied high-resolution clinic header, visually inspected. Recommended raster header for white-paper print templates. |
| Unified header, transparency | `docs/headers/transparent_header.png` | New user-supplied transparent version, visually inspected. Genuine alpha channel, substantially fewer pixels than the JPEG. |

No patient or mock personal identifiers are reproduced in this analysis.

Both photographed source forms are blank patient forms. They contain institutional branding/contact information. The builder screenshot contains person-like names, employee/document identifiers, credentials, and example clinical content whose authenticity is unverified. Do not publish that image to the public repository merely because it is a UI reference. Review/redact or exclude it before any separately authorized push.

All four new `docs/headers/` assets show blank forms or institutional header content. Inspection found no filled patient records, personal clinician credentials, or handwritten signature images. Institutional branding and contact text are present. This observation does not itself authorize publishing the files or establish licensing/official approval of branding.

## Challenge deck evidence

| Actual slide position | Extracted substance |
| --- | --- |
| 1-2 | The Office of the Hospital Management Officer's challenge is digitalizing healthcare records, moving the HMO clinic from paper folders to a simple electronic medical record system. |
| 3 | Personnel manage medical, dental, and laboratory records for provincial government employees and dependents. Paper volume and retrieval burden affect staff and patient waiting times. |
| 4 | Waiting-time illustration. It does not establish a measured baseline or service-level target. |
| 5 | Paper records occupy space and can be misfiled, misplaced, difficult to retrieve, incomplete, or late to update. |
| 6 | Current process: handwritten notes, physical folders, manual searching, consultation use. Paper contains patient information, consultation notes, medical history, diagnoses, treatment, and recommendations. |
| 7-8 | Aspiration for a simple electronic record system accessible to authorized personnel; slide 8 is an illustrative electronic-health-record image. |
| 9 | Desired records are organized, searchable, accessible, tracked, and usable for organized reports. |
| 10 | The clinic can supply patient folders, supporting photocopies, and current clinic forms. Actual forms define fields and workflows that still need discovery. |
| 11 | Works when internet access is unavailable, shares across office computers, uses existing devices, has a simple interface and few steps. |
| 12 | Closing invitation and aspirations for faster records, shorter waits, and improved care. |

The deck does not specify provincial cloud hosting, multi-clinic replication, workstation databases, appointment management, stock accounting, or a live queue. Those should not enter the specification solely because the earlier architecture transcript proposes them. Slide notes sometimes use a different number from the actual slide position; the table uses actual positions.

## Posted workflow evidence

The photograph shows the nursing attendant accommodating the patient, preparing a new record or retrieving an old record. A nurse takes vital signs and refers the patient to the physician. The physician evaluates symptoms, refers for specialist evaluation or laboratory analysis when needed, or prescribes medication and instructions when treatable. The nursing attendant or assigned supply officer dispenses available medicines.

The clinic staffing statement identifies a nursing attendant, while the poster labels the vital-sign step as a nurse. The specification should record the vitals capability under the confirmed role without silently inventing a separate nurse account. The poster supports documenting referrals and dispensing as workflow context; it does not require implementing either module for the selected demo.

## Earlier Gemini discussion: page map and conflicts

| Pages | Content and interpretation |
| --- | --- |
| 1-2 | Proposes three tiers: Electron workstation database, clinic PostgreSQL server, cloud PostgreSQL server. Proposes WatermelonDB, lazy fetching of visiting patients, append-only encounters, timestamp-based demographic merging, and clinical-alert union. These are generated architecture suggestions. |
| 3-5 | Proposes a multi-device demonstration, mDNS discovery, UDP broadcast fallback, cached server address, and manual address entry. Calls discovery effectively zero configuration, although firewall, network isolation, pairing, and interface selection are unresolved. |
| 5-8 | Proposes Docker Compose and a Windows launcher. Includes sample credentials, exposed PostgreSQL port, and partial code. These are examples, not deployment-ready configuration. Injecting a host IP does not by itself prove broadcast packets can traverse Windows/container networking. |
| 8-11 | Reverses the workstation-database proposal: direct LAN access to the clinic server, no WatermelonDB. Proposes a 48-hour implementation scope and a short timestamp-based cloud sync loop. Initially suggests hardcoded authentication and a live queue. |
| 11-12 | Historical human prompt questions queue necessity. Generated response cuts the queue in favor of retrieval and recent folders, including polling. Current demo scope likewise does not establish a full queue requirement. |
| 13-17 | Historical prompt requests medical certificates and prescriptions, with an editable purpose. Generated response proposes an editor/live-preview layout and CSS printing. Historical prompt later rejects hardcoded authentication and assumes all accounts are doctors. The all-doctor assumption conflicts with current confirmed staffing and permissions. |
| 17-21 | Proposes a shared edge/cloud backend, real authentication, patient/dependent relationships, encounters, attachments, issued-document snapshots, sync cursors, reports, and broad folder responses. Does not enforce the currently required discipline boundaries. |
| 21-22 | Offers five decisions. Historical prompt accepts full mirror, deployed cloud, NestJS, employee/dependent linking, and obtaining a scanned header. These are historical source claims, not current authorization. NestJS is independently selected now; cloud/full mirror remain open. |
| 22-27 | Repeats a supposed finalized architecture with broad chart access, full mirroring of users including password hashes, timestamp-based sync, static attachment serving, and universal doctor registration. Despite the generated description, this is not a verified production-ready design. |

Material discrepancies to resolve in the specification:

- Workstation persistence appears in the first proposal and disappears in the later one. The current confirmed WAN-only offline requirement selects clinic-server persistence.
- Initial lazy patient fetching becomes full mirroring later. Neither is needed for a single-clinic LAN demo without confirmed cloud sync.
- Universal doctor accounts and freely selectable medical/dental/lab service types contradict current role and chart restrictions.
- Returning every chart in a folder response and hiding tabs in the UI would still disclose restricted data. Authorization must filter the API response and attachment/document access.
- An append-only record cannot also allow unrestricted upsert of an existing UUID. Finalized entries need explicit ownership and amendment rules.
- Timestamp-only sync and concatenating allergy text do not establish correct conflict handling. Client clock skew, in-flight edits, deletes, replay, and partial failures are unresolved.
- Public static attachment paths bypass chart authorization. Protected downloads must apply the same policy as their owning chart.
- The older photographed prescription and medical-certificate headers differ. The user has now supplied a unified header as the current asset choice; retain the distinct form bodies and record shared-header adoption in the final reviewed specification.

## Observed print-form requirements

Medical certificate: government/clinic header with seal and a right-side provincial branding mark, certificate title, issue-date line, patient name, age, sex, address, consultation date, reason for consultation, findings and clinical impression, remarks, free-text certificate purpose, a restriction against medico-legal use, and a signature area with license and PTR numbers.

Prescription: a different clinic header and seal without the same right-side branding block, date, patient name, age, sex, CS, address, prescription body, clinician signature area, license and PTR numbers, and a follow-up warning. The likely meaning of CS is civil status, as suggested by the earlier transcript; the clinic should confirm the label's intended meaning.

The UI example uses a different office header, a fixed list of purposes, extra credential/control fields, and demonstration values. It supports the editor-plus-paper-preview layout only. Its A4/letter labels do not establish the photographed forms' physical paper sizes. Do not reproduce mock identifiers, digital-signature claims, seal requirements, or extra clinician credentials without confirmation.

Proposed document model: prefill from the selected patient, consultation, and authenticated clinician; permit clinical wording and purpose edits; retain patient/author linkage and an immutable issued snapshot. Document-only edits should not silently alter the patient profile or source consultation. Clinician identity and credentials should come from the authorized issuer profile rather than arbitrary editable text that permits impersonation. Confirmation of permitted issuers and paper-signature practice remains necessary.

### New flattened references and unified header

Metadata was inspected with Pillow without altering assets. DPI values below are embedded metadata, not measured physical paper sizes or proof of image quality.

| Asset | Pixels | Mode/alpha | Embedded DPI | Observed quality and use |
| --- | --- | --- | --- | --- |
| `flattened_medcert.jpg` | 1792 × 2370 | RGB, no alpha | 300 × 300 | Blank form with readable main labels and color logos. Residual skew, page/background shading, and faint/degraded lower signature/license/PTR area remain. Use the body as the current layout/wording reference. |
| `flattened_prescription.jpg` | 1632 × 2566 | RGB, no alpha | 300 × 300 | Blank form with readable fields, prescription symbol, signature area, and follow-up note. Some lines still slant and background shading remains. Use the body as the current layout/wording reference. |
| `header.jpg` | 4128 × 1024 | RGB, white background | 300 × 300 | Clear clinic text, seal, and right-side provincial branding. Best supplied raster input for the paper header. |
| `transparent_header.png` | 774 × 190 | RGBA; alpha range 0–255 | Approximately 300 × 300 | Genuine transparent background with dark opaque text retained. Small text and logo detail have many fewer pixels than in the JPEG. Useful for a small screen preview, not preferred for a full-width print header. |

The new medical-certificate body retains its title, date, patient details, consultation date/reason, findings/clinical impression, remarks, purpose line, medico-legal restriction, and signature/license/PTR area. The new prescription body retains date, patient details, age/sex/CS/address, medication area, clinician/signature/license/PTR area, and follow-up note. No document generator or template was implemented during this review.

For an illustrative 180–190 mm printed header width, the JPEG supplies approximately 583–552 effective pixels per inch. The transparent PNG supplies approximately 109–103 pixels per inch at the same width. Its 300-DPI metadata does not recover that missing detail. The JPEG has approximately 5.3 times the horizontal pixels and 29 times the total pixels. The supplied transparent image's small text should be expected to soften or pixelate at paper width even though the branding remains recognizable.

Recommendation: use `header.jpg` at its preserved aspect ratio on the white print page and use native template text/rules for the form body. Keep all fonts/header assets local for offline generation. Use the transparent PNG only if the actual small rendered size is acceptable, or obtain a comparably high-resolution transparent source if transparency later becomes necessary. Do not enlarge the PNG and call it higher resolution. Do not use either whole-page JPEG as the final page background: that would reproduce shading, skew, faint text, and fixed blank lines, complicate dynamic text overflow, and reduce print quality.

The source page ratios differ from A4, and the embedded 300-DPI dimensions do not match a verified physical paper format. Adopt the final specification's selected paper size explicitly, preserve header proportions, and verify template layout against those dimensions instead of inferring size from the file name or DPI tag. A later print review should check monochrome logo contrast, long patient text, long prescription/remarks content, footer/signature visibility, printer margins, and page overflow.

## Verified technical findings and recommendation

### RxJS and WatermelonDB

RxJS composes asynchronous and event-based operations with Observable values. It provides no database or durable replication on its own. It can support connection events or backend flows without determining storage architecture. See the [official RxJS repository](https://github.com/ReactiveX/rxjs) and [RxJS overview](https://rxjs.dev/guide/overview).

WatermelonDB is a local database framework with change tracking and a synchronization adapter. Applications still provide a backend and protocol-compliant pull/push endpoints. See [WatermelonDB synchronization](https://watermelondb.dev/docs/Sync/Intro).

The adapter documentation lists web LokiJS backed by IndexedDB and Node SQLite via better-sqlite3. Electron SQLite integration remains an adapter/integration task rather than a documented ready-made desktop path; a renderer web adapter is another possible route with different storage and security consequences. See [database adapters](https://watermelondb.dev/docs/Implementation/DatabaseAdapters).

Its sync protocol requires consistent pull snapshots, transactional pushes, validation of permissions, and handling server changes between pull and push. A library does not remove the need for domain conflict policy. See [sync backend requirements](https://watermelondb.dev/docs/Sync/Backend).

Selected recommendation: Electron clients communicate with NestJS on the clinic LAN; PostgreSQL on the designated clinic server stores the records. The office operates through an internet outage while that server and network remain available. RxJS can remain a framework dependency or serve actual event-composition needs. No workstation database is required by the confirmed requirement. Do not describe cached UI state as durable offline saving.

If the requirement later expands to each workstation surviving server/LAN failure, revisit a durable local database, per-user data scope, pending writes, conflict handling, encrypted storage, cache purge, and offline authorization leases. This is a separate architecture decision.

### Windows printing

Electron's main-process webContents API exposes printer enumeration, printing of its page, and PDF generation. It provides printer selection, page size, margins, and error callbacks. Use it for generated HTML certificates/prescriptions and PDF export when no existing PDF needs direct dispatch. See [Electron webContents printing](https://www.electronjs.org/docs/latest/api/web-contents).

pdf-to-printer sends an existing PDF to a Windows printer through SumatraPDF and supports printer discovery and print options. It is a reasonable optional Windows adapter when printing generated or imported PDF files, but it is not a PDF-generation library. Its documentation identifies Windows-only support. See [the maintained project documentation](https://github.com/artiebits/pdf-to-printer).

Proposed boundary: React requests a named document operation through a narrow typed preload API. The Electron main process validates sender, document identity, permitted operation, printer/options, and application-owned local file path before calling the printer adapter. Do not expose raw IPC, shell execution, arbitrary file paths, or the whole Node module to the renderer. Electron recommends renderer isolation, sandboxing, restricted navigation, and validation of every IPC sender. See [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

Printing can operate without internet when fonts, logos, templates, PDF assets, driver, and printer are local. Package and verify the selected printer engine with the installer. A successful submission should be recorded as submitted to printer, not proof that paper emerged. Keep issuance and print attempts separate so retries do not generate duplicate issued documents. Clear temporary clinical PDFs according to the selected retention policy.

### Discovery, deployment, and failure behavior

Use a remembered manually configured or paired clinic-server address first. Optional discovery can locate candidates, but discovery is not authentication: verify clinic/server identity before transmitting credentials or charts. Restrict inbound API access to the clinic network; PostgreSQL should not need a workstation-facing published port.

Docker Compose is useful for reproducible development or a prepared demo machine. Do not promise a one-click production Windows install until OS/build, memory, virtualization, Docker/WSL prerequisites, images, and offline installation have been tested. The official installation guidance defines supported Windows/virtualization requirements: [Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/). Current user facts establish Windows 10/11, not these prerequisites.

When the LAN/server fails, the selected client should clearly report disconnection and preserve the currently visible unsaved form where practical. It must not claim a server save succeeded. Provide an explicit paper/manual continuity process; cached memory is not a backup.

## Open decision frontier

Use the current confirmed outage, demo, deadline, shared registry, staff access plan, head role, authorship/corrections, synthetic data, and fixed-document answers as resolved roots. Ask only the next material decisions, grouped so the clinic can decide without choosing implementation details.

1. **Remaining laboratory details.** The staff access plan is accepted. Clarify only whether a laboratory result ordered by one discipline may also be read by the other and how historical lab attachments without a linked order are classified. Default to the owning discipline until the clinic establishes a sharing rule. Do not infer access to entire clinical charts.
2. **Remaining ownership details.** Finalized originals and attributed author corrections are selected. Confirm who owns a digitized historical entry or an attendant's vitals correction if the original author has no active account. Default to attributed imported records and a designated correction workflow rather than assigning historical content to the importing clerk.
3. **Minimum record fields, eligibility, and identity.** Obtain the clinic's registration, medical, dental, and laboratory forms. The deck's slide 3 explicitly identifies provincial government employees and dependents as the patient group; it does not establish whether the clinic also serves members of the public. Confirm whether the application must enforce eligibility or simply record patient category. Recommended hackathon default: demonstrate employees/dependents, require explicit linkage only for records categorized as dependents, and avoid an eligibility rejection rule until clinic policy is known. Confirm employee identifier, required fields, unknown values, and duplicate-review authority. Use employee-ID uniqueness only where verified; UUIDs do not detect duplicate people.
4. **Remaining print details.** Fixed prescription/certificate templates, editable purpose, synthetic demo data, and paper signatures are selected. The current reproduction inputs are the flattened form bodies and supplied unified header in `docs/headers/`; prefer the high-resolution JPEG for print. Record adoption of the shared header in the final specification and use its explicitly selected physical paper size. Keep authorized issuer identity, immutable issued snapshots, retention/reprint policy, and printer-margin/overflow checks explicit. No stored signature image is present in the supplied assets.
5. **Cloud branch.** Is any real cloud demonstration required before October 15, or is the complete clinic LAN flow sufficient? Proposed default: defer cloud and multi-clinic replication beyond the selected demo. If selected, separately decide permitted replication scope, central account authority, cloud operator, hosting approval, and attachment transfer. Historical full mirror does not authorize sending every chart or password hash to every server.
6. **Authentication and revocation.** Who provisions and disables accounts and assigns discipline? Proposed default: admin-created named accounts, local password verification, no public self-registration into clinical roles, authenticated server-side policy checks. WAN failure should not prevent local login for already provisioned users. If cloud authority is later added, define maximum acceptable stale permissions and a local emergency-disable procedure; disconnected servers cannot receive instant remote revocation.
7. **Paper digitization and attachments.** Which files are necessary in the demo, who may upload/classify them, and which chart owns each file? Proposed default: small explicit file uploads rather than scanner integration, protected downloads, file-type/size checks, no public upload paths. Resolve whether scanned charts stay as images, have structured transcription, or both.
8. **Reports.** Which existing report/form matters for the demonstration, and who may see it? Proposed default: authorized clinic counts with explicit date/encounter definitions; avoid inventing diagnosis analytics or cross-discipline disclosure from the deck's broad reporting aspiration.
9. **Backup and operational ownership.** Which PC hosts the server, who maintains it and backups, how much recent work may be lost, and how quickly must service recover? Proposed default: database plus attachment backup to separate protected media, daily scheduled backup, retention selected by clinic, and a restore rehearsal before real clinical use. Cloud replication, a Docker volume, and a second copy on the same disk are not independent backups.

## Engineering constraints that do not need a product vote

- Enforce discipline and ownership on every read, search, write, report, attachment, export, and print-related API. Broad cached responses cannot be secured by hidden tabs.
- Keep authentication hashes and secrets out of ordinary record DTOs and logs. Do not copy the example secrets from the transcript.
- Record actor, action, chart/document identifiers, and relevant version changes in an audit trail without dumping clinical payloads into general logs.
- If replication is later implemented, use durable change/outbox records, idempotent operation IDs, server-managed revisions/cursors, transactional application, and acknowledgment of the exact sent version. Never mark an edit made during an in-flight request as synced merely because its row ID was in the batch.
- Preserve deletion/amendment events, handle retries and schema versions, and route meaningful demographic/clinical conflicts to review. UUIDs prevent accidental primary-key collision, not duplicate patients or conflicting clinical content.
- Clear user-scoped client state on logout/account switch and invalidate it when permissions change. Decide any durable cache policy before introducing a local database.
- Static/headless checks are authorized. Interactive browser/device QA requires the user's confirmation of the shared resource under the supplied repository instructions.
