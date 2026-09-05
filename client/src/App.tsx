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
 * App-shell views follow the "Editorial Nostalgia & Playful Warmth" design
 * language (docs/frontend_scope/DESIGN_DIRECTIONS.md): warm off-white canvas,
 * organic bento framing, expressive bubble typography, and floating pill
 * badges for interactive elements.
 */

import { useEffect, useState } from "react";
import { usePlayback } from "./lib/websocket";
import { DEFAULT_SKIN_ID, getSkin, getSkins } from "./skins/registry";
import type { Skin } from "./skins/types";
import heroLogo from "../assets/hero-logo.png";
import horizontalLogo from "../assets/horizontal-logo.png";
import "./styles/app.css";

const STORAGE_KEY = "howdy-skin";

export default function App() {
  const { state, isLive } = usePlayback();
  const [tunedIn, setTunedIn] = useState(false);
  const [skinId, setSkinId] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_SKIN_ID;
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SKIN_ID;
  });

  // Persist the per-user skin preference (presentational, not sync state).
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, skinId);
    }
  }, [skinId]);

  const skin = getSkin(skinId) ?? getSkin(DEFAULT_SKIN_ID)!;

  return (
    <div className="howdy-app">
      <Header
        skins={getSkins()}
        activeId={skinId}
        onChange={setSkinId}
        tunedIn={tunedIn}
        onTuneIn={() => setTunedIn(true)}
      />
      {!isLive ? (
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
              onClick={() => setTunedIn(true)}
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
 * skin selector pills after tuning in.
 * Full width, no border radius, sticky to top.
 */
function Header({
  skins,
  activeId,
  onChange,
  tunedIn,
  onTuneIn,
}: {
  skins: Skin[];
  activeId: string;
  onChange: (id: string) => void;
  tunedIn: boolean;
  onTuneIn: () => void;
}) {
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
          skins.map((s) => (
            <button
              key={s.id}
              type="button"
              className="howdy-header-pill"
              onClick={() => onChange(s.id)}
              data-active={s.id === activeId ? "true" : "false"}
            >
              {s.name}
            </button>
          ))
        )}
      </nav>
    </header>
  );
}
