# Laptop EDGE HTTPS and packaged workstation proof

Status: executed on 2026-10-15. The laptop EDGE deployment and real packaged Electron HTTPS flow work. All 18 guide cases are accounted for: **12 passed, 3 partial, 3 failed**. The layout, PDF submission and Celsius failures remain unresolved; the working server and synthetic data are retained for ongoing QA.

Later EDGE update, 2026-10-15 16:27 Asia/Manila: the user authorized refreshing the retained backend. Merged source `ef496bf3f9fd12aaa2147945c697f7b340930d6a` now runs in image `sha256:4e1a07ddd498793a0980e93baa4964db91512f9e98d8c34a5bd76168c86a12ed`, with private local MinIO and eight applied migrations. Existing PostgreSQL/Caddy containers, volumes, original environment and Caddyfile were preserved. The new scan/audit API passed a bounded synthetic integration probe; [rollout evidence](../verification/guided-onboarding-postmerge-2026-10-15/server-readiness.md) records exact checks, backup and limitations. Use the updated [Resume this run](laptop-edge-setup.md#resume-this-run) command. The 18-case results below remain the historical `b974375` desktop baseline; they are not new-package passes. After the user manually opened exact `5631a43`, the desktop owner completed actual HTTPS sign-in as Synthetic Clerk using official `set_value` input plus Tab/Return; the Clinic LAN badge and last connection check passed. Coordinate clicks still fail with `GetLastError87`, while keyboard-controlled native workflow QA is in progress. CLOUD scan intake is not deployed, and EDGE mirroring stays disabled.

For copyable numbered instructions and the exact retained package launcher, use [operator setup and resume steps](laptop-edge-setup.md). The sections below record this run's configuration, diagnostics and results.

## Scope and identities

This run reverses the earlier [LAN guide](../lan-tls-setup.md): the laptop hosts EDGE, PostgreSQL and Caddy; the workstation runs the packaged Electron client. Earlier guide observations remain historical evidence.

| Item                      | Value / status                                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source parent             | `master`, `b974375123c5afa5be2721d69cffc8c68d945811`                                                                                                                                                       |
| Laptop                    | `192.168.1.35`, Windows account reported as `windows\ajapa`                                                                                                                                                |
| Workstation               | Ethernet `192.168.1.95`, observed locally                                                                                                                                                                  |
| Laptop SSH                | TCP 22 reachable; ED25519 fingerprint separately confirmed by user: `SHA256:Q5OdRrSAP5Mekp+7RGs8Ji9LjwfoWAnda9sCrucHUAg`; strict public-key authentication passed as `windows\ajapa` on hostname `WINDOWS` |
| Public application origin | `https://192.168.1.35`                                                                                                                                                                                     |
| Data                      | Fresh synthetic run only; no existing volumes, credentials or records reused/reset                                                                                                                         |
| Cloud mirror              | Disabled in this isolated proof; no cloud delivery claim                                                                                                                                                   |

## Read-only laptop preflight

After SSH identity verification and authorized key login, run these on the laptop through that verified connection. Do not print environment files, Docker inspect environment values, credential files or private keys.

```powershell
whoami
Get-NetIPConfiguration
Get-NetConnectionProfile
docker version --format '{{.Server.Os}}'
docker compose version
docker ps --format 'table {{.Names}}\t{{.Ports}}'
Get-NetTCPConnection -State Listen -LocalPort 443 -ErrorAction SilentlyContinue
Get-NetFirewallRule -Name 'Healthier-Laptop-HTTPS-*' -ErrorAction SilentlyContinue
```

Require the expected Windows user/IP, trusted Private LAN profile, running **Linux** Docker engine, Compose >= 2.24.4 (`!reset` support), and free laptop TCP 443. Preserve existing services and firewall rules. Docker Desktop must be running under its owning Windows session; installation alone does not establish SSH-session engine access.

## Fresh project and private files

Choose a fresh run such as `20261015t130000`; verify its directory and Docker project/volume names do not exist before creating anything. Use laptop path `C:\Users\ajapa\HealthierLanProof\<run>\source`, Compose project `healthier-laptop-<run>`, database `healthier_demo_laptop_<run>` (letters, digits and underscores only), and image tag equal to the run. Copy the exact reviewed source using verified SSH. Preserve this source revision and configuration alongside the deployment; do not use an existing checkout or deployment directory.

This execution selected run `20261015t1230d6a1`, source directory `C:\Users\ajapa\HealthierLanProof\20261015t1230d6a1\source`, project `healthier-laptop-20261015t1230d6a1` and database `healthier_demo_laptop_20261015t1230d6a1`. Both project containers and volumes were absent before creation. Existing Supabase/Topicvane/API resources were preserved. The transferred baseline archive (parent source plus reviewed laptop deployment files) matched SHA-256 `4F7AE3D21DAB84879408D8EF101EC2AE39D43F8527498525031C62DCF836E702`; the later Dockerfile amendment is recorded below.

Create `.private/laptop-proof` under this fresh checkout. Restrict the new `.private` tree to the intended laptop account and SYSTEM with `icacls` before writing secrets; inspect resulting ACLs. Generate a fresh random hexadecimal PostgreSQL password privately (hex avoids URL/Compose escaping issues), then write a private `.private/laptop.env` with these keys. Never paste real values into chat or command output:

```dotenv
DEPLOY_RUN=REPLACE_WITH_FRESH_RUN
LAPTOP_IP=192.168.1.35
CLINIC_ID=synthetic-clinic-laptop
POSTGRES_DB=healthier_demo_laptop_REPLACE_WITH_FRESH_RUN
POSTGRES_USER=healthier_laptop
POSTGRES_PASSWORD=REPLACE_WITH_PRIVATE_RANDOM_HEX
DATABASE_URL=postgresql://healthier_laptop:REPLACE_WITH_SAME_PRIVATE_RANDOM_HEX@postgres:5432/healthier_demo_laptop_REPLACE_WITH_FRESH_RUN
```

The default production Compose file is extended by `compose.laptop.yaml`: API host ports are removed, PostgreSQL has no published ports, and Caddy publishes only laptop-IP TCP 443. Caddy port 80 and admin port 2019 remain unpublished. Named PostgreSQL and CA/config volumes inherit the fresh explicit project name. CA private keys remain in laptop Docker storage. Review existing broad firewall allowances; one narrow rule cannot cancel another broad allowance.

## Deployment sequence

In laptop PowerShell at the fresh checkout, use the same explicit project and private environment file on **every** command:

This laptop's Docker Desktop credential helper cannot access its Windows credential session through SSH. A dedicated client configuration uses anonymous access to public Docker Hub images; existing Docker credentials/configuration remain untouched. Create the following only inside this run's already restricted `.private` directory, then set these process-only variables in each SSH command session. An empty `auths` map is insufficient because Docker automatically detects the Windows credential helper.

```powershell
$dockerClient = Join-Path (Get-Location) '.private/docker-client'
# First creation only; preserve this file on later commands.
New-Item -ItemType Directory -Path $dockerClient | Out-Null
[IO.File]::WriteAllText((Join-Path $dockerClient 'config.json'), '{"auths":{"https://index.docker.io/v1/":{}}}', (New-Object Text.UTF8Encoding($false)))
$env:DOCKER_CONFIG = $dockerClient
$env:DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
```

```powershell
$run = 'REPLACE_WITH_FRESH_RUN'
$project = "healthier-laptop-$run"
$compose = @('--project-name', $project, '--env-file', '.private/laptop.env', '-f', 'compose.prod.yaml', '-f', 'compose.laptop.yaml')
docker compose @compose config --quiet
docker compose @compose build server
docker compose @compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose @compose up -d --wait postgres server
docker compose @compose --profile seed run --rm seed
docker compose @compose up -d --wait caddy
docker compose @compose ps
```

Stop on any nonzero exit code before proceeding. The server image applies versioned migrations on startup. The one-shot seed uses the built server image and joins the PostgreSQL container's network namespace; its loopback database URL satisfies the existing synthetic-only seed guard without publishing a database port or changing application safety checks. Its private bind mount writes eight random staff credentials to `.private/laptop-proof/credentials.json`; never print that file. Preserve it with this database. A rerun preserves existing matching accounts; do not reset/reseed an existing deployment to fix access.

### Observed image prerequisites and verified artifact fallback

The exact Node base is Linux amd64 `node:24.13.0-bookworm-slim`, digest `sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f`. It lacked `openssl` and `/usr/lib/x86_64-linux-gnu/libssl.so.3`. Prisma warned and selected OpenSSL 1.1. The canonical `server/Dockerfile` now installs `openssl` (which also installs `libssl3`) before generation; its transferred SHA-256 is `9779DCC844C1DEA2B94F16A3ABDFDC79FC8D537E34B1A4F61B52705B151D7F3B`. Generation then selected the correct OpenSSL 3 target.

The laptop container could retrieve artifact headers but its complete engine download stalled; a separate bounded full-body fetch timed out after 30 seconds. Workstation Schannel curl downloaded the identical official artifact in about 1.2 seconds with normal TLS verification. Both compressed and decompressed SHA-256 values matched the publisher's separate HTTPS checksum files:

| Public artifact              | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `schema-engine.gz`           | `b7210b525a6e592c0d5db7e7d48edbc0f334e14e212af7af11c0d4a8de755a31` |
| Decompressed `schema-engine` | `29557c21d47da6f1695ec1a747cb6c607dade5e44e8b3e4fa687bd4dc226956d` |

Download and checksum URLs share this exact official prefix: `https://binaries.prisma.sh/all_commits/0edf323efd1d98336f3f0a68684b56f689b900d3/debian-openssl-3.0.x/`. Append `schema-engine.gz`, `schema-engine.gz.sha256` or `schema-engine.sha256`. Download through verified HTTPS, compare the compressed checksum, decompress with `System.IO.Compression.GZipStream`, compare the raw checksum, and transfer that public binary through pinned SSH. Never set checksum-ignore or TLS-bypass variables.

For this run, ignored `.private/prisma-engine` contains **only** the verified raw public `schema-engine`. Ignored `.private/Dockerfile.laptop-cache` derives from the canonical amended Dockerfile by inserting these lines immediately before its Prisma generation/build instruction:

```dockerfile
COPY --from=prisma-engine /schema-engine /usr/local/bin/prisma-schema-engine
RUN chmod 0755 /usr/local/bin/prisma-schema-engine
ENV PRISMA_SCHEMA_ENGINE_BINARY=/usr/local/bin/prisma-schema-engine
```

The derived Dockerfile SHA-256 is `2F1B7D0C7746C175F807D0FB80FEC544B53BB43170796CF8EC2240F65BC8E1BF`. Architecture was verified as `amd64`. Its explicit executable permissions support the existing non-root runtime user `node`; the environment points both generation and later migrations to the same verified engine. The exact fallback build command, run with the dedicated Docker client environment above, replaces the normal Compose build for this run:

```powershell
docker build --build-context prisma-engine=.private/prisma-engine --load -t health-ier-laptop-edge:20261015t1230d6a1 -f .private/Dockerfile.laptop-cache .
```

Only the single-file named context enters this build; the parent `.private` directory and its environment/credential files remain excluded. Temporary download diagnostics were removed from the canonical Dockerfile before this build. This fallback generated Prisma successfully and compiled 80 server files; final image/runtime results are recorded below.

The first runtime attempted to download pnpm again: Corepack's build-time root cache was unavailable to runtime user `node`. The canonical Dockerfile now invokes the already installed Prisma CLI directly: `node node_modules/prisma/build/index.js migrate deploy --config prisma7.config.ts`, then `node dist/main.js`. The rebuilt final image is `sha256:1489e617e4870e07918f27227182d8747f0ac6cfc041ac6b090ccb0c608d01ee`; server inspection confirms user `node`, running and healthy. An actual `migrate status` through that runtime CLI reports seven migrations and an up-to-date schema. Seeding then created eight synthetic accounts successfully. No production data or existing database was reset.

The user separately reported their workstation npm registry as `https://mirrors.tencent.com/npm/`. This is user-reported context; this run did not change a global registry or rebuild the completed image for that preference. The observed npm install delay and the later Prisma CDN artifact stall were distinct.

Executed after root review: inbound allow rule `Healthier-Laptop-HTTPS-20261015t1230d6a1` for TCP 443, local address `192.168.1.35`, remote address **only** `192.168.1.95`, interface `Wi-Fi`, Private profile. Keep Windows Firewall enabled. Inspect existing broad rules and verify external exposure through negative port checks; do not change router settings. SSH rule narrowing is separate from application HTTPS. Docker Desktop's actual Windows forwarding behavior must be verified before claiming these scopes hold.

## Public CA verification and approved client trust

Copy **only** `/data/caddy/pki/authorities/local/root.crt` from the named Caddy container to the fresh laptop proof directory. Hash it on the laptop, transfer that public certificate through fingerprint-verified SSH, and compare the full SHA-256 file hash on the workstation. Do not copy CA keys, entire Caddy volumes, server environment files or database secrets.

Before importing the verified public root, record a workstation HTTPS untrusted-CA failure. After root review, import only that root to the intended workstation user's `CurrentUser\Root` store; record its certificate thumbprint and whether it pre-existed for precise later cleanup. Restart Electron after trust changes. Do not disable certificate validation.

Use Windows Schannel curl for independent checks:

```powershell
C:\Windows\System32\curl.exe --version
C:\Windows\System32\curl.exe --fail --silent --show-error --max-time 10 https://192.168.1.35/health
C:\Windows\System32\curl.exe --fail --silent --show-error --max-time 10 --resolve 'clinic-wrong.invalid:443:192.168.1.35' https://clinic-wrong.invalid/health
Test-NetConnection 192.168.1.35 -Port 3000
Test-NetConnection 192.168.1.35 -Port 5432
Test-NetConnection 192.168.1.35 -Port 2019
Test-NetConnection 192.168.1.35 -Port 80
```

Require EDGE health through the actual Electron path with normal TLS validation, wrong-identity failure before HTTP success, and unreachable plaintext/API/database/admin ports. The commands above record independent Schannel behavior; on this machine its internal-CA revocation limitation below prevents a default curl success, and must not be bypassed to obtain a pass. Node's explicitly verified-CA check and Electron's own results are recorded separately.

Launch the packaged application with `HEALTH_IER_SERVER_URL=https://192.168.1.35` and `HEALTH_IER_ALLOW_SYNTHETIC_HTTP=false` in its process environment. Packaged applications do not load development `app/.env` automatically. Transfer the synthetic staff credential file privately through verified SSH to a new workstation proof directory with restricted ACLs; keep credentials out of screenshots, logs and renderer configuration.

### Executed TLS and trust evidence

Initial IP-address clients omitted SNI, while Docker NAT gave Caddy a different local address. Caddy obtained the IP certificate but could not select it for that handshake, producing an internal TLS alert (Schannel misleadingly reported an LSA error). An explicit-SNI diagnostic succeeded with full chain validation. The final global `default_sni {$LAPTOP_IP}` selects the existing IP certificate for clients omitting SNI; it does not change client identity or trust validation. This is the documented [Caddy default SNI option](https://caddyserver.com/docs/caddyfile/options#default-sni). The final Caddyfile SHA-256 is `35B17F9969AF9D16BE8A2C73E34300A1DCAC7C490636D15EC8A3B2970C6338FE`; it was validated and reloaded only inside this project's Caddy container.

Before trust import, ordinary Schannel curl correctly failed with exit 60 `SEC_E_UNTRUSTED_ROOT`. Node's default trust also rejected the issuer. With only this verified public CA supplied explicitly, Node HTTPS with `rejectUnauthorized: true` returned HTTP 200 `{"status":"ok","mode":"EDGE"}`; Node's built-in hostname verifier rejected `clinic-wrong.invalid` with `ERR_TLS_CERT_ALTNAME_INVALID`. The CA fingerprint remained unchanged through the Caddy correction.

The user explicitly approved importing this exact public CA. It was absent beforehand and was added only to `CurrentUser\Root` for `AJ-DESKTOP\ajapa`. The exact stored certificate was verified through both the .NET X509 store and PowerShell's certificate provider; `HasPrivateKey` is false. The private trust record retains the account SID. `LocalMachine\Root` was not modified.

| Public CA identity      | Verified value                                                     |
| ----------------------- | ------------------------------------------------------------------ |
| Subject / issuer        | `CN=Caddy Local Authority - 2026 ECC Root`                         |
| Public PEM file SHA-256 | `A478B6C27A6F5FFB51A4D60E58199161A5D5C452D338C689668DEBD972911D5A` |
| Certificate thumbprint  | `6CF95CEF5B4E065507BE3203B86F0ACEE2C4A91A`                         |
| Validity UTC            | `2026-10-15T04:31:36Z` through `2036-08-23T04:31:36Z`              |

Schannel curl with an explicit CA file reported unknown revocation status; after OS trust import it reported `CRYPT_E_NO_REVOCATION_CHECK` (exit 35), because this local CA supplies no revocation endpoint. No revocation or certificate checks were disabled. A default Schannel success is therefore **not** claimed. A fresh actual packaged Electron launch subsequently passed its own trusted HTTPS health and live staff flow; the final per-case outcomes are recorded below.

Workstation private evidence is under `D:\health-ier\docs\verification\laptop-edge-tls-2026-10-15\.private\laptop-transfer`: `root.crt`, `laptop-credentials.json`, `tls-pretrust.json`, `network-preflight.json` and `trust-record.json`. Only the workstation account and SYSTEM can access that new directory. The broader pre-existing evidence directory's ACL was preserved. The SSH pin was revalidated and copied to `C:\Users\ajapa\.ssh\health-ier-laptop-20261015-known_hosts`, whose ACL permits only that account and SYSTEM; subsequent SSH/SCP used this protected pin file. The existing SSH key and parent folder ACLs were preserved.

## Observed results

| Check                                            | Result / evidence                                                                                                                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local frozen dependency install                  | Passed; pnpm 10.30.1 / Node 24.13.0                                                                                                                                                                                  |
| Local Compose merged configuration               | Passed assertions: API/DB unexposed, Caddy laptop-IP TCP 443 only, seed loopback namespace                                                                                                                           |
| Laptop Linux engine / fresh project              | Passed: Linux amd64, Compose 5.5.0; approved fresh project; unrelated resources preserved                                                                                                                            |
| Image build / migrations / private seed          | Passed: final image `sha256:1489e617e4870e07918f27227182d8747f0ac6cfc041ac6b090ccb0c608d01ee`; seven migrations up to date; eight private synthetic accounts                                                         |
| Scoped Windows HTTPS exposure                    | Passed from workstation: TCP443 reachable; 3000/5432/2019/80 unreachable; exact new rule recorded below                                                                                                              |
| Untrusted CA / verified trust / wrong identity   | Passed Node explicit-root TLS plus built-in wrong-host rejection; user approved and imported exact workstation CurrentUser root; actual packaged Electron pre-trust rejection and post-trust health/live flow passed |
| HTTPS EDGE health / negative private-port checks | Passed Node HTTPS with explicit verified CA; TCP443 reachable, 3000/5432/2019/80 unreachable; Schannel revocation limitation recorded below                                                                          |
| Packaged Electron 18 cases                       | Executed: 12 PASS, 3 PARTIAL, 3 FAIL; exact ledger and limits below                                                                                                                                                  |
| Persistence / server interruption / recovery     | Passed: actual package restart retained both document IDs/snapshots; real API-only interruption retained unsaved input; explicit retry after restart persisted exactly one draft                                     |

Keep raw screenshots and generated evidence outside Git. Record IDs/statuses and redacted results here, without passwords, tokens, private keys or clinical payloads. Stopping this project preserves named volumes; do not use `down -v`, broad Docker cleanup or delete private credentials/CA data. This synthetic proof does not establish clinic production readiness or backups.

## Actual packaged Electron QA: all 18 cases

The real portable executable used application source `b974375123c5afa5be2721d69cffc8c68d945811`, clean tree `3987821c68774f6f6b50d91ff7fcc0cde21acea3`, and Electron `44.7.2`. Its complete ZIP SHA-256 is `b2add74e40eb5cc4a1035259ebd4945584a9581ebfc129a595de3c2fd0c90bcd`. Advancing the deployment/documentation branch does not change that recorded application provenance. The exact launcher is in [the operator guide](laptop-edge-setup.md#resume-this-run).

Before trust import, the actual packaged health call returned safe `UNAVAILABLE`; after a fresh launch following the approved import, its real preload/main health request returned EDGE and staff sign-in worked. Runtime evidence confirmed a visible native window, packaged mode, the bundled `file:` renderer, sandboxing, context isolation and disabled renderer Node integration. No fixture bridge, HTTP exception, certificate bypass or compiled bundle patch was used.

All eight named synthetic staff accounts signed in and out through the renderer. The original main runner printed 12 flow checks, but one was a not-run session-expiry marker: its correct result was **11 completed groups plus one pending marker**. The later operator-assisted expiry was executed separately. The final case accounting below reconciles that historical runner output rather than counting it as 12 passing groups or 18 passing cases.

Local evidence remains outside Git: [full QA report](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/qa-results.md), [screenshot gallery](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/gallery.md), [artifact provenance](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/current-b974375/artifact-provenance.json), and [main-count reconciliation](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/reconciled-main-workflow.json). These links target the retained workstation files, not committed attachments.

| Case                          | Result  | Actual observed scope and remaining limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-01 Registry                | PASS    | Clerk registered, renamed/searched and edited the same UUID; stale revision rejected. [Saved demographics](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-01-demographics-edit.png).                                                                                                                                                                                                                                                                                                                         |
| QA-02 Vitals                  | PASS    | Nullable measurements, edit/reopen, finalization and attributed correction passed. The additional draft advanced from pulse 72 to 73 at revision 2. [Edited draft](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-02-draft-edited.png).                                                                                                                                                                                                                                                                      |
| QA-03 Interrupted work        | PARTIAL | Medical quick-search decline retained patient/input without another-patient mutation; accepted cancel cleared that draft. Patient-edit and document navigation declines retained their editors. Unsaved-vital switching and every register shortcut were not separately replayed. [Patient-edit guard](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-03-patient-edit-guard.png).                                                                                                                            |
| QA-04 Medical/vital linkage   | PASS    | Doctor selected the same patient's finalized vital record and saved a consultation; a real named IPC request rejected a cross-patient vital link. [Consultation](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/run-16d73c22-1f23-4d3b-849b-57923ae1d3c3/flow-6.png).                                                                                                                                                                                                                                                                    |
| QA-05 Stale revision          | PASS    | A named IPC update advanced the open real UI draft; stale save preserved input, required explicit review/rebase and persisted the next revision. This was IPC-assisted concurrency, not two manually operated workstations. [Conflict flow](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/run-16d73c22-1f23-4d3b-849b-57923ae1d3c3/flow-5.png).                                                                                                                                                                                         |
| QA-06 Finalize/correct        | PASS    | Doctor finalized and added a reasoned correction; original content and separate attribution remained intact. [Finalized entry and correction](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/run-16d73c22-1f23-4d3b-849b-57923ae1d3c3/flow-6.png).                                                                                                                                                                                                                                                                                       |
| QA-07 Prescription            | PARTIAL | Preview/review/issue passed; editing wording invalidated the reviewed preview and issuance gate. Unified header/signature area was visible. Long-content overflow and forced header-load recovery were not replayed. [Invalidated review](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-07-review-invalidated.png).                                                                                                                                                                                         |
| QA-08 Certificate             | PASS    | Preview/review/issue with editable synthetic purpose passed; the immutable ID reopened after restart, including 100% view. No certificate print was attempted. [Reopened certificate](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-08-certificate-reopened.png).                                                                                                                                                                                                                                           |
| QA-09 Restart/history         | PASS    | Actual package close/relaunch preserved both issued IDs and complete stored snapshots; UI history discovered them. The later API restart also preserved the certificate. [Reopened history](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792039983292/QA-09-reopened.png).                                                                                                                                                                                                                                                 |
| QA-10 Colleague authorization | PASS    | Other-author entry was read-only; real named IPC correction and issuance attempts were denied. UI absence alone was not treated as server authorization proof. See the linked full report and main assertions.                                                                                                                                                                                                                                                                                                                                                |
| QA-11 Dentistry/referral      | PASS    | Both dentists read the isolated chart with discipline restrictions. Additional UI smoke created a dentist-to-medical referral and the receiving doctor accepted, started and completed it. Dental chart authoring remains absent. [Completed referral](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-11-referral-completed.png).                                                                                                                                                                            |
| QA-12 Laboratory              | PASS    | Both medtech identity/discipline boundaries passed. UI smoke covered doctor order, medtech queue/start/result/finalization and ordering-provider review. Correction/denial permutations were not exhaustive. [Finalized result](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-12-medtech-finalized.png), [provider review](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-12-provider-reviewed.png).                                                       |
| QA-13 Head oversight          | PASS    | Cross-discipline reads and other-author limits passed. Head Reports and filtered Audit loaded; ordinary-doctor audit IPC returned `FORBIDDEN` and its navigation was absent. Optional new head-authored consultation was not repeated. [Head audit](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-13-head-audit.png).                                                                                                                                                                                       |
| QA-14 Sessions                | PASS    | Repeated role changes/logout/restart passed. Exactly one owned session was expired; actual requests returned `UNAUTHENTICATED` and the UI cleared clinical context. Invalid credentials cleared the password. F02 did not recur; generic invalid-login wording remains a clarity limitation. [Expired/cleared view](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-14-expired-cleared.png).                                                                                                                  |
| QA-15 Connectivity            | PARTIAL | Real API-only outage/recovery subcase passed: failed Save retained patient/input, then explicit retry persisted exactly one draft after restart. Physical WAN-off and cloud catch-up were not run; internet remained up at the user's direction. [Visible outage](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-15-real-api-error-visible.png), [restored save](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-15-real-api-restored.png).                  |
| QA-16 Keyboard/sizing         | FAIL    | Normal-size keyboard editing worked. With CSS root text 32px, sticky identity obscured focused labels/control tops at 1280×720 and much of long fields at 1024×768; 1920×1080 remained clear. This was actual viewport evidence, not Windows scaling. [1280 viewport](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-16-text200-1280-plan-viewport.png), [1024 viewport](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-16-text200-1024-plan-viewport.png). |
| QA-17 Printer                 | FAIL    | Four real queues were enumerated. One authorized Microsoft Print to PDF confirmation produced no Save As dialog/PDF and a persistent unconfirmed-submission error. No retry or DS-RX1 job was sent; cause remains unresolved. [Confirmation](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-17-pdf-gate.png), [visible failure](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-17-pdf-failure.png).                                                         |
| QA-18 Celsius                 | FAIL    | No-save −1°C test observed `min="0"`, `rangeUnderflow=true`, `valid=false`. Existing F01 remains; no clinical value was saved and no product fix was made. [F01 evidence](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/packaged/supplement-1792040130208/QA-18-F01.png).                                                                                                                                                                                                                                                                        |

The retained synthetic patient is `52053040-fc1d-42cb-ad6d-fee26fb52552`. Prescription `11ebb819-94d6-443c-9715-dc695dd88b54` and certificate `0a4a5571-11bc-4119-9adb-8d55a9009b84` retained their exact IDs/snapshots after client restart. Additional UI/IPC smoke covered an appointment, membership/history, clinical summary/history, a completed referral and a reviewed laboratory order; this is not exhaustive acceptance proof for every new operation.

For actual session expiry, the schema had no public session UUID or creation field. Read-only, narrowly bounded staff/expiry discovery preceded a guarded transaction that changed exactly one owned row's expiry. No token/hash was returned; other sessions and both system clocks were untouched. [Restricted expiry operator record](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/.private/laptop-transfer/session-expiry-operator.json).

Only the owned API stopped at laptop UTC `2026-10-15T05:07:40.1243834Z`; Caddy and healthy PostgreSQL remained running. It was healthy again at `2026-10-15T05:09:43.6825930Z`, with seven migrations up to date and no Corepack download prompt. The explicit retry through the actual client saved draft `98352953-9ff0-4d98-8e13-a42c0cf97105`, revision 1, with exactly one matching server readback at `2026-10-15T05:11:28.196Z`. [Stop operator record](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/.private/laptop-transfer/api-stop-operator.txt), [restart operator record](D:/health-ier/docs/verification/laptop-edge-tls-2026-10-15/.private/laptop-transfer/api-restart-operator.txt).

Completed renderer error lists were empty. Native dialog and selector automation failures were separated from product findings. No physical paper/PDF-layout success, physical WAN interruption or cloud catch-up is claimed. The test client was signed out and closed without an unsaved draft; the server remains running. An optional final automated relaunch was blocked by policy; the full local report records that coordination history. The documented launcher is available for the user, and no further automated GUI action is required for this deployment.

The final deployment/documentation tree passed ordinary `pnpm check`: lint, formatting, both TypeScript checks, 64 app tests, 27 server unit tests, 11 HTTP tests, Prisma generation and the server build. One optional app test and nine optional server integration tests were skipped; those are not counted as live passes. All 12 operator PowerShell blocks parsed without syntax errors, and all 28 local evidence links resolved. Final retained-stack inspection at laptop UTC `2026-10-15T05:19:29.4872012Z` found the API and PostgreSQL healthy and Caddy running; Caddy has no separate Docker healthcheck, so its live TLS evidence above establishes its request path.

## Retained setup and later operator commands

Leave this healthy project running for ongoing workstation QA. Its owned containers are `healthier-laptop-20261015t1230d6a1-{server,postgres,caddy}-1`. Its volumes are `healthier-laptop-20261015t1230d6a1_postgres_prod`, `_caddy_data` and `_caddy_config`; its network is `healthier-laptop-20261015t1230d6a1_default`. API port 3000 and PostgreSQL 5432 are container-only; only TCP `192.168.1.35:443` is published. Existing Public-profile Docker Backend allow rules were observed and preserved; the new rule is restricted to the workstation on the Private Wi-Fi profile. No second unapproved LAN client was tested against that rule.

For a later intentional stop, in laptop PowerShell at the exact source directory, restore the process-only Docker client environment above and set `$compose` to this exact run:

```powershell
$compose = @('--project-name', 'healthier-laptop-20261015t1230d6a1', '--env-file', '.private/laptop.env', '-f', 'compose.prod.yaml', '-f', 'compose.laptop.yaml')
docker compose @compose stop
# Later restart the same data and certificates; do not seed again.
docker compose @compose up -d --no-build --wait
```

Only if the user later requests removal, `docker compose @compose down` removes this project's containers/network while retaining its named database/CA volumes. Separately remove only the named laptop firewall rule with `Remove-NetFirewallRule -Name 'Healthier-Laptop-HTTPS-20261015t1230d6a1'` and, on this workstation as the intended account, only this root with `Remove-Item 'Cert:\CurrentUser\Root\6CF95CEF5B4E065507BE3203B86F0ACEE2C4A91A'`. These cleanup commands have **not** been executed; retain CA trust, data and private credentials for ongoing QA. Docker Desktop must remain running on the laptop, its Wi-Fi must remain on this trusted LAN, and address changes require reconfiguring the origin, certificate identity, binding and scoped rule.
