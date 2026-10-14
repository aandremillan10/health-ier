# Fixed-document and synthetic-data baseline

Status: **approved clinic-demo-v1, 2026-10-14, Asia/Manila**; see [approval record](approval.md). No feature implementation yet.

Use [flattened certificate](../headers/flattened_medcert.jpg) (1792×2370) and [flattened prescription](../headers/flattened_prescription.jpg) (1632×2566) as form-body wording/layout references. Both are blank RGB images with 300-DPI metadata; they retain some skew/shading, so later templates rebuild native text/rules rather than print a photographic page background.

User supplied a **unified header for both**, superseding the earlier distinct-photo header direction. Prefer [header.jpg](../headers/header.jpg) (4128×1024 RGB, 300 DPI) for white-paper printing. [transparent_header.png](../headers/transparent_header.png) (774×190 RGBA) has real alpha but only 19% of JPEG width; use for small preview or request higher-resolution transparency if necessary for full-width output. See the inspected [source analysis](../references/source-analysis.md). No DOCX is required; an editable version can supplement references later. Verify actual paper size/margins on printer; metadata alone does not prove physical dimensions.

Handwritten signatures are selected. Show authorized issuer name/license/PTR and paper signature area; store no signature image and claim no digital signature. Keep photographed optional `CS` label until clinic clarification. Preserve certificate restriction/prescription follow-up wording and editable certificate purpose. Avoid importing demonstration identifiers or claims from builder UI reference.

Only original doctor author issues from their own finalized medical consultation, using trusted issuer identity. Preview is separate from issuance. Document wording/purpose edits do not alter profile or source consultation. Immutable issued snapshots permit authorized reprint with same ID; read-only viewers cannot alter or issue as another author.

Seed eight named synthetic users: two doctors (one head), two dentists, two medtechs, attendant, clerk. Use real local password verification and controlled setup command; no account-admin UI or public role registration. Setup provides demo credentials; do not copy transcript example secrets or commit real credentials. Seed synthetic patient categories/optional employee reference without eligibility rejection/family links. No source/mock person identifiers or clinical values are reused.

Astra handoff is preauthorized only for future print-template implementation after a separate explicit build instruction. Supplied assets are available; no template code is authorized now. Other Frontend work remains with the teammate. Pass actual assets, fixed-form requirements, issuer/permission contracts, design skill sources, and QA resource authorization into that bounded handoff.
