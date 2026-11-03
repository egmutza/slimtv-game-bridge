import { type StickDetail, type StickName, type StickPosition } from "./contract";
/** A stick at rest. */
export declare const CENTRE: StickPosition;
export interface StickPositions {
    /** Records one position and says whether it changed anything. */
    set(detail: StickDetail): boolean;
    /**
     * Where the stick is, for `player` if given, otherwise for whoever pushes it furthest (the lower
     * player number if two push it equally far).
     */
    get(stick: StickName, player?: number): StickPosition;
    /** Puts every stick back to the centre without reporting anything. */
    clear(): void;
}
export declare function createSticks(): StickPositions;
