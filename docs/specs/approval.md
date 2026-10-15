# clinic-demo-v1.2 approval and amendment history

Current version: **clinic-demo-v1.2**, user-requested UI refinement on **2026-10-15, Asia/Manila**. The clinic-demo-v1.1 mirror scope and original v1 approval/history remain unchanged below.

Exact user instructions:

> improve color themes, not just plain white but also make it accessible and pleasant to the eyes /emil-design-eng
>
> use [$emil-design-eng] and [$break] the UI to find issues
>
> [$ask-sonner] setup toasts also

This amendment records the requested palette and toast implementation. The change uses a pale sage canvas, warm ivory cards, and deep blue-teal actions; existing semantic status pairs and persistent save/error messages remain. Sonner provides brief noncritical feedback. This amendment does not change clinic workflows, database schema, or migrations.

It records implementation scope from the user's request; it is not a separate visual sign-off.

Exact current user answers:

> Include mirroring in the October 16 demo

> One-way mirror; edge writes, cloud read-only (recommended)

The earlier broad cloud exclusion applied to both tracks; it was an implicit scope deferral rather than a separately answered cloud requirement. The user's new selection supersedes it. Required Backend-owned mirroring now covers approved structured records and minimum attribution with authoritative edge writes, staff-read-only cloud, durable nonblocking delivery and actual cloud proof. Credentials/sessions/secrets and unapproved attachments are excluded. [mirror-amendment.md](mirror-amendment.md) and [ADR-0002](../adr/0002-one-way-application-mirror.md) are added to the current approved document set; prior staff/API/design requirements remain except this stated supersession.

One additional standalone Backend mirror issue brings the plan to **eleven issues**, six Backend/five Frontend. All ten existing scope boilerplates and #9/#10 verification/dependencies are amended; no original issue is repurposed or renumbered. No cloud UI/portal or Frontend transport ticket is inferred. See [current issue index](issue-index.md).

This authorizes specification/issue amendments. Product feature implementation still requires a separate explicit build instruction; actual hosting/credentials/resource creation/deployment are future authorized build preparation, not work performed here. Real cloud endpoint proof is required for October 16; local container tests alone cannot claim it. Demo remains synthetic and makes no production-readiness claim. Follow-up commit/push is coordinated separately; this worker performs neither.

---

## Original clinic-demo-v1 approval (preserved history)

Status: **approved**. Date: **2026-10-14, Asia/Manila**.

Exact user authorization:

> Approve specs and publish the 10 tickets. Commit and push using my GH CLI afterwards. Also, I set my user.email and user.name in the root /health-ier as the same as the github

This approves the clinic-demo-v1 requirements, API/field/session contract, design baseline, and five paired Backend/Frontend outcomes (ten tickets). It authorizes their GitHub publication and subsequent commit/push of the setup/specification work. **It is not a product feature build instruction.** Feature implementation remains gated on a separate explicit request.

## Approved document set

- [Clinic baseline](clinic-baseline.md)
- [Staff permissions](permissions.md)
- [Demo flow and end-to-end acceptance](demo-flow.md)
- [API and field contract](api-contract.md), including native main-memory session transport and error/version policy
- [Fixed documents and synthetic data](demo-data-and-documents.md), including supplied unified header/assets
- [Decision record and explicit deferrals](pending-decisions.md)
- [Ten-ticket plan/index](backlog.md)
- [DESIGN.md](../../DESIGN.md) staff-tool tokens/components/accessibility baseline
- [CONTEXT.md](../../CONTEXT.md) domain language and [LAN persistence ADR](../adr/0001-clinic-lan-persistence.md)

Routes, UI flows, and template reproduction are approved implementation plans, not claims that they exist or were verified. Current source/scan observations remain evidence; public issue content uses synthetic information only. Demo ready target is October 15, presentation October 16 morning, Asia/Manila. Deferred modules and production readiness limitations remain unchanged.

Issues use branch `master` links to these docs. At initial publication the repository has no commit/default branch; those file links become live only after the separately authorized initial commit/push. The issue URLs themselves are verified after creation. Later material scope changes require a spec/version update and approval.
