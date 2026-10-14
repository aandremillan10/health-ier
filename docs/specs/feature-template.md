# Feature specification template

Use this template after the interview establishes a feature's scope. Every `Pending` entry must be answered or explicitly deferred as nonblocking before approval.

## Status and provenance

- Status: Draft / Reviewed / Approved (choose from actual evidence).
- Version and approval date: Pending.
- User confirmation: Pending.
- User outcome and first-release priority: Pending.
- Confirmed requirement source: Pending.
- Source suggestions considered, accepted, or rejected: Pending.
- Dependencies and deferred choices: Pending.

## Workflow

Describe the actor, starting state, patient/chart context, trigger, visible steps, successful outcome, and supported exception paths. Name the domain concepts using the root glossary. State what is excluded from this approved feature without inventing future requirements.

## Backend acceptance criteria

Owner: user. Define allowed and denied operations for every relevant role/discipline/author boundary, field validation, persistence/lifecycle behavior, concurrency policy, and recoverable failure behavior. State the smallest meaningful automated checks and expected results.

## Frontend acceptance criteria

Owner: teammate. Define screen/task behavior, specific action labels, identity/chart visibility, loading/empty/error/disconnected/disabled/success states, keyboard/focus access, accessible help, and read-only explanations. Apply approved DESIGN guidance; define optional demonstration behavior only if included in the approved scope.

## Shared API contract

Specify routes/operations, request and response shapes, authentication/authorization expectations, error codes and user-facing handling, and ownership of disputed fields. Include a working request/response usage example for each public route. A mock must be explicitly labeled and is not end-to-end proof.

## End-to-end verification

Specify synthetic inputs, role/session, preconditions, steps from the desktop through server persistence, expected final state, and denied-operation cases. Non-interactive checks run without extra confirmation. Interactive Chrome/device QA follows AGENTS resource availability and exact-session rules; record exercised flows, evidence paths, and unverified gaps.

## Approval and issue readiness

Confirm release-blocking decisions are resolved, backend/frontend criteria agree with the contract, usage examples work when implemented, and scope is explicitly approved. Spec approval permits agreed issue publication; feature code requires a separate explicit build instruction. Link the verified repository/issue(s) after publication; use only the four workflow labels.
