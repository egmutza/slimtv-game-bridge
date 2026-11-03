import { type Action, type InputDetail, type StickDetail, type StickPosition } from "./contract";
/** The parts of a browser Gamepad the reader uses. */
export interface GamepadLike {
    readonly index: number;
    readonly mapping: string;
    readonly connected?: boolean;
    /** `value` is from 0 to 1; the reader uses it for the triggers when it is a number. */
    readonly buttons: readonly {
        readonly pressed: boolean;
        readonly value?: number;
    }[];
    readonly axes: readonly number[];
}
/** Standard-mapping button numbers and the action each one sends. */
export declare const GAMEPAD_BUTTONS: readonly (readonly [number, Action])[];
/**
 * Standard-mapping trigger buttons: LT / L2 / ZL and RT / R2 / ZR. They go down at TRIGGER_PRESS
 * and up below TRIGGER_RELEASE, read from the button's value, or from whether it is pressed when
 * the browser gives no value.
 */
export declare const GAMEPAD_TRIGGERS: readonly (readonly [number, Action])[];
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
export declare function createGamepadReader(emit: (detail: InputDetail) => void, warn: (message: string) => void, emitStick?: (detail: StickDetail) => void): GamepadReader;
/**
 * Turns a stick's raw reading (each axis -1 to 1, right and down positive) into what a game sees:
 * inside STICK_DEAD_ZONE it is 0, 0; past it the distance starts again from 0 and reaches 1 at the
 * edge, never beyond; each axis is rounded to two decimal places. A reading that isn't a number
 * counts as 0.
 */
export declare function shapeStick(rawX: number, rawY: number): StickPosition;
