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
 */

import { useEffect, useState } from "react";
import { usePlayback } from "./lib/websocket";
import { DEFAULT_SKIN_ID, getSkin, getSkins } from "./skins/registry";
import type { Skin } from "./skins/types";

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

  // ── Stage 1: connecting ─────────────────────────────────────────────
  if (!isLive) {
    return (
      <div data-testid="connecting">
        <p>Connecting to broadcast…</p>
      </div>
    );
  }

  // ── Stage 2: tune-in gate (autoplay policy) ─────────────────────────
  if (!tunedIn) {
    return (
      <div data-testid="tune-in">
        <p>Connected. Ready to join the broadcast?</p>
        <button type="button" onClick={() => setTunedIn(true)}>
          Tune in
        </button>
      </div>
    );
  }

  // If tune-in was clicked but no state has arrived yet, wait for it.
  if (!state) {
    return (
      <div data-testid="awaiting-state">
        <p>Joining broadcast…</p>
      </div>
    );
  }

  // ── Stage 3: render the active skin with server state ──────────────
  return (
    <>
      <SkinSelector
        skins={getSkins()}
        activeId={skinId}
        onChange={setSkinId}
      />
      {skin.render(state)}
    </>
  );
}

/** Minimal, unstyled skin picker (skeleton only). */
function SkinSelector({
  skins,
  activeId,
  onChange,
}: {
  skins: Skin[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  if (skins.length <= 1) return null;
  return (
    <nav data-testid="skin-selector">
      {skins.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(s.id)}
          data-active={s.id === activeId ? "true" : "false"}
        >
          {s.name}
        </button>
      ))}
    </nav>
  );
}
