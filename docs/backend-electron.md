# Privileged desktop API

The Electron main process owns the staff session, fixed clinic-server requests, and printer submission. The teammate can use the typed `window.desktop.clinic` API from `app/src/shared/clinic-api.ts`. No renderer feature screens were changed. The server remains responsible for permissions, lifecycle, revision checks, and filtered records.

## Server configuration

Set `HEALTH_IER_SERVER_URL` to the exact trusted clinic **HTTPS origin**, for example `https://clinic.example:3000`. The default is `https://localhost:3000`; it requires a trusted certificate. Paths, credentials, query strings, fragments, HTTP redirects, and alternate response origins are rejected. Electron uses normal certificate validation; no trust bypass is installed.

For this synthetic local demo only, an **unpackaged** client may explicitly use loopback HTTP:

```powershell
$env:HEALTH_IER_SERVER_URL = 'http://127.0.0.1:3000'
$env:HEALTH_IER_ALLOW_SYNTHETIC_HTTP = 'true'
pnpm dev:app
```

This exception cannot be used by a packaged client or with a LAN/remote HTTP hostname. Use trusted HTTPS for clinic deployment. All configured network requests stay on this origin; cloud mirroring is server-owned.

## Teammate usage

Subscribe to session reset before login or protected reads. Immediately discard patient/chart caches, previews, unsaved account-specific state, and pending display results on every reset. Account switching clears the old session before sending new credentials; failed login leaves the workstation signed out. Unsubscribe when the owning component unmounts.

```typescript
const unsubscribe = window.desktop.clinic.onSessionReset(() => {
  clearStaffAndPatientCaches(); // Teammate's renderer state reset.
});

const login = await window.desktop.clinic.login({ username, password });
if (login.ok) showSignedInStaff(login.data);
else showError(login.error.message);

const staff = await window.desktop.clinic.currentStaff();
const health = await window.desktop.clinic.health();
const patients = await window.desktop.clinic.searchPatients({
  search: 'Synthetic',
});
const created = await window.desktop.clinic.createPatient({
  fullName: 'Synthetic Clinic Patient',
  sex: 'female',
  address: 'Synthetic demo address',
  patientCategory: 'employee',
  employeeIdentifier: 'DEMO-001',
  dateOfBirth: null,
});
if (created.ok) {
  await window.desktop.clinic.updatePatient({
    id: created.data.id,
    expectedRevision: created.data.revision,
    address: 'Updated synthetic address',
  });
}

const logout = await window.desktop.clinic.logout();
// Local logout always clears the token. serverRevoked=false requires the
// message "Signed out here; the clinic server could not confirm revocation."
unsubscribe();
```

Every result is `{ok:true,data}` or `{ok:false,error}`. Errors contain a safe discriminated code/message, validated field keys for server validation failures, and an authorized `currentRevision` for stale revision conflicts. `UNAVAILABLE` means no save was confirmed; re-read before retrying a mutation that may have reached the server. `SESSION_CHANGED` means discard the old result and obtain current authorized data. Renderer state reset is required for the integrated UI and is not implemented by this Backend change.

### Named route mapping

| Preload operation                                         | Fixed server route                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `login`, `currentStaff`, `logout`                         | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`                                                                         |
| `health`                                                  | `GET /health`                                                                                                                   |
| `searchPatients`, `createPatient`, `updatePatient`        | `GET /patients?search=...`, `POST /patients`, `PATCH /patients/:id`                                                             |
| `readVitals`, `createVitals`, `updateVitals`              | `GET/POST /patients/:patientId/vitals`, `PATCH /vitals/:id`                                                                     |
| `finalizeVitals`, `correctVitals`                         | `POST /vitals/:id/finalize`, `POST /vitals/:id/corrections`                                                                     |
| `readEntries`, `createMedicalEntry`, `updateMedicalEntry` | `GET /patients/:patientId/charts/:discipline/entries`, `POST /patients/:patientId/charts/medical/entries`, `PATCH /entries/:id` |
| `finalizeEntry`, `correctEntry`, `readCorrections`        | `POST /entries/:id/finalize`, `POST/GET /entries/:id/corrections`                                                               |
| `previewDocument`, `issueDocument`, `readDocument`        | `POST /documents/preview`, `POST /documents`, `GET /documents/:id`                                                              |
| `listPrinters`                                            | Main-only installed printer enumeration; signed-in session required                                                             |
| `printDocument`                                           | Authorized `GET /documents/:id`, then main-only printer submission                                                              |

Create/update/correction field types and nullable measurements are defined by `Requests`. No caller-supplied author, role, head status, token, issuer/license authority, raw IPC, arbitrary URL, path, shell command, or HTML is accepted. UUID routing inputs, dates, finite numbers, explicit nulls, revision integers, printer names/options, and every nested response are validated. Unexpected response fields fail closed; medtech patient search accepts only minimum identity DTOs.

## Fixed-template printing seam

```typescript
const preview = await window.desktop.clinic.previewDocument({
  consultationId,
  expectedRevision: consultationRevision,
  kind: 'prescription', // Or 'medical_certificate'.
  body: 'Synthetic medication instructions',
  issueDate: '2026-10-14',
});
const issued = await window.desktop.clinic.issueDocument({
  consultationId,
  expectedRevision: consultationRevision,
  kind: 'medical_certificate',
  body: 'Synthetic certificate findings',
  purpose: 'Synthetic demonstration',
});
if (issued.ok) {
  const existing = await window.desktop.clinic.readDocument({
    id: issued.data.id,
  });
  const printers = await window.desktop.clinic.listPrinters();
  if (existing.ok && printers.ok && printers.data[0]) {
    const printed = await window.desktop.clinic.printDocument({
      documentId: existing.data.id,
      printerName: printers.data[0].name,
      copies: 1,
      duplexMode: 'simplex',
    });
    // printed.ok means the system confirmed submission, never physical paper.
  }
}
```

Main fetches and validates the protected immutable issued snapshot, confirms envelope/snapshot IDs, checks the exact installed printer name, and accepts 1–10 copies plus the three Electron duplex modes. Reprint uses the same document ID without issuance/mutation. The print window is hidden, sandboxed, has context isolation, no preload/Node/JavaScript/devtools, an ephemeral session, denied permissions/navigation/popups, a restrictive injected CSP, and data-only resource loading. Every success, failure, timeout, or session reset closes it. A timed-out or canceled load cannot later submit. A job already accepted by the OS cannot be recalled by logout; inspect the queue before retrying an ambiguous failure.

`renderDocument(document: IssuedDocument)` in `app/src/printing/template.ts` now implements the fixed prescription and medical-certificate templates from the approved supplied forms. It uses only the main-validated immutable snapshot, escapes every dynamic string, and returns local HTML with native text/rules, inline print CSS, and the approved unified header embedded as a data URI. No network/file resource URLs, renderer HTML, stored signature image, or template builder is accepted. See [fixed print-template implementation and headless evidence](backend-print-templates.md). Renderer workflow integration and physical printer calibration remain unverified.

## Verification and remaining proof

Headless app tests cover sender/window/frame/exact-URL rejection, operation/payload attacks, fixed route construction, token omission from preload, restart/logout/account-switch invalidation, stale login/read/print results, medtech response filtering, safe error details, server failure without save confirmation, protected document/printer authorization, submission/failure/timeout cleanup, and HTML escaping/CSP. `pnpm --filter app typecheck`, app lint, app tests, and `pnpm --filter app build` validate the bundled boundary.

The opt-in `app/src/privileged/live.spec.ts` also passed against the actual local EDGE NestJS/PostgreSQL server: all named HTTP operations, correction/history envelopes, document preview/issue/read, minimum medtech identities, head dental/lab reads, staff switching, and stale revisions. Its printer adapter is synthetic and claims no Electron/physical submission. Run it without printing secrets:

```powershell
$env:HEALTH_IER_LIVE_CREDENTIALS = 'C:/absolute/ignored/.private/demo-credentials.json'
$env:HEALTH_IER_LIVE_SERVER = 'http://127.0.0.1:3000'
pnpm --filter app test
```

The server must be an explicitly controlled synthetic EDGE instance. This creates synthetic patient/vitals/entry/documents; no destructive reset is performed. Normal checks skip the live test unless the private credential path is supplied. Core Backend scripted curl verification owns the exhaustive real PostgreSQL route/RBAC/lifecycle proof. The graphical renderer cache reset and printer selection/retry flows require teammate integration and shared-resource confirmation before interactive QA. No physical printer paper, margins, printer hardware, visual template approval, or production deployment readiness is claimed here.
