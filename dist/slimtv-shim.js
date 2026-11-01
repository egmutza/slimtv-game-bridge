// slimtv-game-bridge shim, release Steady Heron (tag steady-heron).
// SlimTV injects this into every game page. Built from src/shim by build.mjs; do not edit.
// The contract it follows: CONTRACT.md in https://github.com/egmutza/slimtv-game-bridge
"use strict";
(() => {
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
  var LOG_LEVELS = ["debug", "info", "warn", "error"];
  var LOG_MESSAGE_MAX = 2e3;
  var INPUT_EVENT = "slimtv:input";
  var PAUSE_EVENT = "slimtv:pause";
  var RESUME_EVENT = "slimtv:resume";
  var MAX_MESSAGE_LENGTH = 4096;

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

  // src/release.ts
  var RELEASE_NAME = "Steady Heron";

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
      if (!isOneOf(ACTIONS, action) || state !== "down" && state !== "up" || typeof repeat !== "boolean" || state === "up" && repeat || !isOneOf(INPUT_SOURCES, source) || typeof player !== "number" || !Number.isSafeInteger(player) || player < 1 || // Each player number held is remembered until it's let go, so a cap keeps that bounded.
      player > MAX_PLAYERS) {
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

  // src/shim/native.ts
  var UNKNOWN_DEVICE = { name: "unknown", tier: "tv" };
  function nativeTransport(win) {
    const native = win.SlimTVNative;
    if (typeof native !== "object" || native === null || typeof native.postMessage !== "function" || typeof native.addEventListener !== "function") {
      return null;
    }
    return {
      send(json) {
        native.postMessage(json);
      },
      listen(onMessage) {
        native.addEventListener("message", (event) => onMessage(event?.data));
      }
    };
  }
  function readDevice(win) {
    try {
      const device = win.__SLIMTV_CONFIG__?.device;
      if (typeof device !== "object" || device === null) return UNKNOWN_DEVICE;
      const { name, tier } = device;
      return {
        name: typeof name === "string" ? name : UNKNOWN_DEVICE.name,
        tier: typeof tier === "string" ? tier : UNKNOWN_DEVICE.tier
      };
    } catch {
      return UNKNOWN_DEVICE;
    }
  }

  // src/shim/entry.ts
  try {
    createShim(window, nativeTransport(window), readDevice(window));
  } catch (error) {
    console.error("[SlimTV] the shim failed to start", error);
  }
})();
