# clinic-demo-v1.3 proposed amendment

Status: **Approved.** Approval date: 2026-10-15, Asia/Manila. User confirmation: “implement them” in response to the final draft review.

## Scope and provenance

The user confirmed the following changes after reviewing the photographed notes. All four have equal priority for one amendment:

1. Reduce the patient clinical-summary fields.
2. Add height and improve blood-pressure entry; allow the Clinic head to correct finalized vital signs.
3. Fully remove the HMO membership and dependent-eligibility feature, including its data.
4. Color-code audit actions.

The patient category and optional employee reference remain in the patient registry as informational fields. They do not create or imply membership or eligibility. Keep the existing application branding. This proposal leaves the clinic-demo-v1.2 approval record intact until this amendment is approved.

Owners remain the user for Backend work and the user's teammate for Frontend work. The shared API contract and integration check must agree before implementation. No new domain term is needed.

## Workflow and requirements

### Clinical summary

Keep these active fields:

- Allergy: substance and notes.
- Medication: name, dose with its unit, and notes.
- Condition: name and notes.
- Remove immunization from the supported summary kinds.

Keep the existing source field required and notes optional. Do not show retired fields, including in old records or history. Keep existing clinical-summary records and revision history in storage. Filter old snapshots to the supported fields when they are returned. Exclude legacy immunization items from summary and history results; a direct history request for one returns the usual not-found response. On a new edit or correction, save only supported fields in the new revision; retain prior stored revisions.

Existing clinical-summary roles and author rules remain: doctors and dentists may create; only the author may update or correct; the existing read policy applies. This amendment does not add clinical-summary mirroring.

### Vital signs

Show blood pressure as one visual group with two numeric inputs and a visible slash. Keep `systolic` and `diastolic` as separate nullable numbers in the API and database. Add nullable `height` in centimetres. Keep weight in kilograms. Unknown measurements remain null; do not infer a value or reject an abnormal reading using a normal-range rule. Include height in the one-way mirror payload.

Nursing attendants keep their existing ability to create, edit, and finalize their own drafts. A Clinic head may append a correction to any finalized vital-sign record. The correction must name the current source revision, include a reason, attribute the head as author, and preserve the original. A Clinic head cannot edit another attendant's draft. Non-head staff keep the existing author and role limits.

### HMO membership and dependent eligibility

Remove the family/membership screen, navigation, local demo state, shared and preload contracts, Backend module and routes, and membership-derived report totals. Remove the `Membership`, `DependentLink`, `MembershipRevision`, and `DependentLinkRevision` tables and their stored rows through a forward migration. Remove employee and dependent totals from report responses and CSV exports; do not replace them with counts derived from patient category or employee reference.

Keep `Patient.patientCategory` and the optional `Patient.employeeIdentifier`, as approved in Q9. Keep generic system audit events for accountability. Remove membership and dependent feature routes rather than returning empty data. A request to a removed route must return the ordinary not-found response.

This database removal is destructive: it permanently deletes membership, dependent-link, and revision data. The forward migration must remove revision tables before their parent tables and remove their Staff/Patient relation fields from the schema. Do not run a production migration under this proposal.

The trade-off is recorded in [ADR-0004](../adr/0004-remove-hmo-membership-data.md).

### Audit action colors

Use the existing semantic tokens and keep the action text visible:

| Audit action                | Semantic color |
| --------------------------- | -------------- |
| `view`                      | neutral        |
| `create`, `finalize`        | success        |
| `change`, `correction`      | warning        |
| `import`, `export`, `print` | info           |

Color must not be the only way to identify an action. Keep the audit API and filtering behavior unchanged.

## Backend acceptance criteria

- Accept only the reduced clinical-summary shapes. Reject retired fields and immunization writes. Return only reduced fields from current records and history, including records created before this amendment. Preserve stored revisions.
- Keep the existing clinical-summary authorization, revision checks, and lifecycle behavior.
- Persist and validate nullable `height` in centimetres. Return it in vital-sign reads and corrections, and include it in the one-way mirror event. Preserve null and existing structural-only validation behavior.
- Allow a Clinic head to correct another author's finalized vital-sign record through the correction operation. Reject head edits to another author's draft and preserve the existing original, source revision, reason, actor, and audit attribution. Keep non-head cross-author writes denied.
- Remove all family/membership/dependent routes and their implementation, including history and eligibility calculation. Remove the four membership tables and their rows. Keep registry category/reference fields and generic audit events.
- Remove employee/dependent totals from report JSON, its fingerprinted content, and CSV output. Keep other report totals and access rules.
- Keep the audit API unchanged; no server-side color state is added.

## Frontend acceptance criteria

- Show only the approved clinical-summary fields. Old records and history must not display retired fields or immunizations. Keep source, notes, authorship, status, and the existing correction/history actions.
- Show blood pressure as two labeled numeric inputs separated by a visible slash. Keep keyboard and screen-reader labels for each value. Add a nullable height input labeled in centimetres and display it with the same unit.
- Show a specific correction action for the Clinic head on any finalized vital-sign record, including another attendant's. Keep drafts by another author read-only. Show the correction reason and attributed author in history.
- Remove all HMO/family navigation, screens, actions, demo rows, and HMO-derived report totals. Keep patient category and optional employee reference in the registry without eligibility language.
- Apply the audit action colors in the table above, using the existing semantic tokens. Keep action labels visible and preserve keyboard access and filters.

## Shared API contract

All operations keep the existing authenticated EDGE API, session transport, error envelope, and revision-conflict behavior. No new route is added.

### Clinical summary

Supported `content` shapes are:

```ts
type SummaryContent =
  | { kind: 'allergy'; substance: string }
  | { kind: 'medication'; name: string; dose: string | null }
  | { kind: 'condition'; name: string };

type SummaryFields = {
  content: SummaryContent;
  source: string;
  notes: string | null;
};
```

Medication `dose` is text that includes its unit, for example `"500 mg"`. Existing routes remain. All require the current Bearer session and keep current role checks. Examples use synthetic IDs.

| Operation           | Request                                                                                                                                                                                                                                                          | Expected response                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Read summary        | `GET /patients/00000000-0000-4000-8000-000000000001/clinical-summary`                                                                                                                                                                                            | `200 {patientId, canCreate, items}`; items contain only supported kinds and fields. |
| Create allergy      | `POST /patients/00000000-0000-4000-8000-000000000001/clinical-summary` with the body below                                                                                                                                                                       | `201 SummaryItem` with only `kind` and `substance` in `content`.                    |
| Update own item     | `PATCH /clinical-summary-items/00000000-0000-4000-8000-000000000002` with `{"expectedRevision":1,"reason":"Synthetic update","content":{"kind":"allergy","substance":"Synthetic example substance"},"source":"Patient report","notes":"Updated synthetic note"}` | `200 SummaryItem` with the next revision.                                           |
| Correct own item    | `POST /clinical-summary-items/00000000-0000-4000-8000-000000000002/corrections` with the same body shape and a correction reason                                                                                                                                 | `201 SummaryItem`; original snapshot remains in history.                            |
| Inactivate own item | `POST /clinical-summary-items/00000000-0000-4000-8000-000000000002/inactivate` with `{"expectedRevision":2,"reason":"Synthetic inactivation"}`                                                                                                                   | `200 SummaryItem` with `status: "inactive"`.                                        |
| Read history        | `GET /clinical-summary-items/00000000-0000-4000-8000-000000000002/history`                                                                                                                                                                                       | `200 SummaryHistory[]`; snapshots use the reduced shape.                            |

Create request body:

```http
POST /patients/00000000-0000-4000-8000-000000000001/clinical-summary
Authorization: Bearer <session>
Content-Type: application/json

{"content":{"kind":"allergy","substance":"Synthetic example substance"},"source":"Patient report","notes":"Synthetic example note"}
```

The create response includes source, notes, ID, patient/author attribution, status, revision, timestamps, and `canEdit`. The API rejects retired properties and writes with `kind: 'immunization'`. It excludes legacy immunization items from summary and history responses.

### Vital signs

Existing routes remain. Add nullable numeric `height` in centimetres to request, response, and mirror payload. Blood pressure remains two numeric fields. All examples require the current Bearer session.

| Operation                | Request                                                                                         | Expected response                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Read vitals              | `GET /patients/00000000-0000-4000-8000-000000000001/vitals`                                     | `200 Vitals[]`; each record includes nullable `height`. |
| Create draft             | `POST /patients/00000000-0000-4000-8000-000000000001/vitals` with the body below                | `201` attributed draft with `height: 165`.              |
| Edit own draft           | `PATCH /vitals/00000000-0000-4000-8000-000000000002` with `{"expectedRevision":1,"height":166}` | `200` draft with the next revision.                     |
| Finalize own draft       | `POST /vitals/00000000-0000-4000-8000-000000000002/finalize` with `{"expectedRevision":2}`      | `201` finalized record.                                 |
| Correct finalized record | `POST /vitals/00000000-0000-4000-8000-000000000002/corrections` with the head request below     | `201 {correction, original}`; original remains intact.  |

Create request body:

```http
POST /patients/00000000-0000-4000-8000-000000000001/vitals
Authorization: Bearer <attendant-session>
Content-Type: application/json

{"recordedAt":"2026-10-15T08:00:00Z","systolic":120,"diastolic":80,"temperature":36.8,"pulse":72,"respiratoryRate":16,"oxygenSaturation":98,"height":165,"weight":60}
```

The response includes the attributed draft, `height: 165`, `status: "draft"`, and its revision. A Clinic head correcting a finalized record uses this existing operation:

```http
POST /vitals/00000000-0000-4000-8000-000000000002/corrections
Authorization: Bearer <head-session>
Content-Type: application/json

{"expectedRevision":3,"reason":"Correct synthetic transcription","correctedContent":{"systolic":122,"height":166}}
```

The correction records the Clinic head as author and source revision 3; finalized original measurements remain intact. Unauthorized role, draft, or stale-revision attempts return the existing safe `403` or `409` error.

### Removed and unchanged routes

Remove these membership routes: `GET /patients/:id/family`; `POST /patients/:id/membership`; `PATCH /memberships/:id`; `POST /memberships/:id/corrections`; `POST /memberships/:id/dependents`; `PATCH /dependent-links/:id`; `POST /dependent-links/:id/corrections`; `POST /dependent-links/:id/unlink`; `GET /memberships/:id/history`; and `GET /dependent-links/:id/history`.

`GET /reports` and `POST /reports/export` remain, but their `totals` no longer contain `employees` or `dependents`; CSV output has no corresponding rows. For example, `GET /reports?from=2026-10-01&to=2026-10-15` still returns `200` with `totals: {visits, noShows, pendingLabs, averageLabMinutes, newPatients}` and the existing `daily`, `departments`, and fingerprint fields. `POST /reports/export` still accepts `{from,to,fingerprint}` and returns `{filename,csv,fingerprint}` with no employee/dependent rows. All other report and audit routes remain unchanged.

## End-to-end verification

Use synthetic patients and staff only. Verify these flows through the desktop client and EDGE server:

1. Create allergy, medication, and condition entries with the reduced fields. Read them and their history. Verify old retained entries expose no retired fields, old immunizations are absent, new retired-field and immunization writes fail, and stored old revisions remain.
2. As a Nursing attendant, create, edit, and finalize vitals with height and separate systolic/diastolic values. Verify the BP slash layout, null height handling, persisted height, and mirrored height.
3. As a Clinic head, correct another attendant's finalized vitals. Verify the original, reason, actor, and source revision remain visible in history. Verify the head cannot edit that attendant's draft, a non-head cannot correct it, and a stale revision conflicts.
4. Verify HMO screens, navigation, APIs, demo data, and employee/dependent report totals are absent. Verify the migration removes membership/dependent rows and revisions while preserving patient category, employee reference, and generic audit events.
5. Verify audit action text and semantic colors for each action group, including keyboard and non-color identification.

Save the migration and API verification evidence with implementation. Do not claim cloud proof from a local mirror test; the change only extends the existing approved one-way mirror with height.

## Approval readiness

The user confirmed the scope and priority, including removal of HMO feature data, and authorized implementation. Publish the agreed feature tickets under clinic-demo-v1.3 and link them below. Keep production migration/deployment outside this build.

### Published tickets

**Seven tickets; all open. They were created with `todo` and currently have `in progress`.**

| Outcome                                | Backend                                                       | Frontend                                                      |
| -------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Clinical-summary fields                | [#29](https://github.com/aandremillan10/health-ier/issues/29) | [#32](https://github.com/aandremillan10/health-ier/issues/32) |
| Vital signs and Clinic head correction | [#30](https://github.com/aandremillan10/health-ier/issues/30) | [#33](https://github.com/aandremillan10/health-ier/issues/33) |
| HMO removal                            | [#31](https://github.com/aandremillan10/health-ier/issues/31) | [#34](https://github.com/aandremillan10/health-ier/issues/34) |
| Audit action colors                    | No Backend change                                             | [#35](https://github.com/aandremillan10/health-ier/issues/35) |
