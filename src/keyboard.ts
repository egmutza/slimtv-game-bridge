// Turns keyboard events into contract input as player 1. Shared by the kit's desktop input and the
// fake bridge, so a key does the same thing in both.

import { ACTIONS, type Action, type InputDetail } from "./contract";
import type { Keymap } from "./kit/keymap";

/**
 * The actions the TV remote has (CONTRACT.md "Input mapping"). The keyboard sends these as the
 * remote; the rest (menu, action1, action2, and the shoulder, trigger and stick buttons) exist only
 * on controllers, so the keyboard sends them as the first controller. A game tested on a computer
 * then sees the same sources as on the TV.
 */
export const REMOTE_ACTIONS: ReadonlySet<Action> = new Set(["up", "down", "left", "right", "confirm", "back"]);

export interface KeyboardReader {
  /** True if the key is mapped to an action. */
  isMapped(code: string): boolean;
  keydown(event: KeyboardEvent): void;
  keyup(event: KeyboardEvent): void;
  /** Reports an "up" for every held action. For when keyup won't come (focus lost, Cmd held). */
  releaseAll(): void;
}

/**
 * Creates a keyboard reader. Rules:
 * - Keys for the remote's actions come from the remote, player 1; the others from the first
 *   controller, player 1 (see REMOTE_ACTIONS).
 * - Several keys can share an action: it goes down with the first and up with the last.
 * - Key auto-repeat of a held key is a repeat.
 * - Typing in a text box and shortcuts with Ctrl or Alt are left alone. Any key with Cmd releases
 *   everything, since a Mac sends no keyup for keys released while Cmd is held.
 * - `claim` is called for each event the reader uses, so the caller can stop the browser (or the
 *   page) from handling it too.
 */
export function createKeyboard(
  keymap: Keymap,
  emit: (detail: InputDetail) => void,
  claim: (event: KeyboardEvent) => void,
): KeyboardReader {
  const actionForKey = new Map<string, Action>();
  for (const action of ACTIONS) {
    for (const code of keymap[action] ?? []) {
      if (!actionForKey.has(code)) actionForKey.set(code, action);
    }
  }
  const keysDown = new Map<Action, Set<string>>();
  const send = (action: Action, state: "down" | "up", repeat = false): void => {
    const source = REMOTE_ACTIONS.has(action) ? "remote" : "gamepad";
    emit(
      state === "down"
        ? { action, state, repeat, source, player: 1 }
        : { action, state, repeat: false, source, player: 1 },
    );
  };

  const releaseAll = (): void => {
    for (const [action, codes] of keysDown) {
      if (codes.size === 0) continue;
      codes.clear();
      send(action, "up");
    }
  };

  return {
    isMapped: (code) => actionForKey.has(code),
    keydown(event) {
      if (event.metaKey) {
        releaseAll();
        return;
      }
      if (event.ctrlKey || event.altKey || isEditable(event)) return;
      const action = actionForKey.get(event.code);
      if (!action) return;
      claim(event);
      const codes = keysDown.get(action) ?? new Set<string>();
      keysDown.set(action, codes);
      if (codes.has(event.code)) {
        if (event.repeat) send(action, "down", true);
        return;
      }
      codes.add(event.code);
      if (codes.size === 1) send(action, "down");
    },
    keyup(event) {
      const action = actionForKey.get(event.code);
      const codes = action && keysDown.get(action);
      if (!action || !codes?.delete(event.code)) return;
      claim(event);
      if (codes.size === 0) send(action, "up");
    },
    releaseAll,
  };
}

/** True when a key event comes from a text box, including one inside a web component. */
export function isEditable(event: Event): boolean {
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
