# Dashboard Page Specification

## Overview
Add a `/dashboard` route to the Howdy Radio application that displays real-time analytics and metrics about the radio station. The radio must continue playing while the user visits the dashboard. Data persists in a single JSON file on the server.

---

## Contract (Shared Between Backend & Frontend)

### API Endpoints

#### GET `/api/dashboard/stats`
Returns current dashboard statistics.

**Response (200):**
```json
{
  "liveUsers": 5,
  "totalTracksPlayed": 142,
  "totalListenTimeMinutes": 3240,
  "uniqueListenersToday": 12,
  "peakConcurrentUsers": 8,
  "tracksBySource": {
    "slack": 120,
    "ads": 22
  },
  "averageSessionMinutes": 45.2,
  "lastUpdated": 1725907200
}
```

#### GET `/api/dashboard/history`
Returns historical data for charts (last 24 hours, 1-hour buckets).

**Response (200):**
```json
{
  "hourlyUsers": [
    { "hour": "2025-09-09T00:00:00Z", "users": 0 },
    { "hour": "2025-09-09T01:00:00Z", "users": 0 },
    ...
    { "hour": "2025-09-09T14:00:00Z", "users": 5 }
  ],
  "hourlyTracksPlayed": [
    { "hour": "2025-09-09T00:00:00Z", "tracks": 0 },
    ...
  ]
}
```

### JSON Persistence Schema (`dashboard-data.json`)
```json
{
  "version": 1,
  "counters": {
    "totalTracksPlayed": 142,
    "totalListenTimeSeconds": 194400,
    "uniqueListenerIds": ["user_1", "user_2", ...],
    "peakConcurrentUsers": 8
  },
  "hourlyBuckets": {
    "2025-09-09T14:00:00Z": {
      "users": [5, 4, 6, 5, 5, 6],
      "tracksPlayed": 3,
      "uniqueListeners": ["user_1", "user_2"]
    }
  },
  "lastUpdated": 1725907200
}
```

### WebSocket Events (Extended)
The existing `state` event already includes `clientCount` — this is the source of truth for live users.

---

## Backend Agent Specification

### Responsibilities
1. **Track live users** — Already available via `Conductor.getClientCount()` (exposed on `/health` and in WebSocket `state`)
2. **Persist metrics to JSON file** — Single file: `dashboard-data.json` in server root
3. **Expose REST endpoints** — `/api/dashboard/stats` and `/api/dashboard/history`
4. **Aggregate historical data** — Hourly buckets for last 24 hours
5. **Update counters on track transitions** — Increment `totalTracksPlayed`, accumulate listen time

### Implementation Details

#### New File: `server/src/dashboard/collector.ts`
```typescript
// Responsibilities:
// - Load/save dashboard-data.json (Bun.file)
// - Increment counters on track played
// - Record hourly buckets
// - Compute derived stats (avg session, peak, etc.)
```

#### New File: `server/src/dashboard/routes.ts`
```typescript
// Responsibilities:
// - GET /api/dashboard/stats → current snapshot
// - GET /api/dashboard/history → last 24h hourly buckets
// - Both endpoints: CORS headers for same-origin
```

#### Integration Points
- **server/index.ts**: Import routes, mount at `/api/dashboard/*`
- **Conductor/conductor.ts**: Call collector on track transition (in `advanceIfNeeded` or `computeLiveState` when track changes)
- **WsHandler/handler.ts**: Already broadcasts `clientCount` — no changes needed

#### Data Collection Logic
| Metric | Source | When Updated |
|--------|--------|--------------|
| `liveUsers` | `conductor.getClientCount()` | Real-time (WebSocket `state`) |
| `totalTracksPlayed` | Track transition | Each time a track ends |
| `totalListenTimeSeconds` | `clientCount × elapsed` | Each tick (aggregate) |
| `uniqueListenersToday` | Session cookies / socket IDs | On connect (dedupe by day) |
| `peakConcurrentUsers` | Max of `clientCount` | On each connect/disconnect |
| `tracksBySource` | Track `isAd` flag | On track played |

#### Persistence
- Single file: `dashboard-data.json` at server root
- Write on every track transition + periodic flush (every 30s)
- Load on startup
- Atomic writes: write to temp file → rename

### Commands
```bash
bun test                    # Must pass
bun run verify              # Typecheck + lint + test
```

---

## Frontend Agent Specification

### Responsibilities
1. **New route** `/dashboard` in React Router (or client-side routing)
2. **Dashboard page component** using app's design language
3. **Fetch data** from `/api/dashboard/stats` and `/api/dashboard/history`
4. **Display metrics** with appropriate visualizations
5. **Keep radio playing** — YouTube player must stay mounted (already outside skin tree)
6. **Real-time live users** — Subscribe to WebSocket `state` for `clientCount`

### Implementation Details

#### New Files
- `client/src/pages/Dashboard.tsx` — Main page component
- `client/src/components/DashboardStats.tsx` — Stats grid (cards)
- `client/src/components/DashboardCharts.tsx` — Charts (if data warrants)
- `client/src/hooks/useDashboard.ts` — Data fetching + WebSocket subscription

#### Routing
- Add route in `App.tsx` (or new router setup)
- Protect with `LoginGate` (same auth as main app)
- Header should remain visible (skin selector, logo)

#### Design Requirements (per DESIGN_DIRECTIONS.md)
- **Warm off-white canvas** (`#FAF8F5`)
- **Organic bento panels** — soft rounded rectangles, generous padding
- **Expressive typography** — serif italic headings, bubble font for pills
- **Floating pill badges** — for metric values, status indicators
- **Low-saturation pastels** — sage, apricot, periwinkle, blush
- **Responsive** — mobile-first, works at 320px+

#### Data Display Decisions
| Metric | Visualization | Rationale |
|--------|---------------|-----------|
| Live users | Large pill badge + small trend sparkline | Real-time, single number |
| Total tracks played | Stat card | Cumulative counter |
| Total listen time | Stat card (formatted as hours) | Cumulative |
| Unique listeners today | Stat card | Daily reset |
| Peak concurrent | Stat card | High-water mark |
| Hourly users (24h) | **Line chart** — shows traffic patterns | Time-series, benefits from chart |
| Hourly tracks played | **Bar chart** — shows activity volume | Time-series, categorical hours |
| Tracks by source | **Donut chart** — slack vs ads | Part-to-whole, only 2 categories |

**Charts are mandatory for hourly data** (time-series patterns). Donut for source breakdown. Stat cards for cumulative counters.

#### Radio Continuity
- The YouTube player is rendered in `App.tsx` outside the skin tree (`howdy-youtube-player` div)
- Dashboard must render inside `howdy-main` like skins do
- Do NOT unmount the player — just render dashboard content in main area

#### WebSocket Integration
- Reuse `usePlayback()` hook — it already provides `state.clientCount`
- Display live users from `state.clientCount` (real-time, no polling needed)
- Poll `/api/dashboard/stats` every 30s for other metrics

### Commands
```bash
bun test                    # Must pass
bun test:e2e                # Must pass
bun run verify              # Typecheck + lint + test
```

---

## Acceptance Criteria

### Backend
- [ ] `dashboard-data.json` created/updated on track transitions
- [ ] `/api/dashboard/stats` returns correct current metrics
- [ ] `/api/dashboard/history` returns 24h hourly buckets
- [ ] Data survives server restart
- [ ] No memory leaks (periodic flush, bounded hourly buckets)

### Frontend
- [ ] `/dashboard` route accessible after login
- [ ] Radio continues playing when navigating to/from dashboard
- [ ] Live users updates in real-time via WebSocket
- [ ] All metrics displayed in app design language
- [ ] Charts render correctly (line, bar, donut)
- [ ] Responsive on mobile
- [ ] Header with skin selector remains functional

### Integration
- [ ] Backend increments counters when tracks play
- [ ] Frontend shows live data from backend
- [ ] No console errors
- [ ] All existing tests pass