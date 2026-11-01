import type { SlimTVApi } from "../contract";
/**
 * window.SlimTV, or undefined outside SlimTV (including where there is no window at all). A
 * window.SlimTV the shim didn't create (CONTRACT.md "Name clash", or another script's global) is
 * ignored with one warning, so the kit stays a safe no-op rather than calling into it.
 */
export declare function slimtv(): SlimTVApi | undefined;
/** For tests: lets the one-time checks run again. */
export declare function resetChecks(): void;
