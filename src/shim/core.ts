// The shim's logic, independent of how messages travel. SlimTV's injected script runs it over the
// native SlimTVNative transport (native.ts); the fake bridge will run the same code over a fake
// one. Everything here follows CONTRACT.md: "Game to SlimTV", "SlimTV to game", "Polling" and
// "Wire protocol".

import {
  ACTIONS,
  INPUT_EVENT,
  INPUT_SOURCES,
  LOG_LEVELS,
  LOG_MESSAGE_MAX,
  MAX_MESSAGE_LENGTH,
  MAX_PLAYERS,
  PAUSE_EVENT,
  RESUME_EVENT,
  STICKS,
  type Action,
  type DeviceInfo,
  type InputDetail,
  type LogLevel,
  type ShimToNativeMessage,
  type SlimTVApi,
  type StickName,
  type StickPosition,
} from "../contract";
import { createHeld } from "../held";
import { createSticks } from "../sticks";
import { isShimObject, SHIM_MARK } from "../mark";
import { RELEASE_NAME } from "../release";

/** The page's window, including its globals (console, CustomEvent). */
export type ShimWindow = Window & typeof globalThis;

/** How the shim talks to native. Both directions carry JSON strings. */
export interface ShimTransport {
  /** Sends one JSON string to native. May throw; the shim catches it. */
  send(json: string): void;
  /** Starts delivering native messages. Called once, after "hello" is sent. */
  listen(onMessage: (data: unknown) => void): void;
}

export { SHIM_MARK };

const PREFIX = `[SlimTV ${RELEASE_NAME}]`;

/** Kinds of bad native message. Each is reported once per page load. */
type BadKind = "not-a-string" | "too-long" | "not-json" | "no-type" | "unknown-type" | "bad-input" | "bad-stick";

/**
 * Installs window.SlimTV on `win` and starts talking to native through `transport`.
 * Returns the installed object, or null when window.SlimTV already existed. In that case nothing
 * is touched; an object this shim didn't create is reported as an error (CONTRACT.md "Name clash").
 */
export function createShim(
  win: ShimWindow,
  transport: ShimTransport | null,
  device: DeviceInfo,
): SlimTVApi | null {
  const console = win.console;

  const send = (message: ShimToNativeMessage): void => {
    if (!transport) return;
    try {
      transport.send(JSON.stringify(message));
    } catch (error) {
      console.error(PREFIX, "sending to SlimTV failed", error);
    }
  };

  // Sends a log, cut to LOG_MESSAGE_MAX characters and then, if needed, further: JSON escapes
  // some characters to six, and native ignores any message over MAX_MESSAGE_LENGTH.
  const sendLog = (level: LogLevel, text: string): void => {
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
      const text =
        "window.SlimTV already exists and was not created by the shim, so the bridge is off. " +
        "Is the launcher's SlimTV interface attached to the game WebView?";
      console.error(PREFIX, text);
      send({ type: "hello", bridge: RELEASE_NAME });
      sendLog("error", `${PREFIX} ${text}`);
    }
    return null;
  }

  if (!transport) {
    console.warn(PREFIX, "SlimTVNative is missing, so nothing reaches SlimTV.");
  }

  const held = createHeld();
  const sticks = createSticks();

  const reported = new Set<BadKind>();
  const reportBad = (kind: BadKind, detail: string): void => {
    if (reported.has(kind)) return;
    reported.add(kind);
    const text = `Ignored a bad message from SlimTV (${kind}): ${detail}. Later ones of this kind are ignored silently.`;
    console.warn(PREFIX, text);
    sendLog("warn", `${PREFIX} ${text}`);
  };

  const dispatch = (type: string, detail: InputDetail | null): void => {
    win.dispatchEvent(new win.CustomEvent(type, { detail }));
  };

  const handleInput = (message: Record<string, unknown>): void => {
    const { action, state, repeat, source, player } = message;
    if (
      !isOneOf(ACTIONS, action) ||
      (state !== "down" && state !== "up") ||
      typeof repeat !== "boolean" ||
      (state === "up" && repeat) ||
      !isOneOf(INPUT_SOURCES, source) ||
      typeof player !== "number" ||
      !Number.isSafeInteger(player) ||
      player < 1 ||
      // Each player number held is remembered until it's let go, so a cap keeps that bounded.
      player > MAX_PLAYERS
    ) {
      reportBad("bad-input", preview(message));
      return;
    }

    const detail: InputDetail =
      state === "down"
        ? { action, state, repeat, source, player }
        : { action, state, repeat: false, source, player };
    // Only changes are passed on. This keeps, for example, a stray "up" after a pause (whose
    // "down" the shim already forgot) from reaching the game.
    if (!held.apply(detail)) return;
    dispatch(INPUT_EVENT, Object.freeze(detail));
  };

  const handleStick = (message: Record<string, unknown>): void => {
    const { stick, x, y, player } = message;
    if (
      !isOneOf(STICKS, stick) ||
      !isAxis(x) ||
      !isAxis(y) ||
      typeof player !== "number" ||
      !Number.isSafeInteger(player) ||
      player < 1 ||
      player > MAX_PLAYERS
    ) {
      reportBad("bad-stick", preview(message));
      return;
    }
    // -0 reads as 0, so a game comparing with Object.is or dividing by it sees no difference.
    sticks.set({ stick, x: x || 0, y: y || 0, player });
  };

  const receive = (data: unknown): void => {
    try {
      if (typeof data !== "string") {
        reportBad("not-a-string", typeof data);
        return;
      }
      if (data.length > MAX_MESSAGE_LENGTH) {
        reportBad("too-long", `${data.length} characters`);
        return;
      }
      let message: unknown;
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
      const record = message as Record<string, unknown>;
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
          dispatch(RESUME_EVENT, null);
          return;
        default:
          if (typeof record.type !== "string") reportBad("no-type", preview(record));
          else reportBad("unknown-type", JSON.stringify(record.type.slice(0, 40)));
      }
    } catch (error) {
      // Never let a native message throw into the page.
      console.error(PREFIX, "handling a message from SlimTV failed", error);
    }
  };

  let readySent = false;

  const api: SlimTVApi = {
    bridge: RELEASE_NAME,
    device: Object.freeze({ name: device.name, tier: device.tier }),
    ready(): void {
      if (readySent) return;
      readySent = true;
      send({ type: "ready" });
    },
    exit(): void {
      send({ type: "exit" });
    },
    log(level: LogLevel, message: string): void {
      sendLog(isOneOf(LOG_LEVELS, level) ? level : "info", toText(message));
    },
    input: Object.freeze({
      isDown(action: Action, player?: number): boolean {
        return held.isDown(action, player);
      },
      stick(stick: StickName, player?: number): StickPosition {
        return sticks.get(stick, player);
      },
    }),
  };
  Object.defineProperty(api, SHIM_MARK, { value: RELEASE_NAME });
  Object.freeze(api);

  // Not writable, so a game can't replace it by accident. Configurable, because a classic script
  // that declares its own top-level `SlimTV` would otherwise fail to load at all.
  Object.defineProperty(win, "SlimTV", {
    value: api,
    writable: false,
    enumerable: true,
    configurable: true,
  });

  send({ type: "hello", bridge: RELEASE_NAME });
  transport?.listen(receive);
  return api;
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isAxis(value: unknown): value is number {
  return typeof value === "number" && value >= -1 && value <= 1;
}

function cut(text: string): string {
  return text.length > LOG_MESSAGE_MAX ? text.slice(0, LOG_MESSAGE_MAX) : text;
}

function toText(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[a value that could not be turned into text]";
  }
}

function preview(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record).slice(0, 120);
  } catch {
    return "[unprintable]";
  }
}
