# Approved staff access specification

Status: **approved clinic-demo-v1.1, 2026-10-14, Asia/Manila**. See [approval record](approval.md). Server authorization applies to every operation and returned payload. Feature build permission remains separate from spec approval.

## Named accounts and head designation

Each staff member has a named account independent of the shared desktop. A staff role establishes clinical authority. The head is one medical doctor with a separate oversight flag, not a replacement role: own medical authorship remains, all other authors/disciplines are read-only through oversight.

| Role                             | Registry                        | Vitals                     | Medical chart                           | Dental chart                           | Laboratory                                     | Edit another author's entry                 |
| -------------------------------- | ------------------------------- | -------------------------- | --------------------------------------- | -------------------------------------- | ---------------------------------------------- | ------------------------------------------- |
| Clerk                            | Lookup/demographics             | No authoring               | No provider notes                       | No provider notes                      | No clinical results                            | Denied                                      |
| Nursing attendant                | Lookup/demographics             | Author own measurements    | No provider notes                       | No provider notes                      | No lab authoring                               | Denied                                      |
| Doctor                           | Relevant patient lookup         | Read care context          | Shared read; author own medical entries | Denied without head oversight          | Denied without head oversight                  | Denied                                      |
| Dentist                          | Relevant patient lookup         | Read approved care context | Denied without head oversight           | Shared read; author own dental entries | Denied without head oversight                  | Denied                                      |
| Medtech                          | Minimum identity for lab record | No general vitals chart    | No full chart/provider notes            | No full chart/provider notes           | Shared laboratory records; own authorship only | Denied                                      |
| Head oversight (added to doctor) | Lookup                          | Read                       | Read all                                | Read all                               | Read all                                       | Denied; own medical authority still applies |

For the narrow demo, seeded laboratory records stay in the laboratory discipline: medtechs share reads, head oversight reads, doctors/dentists without head are denied. Order/referral/result sharing and complete lab workflows are deferred. Vitals available to a care role do not disclose provider notes to attendant/clerk. Registry lookup never includes unrestricted clinical records.

## Authorship and lifecycle

The author edits their draft, then explicitly finalizes it. Preserve original finalized content. An author correction records actor, time, reason/content, and original-entry linkage without replacement. Oversight and same-discipline read access never allow another author's correction. Apply these lifecycle/ownership rules to vitals as well as provider entries. Use server-managed revision checks for edit/finalize/correction: reject stale requests without losing newer content and return a recoverable conflict. Historical/inactive authors and delegated corrections are deferred.

For the selected medical documents, only the medical doctor who authored the finalized medical consultation may preview/issue a prescription or certificate from it, using their trusted issuer identity. Head oversight or colleague read access cannot issue as another author. An authorized read-only viewer may view/reprint an existing document under its chart policy; reprint retains document identity and never mutates or reissues it.

## Backend acceptance criteria

v1.1 mirror boundary: dedicated clinic-scoped machine ingestion may write the CLOUD mirror, but staff clinical mutations are denied in CLOUD mode. Staff tokens cannot ingest. Any exposed cloud staff reads enforce this matrix and filtered DTOs; no cloud staff-login/portal is required for operator/API/database demo proof. Minimum mirrored staff/author display metadata grants no login authority. Passwords/hashes/sessions/tokens/secrets/unapproved attachments stay excluded. See [mirror amendment](mirror-amendment.md).

1. Authenticate named staff; enforce role, discipline, head capability, author, and lifecycle checks on reads/searches/writes/documents. Direct API requests cannot bypass the matrix.
2. Same-discipline colleagues read allowed entries but cannot edit/finalize/correct another author. Head reads all disciplines, is denied others' writes, and edits own medical draft through medical authority.
3. Clerk/attendant responses omit provider notes/restricted attachments. Medtech receives minimum patient identity and isolated laboratory records, never mixed charts. Doctor/dentist without head cannot retrieve lab content. Filter on the server before returning data.
4. DTOs/errors/general logs omit passwords, hashes, secrets, and unauthorized clinical payload. Document/download/print-data access inherits chart policy.
5. Draft/finalize/correction operations, including vitals, enforce ownership/version checks transactionally. Tests show original preservation, attributed correction, denied cross-author correction, and rejected stale writes. Document tests deny issue/mutation as another author and preserve document ID on reprint.
6. Matrix tests exercise allowed/denied direct API calls and scoped search/record/document responses with synthetic patients and two medical authors.

## Frontend acceptance criteria

1. Display staff identity, selected patient/chart, and applicable task controls. Clearly explain others' entries/oversight as read-only.
2. Distinguish `Save draft`, `Finalize entry`, and `Add correction`; display original plus correction history.
3. Denied operations reveal no denied content. Stale-write recovery keeps unsaved input where practical and asks the user to review latest content before retrying.
4. Logout/account switch clears user-scoped queries, patient/record state, documents/previews, and cached prior responses. Invalidate affected data when permissions change.
5. Integrated proof covers same-discipline shared read, cross-discipline denial, minimum lab context, head read-only, own authorship, forbidden others' correction, protected documents, and no cache leakage from head/doctor to clerk.
