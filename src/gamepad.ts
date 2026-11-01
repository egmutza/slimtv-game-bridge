// Turns controllers read from the browser's Gamepad API into contract input, following the same
// rules SlimTV uses natively (CONTRACT.md "Input mapping" and "Players"). Used by the kit's
// desktop input and by the fake bridge.

import {
  ACTIONS,
  STICK_PRESS,
  STICK_RELEASE,
  type Action,
  type InputDetail,
} from "./contract";

/** The parts of a browser Gamepad the reader uses. */
export interface GamepadLike {
  readonly index: number;
  readonly mapping: string;
  readonly connected?: boolean;
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

/** Standard-mapping button numbers and the action each one sends. */
export const GAMEPAD_BUTTONS: readonly (readonly [number, Action])[] = [
  [0, "confirm"], // A / Cross
  [1, "back"], // B / Circle
  [2, "action1"], // X / Square
  [3, "action2"], // Y / Triangle
  [9, "menu"], // Start / Options
  [12, "up"], // D-pad
  [13, "down"],
  [14, "left"],
  [15, "right"],
];

/** Left stick directions: the axis and which way along it counts. */
const STICK: readonly (readonly [Action, number, 1 | -1])[] = [
  ["up", 1, -1],
  ["down", 1, 1],
  ["left", 0, -1],
  ["right", 0, 1],
];

interface PadState {
  readonly player: number;
  /** Stick directions currently past the press threshold (until they fall below release). */
  readonly stick: Set<Action>;
  /** Actions this controller holds by any control. */
  readonly held: Set<Action>;
}

export interface GamepadReader {
  /** Reads the current controllers (navigator.getGamepads()) and reports what changed. */
  read(pads: readonly (GamepadLike | null)[]): void;
  /**
   * Reports an "up" for everything held, for when the page stops reading (a pause, or the window
   * losing focus). Controllers keep their player numbers; only a disconnect frees one. Buttons
   * still pressed come back as a fresh "down" on the next read.
   */
  releaseHeld(): void;
}

/**
 * Creates a reader that calls `emit` for each change. Rules:
 * - A direction held by the D-pad and the stick together is one "down" and, when the last one
 *   lets go, one "up".
 * - The stick presses a direction at STICK_PRESS along its axis and releases below STICK_RELEASE.
 * - Each new controller takes the lowest free player number, starting at 1.
 * - A controller that goes away first reports an "up" for everything it held.
 * - Controllers without the browser's standard mapping are skipped, with one warning.
 * - Controllers never send repeats; games time their own from isDown.
 */
export function createGamepadReader(
  emit: (detail: InputDetail) => void,
  warn: (message: string) => void,
): GamepadReader {
  const pads = new Map<number, PadState>();
  let warnedMapping = false;

  const send = (action: Action, state: "down" | "up", player: number): void =>
    emit({ action, state, repeat: false, source: "gamepad", player });

  const release = (index: number): void => {
    const pad = pads.get(index);
    if (!pad) return;
    for (const action of ACTIONS) if (pad.held.has(action)) send(action, "up", pad.player);
    pads.delete(index);
  };

  const freePlayer = (): number => {
    const taken = new Set([...pads.values()].map((pad) => pad.player));
    let player = 1;
    while (taken.has(player)) player++;
    return player;
  };

  return {
    read(list) {
      const present = new Map<number, GamepadLike>();
      for (const pad of list) {
        if (!pad || pad.connected === false) continue;
        if (pad.mapping !== "standard") {
          if (!warnedMapping) {
            warnedMapping = true;
            warn("A controller without the browser's standard mapping is connected; it is ignored.");
          }
          continue;
        }
        present.set(pad.index, pad);
      }

      for (const index of [...pads.keys()]) if (!present.has(index)) release(index);

      for (const [index, pad] of present) {
        let state = pads.get(index);
        if (!state) {
          state = { player: freePlayer(), stick: new Set(), held: new Set() };
          pads.set(index, state);
        }

        for (const [action, axis, sign] of STICK) {
          const value = (pad.axes[axis] ?? 0) * sign;
          if (state.stick.has(action)) {
            if (value < STICK_RELEASE) state.stick.delete(action);
          } else if (value >= STICK_PRESS) {
            state.stick.add(action);
          }
        }

        const now = new Set<Action>(state.stick);
        for (const [button, action] of GAMEPAD_BUTTONS) {
          if (pad.buttons[button]?.pressed) now.add(action);
        }

        for (const action of ACTIONS) {
          const was = state.held.has(action);
          const is = now.has(action);
          if (is && !was) {
            state.held.add(action);
            send(action, "down", state.player);
          } else if (was && !is) {
            state.held.delete(action);
            send(action, "up", state.player);
          }
        }
      }
    },
    releaseHeld() {
      for (const pad of pads.values()) {
        for (const action of ACTIONS) if (pad.held.has(action)) send(action, "up", pad.player);
        pad.held.clear();
        pad.stick.clear();
      }
    },
  };
}
