import type { Action, InputDetail } from "./contract";
export interface HeldButtons {
    /**
     * Records one input and says whether it is a change to pass on. A "down" for a button that is
     * already down, or an "up" or repeat for one that isn't, changes nothing and returns false.
     */
    apply(detail: InputDetail): boolean;
    /** True while the action is held, by `player` if given, otherwise by anyone. */
    isDown(action: Action, player?: number): boolean;
    /** Forgets every held button without reporting anything. */
    clear(): void;
}
export declare function createHeld(): HeldButtons;
