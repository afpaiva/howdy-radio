/**
 * /client/src/components/DashboardCharts.tsx
 *
 * Chart components for dashboard using inline SVG — no external deps.
 * Implements: Line chart (hourly users), Bar chart (hourly tracks), Donut chart (tracks by source).
 */

import type { ReactElement } from "react";
import type { DashboardHistory, DashboardStats } from "../hooks/useDashboard";

interface DashboardChartsProps {
  history: DashboardHistory | null;
  stats: DashboardStats | null;
}

/** Format hour string for display (e.g., "14:00") */
function formatHourLabel(hourStr: string): string {
  try {
    const date = new Date(hourStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return hourStr.slice(11, 16);
  }
}

/** Find min/max in array of numbers */
function getMinMax(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Add some padding
  const range = max - min || 1;
  return { min: min - range * 0.1, max: max + range * 0.1 };
}

/** Line chart for hourly users (24h) */
function HourlyUsersLineChart({ data }: { data: DashboardHistory["hourlyUsers"] }): ReactElement {
  if (!data.length) {
    return (
      <div className="howdy-dashboard-chart-placeholder">
        <p className="howdy-body-text">No hourly user data yet</p>
      </div>
    );
  }

  const values = data.map((d) => d.users);
  const { min, max } = getMinMax(values);
  const range = max - min;

  // Generate path points
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * 100; // percentage
    const y = range > 0 ? (1 - (d.users - min) / range) * 100 : 50; // percentage
    return `${x}%,${y}%`;
  }).join(" ");

  return (
    <div className="howdy-dashboard-chart" data-testid="chart-hourly-users">
      <h3 className="howdy-dashboard-chart-title">Listeners (24h)</h3>
      <div className="howdy-dashboard-chart-svg-wrapper">
        <svg
          viewBox={`0 0 ${100} ${100}`}
          preserveAspectRatio="none"
          className="howdy-dashboard-chart-svg"
          role="img"
          aria-label={`Hourly listeners chart. Peak: ${Math.max(...values)} users`}
        >
          {/* Background grid lines */}
          <g className="howdy-dashboard-chart-grid">
            {[0, 25, 50, 75, 100].map((p) => (
              <line
                key={p}
                x1="0%"
                y1={`${p}%`}
                x2="100%"
                y2={`${p}%`}
                stroke="var(--howdy-text-muted)"
                strokeWidth="0.5%"
                strokeDasharray="4% 4%"
                opacity="0.3"
              />
            ))}
          </g>

          {/* Area under line */}
          <path
            d={`M${points} L100%,100% L0%,100% Z`}
            fill="url(#howdy-users-gradient)"
            opacity="0.4"
          />

          {/* Line */}
          <path
            d={`M${points}`}
            fill="none"
            stroke="var(--howdy-periwinkle-deep)"
            strokeWidth="2.5%"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="howdy-dashboard-chart-line"
          />

          {/* Data points */}
          {data.map((d, i) => {
            const x = (i / (data.length - 1 || 1)) * 100;
            const y = range > 0 ? (1 - (d.users - min) / range) * 100 : 50;
            return (
              <circle
                key={i}
                cx={`${x}%`}
                cy={`${y}%`}
                r="2.5%"
                fill="var(--howdy-periwinkle-deep)"
                stroke="var(--howdy-canvas)"
                strokeWidth="2%"
                className="howdy-dashboard-chart-point"
              />
            );
          })}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="howdy-users-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--howdy-periwinkle)" />
              <stop offset="100%" stopColor="var(--howdy-periwinkle)" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="howdy-dashboard-chart-x-axis">
        {data.filter((_, i) => i % 3 === 0 || i === data.length - 1).map((d, idx) => (
          <span key={idx} className="howdy-dashboard-chart-x-label">
            {formatHourLabel(d.hour)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Bar chart for hourly tracks played (24h) */
function HourlyTracksBarChart({ data }: { data: DashboardHistory["hourlyTracksPlayed"] }): ReactElement {
  if (!data.length) {
    return (
      <div className="howdy-dashboard-chart-placeholder">
        <p className="howdy-body-text">No hourly track data yet</p>
      </div>
    );
  }

  const values = data.map((d) => d.tracks);
  const max = Math.max(...values) || 1;

  return (
    <div className="howdy-dashboard-chart" data-testid="chart-hourly-tracks">
      <h3 className="howdy-dashboard-chart-title">Tracks played (24h)</h3>
      <div className="howdy-dashboard-chart-svg-wrapper">
        <svg
          viewBox={`0 0 ${100} ${100}`}
          preserveAspectRatio="none"
          className="howdy-dashboard-chart-svg"
          role="img"
          aria-label={`Hourly tracks played chart. Peak: ${max} tracks`}
        >
          {/* Bars */}
          {data.map((d, i) => {
            const barWidth = 100 / data.length * 0.7;
            const x = (i / data.length) * 100 + (100 / data.length) * 0.15;
            const height = max > 0 ? (d.tracks / max) * 85 : 0;
            const y = 100 - height;
            return (
              <rect
                key={i}
                x={`${x}%`}
                y={`${y}%`}
                width={`${barWidth}%`}
                height={`${height}%`}
                fill="var(--howdy-sage-deep)"
                rx="3%"
                ry="3%"
                className="howdy-dashboard-chart-bar"
              />
            );
          })}
        </svg>
      </div>
      <div className="howdy-dashboard-chart-x-axis">
        {data.filter((_, i) => i % 3 === 0 || i === data.length - 1).map((d, idx) => (
          <span key={idx} className="howdy-dashboard-chart-x-label">
            {formatHourLabel(d.hour)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Donut chart for tracks by source (slack vs ads) */
function TracksBySourceDonutChart({ stats }: { stats: DashboardStats | null }): ReactElement {
  if (!stats) {
    return (
      <div className="howdy-dashboard-chart-placeholder">
        <p className="howdy-body-text">Loading source breakdown…</p>
      </div>
    );
  }

  const { slack, ads } = stats.tracksBySource;
  const total = slack + ads;

  if (total === 0) {
    return (
      <div className="howdy-dashboard-chart-placeholder">
        <p className="howdy-body-text">No tracks played yet</p>
      </div>
    );
  }

  const slackPercent = (slack / total) * 100;
  const adsPercent = (ads / total) * 100;

  // Donut segments using stroke-dasharray
  const radius = 38; // percent
  const circumference = 2 * Math.PI * radius;

  const slackStroke = (slackPercent / 100) * circumference;
  const adsStroke = (adsPercent / 100) * circumference;

  return (
    <div className="howdy-dashboard-chart" data-testid="chart-tracks-by-source">
      <h3 className="howdy-dashboard-chart-title">Tracks by source</h3>
      <div className="howdy-dashboard-chart-donut-wrapper">
        <svg
          viewBox="0 0 100 100"
          className="howdy-dashboard-chart-svg howdy-dashboard-chart-svg--donut"
          role="img"
          aria-label={`Tracks by source: ${slack} from Slack (${slackPercent.toFixed(0)}%), ${ads} ads (${adsPercent.toFixed(0)}%)`}
        >
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="var(--howdy-canvas-soft)"
            strokeWidth="16"
          />

          {/* Slack segment */}
          {slack > 0 && (
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="var(--howdy-periwinkle-deep)"
              strokeWidth="16"
              strokeDasharray={`${slackStroke} ${circumference}`}
              strokeDashoffset={-circumference / 4} // Start at top
              strokeLinecap="round"
              className="howdy-dashboard-chart-segment"
            />
          )}

          {/* Ads segment */}
          {ads > 0 && (
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="var(--howdy-pill-coral)"
              strokeWidth="16"
              strokeDasharray={`${adsStroke} ${circumference}`}
              strokeDashoffset={-circumference / 4 - slackStroke}
              strokeLinecap="round"
              className="howdy-dashboard-chart-segment"
            />
          )}
        </svg>
        <div className="howdy-dashboard-donut-center">
          <span className="howdy-dashboard-donut-total">{total}</span>
          <span className="howdy-dashboard-donut-label">tracks</span>
        </div>
      </div>
      <ul className="howdy-dashboard-chart-legend">
        <li className="howdy-dashboard-legend-item">
          <span className="howdy-dashboard-legend-swatch" style={{ background: "var(--howdy-periwinkle-deep)" }} />
          <span className="howdy-dashboard-legend-label">Slack</span>
          <span className="howdy-dashboard-legend-value">{slack} ({slackPercent.toFixed(0)}%)</span>
        </li>
        <li className="howdy-dashboard-legend-item">
          <span className="howdy-dashboard-legend-swatch" style={{ background: "var(--howdy-pill-coral)" }} />
          <span className="howdy-dashboard-legend-label">Ads</span>
          <span className="howdy-dashboard-legend-value">{ads} ({adsPercent.toFixed(0)}%)</span>
        </li>
      </ul>
    </div>
  );
}

export function DashboardCharts({ history, stats }: DashboardChartsProps): ReactElement {
  return (
    <section className="howdy-dashboard-charts" aria-label="Dashboard charts">
      <div className="howdy-dashboard-charts-grid" data-testid="dashboard-charts-grid">
        <HourlyUsersLineChart data={history?.hourlyUsers ?? []} />
        <HourlyTracksBarChart data={history?.hourlyTracksPlayed ?? []} />
        <TracksBySourceDonutChart stats={stats} />
      </div>
    </section>
  );
}