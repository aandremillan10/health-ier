# Clinic EDGE backend

NestJS 11, Prisma 7.10 and PostgreSQL implement the approved synthetic clinic-demo-v1.1 staff API. [API.md](API.md) contains every route, fields, permission/error rules and executable curl.exe examples. The database migration and exact immutable outbox contract are versioned under prisma/ and src/mirror-contract.ts.

## Fresh Windows setup

For teammates using Docker, follow [the copy-and-paste development guide](../docs/development.md). Root/server/app environment examples agree on the loopback synthetic database, including the public dev-only database password; staff passwords remain random/private. The portable PostgreSQL alternative below remains available and preserves existing configuration.

Node 24 and pnpm 10.30.1 are required. From repository root:

```powershell
pnpm install --frozen-lockfile
powershell -NoProfile -ExecutionPolicy Bypass -File server/scripts/setup-local.ps1
pnpm --filter server start:prod
```

The setup script downloads pinned official PostgreSQL 16.2 binaries and verifies SHA-256, creates a separate user-local cluster bound to 127.0.0.1:55432, creates only a dedicated healthier_demo_* database, applies migrations, then seeds eight named synthetic accounts. It preserves an existing server/.env by refusing to overwrite it. No existing production database is reset. Docker is optional; an existing dedicated loopback PostgreSQL database may instead be configured privately in server/.env, followed by prisma:migrate and demo:seed.

Secure random account passwords are scrypt-hashed in PostgreSQL. Plaintext credentials exist only in ignored .private/demo-credentials.json; Windows setup restricts that directory to the current user. Open that local file privately. Never paste credentials into Git, issues, screenshots or logs. Seeding again verifies/preserves existing accounts, password hashes, metadata revisions and event timestamps. No public account administration or role registration exists.

| Username                            | Synthetic role           |
| ----------------------------------- | ------------------------ |
| demo.doctor.head                    | Doctor, exactly one head |
| demo.doctor                         | Doctor                   |
| demo.dentist.one / demo.dentist.two | Dentists                 |
| demo.medtech.one / demo.medtech.two | Medical technologists    |
| demo.attendant                      | Nursing attendant        |
| demo.clerk                          | Clerk                    |

The isolated authorization patient is 20000000-0000-4000-8000-000000000001; dental and laboratory fixture entries are 30000000-0000-4000-8000-000000000001 and 30000000-0000-4000-8000-000000000002. They contain only synthetic proof text.

## Run and verify

```powershell
pnpm --filter server prisma:migrate
pnpm --filter server demo:seed
pnpm --filter server start:prod
# In a separate terminal:
pnpm --filter server test:live
cd server
node dist/live-db-checks.js
# Restart only this API, then:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-persistence.ps1
cd ..
pnpm check
```

Normal pnpm check uses isolated mocked database readiness plus unit security checks; the explicitly named live scripts exercise the real PostgreSQL API and actual atomic rollback/immutability. Server connection/query timeouts are five seconds and unavailable dependencies return safe 503. Stop/restart the API process for connection-failure and persistence proof; do not stop shared databases or unrelated applications.

For a deliberate synthetic reset only, stop this API and run pnpm --filter server demo:reset followed by demo:seed. This command removes every record, session, issued document, mirror event and private account credential file in the configured dedicated loopback healthier_demo_* EDGE database. The script refuses CLOUD mode, non-loopback hosts and other database names. It never runs automatically. A remote cloud copy is preserved; coordinate a fresh dedicated cloud database separately if the next synthetic demonstration requires an empty mirror.

## Actual local proof runtime

The implementation run used C:/Users/ajapa/.codex/healthier-runtime with portable PostgreSQL on 127.0.0.1:55432 and database healthier_demo_core. Its private admin password file is outside Git at admin-password.private in that directory. Current EDGE configuration and accounts are at C:/Users/ajapa/.codex/worktrees/backend-demo/health-ier/server/.env and the sibling .private/demo-credentials.json. These paths are temporary task/runtime locations; fresh setup above creates the equivalent under the chosen checkout and LOCALAPPDATA/HealthierSyntheticPostgres.

Cluster commands (use only this application's dedicated runtime):

```powershell
& 'C:/Users/ajapa/.codex/healthier-runtime/pgsql/bin/pg_ctl.exe' -D 'C:/Users/ajapa/.codex/healthier-runtime/data' status
& 'C:/Users/ajapa/.codex/healthier-runtime/pgsql/bin/pg_ctl.exe' -D 'C:/Users/ajapa/.codex/healthier-runtime/data' -l 'C:/Users/ajapa/.codex/healthier-runtime/postgresql.log' -o '-h 127.0.0.1 -p 55432' start
# Stop only when no local mirror/API worker is using it:
& 'C:/Users/ajapa/.codex/healthier-runtime/pgsql/bin/pg_ctl.exe' -D 'C:/Users/ajapa/.codex/healthier-runtime/data' stop
```

Internet is not needed by the local auth/domain/issuance code. Independent workstation persistence during LAN/server failure is outside scope. Fixed-template presentation, Electron token/IPC/printer boundaries and real cloud mirror evidence are separate coordinated stages. Neither API issuance nor accepted printer submission proves physical paper output. The demo makes no production rollout or backup/privacy/retention assurance.
