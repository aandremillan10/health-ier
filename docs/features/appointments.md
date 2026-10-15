# Daily appointments and clinic flow

Issue: #15. Appointments describe operational queue state. They do not replace a consultation entry or a laboratory order/result.

## State and access

Normal flow: `scheduled -> arrived -> waiting -> with_provider -> completed`. Medical and dental care can use `with_provider -> lab -> with_provider` before completion, or `lab -> completed`. Laboratory appointments use `waiting -> lab -> completed`. Only a scheduled appointment whose scheduled time has passed can become `no_show`.

All authenticated staff can read the operational board. The response has patient identity, workflow state, scheduling details and staff attribution; it has no consultation or laboratory result content.

- Clerk and nursing attendant: schedule patients, mark arrival, move to waiting, and mark no-show. State corrections are limited to scheduled, arrived, waiting and no-show states.
- Doctor: workflow changes and corrections for medical appointments.
- Dentist: workflow changes and corrections for dental appointments.
- Medical technologist: workflow changes and corrections for laboratory appointments; return medical/dental appointments from lab to their provider.
- Clinic head status does not grant another discipline's care transitions.

Every state change requires `expectedRevision`. The server locks the appointment row, checks the revision, and stores the new revision and history event in one transaction. A correction requires a reason. Original events remain available. Staff identity and event times come from the server.

## HTTP usage

Use an authenticated clinic EDGE server. The examples use shell variables `CLINIC_URL`, `TOKEN`, `PATIENT_ID` and `APPOINTMENT_ID`. Do not put real credentials in this document.

Schedule the selected registry patient as a clerk or nursing attendant:

```sh
curl -X POST "$CLINIC_URL/appointments" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data "{\"patientId\":\"$PATIENT_ID\",\"discipline\":\"medical\",\"scheduledAt\":\"2026-10-16T09:00:00+08:00\"}"
```

Read the Manila daily board:

```sh
curl "$CLINIC_URL/appointments?date=2026-10-16&discipline=medical" -H "Authorization: Bearer $TOKEN"
```

The optional `clinicId` filter can only return this server's configured clinic. The date range is `[00:00+08:00, next day 00:00+08:00)`, regardless of server or workstation timezone. Create requests must state `+08:00`; responses use UTC ISO timestamps. Each daily response contains at most 10,000 appointments.

Mark arrival at revision 1:

```sh
curl -X POST "$CLINIC_URL/appointments/$APPOINTMENT_ID/transitions" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data '{"expectedRevision":1,"status":"arrived"}'
```

Correct an arrival that was recorded for the wrong patient at revision 2:

```sh
curl -X POST "$CLINIC_URL/appointments/$APPOINTMENT_ID/corrections" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data '{"expectedRevision":2,"status":"scheduled","reason":"Arrival was selected for the wrong patient."}'
```

An invalid step returns HTTP 409 `LIFECYCLE_CONFLICT`. A stale write returns HTTP 409 `STALE_REVISION` and `currentRevision`. Unauthorized steps return HTTP 403. Unknown fields and invalid dates are rejected at the HTTP and desktop IPC boundaries.

## Integration pointers

- Register `AppointmentsController` and `AppointmentsService` in the server module.
- Extend shared request/response maps with `AppointmentRequests` and `AppointmentResponses` from `app/src/shared/appointments-api.ts`.
- Spread `appointmentRequestGuards`/`appointmentResponseGuards` into desktop guards. Send only these fixed operations through `appointmentRoute`; no renderer-supplied URL is accepted.
- Expose the four operation names through preload. Combine `createAppointmentDesktopClient(wire)` with the existing renderer client.
- Render `Appointments` with the current staff, selected patient, API, session-expiry callback, and optional patient-open/dirty callbacks. Keep its API object stable between renders. Use a staff/selected-patient key when the shell switches either identity.
- The explicit demo uses `createDemoAppointments({ getStaff, getPatient, isAvailable })`. Its internal `snapshotAppointments()` returns cloned records for synthetic reports. Do not expose that method through preload.
- Reports can use `Appointment.scheduledAt`, `status`, `discipline`, `statusChangedAt` and `AppointmentEvent.occurredAt`. Events carry `kind`, `fromStatus`, `toStatus`, actor and revision. A correction is a new event, so reports must state whether they use current state or historical event counts.
- Parent audit work can record create/change events inside the existing service transactions. No mirror entity, worker, or cloud write path changes are part of #15.

## Focused verification

The public synthetic adapter check was written before its implementation. Its first runnable check failed because the adapter did not exist; it then passed. Run:

```sh
pnpm --filter app exec vitest run src/renderer/clinic/appointments-demo.spec.ts
pnpm --filter app typecheck
pnpm --filter server typecheck
pnpm --filter server prisma:validate
```

The check covers normal care, optional lab flow, rejected jumps, denied care transitions, stale revisions, preserved correction history, no-show handling, and Manila day/discipline filtering. It does not establish PostgreSQL locking, deployed HTTP behavior or two physical workstations. The coordinating implementation must run the HTTP integration flow after central registration and migration.

UI source review used DESIGN.md, Emil design engineering and the six better-interface domain skills. Controls use native form semantics, visible labels, the existing focus rules, named status text, table-scroll cues and persistent errors. Automatic refresh can be paused. No new animation was added: daily filtering, queue steps and history scanning are repeated tasks, and moving clinical workflow data would impede reading. Rendered contrast, zoom, screen-reader output and browser interaction remain unverified in this isolated feature checkout.
