/**
 * /client/src/skins/registry.ts
 *
 * Auto-registers every available skin by `Skin.id`.
 *
 * Adding a new skin is a single-line change: import it here and add it to
 * the registry object. The App reads the persisted preference from
 * localStorage and falls back to the default skin when unknown.
 */

import type { Skin, SkinRegistry } from "./types";
import { neutralSkin } from "./neutral";

/** All skins the client knows about, keyed by `Skin.id`. */
const registry: SkinRegistry = {
  [neutralSkin.id]: neutralSkin,
};

/**
 * Look up a skin by id. Returns `undefined` when the id is unknown
 * (the caller is responsible for falling back to the default).
 */
export function getSkin(id: string): Skin | undefined {
  return registry[id];
}

/** Every registered skin, suitable for a skin-gallery UI. */
export function getSkins(): Skin[] {
  return Object.values(registry);
}

/** The default skin shown when no persisted preference exists. */
export const DEFAULT_SKIN_ID: string = neutralSkin.id;

export { registry };
