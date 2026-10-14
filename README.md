# AMLIG

Electron desktop and NestJS server workspace for the clinic application.
Repository: [aandremillan10/health-ier](https://github.com/aandremillan10/health-ier).

The backend now implements named local staff sessions, protected patient registry, vitals and consultation lifecycle/corrections, and immutable prescription/certificate snapshots in PostgreSQL. A durable one-way mirror sends only approved exact record versions to CLOUD; EDGE remains authoritative and local clinical saves never wait for cloud. See [server setup](server/README.md), [implemented API and executable curl examples](server/API.md), and [mirror protocol/operator evidence](docs/backend-mirror.md).

AMLIG provides the staff flows and an explicitly labeled in-memory synthetic demo. The supplied app logo appears on sign-in, in navigation, and as the browser icon. The repository remains `health-ier`. Privileged main/preload operations provide the session/network/document/printer boundary; the renderer adapts the typed `window.desktop.clinic` bridge. Local synthetic Electron/NestJS/PostgreSQL flows are verified; physical printing, second-machine LAN/TLS and cloud recovery remain separate checks. See [frontend migration and issue coverage](docs/frontend-migration.md). Independent desktop databases, bidirectional editing and production rollout remain outside scope. Approved scope is [clinic-demo-v1.1](docs/specs/mirror-amendment.md).

Review the frontend with `pnpm dev:frontend` at `http://127.0.0.1:5175`. Select a synthetic staff member and **Open frontend demo**. The demo patient list appears on entry; open a record directly or search by name/number. Run `pnpm test:frontend` for the headless Chrome renderer checks. The existing Electron/LAN architecture remains in place. The old Next.js prototype was moved to a temporary archive after migration; this repository is the remaining project in the workspace.

## Setup

Use Node.js 24.13 or a later Node.js 24 release and pnpm 10.30.1. For the copy-and-paste teammate setup, including all three environment files and the development Compose password, use [local development](docs/development.md).

For a later second-machine test, use the [Windows laptop LAN/TLS and optional SSH guide](docs/lan-tls-setup.md). It records a future procedure; no certificate, firewall or SSH configuration was changed.

```sh
corepack enable
corepack prepare pnpm@10.30.1 --activate
pnpm install
```

The root lockfile owns both packages. Run installations from the repository root.
Electron's install script downloads its platform binary during setup.

### Verified local setup

The latest `master` environment setup is applied to the existing `health-ier-dev` Docker project. PostgreSQL remains on `127.0.0.1:5433` with the dedicated `healthier_demo_amlig` database; the host clinic API runs on `http://127.0.0.1:3002`. Root, server and app environment settings match, and existing volumes/accounts were preserved. The temporary extra Docker project's container/network were removed. Private account credentials remain in `.private/demo-credentials.json`.

Run `pnpm dev:app` to use live clinic data. `app/.env` is loaded only into the main process by the latest development loader. The browser on port 5175 remains a fixture demo. Run `pnpm --filter app test:integration` with the local clinic API running for a noninteractive check of the actual Electron renderer/preload/main and real database. Results are saved outside the repo; see [integration evidence](../verification/integration-report.md).

Set up on 2026-10-14. Node.js 24.15.0 and pnpm 10.30.1 are installed. Existing private `.env`, `server/.env`, and `.env.production` files were validated and kept unchanged. Development credentials match between root Compose and `server/.env`; the container environment has separate matching credentials. All three files are ignored by Git.

This section records the original scaffold setup. After the latest `master` update, use the dedicated synthetic database setup in `server/README.md` before live clinic operations; the earlier shell checks do not prove the new backend is configured locally.

| Service                 | Local address            | Start command                                                                  |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| Development PostgreSQL  | `127.0.0.1:5433`         | `docker compose -f compose.dev.yaml up -d`                                     |
| Host Nest server        | `http://127.0.0.1:3002/` | Set `PORT=3002`, then `pnpm dev:server`                                        |
| Electron renderer       | `http://127.0.0.1:5173/` | `pnpm dev:app`                                                                 |
| Browser frontend review | `http://127.0.0.1:5175/` | `pnpm dev:frontend`                                                            |
| Local container server  | `http://127.0.0.1:3001/` | `docker compose --env-file .env.production -f compose.prod.yaml up --build -d` |

Port 3000 already serves another application, so this setup uses a process-only override for the host server. The saved `server/.env` remains unchanged. In its PowerShell terminal:

```powershell
$env:PORT = '3002'
pnpm dev:server
```

The container server uses `.env.production` with `SERVER_PORT=3001`; its PostgreSQL database is private to the Compose network and uses a separate persistent volume. This is a local scaffold check, not a clinic deployment.

Dependency installation, both Compose configurations, Prisma validation/generation, authenticated PostgreSQL queries, smoke routes, repository checks, and builds passed. The frontend suite covers the approved renderer flows with synthetic fixtures. See the [frontend evidence and remaining integration checks](../verification/frontend-report.md) and [local setup evidence](../verification/setup-report.md), stored outside this repository.

Start the desktop and server in separate terminals:

```sh
pnpm dev:app
pnpm dev:server
```

The Electron renderer is sandboxed, has no Node integration, and uses an isolated preload. Development loads only `http://127.0.0.1:5173/`; packaged builds load bundled local files. The narrow privileged boundary keeps session tokens in main-process memory and checks sender, operation, payload and clinic server identity. The updated bridge is `window.desktop.clinic`; live renderer integration and physical printing remain separate checks. Browser review uses the explicit synthetic demo.

## Local backend

Set up the dedicated synthetic PostgreSQL database and eight secure local accounts before starting the server. Existing private configuration is preserved:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File server/scripts/setup-local.ps1
pnpm --filter server start:prod
curl.exe http://127.0.0.1:3000/health
```

The nonclinical health route returns `{status:"ok",mode:"EDGE"}` only after PostgreSQL responds. Protected routes require a real local session. Credentials are supplied privately in ignored `.private/demo-credentials.json`; never copy them into Git or evidence. Execute all route examples and assertions:

```powershell
pnpm --filter server test:live
```

The loopback HTTP exception is for synthetic development only. Clinic production transport requires TLS, and hosting/privacy/retention/backups remain separate decisions. See [server/API.md](server/API.md) for fields, scoped DTOs, revision conflicts and document linkage.

On this workstation, use port 3002 for the host server or port 3001 for the container server while port 3000 belongs to another application. Configure the Electron clinic URL to match the selected clinic server; do not connect to an unrelated service.

## Verification

```sh
pnpm check
pnpm build
```

`check` runs ESLint, Prettier checks, both package typechecks and unit tests, server HTTP e2e tests, and Prisma generation/server build. Optional mirror live tests use dedicated private test URLs; every parallel runner needs its own databases. `build` also bundles Electron main, sandbox preload, and React renderer; it does not produce an installer.

Frontend screenshots, PDFs, reports, and setup evidence are stored in sibling `../verification/`. Playwright run metadata and failure traces are stored in sibling `../test-results/`. These local folders are outside Git; `pnpm test:frontend` regenerates its evidence there. The test source remains in `app/e2e/`.

Husky runs check-only Prettier and ESLint on staged files before commits. It runs `pnpm check` before pushes. Hooks never automatically rewrite source files; use `pnpm format` when you intend to format files. Copied agent skills, generated code, build artifacts, and reference images are excluded from formatting and linting.

## PostgreSQL and Docker

Docker Desktop must be running for container commands. The development defaults are database `healthier_demo_dev`, user `healthier_dev`, shared **dev-only** password `healthier_dev_only`, and loopback port 5432. [The full setup](docs/development.md) copies matching root/server/app examples without overwriting existing files, starts the database, migrates/seeds secure staff accounts, and loads the Electron origin. Production retains its separate required private password.

Development Compose starts PostgreSQL only. Run app/server development on the host:

```sh
docker compose -f compose.dev.yaml up -d
docker compose -f compose.dev.yaml config --quiet
```

Existing PostgreSQL volumes retain the credentials/database from their first initialization; new environment defaults never reset them. Use the original settings or an explicitly separate fresh project as explained in the development guide.

Versioned Prisma 7 migrations define the clinic records, authentication sessions, immutable outbox and mirror history/receipts. Prisma scripts explicitly select `prisma7.config.ts`:

```sh
pnpm --filter server prisma:validate
pnpm --filter server prisma:generate
pnpm --filter server prisma:migrate
```

For the server container scaffold, create a private production environment file from `.env.production.example`. `DATABASE_URL` must use the Compose hostname `postgres` and the same password as `POSTGRES_PASSWORD` (URL-encoded in the connection string):

```sh
docker compose --env-file .env.production -f compose.prod.yaml config --quiet
docker compose --env-file .env.production -f compose.prod.yaml up --build -d
```

Compose builds the server and starts PostgreSQL, using a separate persistent database volume. Its server port binds to loopback. Dedicated synthetic EDGE seeding refuses non-loopback or databases outside `healthier_demo_*`; adjust a fresh demo configuration deliberately instead of resetting an existing environment. This configuration does not constitute production rollout approval.

Stopping containers with `docker compose ... down` retains database volumes. Add `--volumes` only when deliberately deleting that environment's data.
