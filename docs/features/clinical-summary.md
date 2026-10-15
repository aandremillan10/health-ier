# Patient clinical summary (#14)

## Current behavior

The v1.3 summary supports allergies (`substance`), medications (`name` and `dose`, including its unit), and conditions (`name`). Each item requires a `source`; `notes` are optional. Immunizations and retired fields are not accepted in new writes or shown in existing items and history. Existing revisions remain stored.

Doctors and dentists can read and create items. The existing read policy remains in place. Only the original clinician author can update, correct, or inactivate an item. Each save appends an attributed revision. Updates use `expectedRevision`; stale saves return HTTP 409 with `currentRevision`. Corrections and inactivation require a reason. New summary data does not enter the one-way mirror.

See the [approved v1.3 amendment](../specs/clinic-demo-v1.3-amendment.md) for the full contract and historical-data rules.

## HTTP use

Use a trusted clinic origin, a signed-in clinician token, and a synthetic patient UUID. Do not store tokens in source control.

```powershell
$headers = @{ Authorization = "Bearer $token" }
$fields = @{
  content = @{ kind = 'allergy'; substance = 'Synthetic example substance' }
  source = 'Synthetic patient report'
  notes = 'Synthetic note'
}
$item = Invoke-RestMethod "$base/patients/$patientId/clinical-summary" -Method Post -Headers $headers -ContentType application/json -Body ($fields | ConvertTo-Json -Depth 5)
$history = Invoke-RestMethod "$base/clinical-summary-items/$($item.id)/history" -Headers $headers
```

## Verification

Service checks are in `server/src/clinical-summary/clinical-summary.service.spec.ts`; HTTP checks are in `server/test/clinical-summary.e2e-spec.ts`. The HTTP suite uses a separately supplied synthetic database and skips when `SUMMARY_E2E_DATABASE_URL` is not set. It does not apply migrations.
