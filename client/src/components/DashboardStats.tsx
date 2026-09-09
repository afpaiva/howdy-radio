/**
 * /client/src/components/DashboardStats.tsx
 *
 * Stats grid displaying key metrics as bento panel cards with floating
 * pill badges for values. Uses the app's design language.
 */

import type { ReactElement } from "react";
import type { DashboardStats } from "../hooks/useDashboard";

interface DashboardStatsProps {
  stats: DashboardStats | null;
}

/** Format minutes as hours with 1 decimal (e.g., "54.0h") */
function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

/** Format large numbers with commas (e.g., "1,234") */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/** Single stat card with label, value pill, and optional description */
function StatCard({
  label,
  value,
  description,
  pillVariant = "periwinkle",
}: {
  label: string;
  value: string | number;
  description?: string;
  pillVariant?: "periwinkle" | "coral" | "amber" | "sage";
}): ReactElement {
  return (
    <article
      className="howdy-dashboard-stat-card"
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <header className="howdy-dashboard-stat-header">
        <span className="howdy-dashboard-stat-label">{label}</span>
      </header>
      <div className="howdy-dashboard-stat-value">
        <span className={`howdy-pill howdy-pill--${pillVariant} howdy-dashboard-stat-pill`}>
          {value}
        </span>
      </div>
      {description && (
        <p className="howdy-dashboard-stat-description">{description}</p>
      )}
    </article>
  );
}

/** Large live users card with real-time indicator */
function LiveUsersCard({ liveUsers }: { liveUsers: number }): ReactElement {
  return (
    <article
      className="howdy-dashboard-stat-card howdy-dashboard-stat-card--featured"
      data-testid="stat-live-users"
    >
      <header className="howdy-dashboard-stat-header">
        <span className="howdy-dashboard-stat-label">Live listeners</span>
        <span className="howdy-dashboard-live-indicator" aria-live="polite">
          <span className="howdy-dashboard-live-dot" aria-hidden="true" />
          LIVE
        </span>
      </header>
      <div className="howdy-dashboard-stat-value howdy-dashboard-stat-value--large">
        <span className="howdy-pill howdy-pill--amber howdy-dashboard-stat-pill howdy-dashboard-stat-pill--large">
          {liveUsers}
        </span>
      </div>
      <p className="howdy-dashboard-stat-description">
        Connected right now
      </p>
    </article>
  );
}

export function DashboardStats({ stats }: DashboardStatsProps): ReactElement {
  if (!stats) {
    return (
      <div className="howdy-dashboard-stats-grid" data-testid="dashboard-stats-loading">
        <div className="howdy-bento-panel">
          <p className="howdy-body-text">Loading dashboard stats…</p>
        </div>
      </div>
    );
  }

  return (
    <section className="howdy-dashboard-stats" aria-label="Dashboard statistics">
      <div className="howdy-dashboard-stats-grid" data-testid="dashboard-stats-grid">
        <LiveUsersCard liveUsers={stats.liveUsers} />
        <StatCard
          label="Total tracks played"
          value={formatNumber(stats.totalTracksPlayed)}
          pillVariant="periwinkle"
        />
        <StatCard
          label="Total listen time"
          value={formatHours(stats.totalListenTimeMinutes)}
          description="Cumulative across all listeners"
          pillVariant="sage"
        />
        <StatCard
          label="Unique listeners today"
          value={formatNumber(stats.uniqueListenersToday)}
          description="Resets daily at midnight"
          pillVariant="coral"
        />
        <StatCard
          label="Peak concurrent"
          value={formatNumber(stats.peakConcurrentUsers)}
          description="All-time high"
          pillVariant="amber"
        />
        <StatCard
          label="Avg session"
          value={`${stats.averageSessionMinutes.toFixed(1)} min`}
          description="Per listener"
          pillVariant="periwinkle"
        />
      </div>
    </section>
  );
}