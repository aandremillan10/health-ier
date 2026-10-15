# Patient clinical summary (#14)

EDGE-only structured allergies, medications, conditions, and immunizations. Doctors and dentists can read and create items. Clinic head oversight can read. Only the original clinician author can change, correct, or inactivate an item. Clerk, attendant, and medtech accounts without head oversight are denied.

Every save appends an immutable attributed revision in the same transaction. A correction or inactivation needs a reason. Updates use `expectedRevision`; stale saves return HTTP 409 with `currentRevision`. Inactive content can be corrected; it cannot silently be reactivated. New summary data does not enter the v1.1 mirror whitelist.

## HTTP usage

For the examples, set `$base` to the trusted clinic origin, `$token` to a signed-in clinician token, and `$patientId` to a synthetic patient UUID. No token belongs in source control.

```powershell
$headers = @{ Authorization = "Bearer $token" }
$summary = Invoke-RestMethod "$base/patients/$patientId/clinical-summary" -Headers $headers
$fields = @{
  content = @{ kind = 'allergy'; substance = 'Synthetic penicillin'; reaction = 'Rash'; severity = 'moderate'; onsetDate = $null }
  source = 'Synthetic patient report'
  notes = $null
}
$item = Invoke-RestMethod "$base/patients/$patientId/clinical-summary" -Method Post -Headers $headers -ContentType application/json -Body ($fields | ConvertTo-Json -Depth 5)
$change = $fields.Clone()
$change.expectedRevision = $item.revision
$change.reason = 'Clarified reaction'
$change.content.reaction = 'Hives'
$item = Invoke-RestMethod "$base/clinical-summary-items/$($item.id)" -Method Patch -Headers $headers -ContentType application/json -Body ($change | ConvertTo-Json -Depth 5)
$change.expectedRevision = $item.revision
$change.reason = 'Corrected source detail'
$item = Invoke-RestMethod "$base/clinical-summary-items/$($item.id)/corrections" -Method Post -Headers $headers -ContentType application/json -Body ($change | ConvertTo-Json -Depth 5)
$inactive = @{ expectedRevision = $item.revision; reason = 'Recorded in error' }
$item = Invoke-RestMethod "$base/clinical-summary-items/$($item.id)/inactivate" -Method Post -Headers $headers -ContentType application/json -Body ($inactive | ConvertTo-Json)
$history = Invoke-RestMethod "$base/clinical-summary-items/$($item.id)/history" -Headers $headers
```

## Focused verification

The public HTTP acceptance check is `server/test/clinical-summary.e2e-spec.ts`. It was written before feature logic. It covers empty summaries, allowed reads/writes, denied clerk reads, denied non-author edits, stale revisions, shared state, correction/inactivation history, invalid dates, and authentication.

With a disposable synthetic database that already has the migrations applied, set `SUMMARY_E2E_DATABASE_URL` and run `pnpm exec vitest run --config vitest.e2e.config.mts test/clinical-summary.e2e-spec.ts` from `server`. The check creates only named synthetic fixtures and removes its fixtures afterward. It does not apply migrations.

Without that explicit database, the check compiles and skips. Feature-local verification on 2026-10-15: server/app typechecks passed; Prisma client generation passed; the HTTP check compiled and skipped because no owned database was supplied. The UI detector returned no mechanical findings. Live PostgreSQL behavior, rendered layout, keyboard/screen-reader behavior, and LAN clients were not verified in the feature checkout.

Motion review: patient opening, editor controls, item actions, and history disclosures are repeated clinic tasks. They remain immediate. No new animation was added.
