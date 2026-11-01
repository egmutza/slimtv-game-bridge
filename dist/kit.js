// slimtv-game-bridge kit, release Steady Heron (tag steady-heron).
// Built by build.mjs; do not edit.
import {
  ACTIONS,
  DEFAULT_KEYMAP,
  GAMEPAD_BUTTONS,
  INPUT_EVENT,
  INPUT_SOURCES,
  LOG_LEVELS,
  LOG_MESSAGE_MAX,
  MAX_PLAYERS,
  PAUSE_EVENT,
  RELEASE_NAME,
  RELEASE_TAG,
  RESUME_EVENT,
  STICK_PRESS,
  STICK_RELEASE,
  createGamepadReader,
  createHeld,
  createKeyboard,
  isShimObject,
  mergeInputs,
  watchGamepads
} from "./chunk-AHZ4LGRT.js";

// src/kit/slimtv.ts
var PREFIX = `[SlimTV kit ${RELEASE_NAME}]`;
var checked = false;
var warnedForeign = false;
function slimtv() {
  if (typeof window === "undefined" || !("SlimTV" in window)) return void 0;
  const api = window.SlimTV;
  if (!isShimObject(api)) {
    if (!warnedForeign) {
      warnedForeign = true;
      console.warn(PREFIX, "window.SlimTV was not created by SlimTV's shim, so the kit ignores it.");
    }
    return void 0;
  }
  if (!checked) {
    checked = true;
    const shim = api;
    if (shim.bridge !== RELEASE_NAME) {
      const text = `${PREFIX} SlimTV's bridge is ${JSON.stringify(shim.bridge)}, but this game was built with the kit from ${RELEASE_NAME}. Carrying on.`;
      console.warn(text);
      try {
        shim.log("warn", text);
      } catch {
      }
    }
  }
  return api;
}

// src/kit/input.ts
var PREFIX2 = `[SlimTV kit ${RELEASE_NAME}]`;
function createInput(options = {}) {
  const handlers = /* @__PURE__ */ new Set();
  const cleanups = [];
  let downs = /* @__PURE__ */ new Set();
  let lastFrame = /* @__PURE__ */ new Set();
  let disposed = false;
  const listen = (type, listener) => {
    window.addEventListener(type, listener);
    cleanups.push(() => window.removeEventListener(type, listener));
  };
  const held = createHeld();
  const deliver = (detail) => {
    if (disposed || !held.apply(detail)) return;
    if (detail.state === "down" && !detail.repeat) {
      downs.add(`${detail.action}|${detail.player}`);
      downs.add(detail.action);
    }
    const frozen = Object.freeze({ ...detail });
    for (const handler of [...handlers]) {
      if (disposed) return;
      try {
        handler(frozen);
      } catch (error) {
        console.error(PREFIX2, "an input handler threw", error);
        try {
          slimtv()?.log("error", `${PREFIX2} an input handler threw: ${String(error)}`);
        } catch {
        }
      }
    }
  };
  const base = {
    on(handler) {
      if (!disposed) handlers.add(handler);
      return () => void handlers.delete(handler);
    },
    off(handler) {
      handlers.delete(handler);
    },
    pressed(action, player) {
      return !disposed && lastFrame.has(player === void 0 ? action : `${action}|${player}`);
    },
    poll() {
      lastFrame = downs;
      downs = /* @__PURE__ */ new Set();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      handlers.clear();
      held.clear();
      downs.clear();
      lastFrame.clear();
    }
  };
  const isDown = (action, player) => !disposed && held.isDown(action, player);
  if (typeof window === "undefined") return { mode: "desktop", ...base, isDown };
  if (slimtv()) {
    const delivered = /* @__PURE__ */ new Map();
    listen("slimtv:input", (event) => {
      const detail = event.detail;
      const key = `${detail.action}|${detail.source}|${detail.player}`;
      if (detail.state === "down") delivered.set(key, detail);
      else delivered.delete(key);
      deliver(detail);
    });
    listen("slimtv:pause", () => {
      const released = [...delivered.values()];
      delivered.clear();
      for (const { action, source, player } of released) {
        deliver({ action, state: "up", repeat: false, source, player });
      }
    });
    return {
      mode: "slimtv",
      ...base,
      isDown: (action, player) => !disposed && (slimtv()?.input.isDown(action, player) ?? false)
    };
  }
  const preventDefault = options.preventDefault !== false;
  const from = mergeInputs(deliver);
  const keyboard = createKeyboard(options.keymap ?? DEFAULT_KEYMAP, from("keyboard"), (event) => {
    if (preventDefault) event.preventDefault();
  });
  listen("keydown", keyboard.keydown);
  listen("keyup", keyboard.keyup);
  listen("blur", keyboard.releaseAll);
  if (options.gamepads !== false) {
    const reader = createGamepadReader(from("gamepads"), (text) => console.warn(PREFIX2, text));
    cleanups.push(watchGamepads(reader, (text, error) => console.warn(PREFIX2, text, error)));
  }
  return { mode: "desktop", ...base, isDown };
}

// src/kit/index.ts
function isSlimTV() {
  if (typeof window === "undefined") return false;
  if (slimtv()) return true;
  try {
    return new URLSearchParams(window.location.search).get("platform") === "slimtv";
  } catch {
    return false;
  }
}
function bridgeRelease() {
  return slimtv()?.bridge ?? null;
}
function device() {
  return slimtv()?.device ?? null;
}
function ready() {
  slimtv()?.ready();
}
function exit() {
  slimtv()?.exit();
}
function log(level, message) {
  slimtv()?.log(level, message);
}
function onPause(handler) {
  return on("slimtv:pause", handler);
}
function onResume(handler) {
  return on("slimtv:resume", handler);
}
function on(type, handler) {
  if (typeof window === "undefined") return () => {
  };
  const listener = () => handler();
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}
export {
  ACTIONS,
  DEFAULT_KEYMAP,
  GAMEPAD_BUTTONS,
  INPUT_EVENT,
  INPUT_SOURCES,
  LOG_LEVELS,
  LOG_MESSAGE_MAX,
  MAX_PLAYERS,
  PAUSE_EVENT,
  RELEASE_NAME,
  RELEASE_TAG,
  RESUME_EVENT,
  STICK_PRESS,
  STICK_RELEASE,
  bridgeRelease,
  createInput,
  device,
  exit,
  isSlimTV,
  log,
  onPause,
  onResume,
  ready
};
