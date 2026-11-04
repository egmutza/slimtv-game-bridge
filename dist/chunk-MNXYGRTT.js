// slimtv-game-bridge shared code, release Wakeful Owl (tag wakeful-owl).
// Built by build.mjs; do not edit.
import {
  ACTIONS,
  AWAKE_SEND_GAP_MS,
  DEFAULT_KEYMAP,
  INPUT_EVENT,
  INPUT_SOURCES,
  LOG_LEVELS,
  LOG_MESSAGE_MAX,
  MAX_MESSAGE_LENGTH,
  MAX_PLAYERS,
  PAUSE_EVENT,
  RELEASE_NAME,
  RESUME_EVENT,
  SHIM_MARK,
  STICKS,
  createGamepadReader,
  createHeld,
  createKeyboard,
  createSticks,
  isEditable,
  isShimObject,
  mergeInputs,
  watchGamepads
} from "./chunk-QP7FNT37.js";

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
  const sticks = createSticks();
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
    if (!isOneOf(ACTIONS, action) || state !== "down" && state !== "up" || typeof repeat !== "boolean" || state === "up" && repeat || !isOneOf(INPUT_SOURCES, source) || typeof player !== "number" || !Number.isSafeInteger(player) || player < 1 || // Each player number held is remembered until it's let go, so a cap keeps that bounded.
    player > MAX_PLAYERS) {
      reportBad("bad-input", preview(message));
      return;
    }
    const detail = state === "down" ? { action, state, repeat, source, player } : { action, state, repeat: false, source, player };
    if (!held.apply(detail)) return;
    dispatch(INPUT_EVENT, Object.freeze(detail));
  };
  const handleStick = (message) => {
    const { stick, x, y, player } = message;
    if (!isOneOf(STICKS, stick) || !isAxis(x) || !isAxis(y) || typeof player !== "number" || !Number.isSafeInteger(player) || player < 1 || player > MAX_PLAYERS) {
      reportBad("bad-stick", preview(message));
      return;
    }
    sticks.set({ stick, x: x || 0, y: y || 0, player });
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
        case "stick":
          handleStick(record);
          return;
        case "pause":
          held.clear();
          sticks.clear();
          dispatch(PAUSE_EVENT, null);
          return;
        case "resume":
          awakeSentAt = void 0;
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
  let awakeSentAt;
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
    keepAwake() {
      const now = Date.now();
      if (awakeSentAt !== void 0 && now >= awakeSentAt && now - awakeSentAt < AWAKE_SEND_GAP_MS) return;
      awakeSentAt = now;
      send({ type: "awake" });
    },
    input: Object.freeze({
      isDown(action, player) {
        return held.isDown(action, player);
      },
      stick(stick, player) {
        return sticks.get(stick, player);
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
function isAxis(value) {
  return typeof value === "number" && value >= -1 && value <= 1;
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
      case "awake":
        toast("keepAwake(): SlimTV would keep the screen on for 5 more minutes.");
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
  const reader = createGamepadReader(
    from("gamepads"),
    (text) => console.warn(PREFIX2, text),
    (detail) => {
      if (!paused) deliverToShim(JSON.stringify({ type: "stick", ...detail }));
    }
  );
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

export {
  PAUSE_KEY,
  BACK_HOLD_MS,
  installFakeBridge
};
