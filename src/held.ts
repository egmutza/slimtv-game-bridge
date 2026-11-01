// Which buttons are held, per action, source and player, with the contract's rules ("SlimTV to
// game" and "Polling" in CONTRACT.md). Shared by the shim and the kit's desktop input so both
// treat input the same way.

import type { Action, InputDetail } from "./contract";

export interface HeldButtons {
  /**
   * Records one input and says whether it is a change to pass on. A "down" for a button that is
   * already down, or an "up" or repeat for one that isn't, changes nothing and returns false.
   */
  apply(detail: InputDetail): boolean;
  /** True while the action is held, by `player` if given, otherwise by anyone. */
  isDown(action: Action, player?: number): boolean;
  /** Forgets every held button without reporting anything. */
  clear(): void;
}

export function createHeld(): HeldButtons {
  const held = new Map<string, { action: Action; player: number }>();
  return {
    apply({ action, state, repeat, source, player }) {
      const key = `${action}|${source}|${player}`;
      const isHeld = held.has(key);
      if (state === "down") {
        if (isHeld !== repeat) return false;
        held.set(key, { action, player });
      } else {
        if (!isHeld) return false;
        held.delete(key);
      }
      return true;
    },
    isDown(action, player) {
      for (const entry of held.values()) {
        if (entry.action === action && (player === undefined || entry.player === player)) {
          return true;
        }
      }
      return false;
    },
    clear() {
      held.clear();
    },
  };
}
