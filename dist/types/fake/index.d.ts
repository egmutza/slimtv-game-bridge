import type { DeviceInfo } from "../contract";
import { type Keymap } from "../kit/keymap";
export interface FakeBridgeOptions {
    /** Keys for each action. Defaults to the kit's DEFAULT_KEYMAP. */
    readonly keymap?: Keymap;
    /** The device the game sees. Defaults to a TV-tier stand-in. */
    readonly device?: DeviceInfo;
}
/** The key that toggles pause and resume. */
export declare const PAUSE_KEY = "F9";
/** How long Back must be held before SlimTV exits regardless of the game (CONTRACT.md). */
export declare const BACK_HOLD_MS = 1000;
export interface FakeBridge {
    /** Removes the fake bridge and window.SlimTV from the page. Mainly for tests. */
    uninstall(): void;
}
/**
 * Installs the fake bridge. Returns null, doing nothing, if there is no window or a bridge (fake
 * or real, or anything else named window.SlimTV) is already in the page; the check is shared by
 * every copy of this code in the page.
 */
export declare function installFakeBridge(options?: FakeBridgeOptions): FakeBridge | null;
