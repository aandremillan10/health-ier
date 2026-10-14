# Repository guidance

## Repository context

Before planning or editing, identify the repository root and read applicable `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, and `CONTEXT.md` files that exist. Check for narrower copies along the path to changed files. Follow instruction priority and scope; surface material conflicts instead of guessing.

## Specification approval

Read [docs/specs/README.md](docs/specs/README.md) before product planning or implementation. The user approved `clinic-demo-v1` and directly selected the `clinic-demo-v1.1` one-way mirror amendment on 2026-10-14; see [approval record](docs/specs/approval.md). Approval authorizes the original ten issues plus one Backend mirror issue and specification publication; product feature implementation still requires a separate explicit build instruction. Tooling scaffolding is authorized. Distinguish approved implementation plans from existing behavior and source suggestions.

## Responsibilities and boundaries

The user owns backend implementation; their teammate owns frontend implementation. Keep feature acceptance criteria separated by Backend and Frontend, with a shared API contract and integration check. The server enforces authorization, validation, and domain rules. UI visibility and disabled controls supplement server checks.

The selected application shape is an Electron desktop client with React, Tailwind CSS, and shadcn/ui, plus a NestJS server and PostgreSQL on the clinic LAN. Internet outages are supported while LAN/server remain available; independent workstation operation during server/LAN failure is outside this requirement. Keep Electron renderer privileges minimal: use context isolation, disable renderer Node integration, expose narrow preload APIs, and validate IPC input and sender at privileged boundaries. Keep secrets and privileged operations out of renderer code. Read [ADR-0001](docs/adr/0001-clinic-lan-persistence.md) and [ADR-0002](docs/adr/0002-one-way-application-mirror.md) before changing storage/topology. Required edge-to-cloud mirroring is Backend-owned, one-way, nonblocking for LAN work, and excludes auth secrets; see [mirror scope](docs/specs/mirror-amendment.md).

## CodeGraph

If `.codegraph/` exists at the root, use CodeGraph before grep, find, or opening files to locate or understand code. Prefer `codegraph_explore` with the relevant file, symbol, or question; otherwise run `codegraph explore "<symbol names or question>"`. If `.codegraph/` is absent, skip CodeGraph; indexing is the user's decision.

## Parallel implementation and worktrees

Before parallel implementation tasks that could affect the same checkout or conflict, invoke [using-git-worktrees](.agents/skills/using-git-worktrees/SKILL.md). Give each task a branch and isolated worktree, record the branch it forked from, and reuse an already isolated checkout. Read-only or clearly non-conflicting work does not require a worktree.

After implementation and required tests pass in a worktree, invoke [finishing-a-development-branch](.agents/skills/finishing-a-development-branch/SKILL.md). Present its integration choices and wait for the user's selection. A subagent returns this decision point to the coordinating agent or user; it does not choose, merge, push, create a PR, delete a branch, or remove a worktree independently.

When the parent branch is outside `main`, `master`, `dev`, or `develop` and the remote is GitHub, check for an open parent PR. If the user chooses a PR, ask whether to stack it against the parent branch. Use installed authenticated `gh`; use `gh stack` only if `gh stack --help` confirms availability, otherwise use `gh pr create --base <parent-branch>`.

## Automated QA

Run relevant non-interactive unit, integration, static, and headless tests without extra confirmation. Before interactive QA that controls a graphical browser, Android emulator, or device, ask the user to confirm the shared resource is available. Another agent or worktree may be using it.

For web UI QA, invoke the computer-use skill and use Chrome. For Android UI QA, invoke android-cli; use Android CLI for build, run, layout inspection, and screenshots, and `adb` for device interaction. After confirmation, identify the exact browser session or device, remain within the assigned application, and report exercised flows, collected evidence, and failures.

## TypeScript

- Use `unknown` and type guards at uncertain boundaries; do not use `any`.
- Prefer `const`, explicit return types, no unused declarations, and `satisfies` for type-safe literals.
- Use discriminated unions, mapped/conditional/template-literal types, `infer`, and utility types when they improve safety or clarity. Prefer a simpler precise type when sufficient.
- For every added or changed public route, include a working usage example and verify it end-to-end.

## UI guidance

Read [DESIGN.md](DESIGN.md) before UI planning or edits. Clinic staff need understandable task flows, specific button labels, accessible help, predictable feedback, and keyboard access. Apply design sources within their scopes. The user preauthorizes Astra handoff only for future print-template implementation after a separate build instruction, using the supplied assets under `docs/headers/`. This does not authorize broad frontend handoff or present template coding. Copying a skill alone does not invoke it.

## Agent skills

- **Issue tracker:** [aandremillan10/health-ier](https://github.com/aandremillan10/health-ier) GitHub Issues after finalized spec approval. Read [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) before tracker operations.
- **Workflow labels:** exactly `todo`, `in progress`, `in review`, `done`. Read [docs/agents/workflow-labels.md](docs/agents/workflow-labels.md) before status changes.
- **Domain docs:** one clinic glossary at root `CONTEXT.md`; qualifying ADRs under `docs/adr/`. Read [docs/agents/domain.md](docs/agents/domain.md) before domain exploration or documentation.
- **Local guidance:** requested skills and their supporting dependencies live under `.agents/skills/`. Read [docs/agents/skills.md](docs/agents/skills.md) to resolve paths and portability limitations. Apply ponytail to authorized coding: the smallest complete solution while preserving validation, security, accessibility, and necessary checks.
