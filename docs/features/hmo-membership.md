# Explicit HMO membership and family relationships (#18)

The clerk creates and maintains membership and dependent links. Doctors, dentists, and nursing attendants can read the minimum family identity and eligibility data. The medtech role is denied unless it has clinic head oversight. The clerk and clinic head can read member references and history; head oversight alone does not permit writes.

One explicit `Membership` belongs to a member patient. A `DependentLink` connects that membership to an existing dependent patient as spouse, child, or parent. Informational registry category and employee reference fields never create or grant membership. A member reference is explicitly entered and unique.

Both records carry an active/inactive state and inclusive effective start/end dates. An inactive record remains visible. An active record before its start is not started; after its end it is expired. A dependent whose own dates cover the selected day is still ineligible when its member is ineligible. This feature reports eligibility; it does not block chart access or patient care.

Every mutation appends an immutable attributed snapshot in the same transaction. Changes require `expectedRevision` and a reason. Unlinking sets state to inactive and preserves the link, dates, and history. Corrections can change a mistaken patient selection after validating the replacement. Self links, overlapping duplicate links, circular active family relationships, and child/parent relationships that contradict known birth dates are denied. Failed mutations preserve the previous state. Date overlap includes membership dates, so disjoint historical relationships do not create a false cycle. A clinic-wide transaction advisory lock prevents concurrent graph edits from bypassing those checks.

All data stays on EDGE and is outside the v1.1 mirror whitelist.

## HTTP usage

Set `$base` to a trusted clinic origin, `$token` to a signed-in clerk token, and `$patientId` / `$dependentId` to different synthetic patients. Keep tokens out of source control.

```powershell
$headers = @{ Authorization = "Bearer $token" }
$family = Invoke-RestMethod "$base/patients/$patientId/family?asOf=2026-10-15" -Headers $headers
$fields = @{ memberNumber = 'SYNTHETIC-HMO-18'; state = 'active'; effectiveStart = '2026-01-01'; effectiveEnd = '2026-12-31' }
$member = Invoke-RestMethod "$base/patients/$patientId/membership" -Method Post -Headers $headers -ContentType application/json -Body ($fields | ConvertTo-Json)
$change = $fields.Clone()
$change.expectedRevision = $member.revision
$change.reason = 'Extended eligibility'
$change.effectiveEnd = '2027-12-31'
$member = Invoke-RestMethod "$base/memberships/$($member.id)" -Method Patch -Headers $headers -ContentType application/json -Body ($change | ConvertTo-Json)
$change.expectedRevision = $member.revision
$change.reason = 'Corrected reference'
$member = Invoke-RestMethod "$base/memberships/$($member.id)/corrections" -Method Post -Headers $headers -ContentType application/json -Body ($change | ConvertTo-Json)
$linkFields = @{ dependentPatientId = $dependentId; relationship = 'spouse'; state = 'active'; effectiveStart = '2026-01-01'; effectiveEnd = '2026-12-31' }
$link = Invoke-RestMethod "$base/memberships/$($member.id)/dependents" -Method Post -Headers $headers -ContentType application/json -Body ($linkFields | ConvertTo-Json)
$linkChange = $linkFields.Clone()
$linkChange.expectedRevision = $link.revision
$linkChange.reason = 'Extended dependent eligibility'
$linkChange.effectiveEnd = '2027-12-31'
$link = Invoke-RestMethod "$base/dependent-links/$($link.id)" -Method Patch -Headers $headers -ContentType application/json -Body ($linkChange | ConvertTo-Json)
$linkChange.expectedRevision = $link.revision
$linkChange.reason = 'Corrected effective date'
$link = Invoke-RestMethod "$base/dependent-links/$($link.id)/corrections" -Method Post -Headers $headers -ContentType application/json -Body ($linkChange | ConvertTo-Json)
$unlink = @{ expectedRevision = $link.revision; reason = 'Dependent eligibility ended' }
$link = Invoke-RestMethod "$base/dependent-links/$($link.id)/unlink" -Method Post -Headers $headers -ContentType application/json -Body ($unlink | ConvertTo-Json)
$memberHistory = Invoke-RestMethod "$base/memberships/$($member.id)/history" -Headers $headers
$linkHistory = Invoke-RestMethod "$base/dependent-links/$($link.id)/history" -Headers $headers
```

## Integration

Register `MembershipController` and `MembershipService` in the server module. Extend the shared bridge `Requests` and `Responses` with `MembershipRequests` and `MembershipResponses`. Spread `membershipRequestGuards` and `membershipResponseGuards` into the existing strict guard maps, route the ten named operations through `membershipRoute`, and expose only those names from preload.

`PatientFamily` uses a feature-local `MembershipApi`. `createMembershipDesktopClient(wire)` builds it from the named preload calls. The component takes staff, patient ID/name, `onExpired`, `onDirty`, optional `onOpenPatient`, and `searchPatients(search)`, which returns the wire `Result<PatientIdentity[]>`. Mount it in patient details for authorized roles. Existing page navigation must honor dirty edits through the supplied callbacks.

`createMembershipDemo(getStaff, getPatient)` returns `{ api, snapshot }`. Keep that one instance for the synthetic demo so member and dependent charts see the same records. The internal `snapshot()` returns a deep clone of raw `{ memberships, dependentLinks }`; use it for report aggregation. It includes explicit `patientId`, `membershipId`, `dependentPatientId`, `relationship`, `state`, and effective dates. It is not a renderer bridge operation. Demo data is in memory and does not prove live persistence.

## Focused verification

`server/test/membership.e2e-spec.ts` was written before feature logic. It covers authentication, clerk maintenance, denied clinician writes/medtech reads, empty family records, all three relationships, self/duplicate/cycle rejection, shared member/dependent views with reference redaction, stale revisions, correction/unlink history, expired dates, and inactive membership.

With an owned disposable synthetic database that already has migrations applied, set `MEMBERSHIP_E2E_DATABASE_URL` and run `pnpm exec vitest run --config vitest.e2e.config.mts test/membership.e2e-spec.ts` from `server`. The check creates and removes its named synthetic fixtures. It never migrates or resets a database.

Feature-checkout verification on 2026-10-15: server/app typechecks passed; Prisma client generation passed; the public HTTP check compiled and skipped because no owned synthetic database was supplied; the mechanical UI detector returned no findings. Live database behavior, rendered layout, keyboard/screen-reader behavior, and LAN clients remain unverified in this checkout.

Source review follows the existing Segoe UI, 16px controls, native form/disclosure elements, visible labels, shared focus rules, and semantic status labels. Empty, loading, failed save, stale revision, missing member, and duplicate-name selection states have explicit recovery actions. Patient names, dates, and IDs wrap. Repeated patient selection, editing, and history controls remain immediate; no new motion was added.
