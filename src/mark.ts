// Marks a window.SlimTV object as one the shim created. Symbol.for is shared across every script
// in the page, so separate copies of the shim, and the kit, all recognize it.

export const SHIM_MARK = Symbol.for("slimtv-game-bridge.shim");

/** True if `value` is a window.SlimTV the shim created. */
export function isShimObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && SHIM_MARK in value;
}
