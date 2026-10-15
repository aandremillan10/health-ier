import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ClinicReport, ReportQuery } from '../../shared/operations-api';
import type { ClinicError } from './contract';
import type { ReportsApi } from './reports-contract';
import { date, timestamp, today } from './format';
import { Empty, ErrorNotice, Field, Loading } from './ui';
import { useOperation } from './use-operation';
import { CountChart } from './CountChart';
import './reports.css';

export function Reports({
  api,
  onExpired,
  demo = false,
}: {
  api: ReportsApi;
  onExpired: () => void;
  demo?: boolean;
}): ReactElement {
  const [from, setFrom] = useState(() => `${today().slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState<ReportQuery>(() => ({ from, to }));
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{
    key: string;
    report: ClinicReport | null;
    error: ClinicError | null;
  }>({ key: '', report: null, error: null });
  const [rangeError, setRangeError] = useState<ClinicError | null>(null);
  const [downloadError, setDownloadError] = useState<ClinicError | null>(null);
  const [notice, setNotice] = useState('');
  const exportOperation = useOperation(onExpired);
  const key = `${applied.from}|${applied.to}|${reload}`;
  const loading = state.key !== key;
  const report = !loading && !exportOperation.conflict ? state.report : null;
  const error = state.key === key ? state.error : null;
  const changed = from !== applied.from || to !== applied.to;

  useEffect(() => {
    let active = true;
    void api
      .readReport(applied)
      .then((result) => {
        if (!active) return;
        if (
          result.ok &&
          result.data.from === applied.from &&
          result.data.to === applied.to
        )
          setState({ key, report: result.data, error: null });
        else {
          const failure: ClinicError = result.ok
            ? {
                code: 'UNAVAILABLE',
                message:
                  'The report range did not match the request. Refresh the report before you use it.',
              }
            : result.error;
          setState({ key, report: null, error: failure });
          if (failure.code === 'UNAUTHENTICATED') onExpired();
        }
      })
      .catch(() => {
        if (active)
          setState({
            key,
            report: null,
            error: {
              code: 'UNAVAILABLE',
              message:
                'Unable to load the report. Check the clinic connection, then select Refresh applied report.',
            },
          });
      });
    return (): void => {
      active = false;
    };
  }, [api, applied, key, onExpired]);

  function refresh(): void {
    exportOperation.clearError();
    setDownloadError(null);
    setNotice('');
    setReload((value) => value + 1);
  }
  function apply(event: FormEvent): void {
    event.preventDefault();
    const start = Date.parse(`${from}T00:00:00+08:00`);
    const end = Date.parse(`${to}T00:00:00+08:00`);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      end - start > 365 * 86400000
    ) {
      setRangeError({
        code: 'VALIDATION',
        message:
          'Choose a range of up to 366 days, with the start date on or before the end date.',
        fieldErrors: {
          to: 'Use an end date on or after the start date, within 366 days.',
        },
      });
      return;
    }
    setRangeError(null);
    setApplied({ from, to });
    refresh();
  }
  async function exportCsv(): Promise<void> {
    if (!report || changed || exportOperation.busy || exportOperation.conflict)
      return;
    setDownloadError(null);
    setNotice('');
    const file = await exportOperation.run(async () => {
      const result = await api.exportReport({
        from: report.from,
        to: report.to,
        fingerprint: report.fingerprint,
      });
      if (result.ok && result.data.fingerprint !== report.fingerprint)
        return {
          ok: false,
          error: {
            code: 'CONFLICT',
            message:
              'The report changed. Refresh the report before you export it.',
          },
        };
      return result;
    });
    if (!file) return;
    try {
      const url = URL.createObjectURL(
        new Blob([file.csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('CSV download requested. Check your Downloads folder.');
    } catch {
      setDownloadError({
        code: 'UNAVAILABLE',
        message:
          'The CSV file could not be downloaded. Check your download settings, then select Export applied report as CSV again.',
      });
    }
  }

  return (
    <div className="reports-view">
      <div className="page-heading">
        <h1>Operational reports</h1>
        <p className="muted">
          Clinic activity for an inclusive Manila date range.
          {demo && ' Synthetic demo data only.'}
        </p>
      </div>
      <form className="panel report-controls" onSubmit={apply}>
        <Field
          name="report-from"
          label="Start date"
          error={rangeError}
          errorName="from"
        >
          <Input
            id="report-from"
            type="date"
            required
            value={from}
            disabled={exportOperation.busy}
            onChange={(event) => {
              setFrom(event.target.value);
              setRangeError(null);
            }}
          />
        </Field>
        <Field
          name="report-to"
          label="End date"
          error={rangeError}
          errorName="to"
        >
          <Input
            id="report-to"
            type="date"
            required
            value={to}
            disabled={exportOperation.busy}
            onChange={(event) => {
              setTo(event.target.value);
              setRangeError(null);
            }}
          />
        </Field>
        <Button type="submit" disabled={exportOperation.busy}>
          {loading ? 'Loading report…' : 'Apply date range'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={loading || exportOperation.busy}
          onClick={refresh}
        >
          Refresh applied report
        </Button>
        <p className="hint report-range-help">
          Use up to 366 days. Both dates are included. Membership and dependent
          totals use eligibility on the end date.
        </p>
      </form>
      <p className="report-applied">
        Applied range:{' '}
        <strong>
          {date(applied.from)} – {date(applied.to)}
        </strong>
      </p>
      {changed && (
        <p className="notice warning">
          Date changes are not applied. Select Apply date range to update the
          report and enable export.
        </p>
      )}
      <ErrorNotice error={rangeError} />
      <ErrorNotice error={error}>
        {error?.code !== 'DENIED' && (
          <Button variant="outline" onClick={refresh}>
            Refresh applied report
          </Button>
        )}
        {error?.code === 'DENIED' && (
          <p>
            Ask the clinic head, clerk or nursing attendant to open this report.
          </p>
        )}
      </ErrorNotice>
      <ErrorNotice error={exportOperation.error}>
        {exportOperation.conflict && (
          <Button variant="outline" onClick={refresh}>
            Refresh changed report
          </Button>
        )}
      </ErrorNotice>
      <ErrorNotice error={downloadError} />
      <p className={notice ? 'notice success' : 'sr-only'} role="status">
        {notice}
      </p>
      {loading && (
        <Loading>Loading the complete report for the applied range…</Loading>
      )}
      {report && (
        <>
          <div className="report-snapshot">
            <p className="hint">
              Generated {timestamp(report.generatedAt)}. Counts use current
              record states for the applied range. Refresh to include later
              changes.
            </p>
            <Button
              variant="outline"
              disabled={changed || exportOperation.busy}
              onClick={() => void exportCsv()}
            >
              {exportOperation.busy
                ? 'Preparing CSV…'
                : 'Export applied report as CSV'}
            </Button>
          </div>
          <ReportMetrics report={report} />
          <div className="report-trends">
            <DailyTrend rows={report.daily} />
            <DepartmentTrend rows={report.departments} />
          </div>
        </>
      )}
    </div>
  );
}

function ReportMetrics({ report }: { report: ClinicReport }): ReactElement {
  const totals = report.totals;
  const metrics: { label: string; value: string; hint: string }[] = [
    {
      label: 'Visits',
      value: totals.visits.toLocaleString('en-PH'),
      hint: 'Appointments currently arrived, waiting, with a provider, in lab or completed.',
    },
    {
      label: 'No-shows',
      value: totals.noShows.toLocaleString('en-PH'),
      hint: 'Appointments in the range currently marked no-show.',
    },
    {
      label: 'Pending labs',
      value: totals.pendingLabs.toLocaleString('en-PH'),
      hint: 'Orders created in the range that are still ordered or in progress.',
    },
    {
      label: 'Average lab turnaround',
      value:
        totals.averageLabMinutes === null
          ? 'No finalized results'
          : `${totals.averageLabMinutes.toLocaleString('en-PH', { maximumFractionDigits: 1 })} min`,
      hint: 'Order creation to first finalized result, for orders created in the range.',
    },
    {
      label: 'New patient registrations',
      value: totals.newPatients.toLocaleString('en-PH'),
      hint: 'Patient records created in the range.',
    },
    {
      label: 'Employees',
      value: totals.employees.toLocaleString('en-PH'),
      hint: 'Distinct patients with active eligible employee memberships on the end date.',
    },
    {
      label: 'Dependents',
      value: totals.dependents.toLocaleString('en-PH'),
      hint: 'Distinct patients with active dependent links and eligible memberships on the end date.',
    },
  ];
  return (
    <section aria-labelledby="report-totals-title">
      <h2 id="report-totals-title">Report totals</h2>
      <dl className="report-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <dd className="hint">{metric.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DailyTrend({ rows }: { rows: ClinicReport['daily'] }): ReactElement {
  const interval = rows.length > 31 ? 7 : 1;
  const values = Array.from(
    { length: Math.ceil(rows.length / interval) },
    (_, index) =>
      rows
        .slice(index * interval, (index + 1) * interval)
        .reduce((sum, row) => sum + row.visits, 0),
  );
  const peak = Math.max(0, ...values);
  const maximum = Math.max(1, peak);
  const points = values.map((value, index) => [
    values.length === 1 ? 320 : (index / (values.length - 1)) * 640,
    200 - (value / maximum) * 200,
  ]);
  return (
    <section
      className="panel report-trend"
      aria-labelledby="report-daily-title"
    >
      <h2 id="report-daily-title">
        {interval === 7 ? 'Visits by 7-day period' : 'Visits per day'}
      </h2>
      {rows.length === 0 ? (
        <Empty>
          No visits in this range. Choose another range to compare daily
          activity.
        </Empty>
      ) : (
        <>
          {rows.every((row) => row.visits === 0) && (
            <p className="hint">
              No visits in this range. Zero values are shown for each reported
              day.
            </p>
          )}
          <div className="daily-chart">
            <div className="chart-scale" aria-hidden="true">
              <span>{maximum.toLocaleString('en-PH')}</span>
              <span>0</span>
            </div>
            <svg
              role="img"
              aria-label="Visits trend chart"
              viewBox="0 0 640 200"
              preserveAspectRatio="none"
            >
              <desc>
                {interval === 7 ? '7-day visit totals' : 'Daily visits'} from{' '}
                {date(rows[0].date)} to {date(rows[rows.length - 1].date)}.
                Highest period count: {peak.toLocaleString('en-PH')}. Exact
                values are available in View daily data.
              </desc>
              <g className="chart-grid">
                <path d="M0 0H640M0 100H640M0 200H640" />
              </g>
              <polyline
                className="chart-series"
                points={points.map((point) => point.join(',')).join(' ')}
              />
              {values.length === 1 && (
                <circle
                  className="chart-point"
                  cx={points[0][0]}
                  cy={points[0][1]}
                  r="5"
                />
              )}
            </svg>
            <div
              className="chart-dates"
              data-single={rows.length === 1}
              aria-hidden="true"
            >
              <span>{date(rows[0].date)}</span>
              {rows.length > 1 && (
                <span>{date(rows[rows.length - 1].date)}</span>
              )}
            </div>
          </div>
          <p className="hint">
            {interval === 7
              ? 'Each point totals up to 7 days. The last period may be shorter. '
              : 'Each point shows one day. '}
            Open the data table for exact counts on each date.
          </p>
          <details className="report-data">
            <summary>View daily data</summary>
            <div
              className="table-scroll report-scroll"
              tabIndex={0}
              role="region"
              aria-label="Daily visits; scroll for all dates"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Clinic date</th>
                    <th scope="col">Visits</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.date}>
                      <th scope="row">{date(row.date)}</th>
                      <td className="report-number">
                        {row.visits.toLocaleString('en-PH')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
function DepartmentTrend({
  rows,
}: {
  rows: ClinicReport['departments'];
}): ReactElement {
  return (
    <section
      className="panel report-trend"
      aria-labelledby="report-department-title"
    >
      <h2 id="report-department-title">Patients by department</h2>
      <p className="hint">
        Distinct patients with visits in each discipline. A patient can appear
        in more than one department.
      </p>
      {rows.length === 0 ? (
        <Empty>
          No department activity in this range. Choose another range to compare
          departments.
        </Empty>
      ) : (
        <>
          <CountChart
            label="Patients by department"
            rows={rows.map((row) => ({
              label: row.discipline,
              value: row.patients,
            }))}
          />
          <details className="report-data">
            <summary>View department data</summary>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Patients by department; scroll horizontally for all columns"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Department</th>
                    <th scope="col">Patients</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.discipline}>
                      <th scope="row" className="capitalize">
                        {row.discipline}
                      </th>
                      <td className="report-number">
                        {row.patients.toLocaleString('en-PH')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
