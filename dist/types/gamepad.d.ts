import { type Action, type InputDetail } from "./contract";
/** The parts of a browser Gamepad the reader uses. */
export interface GamepadLike {
    readonly index: number;
    readonly mapping: string;
    readonly connected?: boolean;
    readonly buttons: readonly {
        readonly pressed: boolean;
    }[];
    readonly axes: readonly number[];
}
/** Standard-mapping button numbers and the action each one sends. */
export declare const GAMEPAD_BUTTONS: readonly (readonly [number, Action])[];
export interface GamepadReader {
    /** Reads the current controllers (navigator.getGamepads()) and reports what changed. */
    read(pads: readonly (GamepadLike | null)[]): void;
    /** Reports an "up" for everything held, then forgets every controller. */
    releaseAll(): void;
}
/**
 * Creates a reader that calls `emit` for each change. Rules:
 * - A direction held by the D-pad and the stick together is one "down" and, when the last one
 *   lets go, one "up".
 * - The stick presses a direction at STICK_PRESS along its axis and releases below STICK_RELEASE.
 * - Each new controller takes the lowest free player number, starting at 1.
 * - A controller that goes away first reports an "up" for everything it held.
 * - Controllers without the browser's standard mapping are skipped, with one warning.
 * - Controllers never send repeats; games time their own from isDown.
 */
export declare function createGamepadReader(emit: (detail: InputDetail) => void, warn: (message: string) => void): GamepadReader;
