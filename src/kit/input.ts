// One input layer for a game, the same on the TV and on a computer. Inside SlimTV it reads only
// SlimTV's slimtv:input events (the remote and controllers arrive through the bridge). Anywhere
// else it reads the keyboard and controllers itself, following the same rules.

import { ACTIONS, type Action, type InputDetail } from "../contract";
import { createGamepadReader, type GamepadLike } from "../gamepad";
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
 * phone play untouched can call it only when isSlimTV() is true. Keyboard input on a computer is
 * reported as source "remote", player 1, since the keyboard stands in for the remote.
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

  // Keyboard. Several keys can share an action: it goes down with the first and up with the last.
  const actionForKey = new Map<string, Action>();
  for (const action of ACTIONS) {
    for (const code of (options.keymap ?? DEFAULT_KEYMAP)[action] ?? []) {
      if (!actionForKey.has(code)) actionForKey.set(code, action);
    }
  }
  const preventDefault = options.preventDefault !== false;
  const keysDown = new Map<Action, Set<string>>();
  const keyboard = (action: Action, state: "down" | "up", repeat = false): void =>
    deliver(
      state === "down"
        ? { action, state, repeat, source: "remote", player: 1 }
        : { action, state, repeat: false, source: "remote", player: 1 },
    );
  // Keys released while the window is in the background, or while Cmd is held on a Mac, never
  // send keyup, so all held keys are released then.
  const releaseKeys = (): void => {
    for (const [action, codes] of keysDown) {
      if (codes.size === 0) continue;
      codes.clear();
      keyboard(action, "up");
    }
  };

  listen("keydown", (event) => {
    if (event.metaKey) {
      releaseKeys();
      return;
    }
    if (event.ctrlKey || event.altKey || isEditable(event)) return;
    const action = actionForKey.get(event.code);
    if (!action) return;
    if (preventDefault) event.preventDefault();
    const codes = keysDown.get(action) ?? new Set<string>();
    keysDown.set(action, codes);
    if (codes.has(event.code)) {
      if (event.repeat) keyboard(action, "down", true);
      return;
    }
    codes.add(event.code);
    if (codes.size === 1) keyboard(action, "down");
  });
  listen("keyup", (event) => {
    const action = actionForKey.get(event.code);
    const codes = action && keysDown.get(action);
    if (!action || !codes?.delete(event.code)) return;
    if (preventDefault) event.preventDefault();
    if (codes.size === 0) keyboard(action, "up");
  });
  listen("blur", releaseKeys);

  // Controllers, read once per animation frame while any is connected and the window has focus.
  // Losing focus releases everything they hold, like the keyboard; regaining it reads them again.
  if (options.gamepads !== false && typeof navigator !== "undefined" && navigator.getGamepads) {
    const reader = createGamepadReader(deliver, (text) => console.warn(PREFIX, text));
    let frame = 0;
    let blocked = false;
    let away = false;
    const tick = (): void => {
      frame = 0;
      if (disposed || blocked || away) return;
      let pads: (GamepadLike | null)[];
      try {
        pads = [...navigator.getGamepads()];
      } catch (error) {
        // For example a page whose Permissions-Policy blocks the gamepad feature.
        blocked = true;
        console.warn(PREFIX, "controllers can't be read here, so they are ignored.", error);
        return;
      }
      reader.read(pads);
      if (!disposed && pads.some((pad) => pad?.connected)) frame = requestAnimationFrame(tick);
    };
    const start = (): void => {
      if (!frame && !disposed && !blocked && !away) frame = requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    listen("gamepadconnected", start);
    listen("gamepaddisconnected", start);
    listen("blur", () => {
      away = true;
      stop();
      reader.releaseAll();
    });
    listen("focus", () => {
      away = false;
      start();
    });
    start();
    cleanups.push(stop);
  }

  return { mode: "desktop", ...base, isDown };
}

/** True when a key event comes from a text box, including one inside a web component. */
function isEditable(event: Event): boolean {
  if (typeof HTMLElement === "undefined") return false;
  const target = event.composedPath?.()[0] ?? event.target;
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
