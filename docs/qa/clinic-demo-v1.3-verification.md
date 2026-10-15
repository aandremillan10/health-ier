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
