// Finds window.SlimTV each time it's needed, so import order never matters, and checks once that
// the shim's release matches the kit's (CONTRACT.md "Versioning").

import type { SlimTVApi } from "../contract";
import { isShimObject } from "../mark";
import { RELEASE_NAME } from "../release";

const PREFIX = `[SlimTV kit ${RELEASE_NAME}]`;

let checked = false;
let warnedForeign = false;

/**
 * window.SlimTV, or undefined outside SlimTV (including where there is no window at all). A
 * window.SlimTV the shim didn't create (CONTRACT.md "Name clash", or another script's global) is
 * ignored with one warning, so the kit stays a safe no-op rather than calling into it.
 */
export function slimtv(): SlimTVApi | undefined {
  if (typeof window === "undefined" || !("SlimTV" in window)) return undefined;
  const api = window.SlimTV;
  if (!isShimObject(api)) {
    if (!warnedForeign) {
      warnedForeign = true;
      console.warn(PREFIX, "window.SlimTV was not created by SlimTV's shim, so the kit ignores it.");
    }
    return undefined;
  }
  if (!checked) {
    checked = true;
    const shim = api as SlimTVApi;
    if (shim.bridge !== RELEASE_NAME) {
      const text =
        `${PREFIX} SlimTV's bridge is ${JSON.stringify(shim.bridge)}, ` +
        `but this game was built with the kit from ${RELEASE_NAME}. Carrying on.`;
      console.warn(text);
      try {
        shim.log("warn", text);
      } catch {
        // Logging is best effort.
      }
    }
  }
  return api as SlimTVApi;
}

/** For tests: lets the one-time checks run again. */
export function resetChecks(): void {
  checked = false;
  warnedForeign = false;
}
