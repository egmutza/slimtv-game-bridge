// Turns controllers read from the browser's Gamepad API into contract input, following the same
// rules SlimTV uses natively (CONTRACT.md "Input mapping", "Players" and "Stick positions"). Used
// by the kit's desktop input and by the fake bridge.

import {
  ACTIONS,
  MAX_PLAYERS,
  STICK_DEAD_ZONE,
  STICK_PRESS,
  STICK_RELEASE,
  STICKS,
  TRIGGER_PRESS,
  TRIGGER_RELEASE,
  type Action,
  type InputDetail,
  type StickDetail,
  type StickName,
  type StickPosition,
} from "./contract";
import { CENTRE } from "./sticks";

/** The parts of a browser Gamepad the reader uses. */
export interface GamepadLike {
  readonly index: number;
  readonly mapping: string;
  readonly connected?: boolean;
  /** `value` is from 0 to 1; the reader uses it for the triggers when it is a number. */
  readonly buttons: readonly { readonly pressed: boolean; readonly value?: number }[];
  readonly axes: readonly number[];
}

/** Standard-mapping button numbers and the action each one sends. */
export const GAMEPAD_BUTTONS: readonly (readonly [number, Action])[] = [
  [0, "confirm"], // A / Cross
  [1, "back"], // B / Circle
  [2, "action1"], // X / Square
  [3, "action2"], // Y / Triangle
  [4, "l1"], // Left shoulder: LB / L1 / L
  [5, "r1"], // Right shoulder: RB / R1 / R
  [9, "menu"], // Start / Options
  [10, "l3"], // Left stick pressed in
  [11, "r3"], // Right stick pressed in
  [12, "up"], // D-pad
  [13, "down"],
  [14, "left"],
  [15, "right"],
];

/**
 * Standard-mapping trigger buttons: LT / L2 / ZL and RT / R2 / ZR. They go down at TRIGGER_PRESS
 * and up below TRIGGER_RELEASE, read from the button's value, or from whether it is pressed when
 * the browser gives no value.
 */
export const GAMEPAD_TRIGGERS: readonly (readonly [number, Action])[] = [
  [6, "l2"],
  [7, "r2"],
];

/** Standard-mapping axes for each stick's x and y. */
const STICK_AXES: Readonly<Record<StickName, readonly [number, number]>> = { left: [0, 1], right: [2, 3] };

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
  /** Triggers currently past the press threshold (until they fall below release). */
  readonly triggers: Set<Action>;
  /** Actions this controller holds by any control. */
  readonly held: Set<Action>;
  /** Stick positions last reported, for sticks away from the centre. */
  readonly positions: Map<StickName, StickPosition>;
}

export interface GamepadReader {
  /** Reads the current controllers (navigator.getGamepads()) and reports what changed. */
  read(pads: readonly (GamepadLike | null)[]): void;
  /**
   * Reports an "up" for everything held and every stick back at the centre, for when the page
   * stops reading (a pause, or the window losing focus). Controllers keep their player numbers;
   * only a disconnect frees one. Buttons still pressed come back as a fresh "down", and sticks
   * still pushed as a new position, on the next read.
   */
  releaseHeld(): void;
}

/**
 * Creates a reader that calls `emit` for each button change and `emitStick` (if given) for each
 * stick that moves. Rules:
 * - A direction held by the D-pad and the stick together is one "down" and, when the last one
 *   lets go, one "up".
 * - The left stick presses a direction at STICK_PRESS along its axis and releases below
 *   STICK_RELEASE. The triggers do the same at TRIGGER_PRESS and TRIGGER_RELEASE.
 * - Stick positions are shaped by shapeStick() and reported only when they change.
 * - Each new controller takes the lowest free player number, starting at 1. One that would need a
 *   number above MAX_PLAYERS is skipped, with one warning, until another controller goes away.
 * - A controller that goes away first reports an "up" for everything it held, and its sticks back
 *   at the centre.
 * - Controllers without the browser's standard mapping are skipped, with one warning.
 * - Controllers never send repeats; games time their own from isDown.
 */
export function createGamepadReader(
  emit: (detail: InputDetail) => void,
  warn: (message: string) => void,
  emitStick: (detail: StickDetail) => void = () => {},
): GamepadReader {
  const pads = new Map<number, PadState>();
  let warnedMapping = false;
  let warnedPlayers = false;

  const send = (action: Action, state: "down" | "up", player: number): void =>
    emit({ action, state, repeat: false, source: "gamepad", player });

  const moveStick = (pad: PadState, stick: StickName, position: StickPosition): void => {
    const old = pad.positions.get(stick);
    if ((old?.x ?? 0) === position.x && (old?.y ?? 0) === position.y) return;
    if (position.x === 0 && position.y === 0) pad.positions.delete(stick);
    else pad.positions.set(stick, position);
    emitStick({ stick, x: position.x, y: position.y, player: pad.player });
  };

  // Everything this controller holds goes up and its sticks back to the centre.
  const letGo = (pad: PadState): void => {
    for (const action of ACTIONS) if (pad.held.has(action)) send(action, "up", pad.player);
    pad.held.clear();
    pad.stick.clear();
    pad.triggers.clear();
    for (const stick of STICKS) moveStick(pad, stick, CENTRE);
  };

  const release = (index: number): void => {
    const pad = pads.get(index);
    if (!pad) return;
    letGo(pad);
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
          const player = freePlayer();
          if (player > MAX_PLAYERS) {
            if (!warnedPlayers) {
              warnedPlayers = true;
              warn(`More than ${MAX_PLAYERS} controllers are connected; the extra ones are ignored.`);
            }
            continue;
          }
          state = { player, stick: new Set(), triggers: new Set(), held: new Set(), positions: new Map() };
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

        for (const [button, action] of GAMEPAD_TRIGGERS) {
          const value = triggerValue(pad.buttons[button]);
          if (state.triggers.has(action)) {
            if (value < TRIGGER_RELEASE) state.triggers.delete(action);
          } else if (value >= TRIGGER_PRESS) {
            state.triggers.add(action);
          }
        }

        const now = new Set<Action>([...state.stick, ...state.triggers]);
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

        for (const stick of STICKS) {
          const [x, y] = STICK_AXES[stick];
          moveStick(state, stick, shapeStick(pad.axes[x] ?? 0, pad.axes[y] ?? 0));
        }
      }
    },
    releaseHeld() {
      for (const pad of pads.values()) letGo(pad);
    },
  };
}

/**
 * Turns a stick's raw reading (each axis -1 to 1, right and down positive) into what a game sees:
 * inside STICK_DEAD_ZONE it is 0, 0; past it the distance starts again from 0 and reaches 1 at the
 * edge, never beyond; each axis is rounded to two decimal places. A reading that isn't a number
 * counts as 0.
 */
export function shapeStick(rawX: number, rawY: number): StickPosition {
  const x = Number.isFinite(rawX) ? rawX : 0;
  const y = Number.isFinite(rawY) ? rawY : 0;
  const distance = Math.hypot(x, y);
  if (distance <= STICK_DEAD_ZONE) return CENTRE;
  const scaled = Math.min(1, (distance - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE));
  const round = (value: number): number => Math.round(value * 100) / 100 || 0;
  return Object.freeze({ x: round((x / distance) * scaled), y: round((y / distance) * scaled) });
}

/** A trigger button's value from 0 to 1, or whether it is pressed when it has no usable value. */
function triggerValue(button: { readonly pressed: boolean; readonly value?: number } | undefined): number {
  if (!button) return 0;
  if (typeof button.value === "number" && Number.isFinite(button.value)) return button.value;
  return button.pressed ? 1 : 0;
}
