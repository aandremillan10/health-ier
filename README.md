# Health-ier

Electron desktop and NestJS server workspace for the clinic application.
Repository: [aandremillan10/health-ier](https://github.com/aandremillan10/health-ier).

The current implementation is a technical shell: a static desktop window and the existing NestJS `GET /` smoke route. Clinic workflows will follow the reviewed specification in `docs/`. The selected architecture uses the clinic LAN server and PostgreSQL during internet outages; independent desktop databases and bidirectional editing remain outside scope. The user requires Backend-owned one-way edge-to-cloud structured-record mirroring for the October 16 demo; edge remains authoritative and clinic work never waits for cloud. See [clinic-demo-v1.1](docs/specs/mirror-amendment.md). The mirror is not implemented or deployed yet.

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

The Electron renderer is sandboxed, has no Node integration, and uses an isolated preload. Development loads only `http://127.0.0.1:5173/`; packaged builds load bundled local files. The static renderer has no clinic data, business IPC, or server connection yet.

## Server smoke route

With the server running, this public shell route returns HTTP 200 and `Hello World!`:

```sh
curl http://127.0.0.1:3000/
```

On PowerShell use `curl.exe` or:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/
```

This route carries no clinical information. Authentication, authorization, TLS, and clinic workflows must be implemented before a clinic deployment.

## Verification

```sh
pnpm check
pnpm build
```

`check` runs ESLint, Prettier checks, both package typechecks and unit tests, the server HTTP e2e test, and the server build. `build` also bundles Electron main, sandbox preload, and React renderer; it does not produce an installer.

Husky runs check-only Prettier and ESLint on staged files before commits. It runs `pnpm check` before pushes. Hooks never automatically rewrite source files; use `pnpm format` when you intend to format files. Copied agent skills, generated code, build artifacts, and reference images are excluded from formatting and linting.

## PostgreSQL and Docker

Docker Desktop must be running for container commands. Copy `.env.example` to a private root `.env`, choose a password, and copy `server/.env.example` to `server/.env` only if it does not already exist. Keep both credentials consistent; never overwrite an existing private environment file.

Development Compose starts PostgreSQL only. Run app/server development on the host:

```sh
docker compose -f compose.dev.yaml up -d
docker compose -f compose.dev.yaml config --quiet
```

The installed Prisma 7 PostgreSQL schema is empty; the shell does not query the database. Prisma scripts explicitly select the existing `prisma7.config.ts` file:

```sh
pnpm --filter server prisma:validate
pnpm --filter server prisma:generate
```

For the server container scaffold, create a private production environment file from `.env.production.example`. `DATABASE_URL` must use the Compose hostname `postgres` and the same password as `POSTGRES_PASSWORD` (URL-encoded in the connection string):

```sh
docker compose --env-file .env.production -f compose.prod.yaml config --quiet
docker compose --env-file .env.production -f compose.prod.yaml up --build -d
```

Production Compose builds the server and starts PostgreSQL, using a separate persistent database volume. Its server port binds to loopback until authentication and TLS deployment decisions are finalized. This configuration is currently for verifying the server shell, not handling real clinic records.

Stopping containers with `docker compose ... down` retains database volumes. Add `--volumes` only when deliberately deleting that environment's data.
