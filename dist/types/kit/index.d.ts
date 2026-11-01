import type { DeviceInfo, LogLevel } from "../contract";
export { ACTIONS, INPUT_EVENT, INPUT_SOURCES, LOG_LEVELS, LOG_MESSAGE_MAX, PAUSE_EVENT, RESUME_EVENT, STICK_PRESS, STICK_RELEASE, } from "../contract";
export type { Action, DeviceInfo, InputDetail, InputSource, InputState, LogLevel, SlimTVApi, SlimTVEventMap, SlimTVInput, } from "../contract";
export { RELEASE_NAME, RELEASE_TAG } from "../release";
export { GAMEPAD_BUTTONS } from "../gamepad";
export { DEFAULT_KEYMAP, type Keymap } from "./keymap";
export { createInput, type GameInput, type InputHandler, type InputOptions } from "./input";
/**
 * True in TV mode: SlimTV injected window.SlimTV, or the address has ?platform=slimtv (CONTRACT.md
 * "Detection"). The address alone means TV mode without the bridge, for trying TV layouts on a
 * computer.
 */
export declare function isSlimTV(): boolean;
/** The bridge's release name, for example "Steady Heron", or null outside SlimTV. */
export declare function bridgeRelease(): string | null;
/** The TV's device info, or null outside SlimTV. Games pick a quality preset from `tier`. */
export declare function device(): DeviceInfo | null;
/** The game is loaded and interactive: SlimTV hides its loading screen. */
export declare function ready(): void;
/** Returns to SlimTV's home screen. */
export declare function exit(): void;
/** Writes to the TV's log (logcat). Outside SlimTV it does nothing. */
export declare function log(level: LogLevel, message: string): void;
/**
 * Calls `handler` when SlimTV loses the screen (Home, screensaver, input switch). The game pauses
 * its loop and audio. Returns a function that stops listening.
 */
export declare function onPause(handler: () => void): () => void;
/**
 * Calls `handler` when SlimTV has the screen again. The game stays on its pause menu; it never
 * resumes play on its own. Returns a function that stops listening.
 */
export declare function onResume(handler: () => void): () => void;
