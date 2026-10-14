# Domain documentation

This project uses one clinic context: root [../../CONTEXT.md](../../CONTEXT.md). The `app/` and `server/` workspaces describe technical responsibilities; their existence alone does not establish multiple domain contexts.

Before domain exploration, read the glossary and any existing relevant `docs/adr/` records. The glossary contains resolved clinic terminology only. Use its language in specs, issues, tests, and code. Flag conflicting usage and resolve a fuzzy term before treating it as settled. Architecture, requirements, pending decisions, and implementation details belong in [../specs/](../specs/README.md), not `CONTEXT.md`.

Use [domain-modeling](../../.agents/skills/domain-modeling/SKILL.md) and its [glossary format](../../.agents/skills/domain-modeling/CONTEXT-FORMAT.md) when adding a resolved term. Use [grill-with-docs](../../.agents/skills/grill-with-docs/SKILL.md) with its grilling/domain-modeling dependencies to refine decisions in rounds. The user confirms shared understanding before product implementation.

ADRs live under root `docs/adr/` and are created lazily. Record a decision only when it is settled, hard to reverse, surprising without context, and based on a real tradeoff. Use the source [ADR format](../../.agents/skills/domain-modeling/ADR-FORMAT.md) and sequential numbering. No ADR is fabricated merely to fill the directory. Missing ADR files are not a setup error. Surface contradictions to an existing ADR explicitly.
