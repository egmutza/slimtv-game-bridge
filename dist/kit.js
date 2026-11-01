// slimtv-game-bridge kit, release Steady Heron (tag steady-heron).
// Built from src/kit by build.mjs; do not edit.

// src/mark.ts
var SHIM_MARK = /* @__PURE__ */ Symbol.for("slimtv-game-bridge.shim");
function isShimObject(value) {
  return typeof value === "object" && value !== null && SHIM_MARK in value;
}

// src/release.ts
var RELEASE_NAME = "Steady Heron";
var RELEASE_TAG = "steady-heron";

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

// src/contract.ts
var ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "confirm",
  "back",
  "menu",
  "action1",
  "action2"
];
var INPUT_SOURCES = ["remote", "gamepad"];
var STICK_PRESS = 0.5;
var STICK_RELEASE = 0.35;
var LOG_LEVELS = ["debug", "info", "warn", "error"];
var LOG_MESSAGE_MAX = 2e3;
var INPUT_EVENT = "slimtv:input";
var PAUSE_EVENT = "slimtv:pause";
var RESUME_EVENT = "slimtv:resume";

// src/gamepad.ts
var GAMEPAD_BUTTONS = [
  [0, "confirm"],
  // A / Cross
  [1, "back"],
  // B / Circle
  [2, "action1"],
  // X / Square
  [3, "action2"],
  // Y / Triangle
  [9, "menu"],
  // Start / Options
  [12, "up"],
  // D-pad
  [13, "down"],
  [14, "left"],
  [15, "right"]
];
var STICK = [
  ["up", 1, -1],
  ["down", 1, 1],
  ["left", 0, -1],
  ["right", 0, 1]
];
function createGamepadReader(emit, warn) {
  const pads = /* @__PURE__ */ new Map();
  let warnedMapping = false;
  const send = (action, state, player) => emit({ action, state, repeat: false, source: "gamepad", player });
  const release = (index) => {
    const pad = pads.get(index);
    if (!pad) return;
    for (const action of ACTIONS) if (pad.held.has(action)) send(action, "up", pad.player);
    pads.delete(index);
  };
  const freePlayer = () => {
    const taken = new Set([...pads.values()].map((pad) => pad.player));
    let player = 1;
    while (taken.has(player)) player++;
    return player;
  };
  return {
    read(list) {
      const present = /* @__PURE__ */ new Map();
      for (const pad of list) {
        if (!pad || pad.connected === false) continue;
        if (pad.mapping !== "standard") {
          if (!warnedMapping) {
            warnedMapping = true;
            warn("A controller without the browser's standard mapping is connected; it is ignored.");
          }
          continue;
        }
        present.set(pad.index, pad);
      }
      for (const index of [...pads.keys()]) if (!present.has(index)) release(index);
      for (const [index, pad] of present) {
        let state = pads.get(index);
        if (!state) {
          state = { player: freePlayer(), stick: /* @__PURE__ */ new Set(), held: /* @__PURE__ */ new Set() };
          pads.set(index, state);
        }
        for (const [action, axis, sign] of STICK) {
          const value = (pad.axes[axis] ?? 0) * sign;
          if (state.stick.has(action)) {
            if (value < STICK_RELEASE) state.stick.delete(action);
          } else if (value >= STICK_PRESS) {
            state.stick.add(action);
          }
        }
        const now = new Set(state.stick);
        for (const [button, action] of GAMEPAD_BUTTONS) {
          if (pad.buttons[button]?.pressed) now.add(action);
        }
        for (const action of ACTIONS) {
          const was = state.held.has(action);
          const is = now.has(action);
          if (is && !was) {
            state.held.add(action);
            send(action, "down", state.player);
          } else if (was && !is) {
            state.held.delete(action);
            send(action, "up", state.player);
          }
        }
      }
    },
    releaseAll() {
      for (const index of [...pads.keys()]) release(index);
    }
  };
}

// src/kit/keymap.ts
var DEFAULT_KEYMAP = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  confirm: ["Enter", "NumpadEnter", "Space"],
  back: ["Escape", "Backspace"],
  menu: ["Tab"],
  action1: ["KeyZ"],
  action2: ["KeyX"]
};

// src/held.ts
function createHeld() {
  const held = /* @__PURE__ */ new Map();
  return {
    apply({ action, state, repeat, source, player }) {
      const key = `${action}|${source}|${player}`;
      const isHeld = held.has(key);
      if (state === "down") {
        if (isHeld !== repeat) return false;
        held.set(key, { action, player });
      } else {
        if (!isHeld) return false;
        held.delete(key);
      }
      return true;
    },
    isDown(action, player) {
      for (const entry of held.values()) {
        if (entry.action === action && (player === void 0 || entry.player === player)) {
          return true;
        }
      }
      return false;
    },
    clear() {
      held.clear();
    }
  };
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
  const actionForKey = /* @__PURE__ */ new Map();
  for (const action of ACTIONS) {
    for (const code of (options.keymap ?? DEFAULT_KEYMAP)[action] ?? []) {
      if (!actionForKey.has(code)) actionForKey.set(code, action);
    }
  }
  const preventDefault = options.preventDefault !== false;
  const keysDown = /* @__PURE__ */ new Map();
  const keyboard = (action, state, repeat = false) => deliver(
    state === "down" ? { action, state, repeat, source: "remote", player: 1 } : { action, state, repeat: false, source: "remote", player: 1 }
  );
  const releaseKeys = () => {
    for (const [action, codes] of keysDown) {
      if (codes.size === 0) continue;
      codes.clear();
      keyboard(action, "up");
    }
  };
  listen("keydown", (event) => {
    if (event.metaKey) {
      releaseKeys();
      return;
    }
    if (event.ctrlKey || event.altKey || isEditable(event)) return;
    const action = actionForKey.get(event.code);
    if (!action) return;
    if (preventDefault) event.preventDefault();
    const codes = keysDown.get(action) ?? /* @__PURE__ */ new Set();
    keysDown.set(action, codes);
    if (codes.has(event.code)) {
      if (event.repeat) keyboard(action, "down", true);
      return;
    }
    codes.add(event.code);
    if (codes.size === 1) keyboard(action, "down");
  });
  listen("keyup", (event) => {
    const action = actionForKey.get(event.code);
    const codes = action && keysDown.get(action);
    if (!action || !codes?.delete(event.code)) return;
    if (preventDefault) event.preventDefault();
    if (codes.size === 0) keyboard(action, "up");
  });
  listen("blur", releaseKeys);
  if (options.gamepads !== false && typeof navigator !== "undefined" && navigator.getGamepads) {
    const reader = createGamepadReader(deliver, (text) => console.warn(PREFIX2, text));
    let frame = 0;
    let blocked = false;
    let away = false;
    const tick = () => {
      frame = 0;
      if (disposed || blocked || away) return;
      let pads;
      try {
        pads = [...navigator.getGamepads()];
      } catch (error) {
        blocked = true;
        console.warn(PREFIX2, "controllers can't be read here, so they are ignored.", error);
        return;
      }
      reader.read(pads);
      if (!disposed && pads.some((pad) => pad?.connected)) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!frame && !disposed && !blocked && !away) frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    listen("gamepadconnected", start);
    listen("gamepaddisconnected", start);
    listen("blur", () => {
      away = true;
      stop();
      reader.releaseAll();
    });
    listen("focus", () => {
      away = false;
      start();
    });
    start();
    cleanups.push(stop);
  }
  return { mode: "desktop", ...base, isDown };
}
function isEditable(event) {
  if (typeof HTMLElement === "undefined") return false;
  const target = event.composedPath?.()[0] ?? event.target;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
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
