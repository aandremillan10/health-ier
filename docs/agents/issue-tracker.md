# Issue tracker: GitHub

GitHub Issues is the chosen tracker. Confirmed repository: [aandremillan10/health-ier](https://github.com/aandremillan10/health-ier), provided by the user on 2026-10-14. No Git remote was configured at initial setup; verify current remote state before operations.

## Publication gate

The user approved clinic-demo-v1 on 2026-10-14, published ten paired issues, then explicitly required the [clinic-demo-v1.1 one-way mirror amendment](../specs/approval.md): one additional Backend issue and scope/verification updates. This publication gate is satisfied for that version; later material scope changes need approval. Feature implementation still requires a separate explicit build instruction. The confirmed origin matches the GitHub destination.

Before tracker operations, verify `git remote -v` and `gh auth status`; if the chosen repository is not inferable from a verified remote, use `--repo aandremillan10/health-ier`. Surface any conflicting remote rather than changing the destination silently.

## Issue conventions

- Title describes a concrete user outcome. Body links the approved spec/version, acceptance criteria, dependencies, and ownership.
- Separate Backend and Frontend acceptance criteria. The user owns backend work; the teammate owns frontend work. Link their shared API contract and end-to-end integration condition.
- Use exactly the workflow labels in [workflow-labels.md](workflow-labels.md). No extra triage or wayfinder labels are configured.
- For multiline bodies/comments, write exact text to a temporary UTF-8 file and use `--body-file`; preserve real newlines. Read with `gh issue view <number> --comments`; list with `gh issue list`; update using `gh issue edit` against the verified repository.
- Claim/assignment and milestone conventions will be finalized with the repository and teammate identities.

**PRs as a request surface: no.** Ordinary implementation PR review is separate from treating external PRs as feature requests.

When a skill says to publish to the tracker, apply the spec gate above before creating a GitHub issue. When it says to fetch a ticket, read the relevant GitHub issue and comments. Skill templates are examples; the selected local workflow takes precedence over their default labels or publication steps.
