# Laboratory workflow (#16)

The laboratory module stores orders and structured results on EDGE only. It does not add data to the mirror whitelist.

Providers create orders in their own discipline. Medtech staff can read order context and patient identity, start or reject work, and save their own result draft. Other providers cannot see drafts. The author finalizes a result; only the ordering provider marks it reviewed. A correction adds a new finalized result linked to the previous result, leaves the previous values unchanged, and requires provider review again. Cancellation and rejection keep the order and reason in history.

Every mutation locks the order and checks its revision. Finalization and correction also check the result revision and author. A unique original-result index and unique correction link protect the linear result history.

## Public HTTP examples

Use the existing sign-in flow to obtain a token. These examples assume the indicated staff role, UUID variables, and a synthetic patient. Do not put real patient data in shell history.

```powershell
$clinicUrl = 'https://clinic.example'
$headers = @{ Authorization = "Bearer $token" }
$order = Invoke-RestMethod "$clinicUrl/patients/$patientId/lab-orders" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ requestedTests = @('Complete blood count'); clinicalContext = 'Synthetic anemia check'; priority = 'routine'; requestedFor = '2026-10-15' } | ConvertTo-Json)
Invoke-RestMethod "$clinicUrl/patients/$patientId/lab-orders" -Headers $headers
```

With a medtech token:

```powershell
Invoke-RestMethod "$clinicUrl/laboratory/queue?scope=pending" -Headers $headers
$order = Invoke-RestMethod "$clinicUrl/lab-orders/$($order.id)/start" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ expectedRevision = $order.revision } | ConvertTo-Json)
$order = Invoke-RestMethod "$clinicUrl/lab-orders/$($order.id)/result" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ expectedRevision = $order.revision; values = @(@{ test = 'Hemoglobin'; value = '13.2'; unit = 'g/dL'; referenceRange = '12-16'; flag = 'normal' }); notes = $null } | ConvertTo-Json -Depth 4)
$result = $order.results | Where-Object status -eq 'draft'
$order = Invoke-RestMethod "$clinicUrl/lab-results/$($result.id)/finalize" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ expectedRevision = $result.revision; expectedOrderRevision = $order.revision } | ConvertTo-Json)
$result = $order.results | Where-Object id -eq $result.id
$order = Invoke-RestMethod "$clinicUrl/lab-results/$($result.id)/corrections" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ expectedRevision = $result.revision; expectedOrderRevision = $order.revision; reason = 'Synthetic instrument correction'; values = @(@{ test = 'Hemoglobin'; value = '12.8'; unit = 'g/dL'; referenceRange = '12-16'; flag = 'normal' }); notes = $null } | ConvertTo-Json -Depth 4)
```

With the ordering provider token:

```powershell
$order = Invoke-RestMethod "$clinicUrl/lab-orders/$($order.id)/review" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ expectedRevision = $order.revision } | ConvertTo-Json)
```

For a different open order, the ordering provider can cancel it. Medtech staff can reject it. Both actions require a reason:

```powershell
Invoke-RestMethod "$clinicUrl/lab-orders/$openOrderId/cancel" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ expectedRevision = $openOrderRevision; reason = 'No longer needed' } | ConvertTo-Json)
Invoke-RestMethod "$clinicUrl/lab-orders/$openOrderId/reject" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ expectedRevision = $openOrderRevision; reason = 'Specimen not suitable' } | ConvertTo-Json)
```

## Focused verification

The public HTTP test was written before feature implementation. The first run could not start because workspace packages were not installed. Offline install missed one cached package; one frozen online install completed. The completed check runs with:

```text
pnpm --filter server exec vitest run --config vitest.e2e.config.mts test/laboratory.e2e-spec.ts
```

It uses a test-only in-memory database fixture and a test principal guard. It verifies order creation, missing-patient rejection, clerk denial, restricted queue identity, hidden provider drafts, medtech ownership, stale revisions, finalization, immutable original values, correction links, originating-provider review, cancellation, rejection, and terminal-state denial.

This fixture does not verify PostgreSQL row locks, database persistence, migration deployment, token authentication, or live IPC wiring. Those require the integrated app and a synthetic PostgreSQL database. No existing database was migrated or reset.

## UI review boundary

The feature reuses the existing Button, Input, Textarea, Field, Confirm, Loading, and Empty components and the clinic's tokens. Native controls have visible labels. Tables preserve complete values and provide a keyboard-focusable scroll region. Destructive closures require a reason and confirmation. Unsaved form input has an explicit discard confirmation. Pending queues have a refresh action; failed and stale writes keep form input.

No new motion is used. Queue navigation and value entry occur tens to hundreds of times daily, so movement was rejected. Result tables contain clinical data to read, so decorative motion was rejected. Finalization already uses the existing confirmation component and needs no added motion.

The six better-interface domain sources and Emil guidance were read. Source inspection and static checks cover names, control semantics, state labels, tokens, responsive CSS, and motion. Rendered contrast, 320px reflow, 200% zoom, keyboard traversal, and screen-reader behavior remain unverified until central app wiring is complete. No visual approval is claimed.
