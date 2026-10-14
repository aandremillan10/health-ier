# Decision and approval record

Status: **all ten questions resolved; clinic-demo-v1 approved on 2026-10-14, Asia/Manila**. No product feature build instruction has been given. This filename is retained for stable links; it now records resolved decisions and the approval gate.

## Confirmed on 2026-10-14

| Interview | Decision                                                                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1        | Internet-only outage continuity with LAN/server available; clinic NestJS/PostgreSQL, no WatermelonDB.                                                                                                                                                                                        |
| Q2        | Staff demo registration → vitals → medical consult → prescription/printing plus MedCert and dental/lab authorization proof. Ready October 15; present October 16 morning, Asia/Manila.                                                                                                       |
| Q3        | Same-discipline shared charts; own-author edits/corrections; head read-only across others.                                                                                                                                                                                                   |
| Q4        | Shared patient registry, separate protected discipline records.                                                                                                                                                                                                                              |
| Q5        | Accepted conservative role plan; one named account each.                                                                                                                                                                                                                                     |
| Q6        | Head is one doctor with separate oversight field/capability; retain own medical authorship. Draft → explicit finalize → attributed correction preserving original.                                                                                                                           |
| Q7        | Fixed prescription/medical-certificate templates; editable certificate purpose; synthetic demo; no visual builder.                                                                                                                                                                           |
| Q8        | Photographed forms as baseline with distinct headers, handwritten signatures, no stored signatures. User supplies clearer scans/header-only assets; actual paper/printer validation later. Astra handoff preauthorized only for future print-template work after separate build instruction. |
| Q9        | Patient category plus optional employee reference, no eligibility enforcement/family linking.                                                                                                                                                                                                |
| Q10       | Eight named synthetic seed accounts, one head doctor, real local password login through controlled setup command; no account-admin screens.                                                                                                                                                  |

GitHub destination is confirmed as [aandremillan10/health-ier](https://github.com/aandremillan10/health-ier) with exact labels `todo`, `in progress`, `in review`, `done`.

## Approved implementation baseline

The minimal fields/routes/session/error policy in [api-contract.md](api-contract.md) and UI tokens in [../../DESIGN.md](../../DESIGN.md) are approved together as clinic-demo-v1. They do not imply implemented APIs or approved visual screens. Lab proof uses isolated medtech/head access; order/referral/result sharing is deferred. Prescription/certificate issuance requires the original doctor's own finalized consultation; authorized reprint preserves the immutable document identity.

No new product decision frontier remains for the narrow demo. After Q8, user supplied `docs/headers/flattened_medcert.jpg`, `flattened_prescription.jpg`, `header.jpg`, and `transparent_header.png`. Latest unified-header instruction supersedes the earlier distinct-header direction. Source reviewer inspected all four; assets are available and blank. Actual printer paper/margins, structural measurement validation/ambiguous `CS`, and server/browser/device details are implementation verification inputs. Preserve unknown values rather than invent clinical information.

## Deferred beyond October 15

Cloud/full mirrors/replication; live queue; scanning/import; eligibility enforcement/dependent linking; dispensing/inventory; reports/dashboard; inactive historical-author corrections; full dental/lab workflows; visual template builder. Production hosting/backup/retention/account management needs a later scope before real clinic use. These are explicit deferrals, not unanswered blockers for this demo.

## Approval gate

Final shared-understanding signoff is recorded in [approval.md](approval.md), version **clinic-demo-v1**, approved **2026-10-14 Asia/Manila** with the exact user quote. The ten agreed GitHub tickets are authorized for publication. A separate explicit build instruction remains necessary for product feature implementation. Tooling scaffolding alone is currently authorized. Later material scope changes reopen affected criteria.
