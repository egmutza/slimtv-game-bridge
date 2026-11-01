import { type Action, type InputDetail } from "../contract";
import { type Keymap } from "./keymap";
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
/**
 * Creates the input layer. It adds listeners only when called, so a game that wants desktop and
 * phone play untouched can call it only when isSlimTV() is true. Keyboard input on a computer is
 * reported as source "remote", player 1, since the keyboard stands in for the remote.
 */
export declare function createInput(options?: InputOptions): GameInput;
