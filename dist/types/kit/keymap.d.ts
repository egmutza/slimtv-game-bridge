import type { Action } from "../contract";
/** Keys for each action. An action left out has no keys. */
export type Keymap = Readonly<Partial<Record<Action, readonly string[]>>>;
export declare const DEFAULT_KEYMAP: Keymap;
