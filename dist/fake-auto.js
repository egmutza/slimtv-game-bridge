// slimtv-game-bridge fake bridge auto-install entry, release Wakeful Owl (tag wakeful-owl).
// For trying a game on a computer; inside SlimTV it does nothing. Built by build.mjs; do not edit.
import {
  installFakeBridge
} from "./chunk-MNXYGRTT.js";
import "./chunk-QP7FNT37.js";

// src/fake/auto.ts
if (typeof window !== "undefined" && !("SlimTVNative" in window) && !("SlimTV" in window)) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("platform") === "slimtv" && params.get("fakebridge") === "1") installFakeBridge();
}
