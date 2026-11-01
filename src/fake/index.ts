// The fake bridge: SlimTV's side of the contract, imitated in a computer's browser, so a game can
// be tried in TV mode without the TV. It runs the real shim (src/shim/core.ts) over a fake
// transport that turns the keyboard and controllers into the same messages SlimTV sends.
//
// What it imitates (CONTRACT.md):
// - Input: mapped keys act as the remote, or as the first controller for buttons the remote
//   lacks, and are caught before the page sees them, as native keys never reach a game page as
//   keydown. Controllers follow the contract's rules.
// - Pause and resume: F9 toggles them. No input arrives while paused.
// - ready() and exit(): a toast says what SlimTV would do.
// - The escape hatches: Back before ready(), and Back held for 1 second, each show a toast saying
//   SlimTV would exit now.
// What it can't imitate: the TV's audio rule. In a computer's browser a real key press counts as
// a user gesture, so whether audio starts with no key press can only be checked on the Onn.

import type { DeviceInfo, InputDetail, LogLevel } from "../contract";
import { createGamepadReader } from "../gamepad";
import { watchGamepads } from "../gamepadLoop";
import { createKeyboard, isEditable } from "../keyboard";
import { mergeInputs } from "../merge";
import { DEFAULT_KEYMAP, type Keymap } from "../kit/keymap";
import { RELEASE_NAME } from "../release";
import { createShim, type ShimWindow } from "../shim/core";

export interface FakeBridgeOptions {
  /** Keys for each action. Defaults to the kit's DEFAULT_KEYMAP. */
  readonly keymap?: Keymap;
  /** The device the game sees. Defaults to a TV-tier stand-in. */
  readonly device?: DeviceInfo;
}

/** The key that toggles pause and resume. */
export const PAUSE_KEY = "F9";

/** How long Back must be held before SlimTV exits regardless of the game (CONTRACT.md). */
export const BACK_HOLD_MS = 1000;

const FAKE_MARK = Symbol.for("slimtv-game-bridge.fake");
const PREFIX = `[SlimTV fake bridge ${RELEASE_NAME}]`;
const DEFAULT_DEVICE: DeviceInfo = { name: "Fake bridge on a computer", tier: "tv" };

export interface FakeBridge {
  /** Removes the fake bridge and window.SlimTV from the page. Mainly for tests. */
  uninstall(): void;
}

/**
 * Installs the fake bridge. Returns null, doing nothing, if there is no window or a bridge (fake
 * or real, or anything else named window.SlimTV) is already in the page; the check is shared by
 * every copy of this code in the page.
 */
export function installFakeBridge(options: FakeBridgeOptions = {}): FakeBridge | null {
  if (typeof window === "undefined") return null;
  const win = window as ShimWindow & { [FAKE_MARK]?: true };
  if (win[FAKE_MARK] || "SlimTV" in win) return null;
  win[FAKE_MARK] = true;
  let stopGamepads = (): void => {};

  let deliverToShim: (data: unknown) => void = () => {};
  let readySeen = false;
  let paused = false;

  const sendInput = (detail: InputDetail): void => {
    if (paused) return;
    if (detail.action === "back" && !trackBack(detail)) return;
    deliverToShim(JSON.stringify({ type: "input", ...detail }));
  };

  // The escape hatches. Returns false when the input should not reach the game.
  const backHeld = new Set<string>();
  const backBlocked = new Set<string>();
  let backTimer: ReturnType<typeof setTimeout> | undefined;
  const trackBack = (detail: InputDetail): boolean => {
    const who = `${detail.source}|${detail.player}`;
    if (detail.state === "up") {
      backHeld.delete(who);
      if (backHeld.size === 0 && backTimer !== undefined) {
        clearTimeout(backTimer);
        backTimer = undefined;
      }
      return !backBlocked.delete(who);
    }
    if (detail.repeat) return !backBlocked.has(who);
    if (!readySeen) {
      backBlocked.add(who);
      toast("Back before ready(): SlimTV would exit to the home screen now.");
      return false;
    }
    backHeld.add(who);
    backTimer ??= setTimeout(() => {
      backTimer = undefined;
      toast("Back held for 1 second: SlimTV would exit to the home screen now.");
    }, BACK_HOLD_MS);
    return true;
  };

  const handleFromShim = (json: string): void => {
    const message = JSON.parse(json) as { type: string; level?: LogLevel; message?: string };
    switch (message.type) {
      case "ready":
        readySeen = true;
        toast("ready(): SlimTV would hide its loading screen.");
        return;
      case "exit":
        toast("exit(): SlimTV would return to the home screen.");
        return;
      case "log": {
        const level = message.level ?? "info";
        console[level]("[SlimTV log]", message.message);
        return;
      }
    }
  };

  // Keyboard, as player 1. Mapped keys are caught before the page sees them, as on the TV.
  // Keys and controllers can hold the same button (keys for controller-only buttons count as the
  // first controller), so their input is merged before it is sent.
  const from = mergeInputs(sendInput);
  let claimed = false;
  const keyboard = createKeyboard(options.keymap ?? DEFAULT_KEYMAP, from("keyboard"), (event) => {
    claimed = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  });
  // Mapped keys whose press the page saw (a shortcut with Ctrl, Alt or Cmd, or typing in a text
  // box). Their release goes to the page too, whatever order the keys are let go in.
  const leftToPage = new Set<string>();
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === PAUSE_KEY) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) togglePause();
      return;
    }
    claimed = false;
    keyboard.keydown(event);
    if (!claimed && keyboard.isMapped(event.code)) leftToPage.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === PAUSE_KEY) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    keyboard.keyup(event);
    if (!keyboard.isMapped(event.code) || leftToPage.delete(event.code)) return;
    // Any other mapped key's release stays hidden, even one the keyboard wasn't tracking (held
    // since before a pause or blur), as no key event ever reaches a game page on the TV.
    if (!isEditable(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const reader = createGamepadReader(from("gamepads"), (text) => console.warn(PREFIX, text));

  const togglePause = (): void => {
    if (!paused) {
      // Like the TV losing focus: nothing arrives until resume, and held buttons are let go here
      // without the game hearing it (the shim forgets its own on pause).
      paused = true;
      keyboard.releaseAll();
      reader.releaseHeld();
      backHeld.clear();
      backBlocked.clear();
      if (backTimer !== undefined) clearTimeout(backTimer);
      backTimer = undefined;
      deliverToShim(JSON.stringify({ type: "pause" }));
      toast(`Paused, as if Home was pressed. ${PAUSE_KEY} resumes.`);
    } else {
      // Anything pressed while paused never reached the game. Let go of it while still paused, so
      // the game hears nothing now and a button still held arrives as a fresh press.
      keyboard.releaseAll();
      reader.releaseHeld();
      paused = false;
      deliverToShim(JSON.stringify({ type: "resume" }));
      toast("Resumed.");
    }
  };

  const api = createShim(
    win,
    {
      send: handleFromShim,
      listen(onMessage) {
        deliverToShim = onMessage;
        // Capture on window, so the fake bridge sees keys before any listener the page adds.
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("blur", keyboard.releaseAll);
        stopGamepads = watchGamepads(reader, (text, error) => console.warn(PREFIX, text, error));
      },
    },
    options.device ?? DEFAULT_DEVICE,
  );
  if (!api) {
    delete win[FAKE_MARK];
    return null;
  }
  console.info(
    PREFIX,
    `installed. Keys act as the remote and the first controller; ${PAUSE_KEY} pauses and resumes.`,
  );
  let uninstalled = false;
  return {
    uninstall() {
      if (uninstalled) return;
      uninstalled = true;
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", keyboard.releaseAll);
      stopGamepads();
      if (backTimer !== undefined) clearTimeout(backTimer);
      deliverToShim = () => {};
      delete (win as { SlimTV?: unknown }).SlimTV;
      delete win[FAKE_MARK];
    },
  };
}

let toastBox: HTMLElement | undefined;

/** Shows a short note at the bottom of the page. */
function toast(text: string): void {
  console.info(PREFIX, text);
  if (typeof document === "undefined") return;
  const parent = document.body ?? document.documentElement;
  if (!parent) return;
  if (!toastBox || !toastBox.isConnected) {
    toastBox = document.createElement("div");
    toastBox.setAttribute("data-slimtv-fake-bridge", "");
    toastBox.setAttribute("role", "status");
    Object.assign(toastBox.style, {
      position: "fixed",
      left: "50%",
      bottom: "24px",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      alignItems: "center",
      pointerEvents: "none",
      font: "16px/1.4 system-ui, sans-serif",
    });
    parent.append(toastBox);
  }
  const note = document.createElement("div");
  note.textContent = text;
  Object.assign(note.style, {
    background: "rgba(20, 20, 28, 0.92)",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
  });
  toastBox.append(note);
  setTimeout(() => note.remove(), 3000);
}
