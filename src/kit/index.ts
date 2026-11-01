// The game kit: what a game imports to work inside SlimTV. Importing it does nothing on its own:
// no listeners, no globals. Every call looks up window.SlimTV when it runs, and outside SlimTV
// every call is a safe no-op, so desktop and phone play are untouched.

import type { DeviceInfo, LogLevel } from "../contract";
import { slimtv } from "./slimtv";

export {
  ACTIONS,
  INPUT_EVENT,
  INPUT_SOURCES,
  LOG_LEVELS,
  LOG_MESSAGE_MAX,
  PAUSE_EVENT,
  RESUME_EVENT,
  STICK_PRESS,
  STICK_RELEASE,
} from "../contract";
export type {
  Action,
  DeviceInfo,
  InputDetail,
  InputSource,
  InputState,
  LogLevel,
  SlimTVApi,
  SlimTVEventMap,
  SlimTVInput,
} from "../contract";
export { RELEASE_NAME, RELEASE_TAG } from "../release";
export { GAMEPAD_BUTTONS } from "../gamepad";
export { DEFAULT_KEYMAP, type Keymap } from "./keymap";
export { createInput, type GameInput, type InputHandler, type InputOptions } from "./input";

/**
 * True in TV mode: SlimTV injected window.SlimTV, or the address has ?platform=slimtv (CONTRACT.md
 * "Detection"). The address alone means TV mode without the bridge, for trying TV layouts on a
 * computer.
 */
export function isSlimTV(): boolean {
  if (typeof window === "undefined") return false;
  if (slimtv()) return true;
  try {
    return new URLSearchParams(window.location.search).get("platform") === "slimtv";
  } catch {
    return false;
  }
}

/** The bridge's release name, for example "Steady Heron", or null outside SlimTV. */
export function bridgeRelease(): string | null {
  return slimtv()?.bridge ?? null;
}

/** The TV's device info, or null outside SlimTV. Games pick a quality preset from `tier`. */
export function device(): DeviceInfo | null {
  return slimtv()?.device ?? null;
}

/** The game is loaded and interactive: SlimTV hides its loading screen. */
export function ready(): void {
  slimtv()?.ready();
}

/** Returns to SlimTV's home screen. */
export function exit(): void {
  slimtv()?.exit();
}

/** Writes to the TV's log (logcat). Outside SlimTV it does nothing. */
export function log(level: LogLevel, message: string): void {
  slimtv()?.log(level, message);
}

/**
 * Calls `handler` when SlimTV loses the screen (Home, screensaver, input switch). The game pauses
 * its loop and audio. Returns a function that stops listening.
 */
export function onPause(handler: () => void): () => void {
  return on("slimtv:pause", handler);
}

/**
 * Calls `handler` when SlimTV has the screen again. The game stays on its pause menu; it never
 * resumes play on its own. Returns a function that stops listening.
 */
export function onResume(handler: () => void): () => void {
  return on("slimtv:resume", handler);
}

function on(type: "slimtv:pause" | "slimtv:resume", handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (): void => handler();
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}
