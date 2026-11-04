/** Every action, in contract order. */
export declare const ACTIONS: readonly ["up", "down", "left", "right", "confirm", "back", "menu", "action1", "action2", "l1", "r1", "l2", "r2", "l3", "r3"];
export type Action = (typeof ACTIONS)[number];
export type InputState = "down" | "up";
export declare const INPUT_SOURCES: readonly ["remote", "gamepad"];
export type InputSource = (typeof INPUT_SOURCES)[number];
/** The highest player number. Input for a higher one is a bad message. */
export declare const MAX_PLAYERS = 16;
interface InputDetailBase {
    readonly action: Action;
    readonly source: InputSource;
    /** Whole number from 1 to MAX_PLAYERS. The remote and the first controller are both player 1. */
    readonly player: number;
}
/**
 * The `detail` of a `slimtv:input` event. `repeat` is true only for an auto-repeat of a held
 * button, which is always a "down"; an "up" never repeats.
 */
export type InputDetail = (InputDetailBase & {
    readonly state: "down";
    readonly repeat: boolean;
}) | (InputDetailBase & {
    readonly state: "up";
    readonly repeat: false;
});
/** Left stick thresholds: a direction goes down past PRESS and up below RELEASE. */
export declare const STICK_PRESS = 0.5;
export declare const STICK_RELEASE = 0.35;
/** Analog trigger thresholds: l2 or r2 goes down past PRESS and up below RELEASE. */
export declare const TRIGGER_PRESS = 0.5;
export declare const TRIGGER_RELEASE = 0.35;
export declare const STICKS: readonly ["left", "right"];
export type StickName = (typeof STICKS)[number];
/**
 * A stick closer to the centre than this (as a distance, 1 being the edge) reads as 0, 0, so a
 * resting stick never drifts. Past it the reading starts again from 0, so it grows smoothly.
 */
export declare const STICK_DEAD_ZONE = 0.15;
/**
 * Where a stick is pushed. Each of x and y is from -1 to 1, with right and down positive, rounded
 * to two decimal places. A stick at rest, or inside the dead zone, is 0, 0.
 */
export interface StickPosition {
    readonly x: number;
    readonly y: number;
}
/** A stick's position for one player, as SlimTV reports it. */
export interface StickDetail extends StickPosition {
    readonly stick: StickName;
    /** Whole number from 1 to MAX_PLAYERS. */
    readonly player: number;
}
export declare const LOG_LEVELS: readonly ["debug", "info", "warn", "error"];
export type LogLevel = (typeof LOG_LEVELS)[number];
/** log() messages are cut to this many characters before they are sent. */
export declare const LOG_MESSAGE_MAX = 2000;
/** How long one keepAwake() keeps the screen on, counted from the latest one SlimTV received. */
export declare const AWAKE_LEASE_MS: number;
/** How often a game renews keepAwake() while it wants the screen kept on: well inside the lease. */
export declare const AWAKE_RENEW_MS: number;
/** The shim sends keepAwake() to SlimTV at most this often; calls in between change nothing. */
export declare const AWAKE_SEND_GAP_MS = 30000;
export interface DeviceInfo {
    /** For example "Onn 4K Pro Gen 2". */
    readonly name: string;
    /** "tv" today. Games pick a quality preset from it. New tiers may be added later. */
    readonly tier: string;
}
export interface SlimTVInput {
    /**
     * True while the action is held. Leaving out `player` means any player. An unknown action or
     * an invalid player number gives false.
     */
    isDown(action: Action, player?: number): boolean;
    /**
     * Where a stick is pushed. Leaving out `player` means whichever player pushes it furthest. A
     * stick nobody is pushing, an unknown stick or an invalid player number gives 0, 0.
     */
    stick(stick: StickName, player?: number): StickPosition;
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
    /**
     * Keeps the screen on, with no screensaver, for AWAKE_LEASE_MS from now. Call it again every
     * AWAKE_RENEW_MS while the screen should stay on; stop calling it and the lease runs out. Calls
     * closer together than AWAKE_SEND_GAP_MS are not sent again. Missing from shims before Wakeful
     * Owl, so plain JavaScript checks for it first.
     */
    keepAwake(): void;
    readonly input: SlimTVInput;
}
export declare const INPUT_EVENT = "slimtv:input";
export declare const PAUSE_EVENT = "slimtv:pause";
export declare const RESUME_EVENT = "slimtv:resume";
export interface SlimTVEventMap {
    "slimtv:input": CustomEvent<InputDetail>;
    "slimtv:pause": CustomEvent<null>;
    "slimtv:resume": CustomEvent<null>;
}
/** Incoming native messages longer than this many characters are ignored. */
export declare const MAX_MESSAGE_LENGTH = 4096;
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
export interface AwakeMessage {
    readonly type: "awake";
}
/** Messages the shim sends to native. "hello" is always first. */
export type ShimToNativeMessage = HelloMessage | ReadyMessage | ExitMessage | LogMessage | AwakeMessage;
export type InputMessage = InputDetail & {
    readonly type: "input";
};
export type StickMessage = StickDetail & {
    readonly type: "stick";
};
export interface PauseMessage {
    readonly type: "pause";
}
export interface ResumeMessage {
    readonly type: "resume";
}
/** Messages native sends to the shim, through the reply proxy it got with "hello". */
export type NativeToShimMessage = InputMessage | StickMessage | PauseMessage | ResumeMessage;
declare global {
    interface Window {
        /** Present only inside SlimTV (or under the fake bridge). */
        SlimTV?: SlimTVApi;
    }
    interface WindowEventMap extends SlimTVEventMap {
    }
}
export {};
