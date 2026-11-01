// One input layer for a game, the same on the TV and on a computer. Inside SlimTV it reads only
// SlimTV's slimtv:input events (the remote and controllers arrive through the bridge). Anywhere
// else it reads the keyboard and controllers itself, following the same rules.

import type { Action, InputDetail } from "../contract";
import { createGamepadReader } from "../gamepad";
import { watchGamepads } from "../gamepadLoop";
import { createKeyboard } from "../keyboard";
import { mergeInputs } from "../merge";
import { createHeld } from "../held";
import { RELEASE_NAME } from "../release";
import { DEFAULT_KEYMAP, type Keymap } from "./keymap";
import { slimtv } from "./slimtv";

export interface InputOptions {
  /** Keys for each action on a computer. Defaults to DEFAULT_KEYMAP. Ignored inside SlimTV. */
  readonly keymap?: Keymap;
  /** Read controllers on a computer. Default true. Ignored inside SlimTV. */
  readonly gamepads?: boolean;
  /**
   * Stop the browser's own handling of mapped keys on a computer (arrow keys and Space scrolling,
   * Tab moving focus out of the game). Default true. Typing in text boxes and shortcuts with
   * Ctrl, Alt or Cmd are never touched. Ignored inside SlimTV, where keys never reach the page.
   */
  readonly preventDefault?: boolean;
}

export type InputHandler = (detail: InputDetail) => void;

export interface GameInput {
  /**
   * "slimtv" when input comes through SlimTV's bridge, "desktop" when read from the browser. Fixed
   * when createInput() runs, so the bridge (or the fake bridge) must be in the page before that.
   */
  readonly mode: "slimtv" | "desktop";
  /**
   * Calls `handler` for every input. Returns a function that stops it. Until dispose(), every
   * "down" a handler sees is followed by an "up", even across a pause on the TV or the window
   * losing focus on a computer, so a game tracking held buttons from its handlers never gets one
   * stuck.
   */
  on(handler: InputHandler): () => void;
  off(handler: InputHandler): void;
  /** True while the action is held, by `player` if given, otherwise by anyone. */
  isDown(action: Action, player?: number): boolean;
  /**
   * True if the action went down (not counting repeats) between the last two poll() calls. For
   * games that read input in a frame loop and call poll() once per frame.
   */
  pressed(action: Action, player?: number): boolean;
  /** Starts a new frame for pressed(). */
  poll(): void;
  /**
   * Removes every listener this input added. Nothing more is reported after it, not even "up"s
   * for buttons still held, and isDown and pressed answer false.
   */
  dispose(): void;
}

const PREFIX = `[SlimTV kit ${RELEASE_NAME}]`;

/**
 * Creates the input layer. It adds listeners only when called, so a game that wants desktop and
 * phone play untouched can call it only when isSlimTV() is true. On a computer the keyboard is
 * player 1: keys for the remote's actions come from the remote, and keys for menu, action1 and
 * action2, which only controllers have, come from the first controller (see REMOTE_ACTIONS).
 */
export function createInput(options: InputOptions = {}): GameInput {
  const handlers = new Set<InputHandler>();
  const cleanups: (() => void)[] = [];
  let downs = new Set<string>();
  let lastFrame = new Set<string>();
  let disposed = false;

  const listen = <K extends keyof WindowEventMap>(
    type: K,
    listener: (event: WindowEventMap[K]) => void,
  ): void => {
    window.addEventListener(type, listener);
    cleanups.push(() => window.removeEventListener(type, listener));
  };

  // Every input passes through here once it is known to be a change. `held` mirrors what the
  // handlers have seen, so the kit can release it on a pause.
  const held = createHeld();
  const deliver = (detail: InputDetail): void => {
    if (disposed || !held.apply(detail)) return;
    if (detail.state === "down" && !detail.repeat) {
      downs.add(`${detail.action}|${detail.player}`);
      downs.add(detail.action);
    }
    const frozen = Object.freeze({ ...detail });
    for (const handler of [...handlers]) {
      if (disposed) return;
      try {
        handler(frozen);
      } catch (error) {
        console.error(PREFIX, "an input handler threw", error);
        try {
          slimtv()?.log("error", `${PREFIX} an input handler threw: ${String(error)}`);
        } catch {
          // Logging is best effort.
        }
      }
    }
  };

  const base = {
    on(handler: InputHandler) {
      if (!disposed) handlers.add(handler);
      return () => void handlers.delete(handler);
    },
    off(handler: InputHandler) {
      handlers.delete(handler);
    },
    pressed(action: Action, player?: number) {
      return !disposed && lastFrame.has(player === undefined ? action : `${action}|${player}`);
    },
    poll() {
      lastFrame = downs;
      downs = new Set();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      handlers.clear();
      held.clear();
      downs.clear();
      lastFrame.clear();
    },
  };
  const isDown = (action: Action, player?: number): boolean =>
    !disposed && held.isDown(action, player);

  if (typeof window === "undefined") return { mode: "desktop", ...base, isDown };

  if (slimtv()) {
    // Remembers what each source and player holds, to send "up"s on a pause, which the contract
    // leaves to the game (the shim forgets held buttons without reporting them).
    const delivered = new Map<string, InputDetail>();
    listen("slimtv:input", (event) => {
      const detail = event.detail;
      const key = `${detail.action}|${detail.source}|${detail.player}`;
      if (detail.state === "down") delivered.set(key, detail);
      else delivered.delete(key);
      deliver(detail);
    });
    listen("slimtv:pause", () => {
      const released = [...delivered.values()];
      delivered.clear();
      for (const { action, source, player } of released) {
        deliver({ action, state: "up", repeat: false, source, player });
      }
    });
    // isDown asks the shim, which also knows buttons held from before this input was created.
    // It forgets held buttons on a pause, just as the "up"s above report.
    return {
      mode: "slimtv",
      ...base,
      isDown: (action, player) => !disposed && (slimtv()?.input.isDown(action, player) ?? false),
    };
  }

  // Keyboard, as player 1. Keys released while the window is in the background never send
  // keyup, so losing focus releases them.
  const preventDefault = options.preventDefault !== false;
  // Keys and controllers can hold the same button (keys for controller-only buttons count as the
  // first controller), so their input is merged first.
  const from = mergeInputs(deliver);
  const keyboard = createKeyboard(options.keymap ?? DEFAULT_KEYMAP, from("keyboard"), (event) => {
    if (preventDefault) event.preventDefault();
  });
  listen("keydown", keyboard.keydown);
  listen("keyup", keyboard.keyup);
  listen("blur", keyboard.releaseAll);

  // Controllers, read each frame while any is connected and the window has focus.
  if (options.gamepads !== false) {
    const reader = createGamepadReader(from("gamepads"), (text) => console.warn(PREFIX, text));
    cleanups.push(watchGamepads(reader, (text, error) => console.warn(PREFIX, text, error)));
  }

  return { mode: "desktop", ...base, isDown };
}
