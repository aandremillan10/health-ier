# Backend implementation handoff

Paste the prompt below into a new task. Drafting this file authorizes no implementation or deployment; submitting the prompt as your new request grants the stated authorization.

---

Implement the approved Backend tickets in `D:/health-ier` for the synthetic **clinic-demo-v1.1** demo. This is my explicit build instruction. I authorize the necessary isolated worktrees, Railway project/resources and CLOUD server deployment using my connected Railway account. Finish the backend flow independently of renderer UI. The target is October 15, 2026, with presentation October 16 morning, Asia/Manila.

Use local **lead-orchestrator** and **ponytail**. Delegate bounded implementation/verification contracts with checkable acceptance criteria; use **GPT-6.1 Sol, High** (`gpt-6.1-sol`, `high`) explicitly for every non-UI worker, including retries and reviewers. Validate and record this selected model without another selection question. Use `fork_turns: "none"` with self-contained contracts. Review artifacts and actual evidence before accepting workers.

## 1. Establish scope and ownership

Identify the actual repository root, branch, worktrees, changes and remote; preserve user changes. Read root and scoped `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, `CONTEXT.md`; `docs/agents/skills.md`, `issue-tracker.md`, `workflow-labels.md`; and `docs/specs/README.md` with its approved baseline, permissions, demo-flow, API, decisions, backlog/index, document/data, approval and mirror specifications. Read ADR-0001/0002. Use CodeGraph before code discovery when `.codegraph/` exists.

Read current issue bodies/comments/statuses via authenticated GitHub CLI against the verified repository. Implement dependency order:

- [#1 — staff login/authorization](https://github.com/aandremillan10/health-ier/issues/1).
- [#3 — patient registry](https://github.com/aandremillan10/health-ier/issues/3), after #1.
- [#5 — vitals/consultation lifecycle](https://github.com/aandremillan10/health-ier/issues/5), after #1/#3.
- [#7 — prescriptions/certificates](https://github.com/aandremillan10/health-ier/issues/7), after #1/#5.
- [#11 — one-way mirror](https://github.com/aandremillan10/health-ier/issues/11), integrated with #1/#3/#5/#7.
- [#9 — LAN/boundary/cloud proof](https://github.com/aandremillan10/health-ier/issues/9), after all above.

Coordinate outbox/schema contracts before domain writers diverge. Invoke local `using-git-worktrees` before conflicting parallel writers; assign isolated branches/worktrees, record each parent branch, reuse suitable isolated checkouts. Read narrower server instructions and apply relevant `server/.agents/skills` Prisma skills for the chosen implementation, not hosted Prisma provisioning for Railway PostgreSQL. Use domain-modeling/grill-with-docs only for material gaps; retain approved decisions.

Backend owns NestJS/PostgreSQL, mirror and privileged Electron main/preload/session/network/printing. General React renderer work belongs to my teammate. Attendant prepares registration/vitals; doctors author consultations, diagnosis, Rx and MedCert. Head is an additive doctor flag with read-only oversight of others. Keep dental/lab proof narrow. Follow approved session/IPC, validation, authorization and TypeScript rules.

For necessary fixed-template presentation only, invoke the Astra handoff skill and use Astra High with actual design sources and `docs/headers/` assets. Preserve unified header, native text/rules, editable certificate purpose and handwritten signatures. This exception grants no broader Frontend delegation.

## 2. Deliver a reproducible local backend

Run NestJS and live PostgreSQL locally on **this machine in EDGE mode**, with versioned migrations and controlled, resettable synthetic setup. Seed eight named synthetic accounts: two doctors (exactly one head), two dentists, two medtechs, attendant and clerk. Generate secure passwords or accept local environment inputs, hash them, and give me usernames/passwords privately in an ignored local file. Publish only synthetic names/roles and setup instructions; keep credentials/tokens out of Git, issues, logs and evidence. Never destructively reset an existing production database.

## 3. Prove every route without UI

Create and execute scripted **`curl.exe`** integration requests on Windows, with status/body assertions, working examples for every added/changed public route, and synthetic IDs/revisions. Exercise login/current staff/logout/session invalidation; patient search/create/update; vitals draft/edit/finalize/correction; consultation draft/edit/finalize/correction; document preview/issue/read/reprint. Reprint preserves ID/snapshot. Re-read after restart and from another client.

Assert invalid/missing authentication, role/discipline/author denial, filtered registry/lab/document DTOs, cross-author/head write denial, stale revisions, lifecycle conflicts, immutable originals, correction attribution, same-patient finalized-vitals linkage and trusted issuer identity. Include both doctors and all roles; clerk/attendant never receive provider notes, medtech receives minimum identity plus isolated lab data. Verify WAN-off local login/read/write/issuance; LAN/server failure reports failure without false durable-save success. Backend printing/IPC checks must distinguish submission from physical paper output.

## 4. Deploy and prove the real Railway mirror

Prefer the Railway connector, inspect existing workspaces/projects first, and reuse resources created during this run. Consult current official Railway docs where needed; create the authorized demo project with **separate Railway PostgreSQL and NestJS CLOUD mode**, private database connectivity, migrations, secrets and verified HTTPS domain. Keep the local EDGE authoritative. Railway is a read-only staff mirror, not a cloud login portal; staff authentication remains local.

Populate the local EDGE through `curl.exe`, then compare actual Railway entity IDs, revisions and allowed content against the local records. Temporarily interrupt only this application's configured outbound mirror delivery, preserving shared internet access and other user processes. Continue local saves while delivery is interrupted, restore delivery, and verify the pending versions catch up on Railway.

Prove real edge-to-Railway delivery and controlled operator/database comparison. Enforce clinic-scoped machine authentication, wrong-clinic/schema rejection, staff-token ingestion denial and CLOUD staff-mutation denial, including requests with edge staff tokens. Mirror only the approved whitelist; exclude authentication authority, secrets and attachments. Demonstrate atomic domain/outbox and receipt/apply, exact acknowledgments, outage/recovery, restart, duplicate/lost-ack replay, late-commit selection, in-flight edits, dependency recovery, stale/equal-conflicting revisions and consistent bootstrap with concurrent writes. Assert rollback, no dropped pending events, no false caught-up status and no overwritten newer/history content. Local containers alone cannot satisfy cloud proof. Avoid adding cloud staff authentication/read APIs merely for evidence.

## 5. Validate and report

Run repository checks including `pnpm check`; retain normal hooks. Build Electron if main/preload changes. Headless tests are authorized; interactive Chrome/device QA needs shared-resource confirmation and exact-session identification. Record remaining renderer/physical-printer verification explicitly.

Map each issue criterion to actual evidence. Use only `todo`, `in progress`, `in review`, `done`, one current workflow label; acceptance is required for `done`. Report commands/results, route examples, migrations/setup, private credentials-file path, cloud endpoint/resource IDs, mirror recovery evidence and remaining gaps. Claim neither production readiness nor unverified physical printing. Invoke `finishing-a-development-branch` after worktree checks pass, present integration choices and await my selection; workers must not independently merge/push/create PRs/delete worktrees. Railway authorization does not waive this Git integration gate.
