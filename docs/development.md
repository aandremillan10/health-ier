# Teammate local development

Use Node 24.13+ (major 24), pnpm 10.30.1 and a running Docker Desktop. This starts a synthetic local database; the Nest API and Electron run on the host. It does not connect to the deployed demo mirror or replace existing private configuration.

## Fresh checkout: paste from repository root

```powershell
# Check all targets first. Existing files must be reviewed, never overwritten.
$envCopies = @{
  '.env' = '.env.example'
  'server/.env' = 'server/.env.example'
  'app/.env' = 'app/.env.example'
}
foreach ($target in $envCopies.Keys) {
  if (Test-Path -LiteralPath $target) {
    throw "$target already exists; preserve and review it before continuing."
  }
}
foreach ($target in $envCopies.Keys) {
  Copy-Item -LiteralPath $envCopies[$target] -Destination $target
}

pnpm install --frozen-lockfile
docker compose -f compose.dev.yaml up -d --wait
pnpm --filter server prisma:migrate
pnpm --filter server demo:seed
```

Development PostgreSQL has these matching defaults, including when Compose is started without a root `.env`:

| Setting                       | Synthetic development value                                                       |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Database                      | `healthier_demo_dev`                                                              |
| Database user                 | `healthier_dev`                                                                   |
| Shared database password      | `healthier_dev_only` — development only                                           |
| Host database address         | `127.0.0.1:5432`                                                                  |
| Server database URL           | `postgresql://healthier_dev:healthier_dev_only@127.0.0.1:5432/healthier_demo_dev` |
| API                           | `http://127.0.0.1:3000`                                                           |
| Electron development renderer | `http://127.0.0.1:5173` (managed by electron-vite)                                |

The shared database password is intentionally public and only for this synthetic loopback environment. **Staff passwords are different:** the seed generates eight secure random passwords, hashes them in PostgreSQL, and writes them privately to ignored `.private/demo-credentials.json`. Open that file locally to sign in. Rerunning the seed preserves accounts/passwords/data; do not share credentials in Git, chat, issues, or renderer configuration.

Then use two terminals, both at repository root:

```powershell
# Terminal 1: Nest API, including local .env loading.
pnpm dev:server
```

```powershell
# Terminal 2: Electron; app/.env is loaded into its main process.
pnpm dev:app
```

Check the API from another terminal:

```powershell
curl.exe --fail http://127.0.0.1:3000/health
pnpm --filter server test:live
```

The live script uses the private generated accounts and exercises every staff route. [API fields/examples](../server/API.md) and [typed desktop operations](backend-electron.md) are available for the teammate's renderer integration. The renderer remains a technical shell until those screens are implemented.

When testing more than one database, give each its own ignored credential/evidence directory (for example `DEMO_CREDENTIALS_FILE=../.private/teammate-dev/credentials.json`). The live verification scripts write a fixed `api-evidence.json` beside the selected credential file, so different databases must not share that directory. Pass the matching `-CredentialsFile` and `-BaseUrl` to the scripts.

## Full environment files and overrides

- Root `.env` is Compose's PostgreSQL configuration: database, user, shared dev-only password and published host port. PostgreSQL is always bound to loopback.
- `server/.env` contains the host API `PORT`, `SERVER_MODE=EDGE`, clinic ID, complete `DATABASE_URL`, private seed file path and disabled mirror configuration. Empty mirror URL/token are intentional. Only enable mirroring against a separately authorized synthetic cloud destination with a private machine credential.
- `app/.env` contains only the trusted API origin and explicit local synthetic HTTP flag. The electron-vite `serve` configuration loads these two exact named values into the Electron main process. Existing shell environment values take precedence; Vite `.env.local` and mode-local files work normally. Restart the dev process after editing them. Database URLs, passwords, machine credentials and staff sessions never belong in this file or `VITE_*` renderer variables.

If you change `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` or `POSTGRES_PORT` in root `.env`, update the corresponding parts of `server/.env`'s `DATABASE_URL` together. URL-encode a custom password. Seeding/resetting deliberately requires a loopback database named `healthier_demo_*`. If you change the API's `PORT`, update `HEALTH_IER_SERVER_URL` in `app/.env` to the same port. Compose starts only PostgreSQL, so root `SERVER_PORT` does not configure the host API.

For example, on a machine already using the default ports, set root `POSTGRES_PORT=55433`, the server URL's database port to `55433`, server `PORT=3002`, and app `HEALTH_IER_SERVER_URL=http://127.0.0.1:3002` before starting. Leave the existing services alone.

For a future clinic LAN client use a trusted HTTPS origin such as `HEALTH_IER_SERVER_URL=https://clinic.example` and `HEALTH_IER_ALLOW_SYNTHETIC_HTTP=false`. Certificate name/trust must match the server. Packaged clients always reject HTTP, even with the synthetic flag; normal TLS validation stays enabled. Development `.env` values are not embedded by `pnpm build` and are not automatically loaded by an installed packaged application; supply its trusted origin through the launcher/process environment when that deployment is prepared. No server/database/mirror secrets are needed by the client.

## Existing volumes and stopping

PostgreSQL's `POSTGRES_*` variables initialize **only an empty volume**. Changing a password/database/user in `.env` does not rewrite an existing database or credentials. The old `health-ier-dev_postgres_dev` volume remains untouched. Keep its original settings to use it; alternatively select a separate fresh project for the new synthetic defaults:

```powershell
docker compose -p health-ier-fresh-dev -f compose.dev.yaml up -d --wait
```

Choose a free database port first if another project is still running, then keep the host URL in sync as above. A project name gives PostgreSQL a separate named volume; it does not grant permission to erase an old one.

Stop only the project you started; data remains in its named volume:

```powershell
docker compose -f compose.dev.yaml down
# Or for the explicitly named fresh project:
docker compose -p health-ier-fresh-dev -f compose.dev.yaml down
```

Do not add `--volumes` to normal stop/restart commands. Production Compose still requires a private database password and explicit clinic ID and probes `/health`; the shared development password is not a production default. [The later laptop LAN/TLS guide](lan-tls-setup.md) explains the separate trusted HTTPS proof and optional SSH control; no network/certificate/firewall setup has been performed. Physical printer validation remains separate QA work.
