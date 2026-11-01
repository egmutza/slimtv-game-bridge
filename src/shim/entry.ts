// Entry point for dist/slimtv-shim.js, the script SlimTV injects at document start.

import { createShim } from "./core";
import { nativeTransport, readDevice } from "./native";

try {
  createShim(window, nativeTransport(window), readDevice(window));
} catch (error) {
  // The shim must never break the page it is injected into.
  console.error("[SlimTV] the shim failed to start", error);
}
