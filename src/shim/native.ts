// The real transport: the SlimTVNative object that SlimTV's addWebMessageListener puts in the
// page, and the window.__SLIMTV_CONFIG__ that SlimTV prepends to the shim. See "Wire protocol"
// in CONTRACT.md.

import type { DeviceInfo, SlimTVConfig } from "../contract";
import type { ShimTransport, ShimWindow } from "./core";

/** The parts of WebView's injected listener object the shim uses. */
interface NativeObject {
  postMessage(message: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

declare global {
  interface Window {
    SlimTVNative?: NativeObject;
    __SLIMTV_CONFIG__?: SlimTVConfig;
  }
}

/** Device info used when SlimTV's config is missing or malformed. */
const UNKNOWN_DEVICE: DeviceInfo = { name: "unknown", tier: "tv" };

/** The native transport, or null when SlimTVNative isn't in the page. */
export function nativeTransport(win: ShimWindow): ShimTransport | null {
  const native = win.SlimTVNative;
  if (
    typeof native !== "object" ||
    native === null ||
    typeof native.postMessage !== "function" ||
    typeof native.addEventListener !== "function"
  ) {
    return null;
  }
  return {
    send(json) {
      native.postMessage(json);
    },
    listen(onMessage) {
      native.addEventListener("message", (event) => onMessage(event?.data));
    },
  };
}

/** Reads the device from window.__SLIMTV_CONFIG__, keeping only well-formed fields. */
export function readDevice(win: ShimWindow): DeviceInfo {
  try {
    const device: unknown = win.__SLIMTV_CONFIG__?.device;
    if (typeof device !== "object" || device === null) return UNKNOWN_DEVICE;
    const { name, tier } = device as Record<string, unknown>;
    return {
      name: typeof name === "string" ? name : UNKNOWN_DEVICE.name,
      tier: typeof tier === "string" ? tier : UNKNOWN_DEVICE.tier,
    };
  } catch {
    return UNKNOWN_DEVICE;
  }
}
