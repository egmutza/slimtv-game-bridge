// Stick positions as games read them ("Stick positions" in CONTRACT.md). Shared by the shim and
// the kit's desktop input, so both answer stick() the same way.

import { MAX_PLAYERS, STICKS, type StickDetail, type StickName, type StickPosition } from "./contract";

/** A stick at rest. */
export const CENTRE: StickPosition = Object.freeze({ x: 0, y: 0 });

export interface StickPositions {
  /** Records one position and says whether it changed anything. */
  set(detail: StickDetail): boolean;
  /**
   * Where the stick is, for `player` if given, otherwise for whoever pushes it furthest (the lower
   * player number if two push it equally far).
   */
  get(stick: StickName, player?: number): StickPosition;
  /** Puts every stick back to the centre without reporting anything. */
  clear(): void;
}

export function createSticks(): StickPositions {
  // Only sticks away from the centre are kept: at most two per player.
  const positions = new Map<string, StickDetail>();
  return {
    set(detail) {
      const key = `${detail.stick}|${detail.player}`;
      const old = positions.get(key) ?? CENTRE;
      if (old.x === detail.x && old.y === detail.y) return false;
      if (detail.x === 0 && detail.y === 0) positions.delete(key);
      else positions.set(key, Object.freeze({ stick: detail.stick, x: detail.x, y: detail.y, player: detail.player }));
      return true;
    },
    get(stick, player) {
      if (!(STICKS as readonly string[]).includes(stick)) return CENTRE;
      if (player !== undefined) {
        if (!Number.isSafeInteger(player) || player < 1 || player > MAX_PLAYERS) return CENTRE;
        const found = positions.get(`${stick}|${player}`);
        return found ? Object.freeze({ x: found.x, y: found.y }) : CENTRE;
      }
      let best: StickPosition = CENTRE;
      let bestDistance = 0;
      let bestPlayer = Infinity;
      for (const entry of positions.values()) {
        if (entry.stick !== stick) continue;
        const distance = Math.hypot(entry.x, entry.y);
        if (distance > bestDistance || (distance === bestDistance && entry.player < bestPlayer)) {
          bestDistance = distance;
          bestPlayer = entry.player;
          best = Object.freeze({ x: entry.x, y: entry.y });
        }
      }
      return best;
    },
    clear() {
      positions.clear();
    },
  };
}
