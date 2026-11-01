import type { GamepadReader } from "./gamepad";
/**
 * Starts reading controllers into `reader`, if this browser can. Returns a function that stops
 * reading and removes every listener added. `warn` is called once if controllers can't be read
 * (for example a page whose Permissions-Policy blocks them), after which reading stops for good.
 */
export declare function watchGamepads(reader: GamepadReader, warn: (text: string, error: unknown) => void): () => void;
