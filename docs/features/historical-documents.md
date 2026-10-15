# Historical patient documents and audit

The user authorized issues [#17](https://github.com/aandremillan10/health-ier/issues/17) and [#19](https://github.com/aandremillan10/health-ier/issues/19) on 2026-10-15, selected local MinIO/S3 and approved one-way scan mirroring to read-only Railway. See [ADR-0003](../adr/0003-historical-record-s3-mirror.md). These are implemented source contracts; deployment and packaged desktop verification are separate evidence.

## Access and file identity

Doctor: medical import/read. Dentist: dental import/read. Medtech: laboratory import/read. Head doctor: all-discipline read, medical import only. Clerk/attendant: no historical scan metadata/content. Server checks apply to every route and returned list. Uploader identity/time, SHA-256, canonical byte length and opaque storage identity are server-owned. The uploader may append a new record with `replacesId` and `replacementReason`; originals cannot be edited/deleted and each record has at most one immediate successor. New replacements can themselves be replaced. Concurrent replacements conflict rather than erase history.

Supported files are PDF, JPG and JPEG with a 10MiB decoded limit. Filename must be a safe display basename; type/extension/base64/structure/size are validated. PDF structure checks do not prove arbitrary PDF safety; the desktop renders inert bounded canvases. JPEG dimensions are checked before native decoding. File picking occurs in main: the renderer receives only a patient/session-bound temporary selection token, safe filename/type/size, then uploads metadata with the token. Tokens expire after 10 minutes and reset/logout destroys buffers. Retrieving preview bytes requires fresh server authorization; integrity is checked before they reach the renderer.

## Public API and working PowerShell examples

All routes require an EDGE staff bearer session and return structured safe errors. Set `$origin` to the trusted EDGE origin and obtain `$token` privately through the existing `/auth/login` contract. Use a synthetic PDF/JPEG only. These examples use a literal synthetic patient UUID; replace it with the selected synthetic patient's returned ID.

```powershell
$origin = 'https://192.168.1.35'
$patientId = '20000000-0000-4000-8000-000000000001'
$headers = @{ Authorization = "Bearer $token" }
$importId = [guid]::NewGuid().ToString()
$body = @{
  id = $importId
  discipline = 'medical'
  documentType = 'Historical chart'
  documentDate = '2026-10-01'
  description = 'Synthetic historical chart for verification'
  filename = 'synthetic.pdf'
  mimeType = 'application/pdf'
  contentBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes('C:/synthetic/synthetic.pdf'))
} | ConvertTo-Json
# POST /patients/:patientId/historical-documents => metadata, HTTP201.
# Retrying exactly this ID/body is idempotent; changing it under that ID conflicts.
$saved = Invoke-RestMethod "$origin/patients/$patientId/historical-documents" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
# GET collection => {documents,nextCursor}, up to 50 rows. Optional discipline/cursor.
$page = Invoke-RestMethod "$origin/patients/$patientId/historical-documents?discipline=medical" -Headers $headers
# GET metadata for one selected-patient record.
$metadata = Invoke-RestMethod "$origin/patients/$patientId/historical-documents/$($saved.id)" -Headers $headers
# GET content => {document,contentBase64}; does not print, export or invoke an OS handler.
$preview = Invoke-RestMethod "$origin/patients/$patientId/historical-documents/$($saved.id)/content" -Headers $headers
```

The four routes are exercised through HTTP in `server/test/historical-documents.e2e-spec.ts`, including wrong roles/patient, payload validation, retries, immutable replacement, storage failure, rollback/ambiguous commit and integrity failure. `/audit-events`, `/audit-events/actors` and `/audit-events/print` retain their existing typed contract; new coverage verifies exact metadata/no secrets, head-only query/actor lookup, sensitive view/failure actions and print outcome attribution.

`server/test/audit-sensitive.e2e-spec.ts` additionally exercises actual ClinicService/interceptor paths for patient open, clerk edit and author correction, preserving the original clinical findings and exact actor/patient/resource attribution. A failed audit write rolls back patient metadata and outbox and returns a safe failure.

## One-way machine intake

Existing machine token and clinic binding protect `POST /internal/mirror/historical-files` (CLOUD only). Body: `{clinicId,event,contentBase64}`. `event` is the exact existing outbox envelope with `entityType:'historicalDocument'`, revision1 and the metadata whitelist from `server/src/mirror-contract.ts`. Metadata contains no binary or storage credentials. This route stages verified bytes under a derived immutable key and returns `{stored:true}`; it does not acknowledge outbox delivery. The worker then calls the existing `/internal/mirror/events`, which verifies bytes/references before its receipt/ACK. Regular staff cannot invoke machine intake or write to CLOUD.

An authorized operator can exercise both routes with a synthetic event captured from the EDGE outbox (not a staff-facing endpoint):

```powershell
# $event is the exact persisted synthetic outbox envelope; $bytes are that
# record's SHA-verified local bytes; $machineToken remains private.
$machineHeaders = @{ Authorization = "Bearer $machineToken" }
$staging = @{ clinicId = $event.clinicId; event = $event; contentBase64 = [Convert]::ToBase64String($bytes) } | ConvertTo-Json -Depth 20 -Compress
Invoke-RestMethod "$cloudOrigin/internal/mirror/historical-files" -Method Post -Headers $machineHeaders -ContentType 'application/json' -Body $staging
$envelope = @{ clinicId = $event.clinicId; events = @($event) } | ConvertTo-Json -Depth 20 -Compress
Invoke-RestMethod "$cloudOrigin/internal/mirror/events" -Method Post -Headers $machineHeaders -ContentType 'application/json' -Body $envelope
```

Use the unchanged status/bootstrap/operator controls for pending delivery. A successful EDGE import confirms local storage/metadata/audit/outbox only, never CLOUD delivery.

## Local setup and orphan reconciliation

`compose.attachments.yaml` is an additive override for the existing production/laptop compose files. It adds a durable local MinIO volume, private network storage and an initializer creating a private fixed bucket plus bucket-scoped application account. Set private `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `HISTORICAL_S3_ACCESS_KEY`, `HISTORICAL_S3_SECRET_KEY` outside source; use explicit fresh project names for isolated tests. The pinned local MinIO is demo-only because upstream is archived. No new ports are published. Existing retained deployments are not changed automatically.

The feature bucket, account and policy must be privately owned by this setup. A successful initialization records a private credential/policy fingerprint in its separate state volume; repeating the same environment verifies existing resources and makes no account/policy changes. A preexisting name without that marker, changed credentials, or interrupted first setup causes a safe refusal. Reconcile ownership and complete/recover the partial setup explicitly; the initializer does not silently adopt or reset unrelated accounts. MinIO's console is disabled.

Before the first mutation, a successful authenticated bounded bucket listing must establish that the feature bucket is absent; user/policy inspections must explicitly report their known JSON not-found codes. The pinned client's missing-bucket stat output has no stable error code and is not interpreted as absence. Network, authentication, malformed or ambiguous inspection failures cause refusal. `server/src/historical-documents/initializer.spec.ts` exercises network faults at all three inspections, access denial, malformed output, existing resources and successful first/second runs with a mocked shell client; actual MinIO proof is recorded separately.

Cloud uses Railway managed S3 with `HISTORICAL_S3_ENDPOINT/BUCKET/REGION/ACCESS_KEY/SECRET_KEY` and `HISTORICAL_S3_FORCE_PATH_STYLE=false`; EDGE's local MinIO uses path style. Credentials never cross into renderer or mirror events. Separate durable backups must cover PostgreSQL metadata and local object data; mirroring is not backup/retention proof.

After failed compensation or uncertain commit, the server logs only a bounded opaque object identity. Reconcile on the corresponding authoritative server: enumerate the private historical object prefix with authorized operator tools, compare full keys against `HistoricalDocument.objectKey` (EDGE) or canonical keys from committed `MirrorEntity` historical metadata (CLOUD), and preserve every referenced object. Before deleting any unreferenced object, pause new scan imports/mirror ingestion or otherwise establish no in-flight operation uses it, repeat the database check, and obtain the deployment owner's cleanup authorization. Never delete by patient/display filename or by broad prefix. Resolve uncertain DB commits before cleanup; do not delete referenced bytes to make retries pass.
