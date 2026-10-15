# Clinic demo v1.3 verification

Run from the repository root in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File server/scripts/verify-v1.3-hmo-migration.ps1
```

The script uses only a disposable `postgres:17-alpine` container. It sets `--network none`, publishes no ports, mounts no volumes, and does not read a database URL. It applies all nine checked-in migrations through `20261015220000_vitals_height_remove_hmo_data`, then stops and removes the container. The synthetic seed and post-migration SQL assertions are in [v1.3-hmo-migration-seed.sql](../../server/scripts/v1.3-hmo-migration-seed.sql) and [v1.3-hmo-migration-assert.sql](../../server/scripts/v1.3-hmo-migration-assert.sql).

The seed includes rows in each HMO table and both revision tables, plus employee and dependent patients, vitals, and a generic audit event. The assertions require all four HMO tables to be absent; the employee patient category and reference to remain; the existing vitals row to remain with nullable height; height to accept a numeric value; and the generic audit event to remain.

## Observed result

Checked on 2026-10-15 with Docker 29.4.3. All nine migrations applied and the verifier printed:

```text
PASS: all four HMO tables are gone; registry fields, nullable height, vitals, and generic audit event remain.
Migration verification passed in a disposable local PostgreSQL 17 container.
```

This verifies the migration SQL only in the disposable local container. It does not inspect or change a clinic, production, or other existing database.

## API and desktop verification

Checked on 2026-10-15 on the integrated v1.3 branch:

- `pnpm test:e2e` passed: 10 server E2E files and 52 tests passed; 2 files and 9 database-backed tests were skipped by the existing test setup. The suite includes clinical-summary API behavior, vital height and Clinic head correction, removed HMO routes returning 404, and reports without employee/dependent totals.
- The database-backed clinical-summary E2E file was then run separately against a fresh disposable PostgreSQL 17 database with `pnpm --filter server exec vitest run --config vitest.e2e.config.mts test/clinical-summary.e2e-spec.ts`: 1 file and 2 tests passed. It checked the legacy summary projection, retained revisions, history output, and supported CRUD flows. The database had no volume and was removed after the run.
- `pnpm test:frontend` passed: all 98 desktop E2E tests passed. This includes height and blood-pressure entry, Clinic head correction, HMO UI removal, and all eight audit action labels and semantic colors with keyboard access.
- `server/scripts/verify-live.ps1` passed against a fresh local EDGE server and disposable PostgreSQL 17 database: 117 assertions passed. It confirmed all 10 removed HMO routes return 404, height persists and remains nullable when unknown, and a Clinic head correction keeps its source revision. The server ran with mirroring disabled. The disposable database had no volume and was removed after the run.

The redacted live API result is in [clinic-demo-v1.3-api-evidence.json](clinic-demo-v1.3-api-evidence.json). The local EDGE run used only synthetic data and did not touch the available persistent Compose stack. Mirroring was disabled, so this is not cloud mirror proof. No existing or production database was migrated.

The desktop E2E suite used demo or stub data, and the live EDGE script called the HTTP API directly. No single run covered the desktop client talking to that live EDGE server.
