# Clinic operations: audit and reports

Issues #19 and #21 provide audit review and operational reports for the clinic. They use the server, fixed desktop IPC operations, renderer screens, and explicit synthetic demo. New records remain on the EDGE server; the mirror whitelist is unchanged.

## Access and data

Only the clinic head can query audit events. The head, clerk, and nursing attendant can read and export operational reports. The server enforces these rules. Other roles receive HTTP 403 even if they call the endpoints directly.

Audit events store actor identity/role, action, server time, patient/resource identity, outcome, source, and workstation context when available. They do not store request bodies, clinical note/result content, passwords, or session tokens. Database triggers reject updates and deletions. There is no staff-facing mutation or deletion API.

Patient/resource reads and document previews create view events. Patient, entry, vital, document, summary, appointment, laboratory, and referral writes record their event in the same transaction as the data change. Controller failures record minimal failure metadata when the database remains available. Authentication failures cannot be attributed to an authenticated actor. Report exports record an export event.

Desktop printing records success or failure after the main process receives the print callback. A print job accepted by the spooler remains submitted if the later audit request fails; the UI warns that its audit event was not saved. A successful callback confirms submission, not paper output. The renderer has no general audit-write operation. Document import (#17) has no workflow in the current branch; its import action is reserved, and import integration remains pending with that feature.

Audit queries return at most 50 events and a next cursor. Filters include date range, actor, patient, resource, and action. The viewer clears results when its query changes and provides loading, empty, denied, failure, and reconnect feedback.

## Report definitions

Dates are inclusive Asia/Manila calendar days. The server uses `[from 00:00+08:00, day after to 00:00+08:00)`, with a maximum of 366 days. A report reads one consistent database snapshot. Daily rows include days with no visits, all three departments are present, and the recorded-sex breakdown includes every category.

| Metric                                                                                                                                                                             | Definition                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visits per day                                                                                                                                                                     | Appointments scheduled in the range whose current state is arrived, waiting, with_provider, lab, or completed; one visit per appointment. Scheduled and no_show are excluded.                                        |
| Patients by department                                                                                                                                                             | Distinct patient IDs among those visits, counted separately for medical, dental, and laboratory.                                                                                                                     |
| Patients by recorded sex                                                                                                                                                           | Distinct patient IDs among those visits, grouped by the current recorded sex. A patient with repeat visits counts once. Null or unknown values are grouped as Not recorded; other remains its own category.          |
| No-shows                                                                                                                                                                           | Appointments scheduled in the range whose current state is no_show.                                                                                                                                                  |
| Pending labs                                                                                                                                                                       | Orders created in the range whose current state is ordered or in_progress. This is the pending cohort created during the selected period.                                                                            |
| Average laboratory turnaround                                                                                                                                                      | Minutes from order creation to its first finalized result, for orders created in the range with a finalized result. Corrections retain the first finalization. Rounded to one decimal; null when no results qualify. |
| New registrations                                                                                                                                                                  | Patient records created in the range.                                                                                                                                                                                |
| Appointment and laboratory counts use current states, so later corrections can change an earlier period's totals. Patient sex is current registry data, not a historical snapshot. |

CSV export contains the selected range, totals, daily visits, department counts, and recorded-sex patient counts. It contains no patient rows or clinical content. The screen supplies the report fingerprint; the server recomputes the same aggregate snapshot and returns HTTP 409 if it changed. Staff must refresh before export in that case.

## Public HTTP examples

Use the existing login operation. Keep tokens in local variables. These examples use synthetic records and an authenticated EDGE server.

As the clinic head:

```powershell
$headers = @{ Authorization = "Bearer $token" }
$range = 'from=2026-10-01&to=2026-10-15'
$page = Invoke-RestMethod "$clinicUrl/audit-events?$range&action=view" -Headers $headers
Invoke-RestMethod "$clinicUrl/audit-events/actors" -Headers $headers
Invoke-RestMethod "$clinicUrl/audit-events?$range&patientId=$patientId&actorId=$staffId&resourceId=$resourceId" -Headers $headers
if ($page.nextCursor) { Invoke-RestMethod "$clinicUrl/audit-events?$range&action=view&cursor=$($page.nextCursor)" -Headers $headers }
```

As the head, clerk, or nursing attendant:

```powershell
$report = Invoke-RestMethod "$clinicUrl/reports?$range" -Headers $headers
$export = Invoke-RestMethod "$clinicUrl/reports/export" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ from = $report.from; to = $report.to; fingerprint = $report.fingerprint } | ConvertTo-Json)
$export.csv | Set-Content -LiteralPath $export.filename -Encoding utf8
```

The trusted desktop main process sends print outcome after its callback. To check that HTTP endpoint with a synthetic saved document and an authorized doctor/head token:

```powershell
Invoke-RestMethod "$clinicUrl/audit-events/print" -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ documentId = $documentId; outcome = 'success' } | ConvertTo-Json)
```

This records supplied print metadata. Calling it directly does not perform or prove a print job.

## Verification and interface review

Focused controller/service checks cover audit authorization and filter bounds, report metrics/date grouping/export parity, laboratory lifecycle, and referral lifecycle. They use database-boundary fixtures. Existing desktop broker/preload/client checks and the appointment demo check cover typed transport and guard behavior. Type checks, lint on changed TypeScript, and both builds passed.

The separate integrated HTTP run used a newly created synthetic PostgreSQL database, real migrations, and five authenticated role sessions. It covered all seven issue flows, stale revisions, denied access, preserved history, laboratory referral completion, report deltas/export parity, and audit identity/content exclusions. Its [sanitized report](../qa/clinic-operations-http-evidence.json) records 55 requests and ten passed check groups. Existing databases were not migrated or reset.

Source review used DESIGN.md, Emil design engineering, and all six better-interface domains. Controls have visible labels, native semantics, existing focus rules, textual states, and shared field/error components. Tables have explicit overflow containers; forms and toolbars reflow. Save failures retain input, and unsaved forms use the shell's navigation guard. Laboratory drafts retain their original revision across refresh and require recovery after a conflicting change.

No new motion was added. Queue changes, filtering, entry, and history reading are frequent clinic tasks; extra motion was rejected. Rendered keyboard/focus order, screen-reader output, contrast, smaller windows, and 200% zoom still need visual QA. Physical printing, multiple workstations, cloud mirroring, and production migration were not exercised by this run.
