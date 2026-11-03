import { type Action, type InputDetail } from "./contract";
import type { Keymap } from "./kit/keymap";
/**
 * The actions the TV remote has (CONTRACT.md "Input mapping"). The keyboard sends these as the
 * remote; the rest (menu, action1, action2, and the shoulder, trigger and stick buttons) exist only
 * on controllers, so the keyboard sends them as the first controller. A game tested on a computer
 * then sees the same sources as on the TV.
 */
export declare const REMOTE_ACTIONS: ReadonlySet<Action>;
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
export declare function createKeyboard(keymap: Keymap, emit: (detail: InputDetail) => void, claim: (event: KeyboardEvent) => void): KeyboardReader;
/** True when a key event comes from a text box, including one inside a web component. */
export declare function isEditable(event: Event): boolean;
