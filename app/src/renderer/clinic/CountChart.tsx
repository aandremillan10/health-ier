import type { ReactElement } from 'react';
import './count-chart.css';

export function CountChart({
  label,
  rows,
}: {
  label: string;
  rows: { label: string; value: number }[];
}): ReactElement {
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return (
    <figure className="count-chart" aria-label={label}>
      <ul>
        {rows.map((row) => (
          <li key={row.label}>
            <span className="count-chart-label">{row.label}</span>
            <span className="count-chart-track" aria-hidden="true">
              <span style={{ width: `${(row.value / maximum) * 100}%` }} />
            </span>
            <strong>{row.value.toLocaleString('en-PH')}</strong>
          </li>
        ))}
      </ul>
    </figure>
  );
}
