# Railway historical scan storage evidence

Investigation and approved bucket provisioning on 2026-10-15 through the user's Railway plugin. Following the maintenance finding below, the user selected **Railway managed S3-compatible cloud storage**. A new bucket was created; no existing application/database source, deployment, domain or retained data was changed. Only variable names and secret-redacted connection details were inspected. No patient payloads or secret values were read.

## Approved cloud bucket: actual result

The environment inventory had no buckets immediately before creation. `create_bucket` succeeded with name `clinic-historical-scans`, region `sin`, in the existing project/production environment below.

| Field                       | Observed value                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Railway bucket ID           | `e1be8f3d-f386-450b-9f0b-1a798f89fdd5`                                                                           |
| Railway reference name      | `clinic-historical-scans`                                                                                        |
| Physical S3 bucket name     | `clinic-historical-scans-a-pimq`                                                                                 |
| S3 API endpoint             | `https://t3.storageapi.dev`                                                                                      |
| Signing region              | `auto` (placement is `sin`)                                                                                      |
| Addressing                  | `virtual-host`; SDK `forcePathStyle=false`                                                                       |
| Credential handling         | OAuth returned `valuesRedacted=true`; values neither read nor copied                                             |
| Anonymous bucket-root check | Actual HTTPS GET `https://clinic-historical-scans-a-pimq.t3.storageapi.dev/`: 403, XML `AccessDenied`            |
| Application configuration   | Six finalized `HISTORICAL_S3_*` variables added using references and `skipDeploys:true`; no application redeploy |

Reference values for the future server configuration are `${{clinic-historical-scans.ENDPOINT}}`, `${{clinic-historical-scans.BUCKET}}`, `${{clinic-historical-scans.REGION}}`, `${{clinic-historical-scans.ACCESS_KEY_ID}}` and `${{clinic-historical-scans.SECRET_ACCESS_KEY}}`. References survive credential rotation; plaintext keys must not be copied. The managed bucket creation provisions the bucket directly, so no MinIO service, volume, public console, root account or separate bucket initializer is needed in Railway.

After backend naming confirmation, the additive update succeeded with `skippedDeploys:true` for `HISTORICAL_S3_ENDPOINT`, `HISTORICAL_S3_BUCKET`, `HISTORICAL_S3_REGION`, `HISTORICAL_S3_ACCESS_KEY`, `HISTORICAL_S3_SECRET_KEY` using those five references in order, and `HISTORICAL_S3_FORCE_PATH_STYLE=false`. Post-change inventory confirmed exactly one live bucket, the same two existing service deployment IDs and Postgres volume, no pending work, zero service issues and actual cloud HTTPS health 200 (`status=ok`, `mode=CLOUD`). The configured references apply at the next application deployment; running old code has not acquired the new feature.

403 verifies denial of anonymous bucket listing; it does not independently prove authenticated write/read or anonymous object denial for an existing object. No object was uploaded in this phase because OAuth deliberately withholds keys. Authenticated synthetic round-trip/hash/idempotence remains a future backend deployment proof. Managed storage adds usage charges; no exact bill was inferred.

## Existing deployment

| Item                            | Observed                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                         | `health-ier-clinic-demo-v1-1`, `2683af6d-cdba-4611-bff9-204ff4285b10`                                                                                                               |
| Environment                     | `production`, `ba3ebb81-79cd-4e42-a111-ea2b27831d37`                                                                                                                                |
| Region                          | `asia-southeast1-eqsg3a` (Singapore), one replica per service                                                                                                                       |
| Cloud server                    | `clinic-cloud`, `8c9acbcd-d287-430a-9509-5c5a4af6e9f5`; deployment `a9d0c2bd-9242-4cb3-8283-ca37724e731e`, SUCCESS, one running replica                                             |
| Cloud URL / actual health       | `https://clinic-cloud-production-21ec.up.railway.app/health`: HTTPS 200, `{"status":"ok","mode":"CLOUD"}`                                                                           |
| Cloud configuration             | Dockerfile `server/Dockerfile`, `/health`, 180s health timeout; plugin exposes no repository/image/commit source provenance                                                         |
| Pre-change cloud variable names | `CLINIC_ID`, `DATABASE_URL`, `MIRROR_MACHINE_TOKEN`, `NODE_ENV`, `PORT`, `SERVER_MODE`; no values inspected. Six additive storage variables were subsequently set as recorded above |
| Database                        | `Postgres`, `8bcadd08-3d66-49c9-b37f-a554684afd85`, image `ghcr.io/railwayapp-templates/postgres-ssl:18`; SUCCESS, one running replica                                              |
| Existing volume                 | `postgres-volume`, `92e077b1-edc7-47b6-9545-bbeb4b396090`, 5000MB, `/var/lib/postgresql/data`, same region                                                                          |
| Health summary                  | Two online services; zero warnings/critical issues/recent failures; no staged/applying changes                                                                                      |
| Pre-change storage              | No existing bucket or object-storage service; one managed bucket was subsequently created as recorded above                                                                         |

The user approved discipline-specific scan ACL and one-way scan mirroring with cloud read-only. This approval does not imply deploying new backend source to the retained EDGE or cloud server in this investigation.

## Current MinIO maintenance finding

Current upstream [repository](https://github.com/minio/minio) is archived (`archived: true` from GitHub API). Its [README](https://github.com/minio/minio/blob/master/README.md) explicitly says **“THIS REPOSITORY IS NO LONGER MAINTAINED”**, identifies source-only distribution, and states legacy binary releases receive no updates. The latest GitHub release returned was `RELEASE.2025-10-15T17-29-55Z`. This is material for a new deployment handling clinical scans; the lead was informed before mutation.

Railway verified-only template search returned none. Marketplace `SMKOEA` is unverified, maintained by Brody's Projects, and declares Railway-owned source repos for a Bucket plus Console service. It generates strong root credentials but provisions an unnecessary console and uses an unpinned build: inspected `railwayapp-templates/minio/main/Dockerfile` has `FROM golang:latest`, `ARG MINIO_VERSION="latest"`, `go install github.com/minio/minio@${MINIO_VERSION}`. The `minio` no-console template is also unverified; its declared image differs from its README and still has a dangling Console redirect reference. Neither template is ready for blind deployment.

Public registry manifest checks against Docker Hub and Quay returned 401; no image digest or availability has been verified. This is a probe limitation, not proof that an image is absent. No registry credentials were requested or disclosed.

## Superseded MinIO cloud proposal

The user chose managed Railway S3 after review. The following is retained only as the investigated alternative; **none of these MinIO cloud resources will be created**. The separately requested local EDGE MinIO remains a pinned synthetic-demo deployment, with the archived upstream maintenance risk recorded and no production-readiness claim.

Subject to the maintenance decision and final lead review:

1. Create exactly one new `minio` service in this existing production environment, one replica in `asia-southeast1-eqsg3a`, with a pinned, inspected image/source revision. Do not reuse or change Postgres/cloud source/config.
2. Attach a new `minio-data` persistent volume at `/data`, initially 5000MB. One volume/one replica is a single-node demo, not highly available storage or a backup. Volume storage plus continuously running service memory/CPU add Railway usage cost; size can grow but cannot shrink. No price estimate is claimed without workspace billing data.
3. Listen on `[::]:9000` for Railway IPv6 private networking, disable browser/console (`MINIO_BROWSER=off`), configure health `/minio/health/ready` with `PORT=9000`, no sleeping. Do not create public domain, TCP proxy, console service, or public admin endpoint.
4. Generate root identity/password inside Railway variables; never return values to reports or use root credentials in the application. Existing template-generated secret expressions demonstrate platform support, but direct variable API secret-expression behavior still requires confirmation before choosing that path. Keep credentials within Railway variable/reference boundaries.
5. Bootstrap a private `clinic-scans` bucket and a distinct application principal restricted to required bucket operations (`GetObject`/`PutObject` and prefix-scoped listing only where necessary; no admin/public policy). Use an idempotent initializer with bounded ready retries; it must refuse unexpected preexisting policy, never erase bucket/data, preserve credentials across restarts and not rerun destructive user creation. Store credentials in service variables and pass references to intake configuration at the future backend rollout. All bootstrap outputs must redact secrets.
6. Proposed cloud-only SDK variables: `S3_ENDPOINT=http://minio.railway.internal:9000`, `S3_REGION=us-east-1`, `S3_BUCKET=clinic-scans`, `S3_FORCE_PATH_STYLE=true`, and references for bucket-scoped `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`. Exact names remain coordinated with backend implementation; do not set them on the old server yet.
7. EDGE keeps authoritative local MinIO for LAN saves. Required cloud mirroring sends authenticated bytes through the existing cloud intake HTTPS boundary; cloud intake writes its private bucket. Staff-facing cloud operations remain read-only. No public S3 ingress, root secret on EDGE, or browser direct object URL is required by this design.

## Superseded MinIO checklist: not executed

These checks belonged to the rejected MinIO cloud alternative and are not current completion requirements or executed proofs. The actual managed-bucket evidence and limits are recorded above.

- Railway deployment healthy; private endpoint resolves/reachable from a same-project isolated checker; console has no domain/proxy and browser disabled.
- Empty private bucket exists; anonymous access denied; scoped application principal cannot administer server/access other buckets.
- Synthetic nonclinical object upload/download hash matches; restart redeploy preserves object; cleanup deletes only owned synthetic probe object. No patient transfer.
- Existing server HTTPS health still 200; Postgres remains healthy; old deployment IDs/source/variables unchanged.
- Record new resource IDs, pinned image/revision, volume, endpoint names, health results and bootstrap durability. Never record credential values.
- When new backend rollout is separately authorized, verify retry/idempotence/one-way ownership and cloud read-only with real authenticated synthetic mirror flows. Resource creation alone is not end-to-end attachment-mirroring proof.

The plugin exposes service/volume/template/variable provisioning but no remote exec facility. This initializer limitation applied to the superseded MinIO approach; managed bucket provisioning avoids it.

## Existing mirror trace and attachment recommendation

Read actual `server/src/database/outbox.ts`, `server/src/mirror-contract.ts`, and mirror service/worker/controller before advising the backend worker. Existing writes enqueue snapshots transactionally. `MirrorWorker` is EDGE-only and requires `MIRROR_ENABLED=true`; retries back off from 1s to 60s. `httpsTransport` requires HTTPS, no redirects, and exact `/internal/mirror/events`; sends machine bearer authentication with a 10s timeout. No cloud credentials need to leave cloud intake.

`MirrorService.deliver` selects up to 50 events ordered by attempts/creation, caps the JSON batch at 512KiB, validates response acknowledgments against sent event/revision, and retries rejected events. `apply` serializes clinic receipt/revision checks with PostgreSQL advisory transaction lock, checks dependencies and preserves immutable originals. `bootstrap` snapshots the six original entity types and resets historical acknowledgments; attachment metadata/bytes are currently absent. Cloud endpoints are machine-authenticated; mutation is CLOUD-only while bootstrap is EDGE-only.

Recommended integration communicated directly to the backend worker: keep attachment metadata in the durable transactional outbox, including immutable attachment/patient/discipline/author identity, size/hash/content type and stable object key. Deliver a separate bounded authenticated binary upload to cloud intake before acknowledging metadata; never base64-embed a 10MiB attachment in the 512KiB JSON batch. Validate actual byte count, MIME signatures and digest at intake, deterministic key/checksum for retries, parent patient/staff dependencies and duplicate conflict. Cloud intake owns S3 references and writes the private managed bucket; staff cloud routes remain read-only. Edge local object must be durable before local save completes; cloud failure only leaves outbox pending. Bootstrap must replay retained edge object bytes, not only metadata. No new mirror/EDGE deployment or transfer was executed here.
