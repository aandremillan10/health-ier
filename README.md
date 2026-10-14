# Health-ier

Electron desktop and NestJS server workspace for the clinic application.
Repository: [aandremillan10/health-ier](https://github.com/aandremillan10/health-ier).

The backend now implements named local staff sessions, protected patient registry, vitals and consultation lifecycle/corrections, and immutable prescription/certificate snapshots in PostgreSQL. A durable one-way mirror sends only approved exact record versions to CLOUD; EDGE remains authoritative and local clinical saves never wait for cloud. See [server setup](server/README.md), [implemented API and executable curl examples](server/API.md), and [mirror protocol/operator evidence](docs/backend-mirror.md).

The Electron renderer remains the teammate's clinic-screen work. Privileged main/preload operations provide the coordinated session/network/document/printer boundary; API and headless boundary proof do not establish the complete renderer flow or physical paper output. Independent desktop databases, bidirectional editing and production rollout remain outside scope. Approved scope is [clinic-demo-v1.1](docs/specs/mirror-amendment.md).

## Setup

Use Node.js 24.13 or a later Node.js 24 release and pnpm 10.30.1.

```sh
corepack enable
corepack prepare pnpm@10.30.1 --activate
pnpm install
```

The root lockfile owns both packages. Run installations from the repository root.
Electron's install script downloads its platform binary during setup.

Start the desktop and server in separate terminals:

```sh
pnpm dev:app
pnpm dev:server
```

The Electron renderer is sandboxed, has no Node integration, and uses an isolated preload. Development loads only `http://127.0.0.1:5173/`; packaged builds load bundled local files. The narrow privileged boundary keeps session tokens in main-process memory and checks sender, operation, payload and clinic server identity. General clinic renderer workflows still require teammate implementation/integrated QA.

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

## Verification

```sh
pnpm check
pnpm build
```

`check` runs ESLint, Prettier checks, both package typechecks and unit tests, server HTTP e2e tests, and Prisma generation/server build. Optional mirror live tests use dedicated private test URLs; every parallel runner needs its own databases. `build` also bundles Electron main, sandbox preload, and React renderer; it does not produce an installer.

Husky runs check-only Prettier and ESLint on staged files before commits. It runs `pnpm check` before pushes. Hooks never automatically rewrite source files; use `pnpm format` when you intend to format files. Copied agent skills, generated code, build artifacts, and reference images are excluded from formatting and linting.

## PostgreSQL and Docker

Docker Desktop must be running for container commands. Copy `.env.example` to a private root `.env`, choose a password, and copy `server/.env.example` to `server/.env` only if it does not already exist. Keep both credentials consistent; never overwrite an existing private environment file.

Development Compose starts PostgreSQL only. Run app/server development on the host:

```sh
docker compose -f compose.dev.yaml up -d
docker compose -f compose.dev.yaml config --quiet
```

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
