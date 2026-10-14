# clinic-demo-v1.1: one-way edge-to-cloud mirror

Status: **user-confirmed scope and accepted architecture amendment**, 2026-10-14, Asia/Manila. Supersedes clinic-demo-v1's cloud deferral; original approval history is preserved. Routes/behavior below are plans, not implemented or deployed features. A separate explicit build instruction remains required.

Exact user answers:

> Include mirroring in the October 16 demo

> One-way mirror; edge writes, cloud read-only (recommended)

## Outcome and ownership

October 16 includes a structured-record mirror from clinic edge to cloud. Clinic staff continue using edge over LAN; WAN/cloud failure never blocks local login, writes or printing. Backend owns transport, persistence, security, retry/recovery and proof in one additional standalone Backend ticket. Frontend #10 verifies edge UX during outage/recovery while Backend/API/database evidence proves cloud catch-up. No cloud portal, new cloud staff-login UI or renderer sync transport is required.

Use the same NestJS codebase with explicit EDGE/CLOUD deployment modes and separate PostgreSQL databases. Edge is the sole clinical write authority; cloud accepts trusted machine ingestion and denies staff clinical writes. This amendment creates no cloud resources or feature code.

## Included records and excluded secrets

Whitelist clinic-scoped structured demo records: shared registry; timestamped vitals; medical/dental/laboratory entries including drafts/status/finalized originals; original-linked corrections; immutable issued prescription/certificate snapshots and source references; minimum staff display/role/head/author/issuer identity needed for attribution. Preserve entity IDs, patient/author/discipline references and server revisions.

Exclude passwords/hashes, sessions, staff/machine tokens, infrastructure secrets, arbitrary tables, unapproved attachments/scans, signature images and private reference/mock images. Staff metadata is attribution, not replicated login authority. Headers/templates are deployed application assets, not clinical events. Use synthetic data only. No delete UI is added; if an existing approved deletion applies, mirror its versioned tombstone without resurrection.

## Durable delivery invariants

1. A local PostgreSQL transaction atomically commits the authorized domain write and immutable versioned outbox event containing that exact permitted record version. Failure rolls back both. Local requests never await cloud/WAN success.
2. The edge worker selects exact **unacknowledged committed events**, with durable delivery state across restarts. Never select only IDs above last acknowledgment: an earlier allocated sequence/ID can commit later and must not be skipped. Sequence/timestamps are not commit-order guarantees.
3. Send outbound authenticated HTTPS to configured cloud with bounded batches/timeouts, bounded backoff/retry, and durable pending state. Cloud failure/wrong acknowledgments clear no local work. Machine credentials stay server-only, outside renderer/payload. No inbound clinic database port, VPN or native logical-replication connection is required.
4. Cloud validates machine/clinic identity, schema/version/entity allowlist and reference IDs. Apply each accepted record version and its idempotency receipt atomically in a cloud transaction. Duplicate identical event delivery is harmless; same event ID with different content is a conflict.
5. Clinic-scoped entity identity and revisions prevent stale versions overwriting newer data/tombstones. Equal revision with different content is an explicit conflict. Preserve finalized originals, corrections and issued snapshots rather than overwriting immutable history.
6. Delivery/apply is dependency-safe for patient/staff/vitals/original-entry references. Missing dependencies stay unacknowledged/retriable until parents arrive. Never falsely acknowledge or discard a child, or fabricate clinical parents.
7. Acknowledge exact received event IDs and recognized/applied versions only after cloud commit. Edge acknowledges only those immutable sent events. A new edit during an in-flight request remains a distinct pending event; an entity-ID or highest-sequence acknowledgment cannot mark it delivered. Replay recovers a lost acknowledgment through idempotent receipts.
8. Bootstrap a consistent snapshot of allowed existing records in reference-safe order, then catch up concurrent committed outbox events. Snapshot completion alone cannot claim ready/caught-up: verify both baseline and relevant committed pending events. Authorized delivery state shows bootstrap progress, pending count, last confirmed acknowledgment and actionable failures without clinical payload/secrets.

## Read-only cloud and security

Only a dedicated authenticated edge machine may ingest for its assigned clinic. CLOUD mode denies staff clinical mutation routes; a staff token cannot call ingestion. Any exposed staff cloud read enforces the existing role/discipline/head scope and filtered DTOs with separately approved authentication, never mirrored credentials. No cloud staff portal/login is needed; controlled authorized API/database proof is sufficient.

Actual cloud transfer uses HTTPS/verified identity. The existing synthetic local HTTP development exception does not authorize insecure public-cloud transfer or real clinic data. A mirror is a secondary copy, not demonstrated independent backup/recovery. Production hosting/privacy/retention/backups remain separate scope.

## Planned contracts and example (not implemented)

Cloud POST /internal/mirror/events is machine-only and CLOUD-mode only. Every event carries clinicId, eventId, schemaVersion, entityType/entityId, exact revision, permitted operation and whitelisted immutable payload/reference IDs. Response acknowledges exact eventId/revision pairs after commit; conflicting/dependency-blocked/unrecognized events remain unacknowledged. No arbitrary JSON passthrough.

Synthetic planned request: {"clinicId":"synthetic-clinic","events":[{"eventId":"synthetic-event-1","schemaVersion":1,"entityType":"patient","entityId":"synthetic-patient","revision":1,"operation":"upsert","payload":{"fullName":"Synthetic Clinic Patient A","patientCategory":"employee"}}]}.

Expected committed response: {"acknowledged":[{"eventId":"synthetic-event-1","revision":1}]}. Dedicated machine authentication is supplied privately, outside this example. Staff/wrong-clinic/schema requests are denied. Every implemented public route receives working authenticated examples/end-to-end checks under AGENTS.

Edge GET /internal/mirror/status or an equivalent controlled Backend verification command exposes authorized nonclinical delivery state, never secrets. A controlled command/process may bootstrap; no new UI is inferred.

## Acceptance and proof

- Additional [Backend #11](https://github.com/aandremillan10/health-ier/issues/11) depends on #1/#3/#5/#7 and owns all invariants above. Backend #9 and Frontend #10 additionally depend on it. Current plan is eleven issues, six Backend/five Frontend; see [issue index](issue-index.md).
- Prove mirrored synthetic registry/vitals/discipline entries/corrections/issued snapshots and minimum attribution with no excluded credentials/sessions/attachments. CLOUD staff mutation and staff-as-machine ingestion attempts fail; any exposed staff read retains RBAC.
- Disable WAN/cloud while edge registration, vitals, consultation/correction and issuance/printing continue. Restore connectivity and verify eventual matching allowed record versions in cloud.
- Test duplicate replay/lost acknowledgment, worker restart, earlier allocated event committing after a later acknowledgment, missing-reference recovery, stale/equal-conflicting revisions/tombstones where applicable, edit during in-flight send and write during bootstrap. Acknowledge only exact committed sent events; no false caught-up state.
- Frontend #10 remains clinic edge UX/integrated evidence; no transport ownership or cloud portal. Other Frontend tickets remain contract-first, with Astra limited to future print-template presentation.
- Record actual synthetic IDs/revisions, checks/results, delivery/recovery evidence and gaps. Do not claim mirror implementation, deployment or production readiness from specs alone.
- October 16 acceptance requires evidence against a real authorized cloud-hosted endpoint. Two local containers are useful tests but do not prove edge-to-cloud delivery. Actual hosting/credentials/deployment are future build preparation with separate resource authorization; this planning task creates no paid resources or deployment. If no real endpoint is verified, record that mandatory demo criterion as unmet rather than relabeling local tests cloud proof.

## Sources and tradeoff

See [ADR-0002](../adr/0002-one-way-application-mirror.md). PostgreSQL [transactions](https://www.postgresql.org/docs/17/tutorial-transactions.html) underpin atomic local write/outbox and cloud apply/receipt units; [INSERT / ON CONFLICT](https://www.postgresql.org/docs/17/sql-insert.html) can support deduplication but does not replace revision/permission policy. Considered native [logical replication](https://www.postgresql.org/docs/17/logical-replication.html), [subscriptions](https://www.postgresql.org/docs/17/logical-replication-subscription.html), and [restrictions](https://www.postgresql.org/docs/17/logical-replication-restrictions.html). Outbound application-whitelisted delivery fits an office behind NAT/firewall and excludes auth authority; it requires application protocol/failure tests.

Bidirectional edits, provincial/multi-clinic merging, independent workstation databases/WatermelonDB, queue, imports, eligibility/family enforcement, inventory/dispensing, reports, inactive-author correction, full dental/lab workflows and template builder remain deferred.
