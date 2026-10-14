# clinic-demo-v1.1 specifications

Status: **approved clinic-demo-v1.1 amendment on 2026-10-14, Asia/Manila**. See the [exact approval/document set](approval.md). The ten original paired issues plus one Backend mirror issue and their scope updates are authorized; product feature implementation requires a separate explicit build instruction.

## Read in this order

1. [Clinic baseline](clinic-baseline.md): confirmed facts, product boundaries, and evidence treatment.
2. [Permissions](permissions.md): named staff/head capabilities, populated matrix, lifecycle, and denial checks.
3. [Demo flow](demo-flow.md): concrete Backend/Frontend and end-to-end acceptance criteria.
4. [API contract](api-contract.md): approved fields/operation plans for teammate coordination; routes are not implemented yet.
5. [Decision record](pending-decisions.md): confirmed answers, deferred scope, and approval record.
6. [Issue plan/index](backlog.md): ten original paired outcomes plus one Backend mirror and publication links.
7. [Document/data baseline](demo-data-and-documents.md): approved source format, scan inputs, and synthetic accounts.
8. [One-way mirror amendment](mirror-amendment.md): authoritative edge, durable delivery, read-only cloud and mandatory cloud proof.
9. [Feature template](feature-template.md): format for later approved features.

The root [glossary](../../CONTEXT.md) holds terminology. [DESIGN.md](../../DESIGN.md) holds the approved staff-tool baseline. [Tracker guidance](../agents/issue-tracker.md) controls publication/status changes. No route or product screen is claimed implemented by this approval.

## Approval workflow

Review source material and current user instructions; distinguish confirmed facts from source suggestions. Ask decision rounds in dependency order, record answers with their date and provenance, and refine the relevant feature specs. A proposal becomes a requirement only when the user confirms it. Before requesting final approval, resolve all release-blocking decisions, agree feature priority and scope, and give each feature Backend, Frontend, shared contract, and end-to-end acceptance criteria.

Record final approval with the approved spec version/date and explicit user confirmation. Then publish agreed GitHub issues linked to that version/repository and the four workflow labels. Wait for a separate explicit build instruction before feature code. Later material scope changes reopen affected decisions; approving the narrow demo does not expand deferred modules.

## Responsibilities

The user implements backend work. Their teammate implements frontend work. Each feature spec identifies server behavior/permissions and desktop behavior separately, and defines how both sides verify the same flow together. Do not replace unresolved integration with an unlabeled frontend mock.

## Evidence

Source decks, the Gemini transcript/PDF, and sample images are research inputs. Gemini recommendations can conflict across pages or reflect historical decisions; preserve that provenance instead of choosing a convenient statement. The interview and explicit current user decisions control scope. Keep identifiable patient information out of specs, fixtures, screenshots, and demonstration data.
