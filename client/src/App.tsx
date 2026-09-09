/**
 * App.tsx — root component.
 *
 * Wires the Socket.io playback hook to a skin from the registry. It owns
 * no playback sync state itself: it only tracks the "tune in" autoplay
 * gate (per SPEC.md -> Autoplay Handling) and the per-user skin
 * preference (localStorage — explicitly permitted, it's presentational,
 * not sync state).
 *
 * Until the user clicks "Tune in", a minimal prompt is shown. Once live
 * state arrives from the server, the active skin renders the received
 * {@link PlaybackState}.
 *
 * The entire app is gated behind authentication via {@link LoginGate}.
 * The login state is tracked via an HTTP-only session cookie (set by the
 * server on POST /auth/login) — no localStorage is used for auth (per
 * client/AGENTS.md hard rule #2). On mount, LoginGate checks for an
 * existing session via GET /auth/me.
 *
 * App-shell views follow the "Editorial Nostalgia & Playful Warmth" design
 * language (docs/frontend_scope/DESIGN_DIRECTIONS.md): warm off-white canvas,
 * organic bento framing, expressive bubble typography, and floating pill
 * badges for interactive elements.
 */

import { useEffect, useState, useCallback } from "react";
import { usePlayback } from "./lib/websocket";
import { useYouTubePlayer } from "./lib/youtube-player";
import { DEFAULT_SKIN_ID, getSkin, getSkins } from "./skins/registry";
import type { Skin } from "./skins/types";
import { LoginGate } from "./components/LoginGate";
import type { AuthUser } from "./components/LoginGate";
import { Dashboard } from "./pages/Dashboard";
import heroLogo from "../assets/hero-logo.png";
import horizontalLogo from "../assets/horizontal-logo.png";
import "./styles/app.css";

const STORAGE_KEY = "howdy-skin";

export default function App() {
  const [authenticated, setAuthenticated] = useState<AuthUser | null>(null);

  // Once authenticated, the full app shell (WebSocket player, skins, etc.) renders.
  if (!authenticated) {
    return (
      <div className="howdy-app">
        <LoginGate onAuthenticated={setAuthenticated} />
      </div>
    );
  }

  return <AppShell />;
}

/**
 * AppShell — the authenticated portion of the app.
 * Rendered only after successful login.
 */
function AppShell() {
  const { state, isLive, tuneIn } = usePlayback();
  const [tunedIn, setTunedIn] = useState(false);
  const [skinId, setSkinId] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_SKIN_ID;
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SKIN_ID;
  });

  // Simple client-side routing for /dashboard
  const [route, setRoute] = useState<string>(() => {
    if (typeof window === "undefined") return "player";
    return window.location.hash.slice(1) || "player";
  });

  const navigate = useCallback((newRoute: string) => {
    setRoute(newRoute);
    if (typeof window !== "undefined") {
      window.location.hash = newRoute;
    }
  }, []);

  // Sync route with hash changes
  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.slice(1) || "player";
      setRoute(hash);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  /**
   * The "Tune in" control is the single user-gesture entry point for audio
   * (client/AGENTS.md hard rule #6). It must both signal the server
   * (emitting the `join-broadcast` control intent) AND flip the local autoplay gate
   * so the YouTube player is cleared to start playback.
   */
  const playerRef = useYouTubePlayer(state, tunedIn);
  const handleTuneIn = () => {
    setTunedIn(true);
    tuneIn();
  };

  // Persist the per-user skin preference (presentational, not sync state).
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, skinId);
    }
  }, [skinId]);

  const skin = getSkin(skinId) ?? getSkin(DEFAULT_SKIN_ID)!;

  return (
    <div className="howdy-app">
      {/*
        Visually-hidden YouTube IFrame — audio-first, never shown on screen
        (client/AGENTS.md hard rule #5). It is rendered outside the skin
        tree so switching skins never unmounts the player.
      */}
      <div
        ref={playerRef}
        className="howdy-youtube-player"
        data-testid="youtube-player-container"
        aria-hidden="true"
      />
      <Header
        skins={getSkins()}
        activeId={skinId}
        onChange={setSkinId}
        tunedIn={tunedIn}
        onTuneIn={handleTuneIn}
        route={route}
        onNavigate={navigate}
      />
      {route === "dashboard" ? (
        // Dashboard route — render Dashboard page (radio keeps playing via YouTube player)
        <main className="howdy-main">
          <Dashboard />
        </main>
      ) : !isLive ? (
        // Stage 1: connecting
        <div className="howdy-pre-launch">
          <img src={heroLogo} alt="Howdy Radio" className="howdy-hero-logo" />
          <div className="howdy-bento-panel" data-testid="connecting">
            <p className="howdy-body-text">Connecting to broadcast…</p>
          </div>
        </div>
      ) : !tunedIn ? (
        // Stage 2: tune-in gate (autoplay policy)
        <div className="howdy-pre-launch">
          <img src={heroLogo} alt="Howdy Radio" className="howdy-hero-logo" />
          <div className="howdy-bento-panel howdy-bento-panel--wide" data-testid="tune-in">
            <p className="howdy-prompt">
              Connected. Ready to join the <span className="howdy-emphasis">broadcast</span>?
            </p>
            <button
              type="button"
              className="howdy-pill howdy-pill--amber"
              onClick={handleTuneIn}
            >
              Tune in
            </button>
          </div>
        </div>
      ) : !state ? (
        // Stage 3: awaiting state (tune-in clicked, no server state yet)
        <div className="howdy-pre-launch">
          <img src={heroLogo} alt="Howdy Radio" className="howdy-hero-logo" />
          <div className="howdy-bento-panel" data-testid="awaiting-state">
            <p className="howdy-body-text">Joining broadcast…</p>
          </div>
        </div>
      ) : (
        // Stage 4: render the active skin with server state
        <main className="howdy-main">{skin.render(state)}</main>
      )}
    </div>
  );
}

/**
 * Header — traditional horizontal bar fixed to top.
 *
 * Left: horizontal logo. Right: "Tune in" button before tuning in,
 * skin selector pills + Dashboard link after tuning in (hamburger menu on mobile).
 * Full width, no border radius, sticky to top.
 */
function Header({
  skins,
  activeId,
  onChange,
  tunedIn,
  onTuneIn,
  route,
  onNavigate,
}: {
  skins: Skin[];
  activeId: string;
  onChange: (id: string) => void;
  tunedIn: boolean;
  onTuneIn: () => void;
  route: string;
  onNavigate: (route: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSkinSelect = (id: string) => {
    onChange(id);
    setMenuOpen(false);
  };

  return (
    <header className="howdy-header" data-testid="header">
      <a href="/" className="howdy-header-logo" aria-label="Howdy Radio home">
        <img src={horizontalLogo} alt="" />
      </a>
      <nav className="howdy-header-nav" aria-label={tunedIn ? "Skin selector" : "Tune in"}>
        {!tunedIn ? (
          <button
            type="button"
            className="howdy-header-pill howdy-header-pill--primary"
            onClick={onTuneIn}
          >
            Tune in
          </button>
        ) : (
          <>
            <div className="howdy-header-pills">
              {skins.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="howdy-header-pill"
                  onClick={() => onChange(s.id)}
                  data-active={s.id === activeId ? "true" : "false"}
                >
                  {s.name}
                </button>
              ))}
              <button
                type="button"
                className={`howdy-header-pill${route === "dashboard" ? " howdy-header-pill--active" : ""}`}
                onClick={() => onNavigate("dashboard")}
                data-active={route === "dashboard" ? "true" : "false"}
              >
                Dashboard
              </button>
              <button
                type="button"
                className={`howdy-header-pill${route === "player" ? " howdy-header-pill--active" : ""}`}
                onClick={() => onNavigate("player")}
                data-active={route === "player" ? "true" : "false"}
              >
                Player
              </button>
            </div>
            <button
              type="button"
              className="howdy-hamburger"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="skin-menu"
              aria-label="Open menu"
            >
              <span className="howdy-hamburger-line" />
              <span className="howdy-hamburger-line" />
              <span className="howdy-hamburger-line" />
            </button>
            <div
              id="skin-menu"
              className={`howdy-skin-dropdown${menuOpen ? " howdy-skin-dropdown--open" : ""}`}
              role="menu"
              aria-orientation="vertical"
            >
              {skins.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  className={`howdy-skin-dropdown-item${s.id === activeId ? " howdy-skin-dropdown-item--active" : ""}`}
                  onClick={() => handleSkinSelect(s.id)}
                  data-active={s.id === activeId ? "true" : "false"}
                >
                  {s.name}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className={`howdy-skin-dropdown-item${route === "dashboard" ? " howdy-skin-dropdown-item--active" : ""}`}
                onClick={() => {
                  onNavigate("dashboard");
                  setMenuOpen(false);
                }}
                data-active={route === "dashboard" ? "true" : "false"}
              >
                Dashboard
              </button>
              <button
                type="button"
                role="menuitem"
                className={`howdy-skin-dropdown-item${route === "player" ? " howdy-skin-dropdown-item--active" : ""}`}
                onClick={() => {
                  onNavigate("player");
                  setMenuOpen(false);
                }}
                data-active={route === "player" ? "true" : "false"}
              >
                Player
              </button>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}
