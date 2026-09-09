/**
 * /client/src/pages/Dashboard.tsx
 *
 * Dashboard page — displays real-time analytics and metrics about the radio station.
 * Renders inside the main app shell (howdy-main) so the YouTube player stays mounted.
 */

import type { ReactElement } from "react";
import { useDashboard } from "../hooks/useDashboard";
import { DashboardStats } from "../components/DashboardStats";
import { DashboardCharts } from "../components/DashboardCharts";

export function Dashboard(): ReactElement {
  const { stats, history, loading, error, refetch } = useDashboard();

  if (loading) {
    return (
      <div className="howdy-dashboard" data-testid="dashboard-loading">
        <div className="howdy-dashboard-header">
          <h1 className="howdy-dashboard-title">Dashboard</h1>
        </div>
        <div className="howdy-dashboard-content">
          <div className="howdy-bento-panel">
            <p className="howdy-body-text">Loading dashboard…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="howdy-dashboard" data-testid="dashboard-error">
        <div className="howdy-dashboard-header">
          <h1 className="howdy-dashboard-title">Dashboard</h1>
        </div>
        <div className="howdy-dashboard-content">
          <div className="howdy-bento-panel howdy-bento-panel--wide">
            <p className="howdy-body-text" style={{ color: "var(--howdy-pill-coral)" }}>
              Failed to load dashboard: {error}
            </p>
            <button
              type="button"
              className="howdy-pill howdy-pill--periwinkle"
              onClick={refetch}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="howdy-dashboard" data-testid="dashboard">
      <header className="howdy-dashboard-header">
        <h1 className="howdy-dashboard-title">Dashboard</h1>
        <p className="howdy-dashboard-subtitle">
          Real-time analytics for Howdy Radio
        </p>
      </header>

      <div className="howdy-dashboard-content">
        <DashboardStats stats={stats} />
        <DashboardCharts history={history} stats={stats} />
      </div>
    </div>
  );
}