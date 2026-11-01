// Reads controllers once per animation frame while any is connected and the window has focus.
// Losing focus releases everything they hold (they keep their player numbers); regaining it
// reads them again. Shared by the kit's desktop input and the fake bridge.

import type { GamepadLike, GamepadReader } from "./gamepad";

/**
 * Starts reading controllers into `reader`, if this browser can. Returns a function that stops
 * reading and removes every listener added. `warn` is called once if controllers can't be read
 * (for example a page whose Permissions-Policy blocks them), after which reading stops for good.
 */
export function watchGamepads(reader: GamepadReader, warn: (text: string, error: unknown) => void): () => void {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.getGamepads) {
    return () => {};
  }
  let frame = 0;
  let stopped = false;
  let blocked = false;
  let away = false;

  const tick = (): void => {
    frame = 0;
    if (stopped || blocked || away) return;
    let pads: (GamepadLike | null)[];
    try {
      pads = [...navigator.getGamepads()];
    } catch (error) {
      blocked = true;
      warn("controllers can't be read here, so they are ignored.", error);
      return;
    }
    reader.read(pads);
    if (!stopped && pads.some((pad) => pad?.connected)) frame = requestAnimationFrame(tick);
  };
  const start = (): void => {
    if (!frame && !stopped && !blocked && !away) frame = requestAnimationFrame(tick);
  };
  const cancel = (): void => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  const onBlur = (): void => {
    away = true;
    cancel();
    reader.releaseHeld();
  };
  const onFocus = (): void => {
    away = false;
    start();
  };

  window.addEventListener("gamepadconnected", start);
  window.addEventListener("gamepaddisconnected", start);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  start();

  return () => {
    stopped = true;
    cancel();
    window.removeEventListener("gamepadconnected", start);
    window.removeEventListener("gamepaddisconnected", start);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
  };
}
