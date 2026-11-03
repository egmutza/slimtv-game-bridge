// slimtv-game-bridge shared code, release Brisk Otter (tag brisk-otter).
// Built by build.mjs; do not edit.
// src/release.ts
var RELEASE_NAME = "Brisk Otter";
var RELEASE_TAG = "brisk-otter";

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
  "action2",
  "l1",
  "r1",
  "l2",
  "r2",
  "l3",
  "r3"
];
var INPUT_SOURCES = ["remote", "gamepad"];
var MAX_PLAYERS = 16;
var STICK_PRESS = 0.5;
var STICK_RELEASE = 0.35;
var TRIGGER_PRESS = 0.5;
var TRIGGER_RELEASE = 0.35;
var STICKS = ["left", "right"];
var STICK_DEAD_ZONE = 0.15;
var LOG_LEVELS = ["debug", "info", "warn", "error"];
var LOG_MESSAGE_MAX = 2e3;
var INPUT_EVENT = "slimtv:input";
var PAUSE_EVENT = "slimtv:pause";
var RESUME_EVENT = "slimtv:resume";
var MAX_MESSAGE_LENGTH = 4096;

// src/sticks.ts
var CENTRE = Object.freeze({ x: 0, y: 0 });
function createSticks() {
  const positions = /* @__PURE__ */ new Map();
  return {
    set(detail) {
      const key = `${detail.stick}|${detail.player}`;
      const old = positions.get(key) ?? CENTRE;
      if (old.x === detail.x && old.y === detail.y) return false;
      if (detail.x === 0 && detail.y === 0) positions.delete(key);
      else positions.set(key, Object.freeze({ stick: detail.stick, x: detail.x, y: detail.y, player: detail.player }));
      return true;
    },
    get(stick, player) {
      if (!STICKS.includes(stick)) return CENTRE;
      if (player !== void 0) {
        if (!Number.isSafeInteger(player) || player < 1 || player > MAX_PLAYERS) return CENTRE;
        const found = positions.get(`${stick}|${player}`);
        return found ? Object.freeze({ x: found.x, y: found.y }) : CENTRE;
      }
      let best = CENTRE;
      let bestDistance = 0;
      let bestPlayer = Infinity;
      for (const entry of positions.values()) {
        if (entry.stick !== stick) continue;
        const distance = Math.hypot(entry.x, entry.y);
        if (distance > bestDistance || distance === bestDistance && entry.player < bestPlayer) {
          bestDistance = distance;
          bestPlayer = entry.player;
          best = Object.freeze({ x: entry.x, y: entry.y });
        }
      }
      return best;
    },
    clear() {
      positions.clear();
    }
  };
}

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
  [4, "l1"],
  // Left shoulder: LB / L1 / L
  [5, "r1"],
  // Right shoulder: RB / R1 / R
  [9, "menu"],
  // Start / Options
  [10, "l3"],
  // Left stick pressed in
  [11, "r3"],
  // Right stick pressed in
  [12, "up"],
  // D-pad
  [13, "down"],
  [14, "left"],
  [15, "right"]
];
var GAMEPAD_TRIGGERS = [
  [6, "l2"],
  [7, "r2"]
];
var STICK_AXES = { left: [0, 1], right: [2, 3] };
var STICK = [
  ["up", 1, -1],
  ["down", 1, 1],
  ["left", 0, -1],
  ["right", 0, 1]
];
function createGamepadReader(emit, warn, emitStick = () => {
}) {
  const pads = /* @__PURE__ */ new Map();
  let warnedMapping = false;
  let warnedPlayers = false;
  const send = (action, state, player) => emit({ action, state, repeat: false, source: "gamepad", player });
  const moveStick = (pad, stick, position) => {
    const old = pad.positions.get(stick);
    if ((old?.x ?? 0) === position.x && (old?.y ?? 0) === position.y) return;
    if (position.x === 0 && position.y === 0) pad.positions.delete(stick);
    else pad.positions.set(stick, position);
    emitStick({ stick, x: position.x, y: position.y, player: pad.player });
  };
  const letGo = (pad) => {
    for (const action of ACTIONS) if (pad.held.has(action)) send(action, "up", pad.player);
    pad.held.clear();
    pad.stick.clear();
    pad.triggers.clear();
    for (const stick of STICKS) moveStick(pad, stick, CENTRE);
  };
  const release = (index) => {
    const pad = pads.get(index);
    if (!pad) return;
    letGo(pad);
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
          state = { player, stick: /* @__PURE__ */ new Set(), triggers: /* @__PURE__ */ new Set(), held: /* @__PURE__ */ new Set(), positions: /* @__PURE__ */ new Map() };
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
        for (const [button, action] of GAMEPAD_TRIGGERS) {
          const value = triggerValue(pad.buttons[button]);
          if (state.triggers.has(action)) {
            if (value < TRIGGER_RELEASE) state.triggers.delete(action);
          } else if (value >= TRIGGER_PRESS) {
            state.triggers.add(action);
          }
        }
        const now = /* @__PURE__ */ new Set([...state.stick, ...state.triggers]);
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
        for (const stick of STICKS) {
          const [x, y] = STICK_AXES[stick];
          moveStick(state, stick, shapeStick(pad.axes[x] ?? 0, pad.axes[y] ?? 0));
        }
      }
    },
    releaseHeld() {
      for (const pad of pads.values()) letGo(pad);
    }
  };
}
function shapeStick(rawX, rawY) {
  const x = Number.isFinite(rawX) ? rawX : 0;
  const y = Number.isFinite(rawY) ? rawY : 0;
  const distance = Math.hypot(x, y);
  if (distance <= STICK_DEAD_ZONE) return CENTRE;
  const scaled = Math.min(1, (distance - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE));
  const round = (value) => Math.round(value * 100) / 100 || 0;
  return Object.freeze({ x: round(x / distance * scaled), y: round(y / distance * scaled) });
}
function triggerValue(button) {
  if (!button) return 0;
  if (typeof button.value === "number" && Number.isFinite(button.value)) return button.value;
  return button.pressed ? 1 : 0;
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
  action2: ["KeyX"],
  l1: ["KeyQ"],
  r1: ["KeyE"],
  l2: ["Digit1"],
  r2: ["Digit3"],
  l3: ["KeyC"],
  r3: ["KeyV"]
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
  TRIGGER_PRESS,
  TRIGGER_RELEASE,
  STICKS,
  STICK_DEAD_ZONE,
  LOG_LEVELS,
  LOG_MESSAGE_MAX,
  INPUT_EVENT,
  PAUSE_EVENT,
  RESUME_EVENT,
  MAX_MESSAGE_LENGTH,
  createSticks,
  GAMEPAD_BUTTONS,
  GAMEPAD_TRIGGERS,
  createGamepadReader,
  DEFAULT_KEYMAP,
  watchGamepads,
  createKeyboard,
  isEditable,
  mergeInputs,
  createHeld
};
