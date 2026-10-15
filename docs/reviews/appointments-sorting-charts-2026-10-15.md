# Appointment sorting and operational charts

Date: 2026-10-15, Asia/Manila.

## Delivered behavior

- Select Time, Patient, Discipline, or Current state in the appointment table to sort ascending. Select the active heading again to reverse it. The initial order is time ascending.
- Time sorting compares actual timestamps, including different UTC offsets. Equal values use time and appointment ID as stable tie-breakers. State sorting uses clinic-flow order from Scheduled through No-show.
- Sorting affects only the loaded records. It sends no writes or additional requests. Refresh and filter changes retain the chosen order. Correction drafts stay with their appointment when rows move.
- The selected column exposes `aria-sort`; header buttons work with keyboard activation and show the direction. A status region announces the order.
- Clinic flow now shows appointment counts by state as labeled bars. Reports show a visits line chart and labeled department bars.
- The visits chart shows daily counts for ranges of up to 31 days. Longer ranges use consecutive periods of up to 7 days, starting on the applied start date. A visible note states that the last period may be shorter. The original daily data remains available under View daily data; department values also remain available in their table.
- Single-day, zero-value, empty, and error states retain useful output. Charts use the existing authorized data and token system, with no library or API change.

The scope of “other data” is operational counts already present in clinic flow and reports. No clinical measurements, new metrics, or additional records were inferred.

## Implementation scope

`Appointments.tsx` and `appointments.css` own sorting and the state overview. `Reports.tsx` and `reports.css` own the trend chart and exact-data disclosures. `CountChart.tsx` and `count-chart.css` provide the small labeled-bar renderer reused by clinic flow and department reports. The new `appointments-reports.spec.ts` uses the existing browser fixture pattern.

Sorted rows and chart values are derived during render. The existing request and refresh Effects remain responsible for server synchronization. No Effect was added for sorting or chart data. Repeated sorting, refresh, and chart updates were rejected as animation candidates because staff need immediate, readable results.

## Verification

| Check                                        | Observed result                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| New browser checks before implementation     | Failed on missing chronological sorting and missing chart output                                          |
| Long-range chart check before grouping       | Failed with 366 points instead of the expected 53 periods; the narrow capture confirmed excessive density |
| `pnpm --filter app exec playwright test`     | 49 passed                                                                                                 |
| `pnpm --filter app test`                     | 64 passed, 1 existing test skipped                                                                        |
| `pnpm --filter app typecheck`                | Passed                                                                                                    |
| ESLint on changed TypeScript files           | Passed                                                                                                    |
| Prettier on changed source and documentation | Passed                                                                                                    |
| `pnpm --filter app build`                    | Electron main, preload, and renderer passed                                                               |
| `git diff --check`                           | Passed                                                                                                    |

The two new E2E tests cover each sort column in both directions, mixed timestamp offsets, equal patient names and times, keyboard activation, no sort-triggered requests or writes, preserved correction drafts, refresh, and a discipline filter change. Chart checks cover explicit category counts, a single point without invalid coordinates, zero values, a 366-day range grouped into 53 periods with a checked peak total, a 320px layout, exact-data access, empty data, and a failed report load.

The test commands run from the repository root. Browser checks use headless Chrome and a named synthetic API fixture. They do not establish live authentication, IPC, database, or clinic network behavior. No unit tests were added after implementation.

## Evidence

- [Appointment sorting and retained draft](../verification/sorting-charts-2026-10-15/appointment-sorting.png)
- [Desktop report charts](../verification/sorting-charts-2026-10-15/report-charts-desktop.png)
- [Long-range charts at 320px](../verification/sorting-charts-2026-10-15/report-charts-320.png)
- [Browser test results](../verification/sorting-charts-2026-10-15/frontend-results.json)

All captured records and report values are synthetic test data. The evidence directory is already ignored by Git. To repeat only the new flows, run `pnpm --filter app exec playwright test e2e/appointments-reports.spec.ts`.

## Limits

Live services, screen reader speech, physical devices, and printing were not checked. Charts have exact-data tables instead of point tooltips. No chart library was added. Changes remain uncommitted; unrelated workspace edits were preserved.
