// slimtv-game-bridge fake bridge auto-install entry, release Steady Heron (tag steady-heron).
// For trying a game on a computer; inside SlimTV it does nothing. Built by build.mjs; do not edit.

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
    releaseHeld() {
      for (const pad of pads.values()) {
        for (const action of ACTIONS) if (pad.held.has(action)) send(action, "up", pad.player);
        pad.held.clear();
        pad.stick.clear();
      }
    }
  };
}

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

// src/release.ts
var RELEASE_NAME = "Steady Heron";

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

// src/mark.ts
var SHIM_MARK = /* @__PURE__ */ Symbol.for("slimtv-game-bridge.shim");
function isShimObject(value) {
  return typeof value === "object" && value !== null && SHIM_MARK in value;
}

// src/shim/core.ts
var PREFIX = `[SlimTV ${RELEASE_NAME}]`;
function createShim(win, transport, device) {
  const console2 = win.console;
  const send = (message) => {
    if (!transport) return;
    try {
      transport.send(JSON.stringify(message));
    } catch (error) {
      console2.error(PREFIX, "sending to SlimTV failed", error);
    }
  };
  const sendLog = (level, text) => {
    let message = cut(text);
    let excess = JSON.stringify({ type: "log", level, message }).length - MAX_MESSAGE_LENGTH;
    while (excess > 0) {
      message = message.slice(0, message.length - Math.ceil(excess / 6));
      excess = JSON.stringify({ type: "log", level, message }).length - MAX_MESSAGE_LENGTH;
    }
    send({ type: "log", level, message });
  };
  if ("SlimTV" in win) {
    if (!isShimObject(win.SlimTV)) {
      const text = "window.SlimTV already exists and was not created by the shim, so the bridge is off. Is the launcher's SlimTV interface attached to the game WebView?";
      console2.error(PREFIX, text);
      send({ type: "hello", bridge: RELEASE_NAME });
      sendLog("error", `${PREFIX} ${text}`);
    }
    return null;
  }
  if (!transport) {
    console2.warn(PREFIX, "SlimTVNative is missing, so nothing reaches SlimTV.");
  }
  const held = createHeld();
  const reported = /* @__PURE__ */ new Set();
  const reportBad = (kind, detail) => {
    if (reported.has(kind)) return;
    reported.add(kind);
    const text = `Ignored a bad message from SlimTV (${kind}): ${detail}. Later ones of this kind are ignored silently.`;
    console2.warn(PREFIX, text);
    sendLog("warn", `${PREFIX} ${text}`);
  };
  const dispatch = (type, detail) => {
    win.dispatchEvent(new win.CustomEvent(type, { detail }));
  };
  const handleInput = (message) => {
    const { action, state, repeat, source, player } = message;
    if (!isOneOf(ACTIONS, action) || state !== "down" && state !== "up" || typeof repeat !== "boolean" || state === "up" && repeat || !isOneOf(INPUT_SOURCES, source) || typeof player !== "number" || !Number.isSafeInteger(player) || player < 1) {
      reportBad("bad-input", preview(message));
      return;
    }
    const detail = state === "down" ? { action, state, repeat, source, player } : { action, state, repeat: false, source, player };
    if (!held.apply(detail)) return;
    dispatch(INPUT_EVENT, Object.freeze(detail));
  };
  const receive = (data) => {
    try {
      if (typeof data !== "string") {
        reportBad("not-a-string", typeof data);
        return;
      }
      if (data.length > MAX_MESSAGE_LENGTH) {
        reportBad("too-long", `${data.length} characters`);
        return;
      }
      let message;
      try {
        message = JSON.parse(data);
      } catch {
        reportBad("not-json", JSON.stringify(data.slice(0, 80)));
        return;
      }
      if (typeof message !== "object" || message === null || Array.isArray(message)) {
        reportBad("no-type", JSON.stringify(data.slice(0, 80)));
        return;
      }
      const record = message;
      switch (record.type) {
        case "input":
          handleInput(record);
          return;
        case "pause":
          held.clear();
          dispatch(PAUSE_EVENT, null);
          return;
        case "resume":
          dispatch(RESUME_EVENT, null);
          return;
        default:
          if (typeof record.type !== "string") reportBad("no-type", preview(record));
          else reportBad("unknown-type", JSON.stringify(record.type.slice(0, 40)));
      }
    } catch (error) {
      console2.error(PREFIX, "handling a message from SlimTV failed", error);
    }
  };
  let readySent = false;
  const api = {
    bridge: RELEASE_NAME,
    device: Object.freeze({ name: device.name, tier: device.tier }),
    ready() {
      if (readySent) return;
      readySent = true;
      send({ type: "ready" });
    },
    exit() {
      send({ type: "exit" });
    },
    log(level, message) {
      sendLog(isOneOf(LOG_LEVELS, level) ? level : "info", toText(message));
    },
    input: Object.freeze({
      isDown(action, player) {
        return held.isDown(action, player);
      }
    })
  };
  Object.defineProperty(api, SHIM_MARK, { value: RELEASE_NAME });
  Object.freeze(api);
  Object.defineProperty(win, "SlimTV", {
    value: api,
    writable: false,
    enumerable: true,
    configurable: true
  });
  send({ type: "hello", bridge: RELEASE_NAME });
  transport?.listen(receive);
  return api;
}
function isOneOf(values, value) {
  return typeof value === "string" && values.includes(value);
}
function cut(text) {
  return text.length > LOG_MESSAGE_MAX ? text.slice(0, LOG_MESSAGE_MAX) : text;
}
function toText(value) {
  try {
    return String(value);
  } catch {
    return "[a value that could not be turned into text]";
  }
}
function preview(record) {
  try {
    return JSON.stringify(record).slice(0, 120);
  } catch {
    return "[unprintable]";
  }
}

// src/fake/index.ts
var PAUSE_KEY = "F9";
var BACK_HOLD_MS = 1e3;
var FAKE_MARK = /* @__PURE__ */ Symbol.for("slimtv-game-bridge.fake");
var PREFIX2 = `[SlimTV fake bridge ${RELEASE_NAME}]`;
var DEFAULT_DEVICE = { name: "Fake bridge on a computer", tier: "tv" };
function installFakeBridge(options = {}) {
  if (typeof window === "undefined") return null;
  const win = window;
  if (win[FAKE_MARK] || "SlimTV" in win) return null;
  win[FAKE_MARK] = true;
  let stopGamepads = () => {
  };
  let deliverToShim = () => {
  };
  let readySeen = false;
  let paused = false;
  const sendInput = (detail) => {
    if (paused) return;
    if (detail.action === "back" && !trackBack(detail)) return;
    deliverToShim(JSON.stringify({ type: "input", ...detail }));
  };
  const backHeld = /* @__PURE__ */ new Set();
  const backBlocked = /* @__PURE__ */ new Set();
  let backTimer;
  const trackBack = (detail) => {
    const who = `${detail.source}|${detail.player}`;
    if (detail.state === "up") {
      backHeld.delete(who);
      if (backHeld.size === 0 && backTimer !== void 0) {
        clearTimeout(backTimer);
        backTimer = void 0;
      }
      return !backBlocked.delete(who);
    }
    if (detail.repeat) return !backBlocked.has(who);
    if (!readySeen) {
      backBlocked.add(who);
      toast("Back before ready(): SlimTV would exit to the home screen now.");
      return false;
    }
    backHeld.add(who);
    backTimer ??= setTimeout(() => {
      backTimer = void 0;
      toast("Back held for 1 second: SlimTV would exit to the home screen now.");
    }, BACK_HOLD_MS);
    return true;
  };
  const handleFromShim = (json) => {
    const message = JSON.parse(json);
    switch (message.type) {
      case "ready":
        readySeen = true;
        toast("ready(): SlimTV would hide its loading screen.");
        return;
      case "exit":
        toast("exit(): SlimTV would return to the home screen.");
        return;
      case "log": {
        const level = message.level ?? "info";
        console[level]("[SlimTV log]", message.message);
        return;
      }
    }
  };
  const from = mergeInputs(sendInput);
  let claimed = false;
  const keyboard = createKeyboard(options.keymap ?? DEFAULT_KEYMAP, from("keyboard"), (event) => {
    claimed = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  });
  const leftToPage = /* @__PURE__ */ new Set();
  const onKeyDown = (event) => {
    if (event.code === PAUSE_KEY) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) togglePause();
      return;
    }
    claimed = false;
    keyboard.keydown(event);
    if (!claimed && keyboard.isMapped(event.code)) leftToPage.add(event.code);
  };
  const onKeyUp = (event) => {
    if (event.code === PAUSE_KEY) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    keyboard.keyup(event);
    if (!keyboard.isMapped(event.code) || leftToPage.delete(event.code)) return;
    if (!isEditable(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const reader = createGamepadReader(from("gamepads"), (text) => console.warn(PREFIX2, text));
  const togglePause = () => {
    if (!paused) {
      paused = true;
      keyboard.releaseAll();
      reader.releaseHeld();
      backHeld.clear();
      backBlocked.clear();
      if (backTimer !== void 0) clearTimeout(backTimer);
      backTimer = void 0;
      deliverToShim(JSON.stringify({ type: "pause" }));
      toast(`Paused, as if Home was pressed. ${PAUSE_KEY} resumes.`);
    } else {
      keyboard.releaseAll();
      reader.releaseHeld();
      paused = false;
      deliverToShim(JSON.stringify({ type: "resume" }));
      toast("Resumed.");
    }
  };
  const api = createShim(
    win,
    {
      send: handleFromShim,
      listen(onMessage) {
        deliverToShim = onMessage;
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("blur", keyboard.releaseAll);
        stopGamepads = watchGamepads(reader, (text, error) => console.warn(PREFIX2, text, error));
      }
    },
    options.device ?? DEFAULT_DEVICE
  );
  if (!api) {
    delete win[FAKE_MARK];
    return null;
  }
  console.info(
    PREFIX2,
    `installed. Keys act as the remote and the first controller; ${PAUSE_KEY} pauses and resumes.`
  );
  let uninstalled = false;
  return {
    uninstall() {
      if (uninstalled) return;
      uninstalled = true;
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", keyboard.releaseAll);
      stopGamepads();
      if (backTimer !== void 0) clearTimeout(backTimer);
      deliverToShim = () => {
      };
      delete win.SlimTV;
      delete win[FAKE_MARK];
    }
  };
}
var toastBox;
function toast(text) {
  console.info(PREFIX2, text);
  if (typeof document === "undefined") return;
  const parent = document.body ?? document.documentElement;
  if (!parent) return;
  if (!toastBox || !toastBox.isConnected) {
    toastBox = document.createElement("div");
    toastBox.setAttribute("data-slimtv-fake-bridge", "");
    toastBox.setAttribute("role", "status");
    Object.assign(toastBox.style, {
      position: "fixed",
      left: "50%",
      bottom: "24px",
      transform: "translateX(-50%)",
      zIndex: "2147483647",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      alignItems: "center",
      pointerEvents: "none",
      font: "16px/1.4 system-ui, sans-serif"
    });
    parent.append(toastBox);
  }
  const note = document.createElement("div");
  note.textContent = text;
  Object.assign(note.style, {
    background: "rgba(20, 20, 28, 0.92)",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)"
  });
  toastBox.append(note);
  setTimeout(() => note.remove(), 3e3);
}

// src/fake/auto.ts
if (typeof window !== "undefined" && !("SlimTVNative" in window) && !("SlimTV" in window)) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("platform") === "slimtv" && params.get("fakebridge") === "1") installFakeBridge();
}
