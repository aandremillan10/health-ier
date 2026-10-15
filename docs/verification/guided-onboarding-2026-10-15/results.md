# Guided onboarding: noninteractive evidence

Command logs, full content manifests/diffs and scratch-run helpers named here are **local evidence only**, retained in this workstation's ignored verification folder. They are not presented as checked-in attachments. The concise reports and provenance summaries are intended for version control after secret review.

## Baseline before implementation

Worktree: `C:/Users/ajapa/.codex/worktrees/guided-onboarding/health-ier`, branch `feat/guided-onboarding`, parent `master`, HEAD `97fd447c4852f554c26e384f288b54efe880283a`. No source diff existed when baseline completed at approximately 2026-10-15 14:25 Asia/Manila. `.codegraph/` absent. Applicable root instructions/context and the handoff brief were read; no scoped instruction files appeared under the tested paths. Ponytail applied to test work.

Runtime: Node `v24.13.0`; native pnpm `10.30.1` at `C:/Users/ajapa/AppData/Local/pnpm/.tools/pnpm-exe/10.30.1/pnpm.exe`.

| Command                                                                                                                                           | Actual result                                                                                                                                                 | Evidence                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                  | PASS, exit 0; 29.8s                                                                                                                                           | `dependency-install.log`            |
| Initial `pnpm check`                                                                                                                              | Setup failure: generated Prisma client absent in fresh checkout; server TypeScript failed. App TypeScript passed. No source change used to resolve it         | `baseline-check.log`                |
| `pnpm --filter server prisma:generate`                                                                                                            | PASS, exit 0; generated ignored client, no database connection or schema change                                                                               | `prisma-generate.log`               |
| Repeated `pnpm check`                                                                                                                             | PASS, exit 0: lint, format, both TypeScript checks; app 64 pass/1 optional skip, server unit 27 pass, HTTP 11 pass/9 optional integration skips; server build | `baseline-check-after-generate.log` |
| `CI=1 CLINIC_FRONTEND_PORT=5297 pnpm --filter app exec playwright test e2e/bridge.spec.ts e2e/navigation.spec.ts e2e/desktop.spec.ts --trace=off` | PASS, 27 tests, 41.2s; isolated headless renderer fixture server                                                                                              | `baseline-headless.log`             |

These are baseline proofs, not new-feature proofs. The 27 headless tests cover renderer session races/reset, desktop mapping, patient ownership/interruption, stale document permissions/identities, independent retries and keyboard navigation. They use mocked bridges, so neither real IPC nor server authorization is established by them.

## Launch safety

Inspected root/app/server package scripts, workspace dependency build allowlist, Electron install script, renderer Vite config, Electron Vite config/main environment loader, Playwright configs, unit/HTTP configs and Windows packaging script before execution.

- Root install hook runs Husky. App install hook `install-electron` checks/downloads/extracts the binary; it does not execute Electron.
- `pnpm check` invokes static checks, Vitest with Node environments and server compilation. HTTP integration tests use test code; no Electron launch.
- Selected Playwright files contain no screenshot/launch calls. Config sets `headless: true`, Chrome channel, loopback renderer Vite server. `CI=1` prohibits reuse; fresh port 5297 and strict binding isolate the run. `--trace=off` disables failure tracing; no desktop or new screenshot capture was performed.
- Existing `clinic.spec.ts` and `refinement-layout.spec.ts` call `page.screenshot`; those were excluded from this checkpoint. This does not claim their flows pass on new source.
- App `build` is `electron-vite build`, which compiles only; `package:windows` compiles, stages files, runs `@electron/packager`, verifies package contents and creates a ZIP/hash. It does not launch the application. Final build/package waits until feature source is final.
- App `test:integration` calls `verify-integration.mts`, which launches Electron, and remains deferred. Electron dev/preview and graphical browser/desktop interaction remain deferred.

## New-source verification

Independent renderer verification: `CI=1 CLINIC_FRONTEND_PORT=5307 pnpm --filter app exec playwright test e2e/bridge.spec.ts e2e/navigation.spec.ts e2e/desktop.spec.ts e2e/guided-onboarding.spec.ts --trace=off --timeout=20000` passed **60/60** on the stable renderer source. Evidence: `final-headless-stable.log`. The prior 60-case run also passed before the final fixture validation refinement. No screenshots or traces were captured.

The 33 new cases in `app/e2e/guided-onboarding.spec.ts` exercise action-driven gates, fresh restart, all eight named roles' available first targets, disposed-session rejection/listener silence, Escape, missing targets, reduced motion at 1024px/200% CSS text, genuine reset and live authority expiry, reset during asynchronous startup, single keyboard command palette, title/focus restoration, and unsaved register/patient/vitals/medical/document editors.

Actual component actions cover registry search/open/edit; family eligibility/update/history; appointment arrival/waiting/history; vital draft/finalize/correction; medical vital linkage/conflict/review/rebase/retry/finalize/correction; honest dental read limitation; provider laboratory order/review and technologist start/save/finalize; referral accept/start/complete/send; summary creation/history; reviewed certificate preview/edit invalidation/issue/inert print/copy/history; synthetic report export/audit filters; historical import/view/replacement/cancel. These are representative complete guided paths, not every clinic action/permutation. Snapshot assertions after each flow recorded zero calls to the independent live API (background `me` authority validation exempt), raw privileged desktop proxy, fetch/XHR, native print, clipboard, object-URL/download or window-open effects.

The two live-fixture scan preview cases render actual generated nonclinical bytes: a one-page PDF's red rectangle appears in canvas pixel data, and a JPEG decodes to its expected 2×2 bitmap. This establishes HTTP renderer behavior with the current bundled library; packaged `file:` rendering/native picker remain pending desktop continuation. These tests create fixture bytes and do not capture screen images.

New findings during implementation: attendant was initially offered a summary lesson its role could not open; role availability was corrected, and final eight-role smoke passed. Initial assertions were corrected for actual accessible labels and review-button removal. Vite's first lazy-dependency preparation occasionally reloaded the development page while filling login; the isolated harness waits for initial network-idle readiness before typing. No authentication product failure was inferred from that dev-server interruption.

Final integrated `pnpm check` passed (`final-check-stable-2.log`): lint, formatting, both TypeScript checks, **84 app unit tests passed / 1 optional skip**, **69 server unit tests passed**, **41 HTTP tests passed / 9 optional PostgreSQL-suite skips**, Prisma generation and server build. The separate actual scratch proof below covers additional PostgreSQL/S3 invariants without counting those nine optional skips as passes. A formatting-only correction to a new broker test resolved the preceding format-check failure.

See `qa-matrix.md` for pending packaged live/practice checks and preserved historical failures.

## Actual isolated PostgreSQL and MinIO proof

The local Linux Docker daemon was already running (`29.2.0`); no GUI or Docker Desktop startup was performed. The authorized scratch runner created unique labeled containers, four fresh volumes and one network, with only loopback host ports 55487/59087. It migrated two fresh databases and used two separate S3 buckets for EDGE/CLOUD plus the initializer's scoped application bucket. Random credentials existed only in the runner/child process environment and were not printed or saved.

Final `run-scratch-storage.ps1` exited 0 with **11 actual invariant groups PASS** (`final-scratch-run.log`, `scratch-storage-proof.log`):

1. Initializer refused changed ownership, no-marker existing resources and restricted inspection credentials; original object/access remained intact.
2. First and same-environment second initializer runs preserved a synthetic object and application access. Scoped principal could not list buckets, list/write another bucket or use admin info; anonymous original-object GET returned 403; scoped deletion worked.
3. Actual runtime versions matched compose pins: MinIO `RELEASE.2025-09-07T16-13-09Z` and mc `RELEASE.2025-08-13T08-35-41Z`.
4. Real PostgreSQL plus actual SDK S3 import/read/hash/idempotent retry produced exactly one metadata row, audit event and outbox event.
5. Actual PostgreSQL historical-document UPDATE and DELETE triggers rejected mutation.
6. Actual audit-event UPDATE and DELETE triggers rejected mutation.
7. Real SDK conditional `IfNoneMatch` accepted identical replay and rejected different bytes without overwriting the original.
8. Replacement created a linked immutable successor, retained the original and rejected another immediate successor.
9. Restarting only the two owned scratch containers preserved metadata, original bytes and hash.
10. Bootstrap and companion bytes/metadata receipts reached the separate cloud database and bucket.
11. Repeated bootstrap caught up idempotently with exactly two cloud historical records.

Cached content-addressed images were used with `--pull=never`: PostgreSQL `sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2`, MinIO `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`, mc `sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727`. Actual container version commands confirmed both MinIO/mc release pins. Public registry-manifest retrieval returned authentication errors; a successful fresh registry pull is not claimed.

The real pinned image exposed a setup regression missed by the host shell mock: mc's minimal container does not include `grep`. The initializer's fail-closed parser was corrected to verified shell builtins/tools and the full real proof above reran successfully. Earlier ten-group success predates that parser correction and is not substituted for this final run. Subsequent refusal checks used the actual final script and its `/state` marker volume.

Final scratch run `2fd4b73bc44c4909b040f4ea2ce2856a` removed its two containers, four volumes and network after verifying each exact ownership label. `scratch-resources.json` records names and `cleaned=true`, `result=0`; independent final label-filtered inventories returned empty for containers, volumes and networks. No retained laptop/EDGE container, data, volume, deployment or trust setting was touched.

This proves local actual PostgreSQL/S3 service semantics, not deployment of new backend code or actual managed-Railway object transfer. Railway bucket creation/anonymous-denial/config-reference evidence is separate in `railway-storage-plan.md`.

## New source and Windows package

The source was frozen after checks, captured with tracked **and nonignored untracked file contents**, then committed by the lead as `5631a43fa8dcfcd233762ae7bf063d3440da4f83` (`feat: add guided practice and historical scan storage`). The commit's 457 source-file content hashes exactly match the precommit manifest: `8e37422ddf2a85da7fa8601f1589ad542239a3d093f79224fdb1ce5f0c535516`. The precommit tracked diff hash was `8a403c4d6e795f6d44cafb13ad659a40ab98df1cfa957e99f795f0d0f8d59877`; this is supplemented by the full-content manifest so formerly untracked feature files are not omitted. Evidence under `docs/verification/**` is intentionally excluded; reports can be updated after packaging without changing source identity. See the versioned `precommit-provenance.json` and `packaged-provenance.json` summaries; full manifests/diff remain local evidence.

| Item               | Verified result                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| App build          | PASS, 2026-10-15 15:15:01–15:15:09 Asia/Manila, 8.08s                                                                                 |
| Windows package    | PASS, 15:15:20–15:16:00 Asia/Manila, 40.47s including its own build                                                                   |
| Package source     | `5631a43fa8dcfcd233762ae7bf063d3440da4f83`, tree `9612c223ffd8e2cb7059b4cc7ccba2da2f9efcba`, package build-info source status empty   |
| Portable ZIP       | `C:/Users/ajapa/.codex/worktrees/guided-onboarding/health-ier/app/dist/windows/2026-10-15T07-15-30-545Z/AMLIG-win32-x64.zip`          |
| ZIP size / SHA-256 | 163,039,770 bytes / `06179737af6725c7aae15c7aa2fc68b74a2d1d187277f0b747b81669a2bb9f75`                                                |
| Integrity          | ZIP sidecar matches; all nine packaged compiled-file hashes match build-info; current source-content manifest still matches precommit |
| Runtime            | Electron `44.7.2`; app was never launched                                                                                             |
| PDF assets         | PDF renderer chunk and `pdf.worker.min-BQhI5qe_.js` shipped                                                                           |

Two additional screenshot-free headless tests served the actual immutable packaged renderer files over an isolated loopback HTTP server (`packaged-renderer-gate.log`, 2/2 PASS). Injected browser-QA `window.clinicApi` cannot expose a demo fallback, and a failed live desktop bridge does not offer memory mode. Unreachable demo JSX labels can remain as bundle string literals, so string absence was deliberately not used as gate proof. This behavior check does not launch Electron or prove packaged `file:` behavior.

Total authoritative browser checks: **60 renderer fixture tests plus 2 packaged-renderer gate tests passed**. Static/unit/HTTP, scratch runtime and browser evidence remain distinct. No new code deployment, managed-Railway file round-trip, native file-picker operation, real print submission or desktop visual QA is claimed.

No actual Electron, desktop interaction, screenshots, retained-stack disruption, WAN disconnection or real print submission was performed. The desktop checkpoint remains mandatory.
