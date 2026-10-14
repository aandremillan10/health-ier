# Fixed backend print presentation

`app/src/printing/template.ts` supplies the trusted HTML to the existing privileged print service. It renders only issued prescription and medical-certificate snapshots. The renderer still owns preview/issue/print controls; no general React screen is implemented here.

## Reference correspondence

Both forms import the canonical `docs/headers/header.jpg?inline`. Vite embeds the original JPEG bytes in the main-process bundle; there is no runtime file path, network request, duplicate asset, or online font. The flattened photographs supply body wording and structure only. Paper shading, skew, and old headers are omitted.

- Prescription: date, name, age/sex/optional CS, address, native Rx symbol, medication instructions, handwritten-signature space, issuer/license/PTR, and the original follow-up note.
- Certificate: title, date, salutation, patient and consultation introduction, six minimum rules each for findings/clinical impression and remarks, requested purpose, original medico-legal restriction, and handwritten-signature space with issuer/license/PTR.
- The issued `snapshot.body` is the authored document wording: medication instructions for prescriptions, findings/clinical impression for certificates. Certificate reason/date come from the immutable consultation snapshot. No live chart/profile lookup or content mutation occurs.
- Optional custom follow-up/restriction is additional text; it never replaces the original mandatory wording. Purpose comes from the issued snapshot and remains editable before issuance through the existing API contract.
- Null age/sex/address/CS/license/PTR remain blank. Zero age remains zero. There are no invented measurements or stored signature images. A small document-ID/revision reference is added below the form for reprint identification.

Every staff/patient string is HTML-escaped. Multiline content keeps line breaks; long words wrap and long documents flow across pages without truncation. The print service supplies the denying CSP; all image bytes are local, and the template has no script, external resource, or interactive control.

## Verification and calibration

Reversible layout default: **A4 portrait, 12 mm margins**, native Arial body at 11 pt, white paper, and 12 mm handwriting space. These are implementation defaults, not measurements established by the photographs. Printer driver paper size, scaling, printable area, and actual clinic paper must be calibrated on hardware before clinical use.

Checks: app unit tests/typecheck/build and the root `pnpm check` (lint, formatting, types, tests, server end-to-end test and server build). Template tests cover both kinds, exact embedded JPEG, immutable snapshot, null/zero values, required wording, escaping and long multiline text. The existing environment-dependent live broker test remains skipped when its endpoint is not configured.

Headless Chromium printed four synthetic documents with JavaScript disabled and the production CSP. PDF text extraction confirmed the final clinical marker, mandatory note, issuer and document reference. Ordinary prescription/certificate examples each occupy one A4 page. Ninety oversized unbroken-word lines continue across seven/eight pages respectively. Inspected rendered PDF pixels include both ordinary forms and first/last stress pages. Very long documents can place the signature block on a subsequent page; no content is cut off.

Local verification evidence (generated, ignored): `out/print-evidence/`, including `render.cjs`, `results.json`, four PDFs/HTML files and page PNGs. The script uses installed Vite and the Codex bundled Playwright, PDF.js and canvas packages; it does not control the user's graphical Chrome session. Re-run from repository root with `node out/print-evidence/render.cjs` on the verification host. Evidence contains synthetic data only.

Impeccable's detector reports the Arial family as an overused font. Retained deliberately for fidelity to the supplied clinical form body and reliable offline Windows printing. No marketing typography, animation, new branding, or generated imagery is added.

Physical printer output and the teammate's future React workflow integration remain unverified. Headless PDF rendering does not establish spooler/driver behavior or claim that the final clinic print has been approved.
