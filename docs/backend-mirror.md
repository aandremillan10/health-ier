# Synthetic demo mirror operations

The EDGE PostgreSQL database remains the sole clinical authority. The same NestJS source runs in CLOUD mode with a separate PostgreSQL database; CLOUD accepts only a dedicated machine credential at `POST /internal/mirror/events`. The cloud stores explicit whitelisted records and immutable versions separately from the staff credential/session tables. This is synthetic demo delivery, not a production backup/retention claim.

## Configuration and setup

EDGE requires `DATABASE_URL`, `SERVER_MODE=EDGE`, `CLINIC_ID=synthetic-clinic`; outbound delivery additionally requires `MIRROR_ENABLED=true`, `MIRROR_URL=https://clinic-cloud-production-21ec.up.railway.app/internal/mirror/events` and a private `MIRROR_MACHINE_TOKEN` of at least 32 characters. CLOUD uses `SERVER_MODE=CLOUD`, the same clinic ID/machine credential, and its own private database URL. Never place machine credentials in renderer code, event JSON, Git, request examples, logs or screenshots. The generated demo credential is privately held at `C:/Users/ajapa/.codex/secrets/health-ier-demo/.env.mirror`.

Use the project's pinned Prisma CLI: `pnpm --filter server prisma:generate`, then `pnpm --filter server exec prisma migrate deploy --config prisma7.config.ts`. The Docker image generates the client, builds the Nest code, and runs `migrate deploy` before starting. The demo image retains build tooling for migration execution; production packaging is separate work.

Bootstrap existing allowed rows before enabling the worker. A repeatable-read transaction snapshots staff, registry, vitals, entries, corrections and documents, adds missing exact current snapshots, and requeues retained immutable transactional outbox history. Retained history supplies document/correction source versions when a new CLOUD begins empty. Reboot/replay preserves event IDs. Legacy rows manually inserted without their source outbox history cannot satisfy dependencies and stay pending; reconstructing unknown historical versions is outside this fresh demo migration.

## Working operator requests

Load the private file into PowerShell variables without printing it:

```powershell
$mirrorToken = ((Get-Content 'C:/Users/ajapa/.codex/secrets/health-ier-demo/.env.mirror' | Where-Object { $_ -like 'MIRROR_MACHINE_TOKEN=*' }) -split '=', 2)[1]
$edge = 'http://127.0.0.1:3000'
curl.exe --silent --show-error --fail-with-body --request POST --header "Authorization: Bearer $mirrorToken" "$edge/internal/mirror/bootstrap"
curl.exe --silent --show-error --fail-with-body --header "Authorization: Bearer $mirrorToken" "$edge/internal/mirror/status"
curl.exe --silent --show-error --fail-with-body 'https://clinic-cloud-production-21ec.up.railway.app/health'
```

Bootstrap returns `{"bootstrapped":true}`. Status contains only mode, bootstrap progress, committed pending count, caught-up flag, last confirmed ACK time and a safe failure code. A completed snapshot with pending events reports `caughtUp:false`. The status/bootstrapping routes require the dedicated machine credential; CLOUD bootstrap and EDGE ingestion are denied. Staff tokens cannot use these operations.

For a machine ingestion example, save this synthetic JSON as a temporary file and use the private token header above. Every timestamp and nullable field belongs to the exact whitelist; UUIDs are synthetic:

```json
{
  "clinicId": "synthetic-clinic",
  "events": [
    {
      "eventId": "895cfa11-1377-416a-95c3-2df697b1a584",
      "clinicId": "synthetic-clinic",
      "schemaVersion": 1,
      "entityType": "patient",
      "entityId": "3b472111-4faf-4976-a8ac-a66389216294",
      "revision": 1,
      "operation": "upsert",
      "payload": {
        "id": "3b472111-4faf-4976-a8ac-a66389216294",
        "revision": 1,
        "fullName": "Synthetic Operator Example",
        "sex": null,
        "address": null,
        "patientCategory": null,
        "employeeIdentifier": null,
        "dateOfBirth": null,
        "createdAt": "2026-10-14T00:00:00.000Z",
        "updatedAt": "2026-10-14T00:00:00.000Z"
      }
    }
  ]
}
```

```powershell
curl.exe --silent --show-error --fail-with-body --request POST --header "Authorization: Bearer $mirrorToken" --header 'Content-Type: application/json' --data-binary '@mirror-example.json' 'https://clinic-cloud-production-21ec.up.railway.app/internal/mirror/events'
```

Successful response: `{"acknowledged":[{"eventId":"895cfa11-1377-416a-95c3-2df697b1a584","revision":1}],"rejected":[]}`. Each event commits its exact version/current record and receipt atomically. Replayed identical IDs return the same ACK; conflicting event IDs or equal versions reject without applying. Dependency failures return safe per-event codes with no ACK, remain pending and retry. Whole-envelope clinic/schema failures return 403/400, and invalid machine authentication returns 401.

## Delivery and authorized outage proof

The worker selects committed rows with `acknowledgedAt=null`, bounded to 50 events, ordering by attempts then creation time so missing parents can pass blocked children. There is no last-sequence cursor. A 10-second HTTPS timeout, rejected redirects and a bounded 1–60 second retry delay preserve local pending work. The worker updates only exact sent IDs/revisions after validating every ACK. New versions committed during an in-flight send stay pending. No request to save local domain data awaits the worker.

To pause only this app's outbound mirror, run/restart EDGE with `MIRROR_ENABLED=false`. Exercise local clinic writes, verify durable pending events, then restore `MIRROR_ENABLED=true`. Shared internet, network adapters, firewalls and unrelated processes remain untouched. Compare allowed cloud IDs/revisions/content through an authorized Railway SSH database/operator command; do not add staff cloud login/read APIs for evidence.

## Railway resources

- Private project `health-ier-clinic-demo-v1-1`: `2683af6d-cdba-4611-bff9-204ff4285b10`.
- Environment `production`: `ba3ebb81-79cd-4e42-a111-ea2b27831d37`.
- CLOUD service `clinic-cloud`: `8c9acbcd-d287-430a-9509-5c5a4af6e9f5`.
- PostgreSQL service: `8bcadd08-3d66-49c9-b37f-a554684afd85`; private `${{Postgres.DATABASE_URL}}`, no public DB proxy.
- Persistent volume: `92e077b1-edc7-47b6-9545-bbeb4b396090`, Singapore region, 5 GB.
- HTTPS endpoint: `https://clinic-cloud-production-21ec.up.railway.app`.

Deploy current local source using `railway up --detach --yes --project 2683af6d-cdba-4611-bff9-204ff4285b10 --service 8c9acbcd-d287-430a-9509-5c5a4af6e9f5 --environment production`. `.railwayignore` excludes private files, generated/build output, docs and unrelated desktop source. Deployment alone is not verification; record the settled deployment and actual HTTPS/edge/operator comparisons in the evidence report.

## Verification

`pnpm --filter server test` exercises schema/secret allowlists, digest canonicalization, byte-safe machine authentication and secure transport configuration. With private `MIRROR_TEST_EDGE_URL`/`MIRROR_TEST_CLOUD_URL` pointing to newly provisioned dedicated databases with migrations applied, `pnpm --filter server test:e2e` exercises atomic rollback, immutable DB event content, lost ACK/restart, receipt failure rollback, late commit, in-flight writes, wrong ACK, event/equal/stale revision handling, dependencies/finalized protection, bootstrap replay/concurrent writes, and absence of cloud authentication authority. Without these explicit test URLs, live cases are skipped rather than silently touching the clinic database. Only the isolated test databases are cleared during empty-cloud bootstrap verification.

Physical printing, teammate renderer flows, production privacy/retention and independent workstation operation remain separate verification/scope.
