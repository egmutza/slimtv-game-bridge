// slimtv-game-bridge shared code, release Steady Heron (tag steady-heron).
// Built by build.mjs; do not edit.
// src/release.ts
var RELEASE_NAME = "Steady Heron";
var RELEASE_TAG = "steady-heron";

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
var MAX_PLAYERS = 16;
var STICK_PRESS = 0.5;
var STICK_RELEASE = 0.35;
var LOG_LEVELS = ["debug", "info", "warn", "error"];
var LOG_MESSAGE_MAX = 2e3;
var INPUT_EVENT = "slimtv:input";
var PAUSE_EVENT = "slimtv:pause";
var RESUME_EVENT = "slimtv:resume";
var MAX_MESSAGE_LENGTH = 4096;

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
  let warnedPlayers = false;
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
          const player = freePlayer();
          if (player > MAX_PLAYERS) {
            if (!warnedPlayers) {
              warnedPlayers = true;
              warn(`More than ${MAX_PLAYERS} controllers are connected; the extra ones are ignored.`);
            }
            continue;
          }
          state = { player, stick: /* @__PURE__ */ new Set(), held: /* @__PURE__ */ new Set() };
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
    releaseHeld() {
      for (const pad of pads.values()) {
        for (const action of ACTIONS) if (pad.held.has(action)) send(action, "up", pad.player);
        pad.held.clear();
        pad.stick.clear();
      }
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

// src/gamepadLoop.ts
function watchGamepads(reader, warn) {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.getGamepads) {
    return () => {
    };
  }
  let frame = 0;
  let stopped = false;
  let blocked = false;
  let away = false;
  const tick = () => {
    frame = 0;
    if (stopped || blocked || away) return;
    let pads;
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
  const start = () => {
    if (!frame && !stopped && !blocked && !away) frame = requestAnimationFrame(tick);
  };
  const cancel = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  const onBlur = () => {
    away = true;
    cancel();
    reader.releaseHeld();
  };
  const onFocus = () => {
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

// src/keyboard.ts
var REMOTE_ACTIONS = /* @__PURE__ */ new Set(["up", "down", "left", "right", "confirm", "back"]);
function createKeyboard(keymap, emit, claim) {
  const actionForKey = /* @__PURE__ */ new Map();
  for (const action of ACTIONS) {
    for (const code of keymap[action] ?? []) {
      if (!actionForKey.has(code)) actionForKey.set(code, action);
    }
  }
  const keysDown = /* @__PURE__ */ new Map();
  const send = (action, state, repeat = false) => {
    const source = REMOTE_ACTIONS.has(action) ? "remote" : "gamepad";
    emit(
      state === "down" ? { action, state, repeat, source, player: 1 } : { action, state, repeat: false, source, player: 1 }
    );
  };
  const releaseAll = () => {
    for (const [action, codes] of keysDown) {
      if (codes.size === 0) continue;
      codes.clear();
      send(action, "up");
    }
  };
  return {
    isMapped: (code) => actionForKey.has(code),
    keydown(event) {
      if (event.metaKey) {
        releaseAll();
        return;
      }
      if (event.ctrlKey || event.altKey || isEditable(event)) return;
      const action = actionForKey.get(event.code);
      if (!action) return;
      claim(event);
      const codes = keysDown.get(action) ?? /* @__PURE__ */ new Set();
      keysDown.set(action, codes);
      if (codes.has(event.code)) {
        if (event.repeat) send(action, "down", true);
        return;
      }
      codes.add(event.code);
      if (codes.size === 1) send(action, "down");
    },
    keyup(event) {
      const action = actionForKey.get(event.code);
      const codes = action && keysDown.get(action);
      if (!action || !codes?.delete(event.code)) return;
      claim(event);
      if (codes.size === 0) send(action, "up");
    },
    releaseAll
  };
}
function isEditable(event) {
  if (typeof HTMLElement === "undefined") return false;
  const target = event.composedPath?.()[0] ?? event.target;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

// src/merge.ts
function mergeInputs(emit) {
  const holders = /* @__PURE__ */ new Map();
  return (reader) => (detail) => {
    const key = `${detail.action}|${detail.source}|${detail.player}`;
    let held = holders.get(key);
    if (!held) {
      held = /* @__PURE__ */ new Set();
      holders.set(key, held);
    }
    if (detail.state === "down") {
      if (detail.repeat) {
        if (held.has(reader)) emit(detail);
        return;
      }
      if (held.has(reader)) return;
      held.add(reader);
      if (held.size === 1) emit(detail);
      return;
    }
    if (!held.delete(reader)) return;
    if (held.size === 0) {
      holders.delete(key);
      emit(detail);
    }
  };
}

// src/mark.ts
var SHIM_MARK = /* @__PURE__ */ Symbol.for("slimtv-game-bridge.shim");
function isShimObject(value) {
  return typeof value === "object" && value !== null && SHIM_MARK in value;
}

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

export {
  SHIM_MARK,
  isShimObject,
  RELEASE_NAME,
  RELEASE_TAG,
  ACTIONS,
  INPUT_SOURCES,
  MAX_PLAYERS,
  STICK_PRESS,
  STICK_RELEASE,
  LOG_LEVELS,
  LOG_MESSAGE_MAX,
  INPUT_EVENT,
  PAUSE_EVENT,
  RESUME_EVENT,
  MAX_MESSAGE_LENGTH,
  GAMEPAD_BUTTONS,
  createGamepadReader,
  DEFAULT_KEYMAP,
  watchGamepads,
  createKeyboard,
  isEditable,
  mergeInputs,
  createHeld
};
