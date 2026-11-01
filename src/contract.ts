// Types and constants for the SlimTV Game Bridge contract. CONTRACT.md is the source of truth;
// this file follows it, and any difference is a bug here.
//
// Importing this file declares window.SlimTV and the slimtv:* window events for TypeScript, so
// `addEventListener("slimtv:input", e => e.detail.action)` is typed in a game with no casts.

// ---------------------------------------------------------------------------------------------
// Actions and input

/** Every action, in contract order. */
export const ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "confirm",
  "back",
  "menu",
  "action1",
  "action2",
] as const;

export type Action = (typeof ACTIONS)[number];

export type InputState = "down" | "up";

export const INPUT_SOURCES = ["remote", "gamepad"] as const;

export type InputSource = (typeof INPUT_SOURCES)[number];

interface InputDetailBase {
  readonly action: Action;
  readonly source: InputSource;
  /** 1-based whole number. The remote and the first controller are both player 1. */
  readonly player: number;
}

/**
 * The `detail` of a `slimtv:input` event. `repeat` is true only for an auto-repeat of a held
 * button, which is always a "down"; an "up" never repeats.
 */
export type InputDetail =
  | (InputDetailBase & { readonly state: "down"; readonly repeat: boolean })
  | (InputDetailBase & { readonly state: "up"; readonly repeat: false });

/** Left stick thresholds: a direction goes down past PRESS and up below RELEASE. */
export const STICK_PRESS = 0.5;
export const STICK_RELEASE = 0.35;

// ---------------------------------------------------------------------------------------------
// Logging

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** log() messages are cut to this many characters before they are sent. */
export const LOG_MESSAGE_MAX = 2000;

// ---------------------------------------------------------------------------------------------
// Device

export interface DeviceInfo {
  /** For example "Onn 4K Pro Gen 2". */
  readonly name: string;
  /** "tv" today. Games pick a quality preset from it. New tiers may be added later. */
  readonly tier: string;
}

// ---------------------------------------------------------------------------------------------
// window.SlimTV

export interface SlimTVInput {
  /**
   * True while the action is held. Leaving out `player` means any player. An unknown action or
   * an invalid player number gives false.
   */
  isDown(action: Action, player?: number): boolean;
}

/** The object SlimTV injects as window.SlimTV. */
export interface SlimTVApi {
  /** Release name of the injected shim, for example "Steady Heron". */
  readonly bridge: string;
  readonly device: DeviceInfo;
  /** The game is loaded and interactive. Sent once per page load; later calls do nothing. */
  ready(): void;
  /** Return to the SlimTV home screen. */
  exit(): void;
  /**
   * Forwarded to logcat. The message is cut to LOG_MESSAGE_MAX characters. At run time an
   * unknown level is sent as "info" and a non-string message is converted to a string.
   */
  log(level: LogLevel, message: string): void;
  readonly input: SlimTVInput;
}

// ---------------------------------------------------------------------------------------------
// Window events

export const INPUT_EVENT = "slimtv:input";
export const PAUSE_EVENT = "slimtv:pause";
export const RESUME_EVENT = "slimtv:resume";

export interface SlimTVEventMap {
  "slimtv:input": CustomEvent<InputDetail>;
  "slimtv:pause": CustomEvent<null>;
  "slimtv:resume": CustomEvent<null>;
}

// ---------------------------------------------------------------------------------------------
// Wire protocol. Every message is sent as a JSON string with a "type" field.

/** Incoming native messages longer than this many characters are ignored. */
export const MAX_MESSAGE_LENGTH = 4096;

/** Prepended by SlimTV to the shim source as window.__SLIMTV_CONFIG__. */
export interface SlimTVConfig {
  readonly device: DeviceInfo;
}

export interface HelloMessage {
  readonly type: "hello";
  readonly bridge: string;
}

export interface ReadyMessage {
  readonly type: "ready";
}

export interface ExitMessage {
  readonly type: "exit";
}

export interface LogMessage {
  readonly type: "log";
  readonly level: LogLevel;
  readonly message: string;
}

/** Messages the shim sends to native. "hello" is always first. */
export type ShimToNativeMessage = HelloMessage | ReadyMessage | ExitMessage | LogMessage;

export type InputMessage = InputDetail & { readonly type: "input" };

export interface PauseMessage {
  readonly type: "pause";
}

export interface ResumeMessage {
  readonly type: "resume";
}

/** Messages native sends to the shim, through the reply proxy it got with "hello". */
export type NativeToShimMessage = InputMessage | PauseMessage | ResumeMessage;

// ---------------------------------------------------------------------------------------------
// Global declarations for games

declare global {
  interface Window {
    /** Present only inside SlimTV (or under the fake bridge). */
    SlimTV?: SlimTVApi;
  }

  // Declaration merging: makes window.addEventListener("slimtv:input", ...) typed.
  interface WindowEventMap extends SlimTVEventMap {}
}
