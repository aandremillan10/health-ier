# Arc setup and clinic components

Date: 2026-10-15, Asia/Manila.

## Installation

The user requested the Arc MCP endpoint, its registry skill, and additional components where they fit the clinic.

- `codex mcp add arc --url https://uiarc.dev/api/mcp` added an enabled global Streamable HTTP server. `codex mcp get arc --json` verified the endpoint.
- The user's skill command ran successfully from `app/`. It installed 13 registry files under `app/.claude/skills/arc/`. Copies under `.agents/skills/arc/` and `C:/Users/Acer/.codex/skills/arc/` were checked against those files with SHA-256. The installed skill will be available to Codex on the next turn; this turn read its entry point and relevant references directly.
- `app/components.json` now registers `@uiarc` for later installs.
- The shadcn CLI installed the public `arc-foundation`, `badge`, `skeleton`, and `stepper` sources under the existing components alias. Motion 14.2.0 is the required runtime dependency, pinned to the project's package convention. The workspace lockfile was updated.
- Arc source is kept separate under `components/arc/`, with MIT attribution in `components/ui/UIARC-LICENSE.txt`. Type checks include it. Formatter and project-style lint skip this imported source so later registry updates remain reviewable. Application integrations still receive normal checks.

## MCP authentication result

The user completed Arc account setup. Codex rejected the OAuth callback because the response omitted its required issuer. Arc's authorization metadata advertises issuer-response support and identifies `https://clerk.uiarc.dev`; this mismatch remains unresolved. `codex mcp list --json` reports `enabled: true` and `auth_status: not_logged_in`. An unauthenticated MCP initialize check returns HTTP 401.

The server is configured but is **not authenticated or callable in this chat**. No issuer validation was disabled, no credentials were put in the repository, and no authenticated catalog call is claimed. Component installation used the public registry. The supplied account-ready screenshot confirms account setup; it does not establish a successful MCP callback.

Sources: [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Arc setup](https://uiarc.dev/docs/ai), [Arc skill registry](https://uiarc.dev/r/arc-skill.json).

## Applied components

| Component                                                  | Use                                                                                                                         | Preserved behavior                                                                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [Stepper](https://uiarc.dev/components/stepper/markdown)   | Registration details, record check, and save                                                                                | Editing patient identity resets the check. Matches require explicit confirmation. The indicator is read-only and adds no hidden form step. |
| [Badge](https://uiarc.dev/components/badge/markdown)       | Medical/vital/document states, laboratory orders/results, referrals, appointments, clinical summary status, and eligibility | Every status keeps its label. Content nodes avoid decorative text swaps. Color only supplements text.                                      |
| [Skeleton](https://uiarc.dev/components/skeleton/markdown) | Existing shared loading states                                                                                              | Visible task text stays present; Arc provides status and busy semantics. Routine loading stays static.                                     |

Existing UIArc search and empty-state adaptations remain in use. No Pro source was used. Backend APIs, record rules, printed document content, and roles were not changed.

## Skill review and project rules

The installed Arc checklist was reviewed against the integration. The existing project direction takes priority where it differs from upstream defaults:

- Keep the clinic system font and established heading weights. Map Arc's font, surface, muted text, radius, and status tokens to the existing theme.
- Import the foundation once through the root stylesheet. Retain 3px keyboard focus, including inputs and selects; Arc's default field reset must not hide it.
- Keep the flat layout. Unused gradient tokens in the upstream foundation do not add gradient surfaces to the product.
- Preserve the supported light theme. Dark mode and alternative accents remain deferred under `DESIGN.md`.
- Use only documented component props. Keep real buttons, labels, the existing dialog focus handling, and announcements. Wide tables continue to scroll within their region.

Motion review: loading placeholders are frequent and carry state indication; repeated pulsing was rejected. Status labels are read throughout the day; text movement was rejected. Registration progress appears once per registration and shows the required sequence; its short marker/connector feedback was accepted with the upstream reduced-motion branch. No page or keyboard-navigation animation was added.

## Verification

The new registration check was written first and failed because the progress group did not exist. It now verifies progression, reset after an identity edit, duplicate confirmation, keyboard focus, and no horizontal page overflow at 390, 768, 1024, and 1440px. A second check verifies readable clinical states with reduced motion. The first focus assertion used the wrong Playwright key target; it was corrected to send Shift+Tab from the current element, then confirm focus before measuring the outline.

Commands:

```sh
pnpm --filter app test:e2e
pnpm --filter app typecheck
pnpm --filter app lint
pnpm --filter app test
pnpm --filter app build
git diff --check
```

The separate, user-authorized Chrome session also exercised clerk registration, the record check, and the resulting save step. Tests use fictional browser records. No records were created in a live clinic service.

Passed: **58 browser checks**, **64 existing app tests** with one existing skip, type checks, app lint, formatting checks for changed application files, Electron build, and `git diff --check`. The two Arc checks also pass separately with reduced motion. No unit tests were added after implementation.

Evidence: [registration screenshot](../../../verification/arc-components/registration.png), [browser results](../../../verification/frontend-results.json). No files were committed.

Not verified: authenticated Arc MCP tools, live clinic services, physical printing, screen reader speech, or clinic hardware. One existing app test remains skipped.
