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

The worker selects committed rows with `acknowledgedAt=null`, bounded to 50 events and a 512 KiB UTF-8 JSON envelope, ordering by attempts then creation time so missing parents can pass blocked children. The Nest JSON parser permits 1 MiB, so valid large/Unicode clinical versions split into deliverable batches. An oversized individual event remains pending with `EVENT_TOO_LARGE`; unknown remote error strings never enter status. There is no last-sequence cursor. A 10-second HTTPS timeout, rejected redirects and a bounded 1–60 second retry delay preserve local pending work. The worker updates only exact sent IDs/revisions after validating every ACK. New versions committed during an in-flight send stay pending. No request to save local domain data awaits the worker.

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

Run `server/scripts/verify-mirror-cloud.ps1` for ten real HTTPS curl assertions covering health, exact ACK/replay, staff-token ingestion denial, wrong clinic/schema, excluded secret fields, conflicting event content, CLOUD bootstrap denial and unauthenticated status denial. Compare actual EDGE allowed versions with controlled operator output:

```powershell
$env:DOTENV_CONFIG_PATH = 'C:/Users/ajapa/.codex/worktrees/backend-demo/health-ier/server/.env'
node server/dist/mirror/operator.js validate-edge
# Run inside CLOUD; output contains IDs/revisions/digests and authentication-row counts only.
ssh -i C:/Users/ajapa/.ssh/health-ier-demo -o BatchMode=yes -o ConnectTimeout=20 clinic-cloud-production-21ec.up.railway.app@ssh.railway.com 'node /workspace/server/dist/mirror/operator.js inspect' > cloud-comparison.json
node server/dist/mirror/operator.js compare cloud-comparison.json
```

Each parallel verification process needs its own two fresh test databases and private URL file; running two suites against the same fixture races the intentionally cleared CLOUD tables. Task operator SSH key copies are private at `C:/Users/ajapa/.codex/secrets/health-ier-demo/railway-demo` and `C:/Users/ajapa/.ssh/health-ier-demo`; its registered public key is named `health-ier-synthetic-demo`. The initial local CLI account differed from the connected Railway account; after the user's explicit re-login, exact project access and local-source upload were verified.

## Verified real-cloud evidence — 2026-10-14

Final runtime source: `0b9989c813ffe770eec138a27167578d72565e7a` on `master`; server includes the final numeric-storage validation, safe HTTP parser and byte-bounded mirror. Railway deployment **`a9d0c2bd-9242-4cb3-8283-ca37724e731e`** settled **SUCCESS at 12:24:36.452 UTC**, using that exact local source upload. Prior foundation deployments `25418424-de4e-4264-808a-f45a01f16c0e`, `a8c579c7-fc22-45d0-be8a-7a9e4894cbb4` and combined `1e25c004-1823-46c0-8499-03fe8bb74895` were staging steps; final acceptance below uses the integrated code.

The final local EDGE uses the existing dedicated PostgreSQL database `healthier_demo_core` at loopback port 55432, separately from Railway PostgreSQL. The user's existing `D:/health-ier/server/.env` was preserved. Private runtime configuration is `C:/Users/ajapa/.codex/secrets/health-ier-demo/.env.edge-mirror`, containing the local database configuration and dedicated machine token, real verified HTTPS mirror URL and `MIRROR_ENABLED=true`. The private `.env.edge-mirror-outage` retains only the task's deliberate failed outbound URL configuration. No secret values are recorded here.

All times below are **UTC on 2026-10-14**; Manila is UTC+8.

| Check                                         | Observed result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Machine-controlled EDGE bootstrap/status      | `POST /internal/mirror/bootstrap` returned 200/`bootstrapped:true`; baseline completion with 57 pending versions reported `caughtUp:false`.                                                                                                                                                                                                                                                                                                                                                     |
| Actual baseline delivery/operator comparison  | All 57 retained EDGE versions and latest records matched real Railway IDs/revisions/canonical payload digests. Counts: staff 8, patient 12, entry 15, vitals 12, correction 6, document 4. EDGE pending 0/caughtUp true; last ACK `12:23:19.705`.                                                                                                                                                                                                                                               |
| Final-source HTTPS boundary proof             | `verify-mirror-cloud.ps1 -EdgeCredentialsFile C:/Users/ajapa/.codex/worktrees/backend-demo/health-ier/.private/demo-credentials.json` passed 14 curl assertions, including actual valid EDGE clerk-session rejection on CLOUD `POST /patients` (403) and ingestion (401), exact ACK/replay, clinic/schema/secret-field rejection, conflicting event-ID rejection, CLOUD bootstrap denial and authenticated operator boundaries. Credentials/tokens were neither printed nor copied to evidence. |
| Application-only delivery fault               | At `12:26:33`, own EDGE process restarted with enabled worker and `MIRROR_URL=https://mirror-outage.invalid/internal/mirror/events`. Shared internet, network adapters, firewall, database service and other applications stayed available. This is configured outbound failure, not physical WAN disconnection.                                                                                                                                                                                |
| Clinic work during failed delivery            | Core `verify-live.ps1` completed **87 curl assertions** by `12:28:03.032`, covering local login/roles, registration/update, vitals/consultation draft/edit/finalize/corrections, prescription/certificate preview/issue/read/reprint and logout/invalidation. It committed **16 new exact versions**. EDGE status reported pending 16, `caughtUp:false`, `DELIVERY_UNAVAILABLE`, and the unchanged prior last ACK. Railway receipts/versions stayed 62 while the local work queued.             |
| Durable worker restart and automatic recovery | Stopped only the task's fault process PID 38916, restored verified HTTPS, and started the exact same ROOT source with the enabled worker at `12:29:20`. Without a manual operator flush, all 16 pending versions were acknowledged by `12:29:22.768`; status was pending 0/caughtUp true/lastError null.                                                                                                                                                                                        |
| Actual recovered content/version comparison   | Authorized SSH `inspect` plus local `compare` passed **73/73 retained versions and all latest IDs/revisions/payload digests**: staff 8, patient 15, entry 20, vitals 16, correction 8, document 6. Cloud staff-authentication and session tables each had **0 rows**.                                                                                                                                                                                                                           |
| Replayed baseline/history                     | A second machine bootstrap requeued all 73 exact retained events. The automatic worker caught up by `12:31:12.353`; another operator comparison passed 73/73 and cloud version/receipt counts remained **78**, proving replay did not duplicate versions or receipts.                                                                                                                                                                                                                           |
| Post-restart fresh client                     | `verify-persistence.ps1` passed: both issued IDs/snapshots and the preserved finalized consultation/source revision remained readable through a new authorized session.                                                                                                                                                                                                                                                                                                                         |
| Private source exclusions                     | Both `.railwayignore` and `.dockerignore` explicitly exclude `.private`, nested `.private`, `*.private`, `.env` and `.env.*`. Authorized inspection of the prior deployed filesystem found none of the private candidate files/directories; final upload used the hardened exclusions without `--no-gitignore`.                                                                                                                                                                                 |

The real CLOUD contains **78 versions/receipts**, comprising the **73 authoritative EDGE versions** plus **five explicitly identified synthetic machine-ingestion smoke-test patient records**. Those contract-test records were created directly by the authorized verification script, separately from the local clinic workflow. The count difference is not unacknowledged or missing clinic history.

Selected records created during the delivery fault:

| Record                                                                    | Synthetic ID                           | Final revision |
| ------------------------------------------------------------------------- | -------------------------------------- | -------------- |
| Patient                                                                   | `806ace6f-3f3e-4dfa-bb2d-3c61d75bf189` | 2              |
| Vitals, preserved finalized original with linked correction               | `2c12391f-13be-42ed-8149-61439235cf0a` | 4              |
| Medical consultation, preserved finalized original with linked correction | `5c98cd73-31a2-4048-adb0-444d108d0487` | 4              |
| Issued prescription                                                       | `57c64be6-2c11-4651-bcfb-1c407a340a1a` | 1              |
| Issued medical certificate                                                | `803856df-558c-41e8-a96f-1af39189b277` | 1              |

Operator comparison files (IDs/revisions/digests and counts only) remain private under `C:/Users/ajapa/.codex/secrets/health-ier-demo/`: `cloud-baseline-comparison.json`, `cloud-outage-comparison.json`, `cloud-recovery-comparison.json`, and `cloud-replay-comparison.json`. Core API evidence is `C:/Users/ajapa/.codex/worktrees/backend-demo/health-ier/.private/api-evidence.json`, containing synthetic IDs only.

The exact final ROOT verification passed `pnpm check` with **38 app tests, 27 server unit tests and 12 server end-to-end tests**, with no skips under its owned live database and broker configuration; Electron build also passed. The 12 server end-to-end tests contain **seven mirror PostgreSQL cases plus five HTTP parser cases**. Mirror cases assert domain/outbox rollback and DB event immutability, cloud receipt/apply rollback, lost ACK/restart replay, late commit after another ACK, in-flight edit/exact-ACK rejection, missing-reference recovery, stale/equal/event conflicts, finalized/stable identity preservation, Unicode document batch splitting, safe error codes, consistent bootstrap with a concurrent write, retained source history and secret/authentication exclusions. Separate test databases were used for concurrent workers after a shared-fixture race was identified; isolated reruns passed. There are no approved deletion routes/tombstones, so resurrection-specific deletion tests do not apply to this upsert-only demo.

Current local service: **PID 36052**, unified exec **session 55943**, port 3000, real HTTPS worker enabled. To restart the same authorized demo setup without changing the user's root environment file:

```powershell
$env:DOTENV_CONFIG_PATH = 'C:/Users/ajapa/.codex/secrets/health-ier-demo/.env.edge-mirror'
node D:/health-ier/server/dist/main.js
```

No interactive renderer or physical printer operation was performed for this mirror proof. Document issuance/retrieval/reprint identity and privileged broker behavior were checked; physical paper output, clinic LAN device deployment, teammate renderer integration and production privacy/retention/backups remain unverified or separately scoped. The cloud mirror is not claimed to be production-ready backup infrastructure.
