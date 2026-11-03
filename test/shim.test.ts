// Tests for the shim (src/shim/) and the built dist/slimtv-shim.js, each in a fresh fake page.

import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InputDetail, SlimTVApi } from "../src/contract";
import { LOG_MESSAGE_MAX, MAX_MESSAGE_LENGTH, MAX_PLAYERS } from "../src/contract";
import { RELEASE_NAME } from "../src/release";
import { createShim, type ShimWindow, type ShimTransport } from "../src/shim/core";
import { nativeTransport, readDevice } from "../src/shim/native";

const windows: Window[] = [];

function newWindow(): ShimWindow {
  const win = new Window();
  windows.push(win);
  return win as unknown as ShimWindow;
}

afterEach(async () => {
  await Promise.all(windows.splice(0).map((win) => win.happyDOM.close()));
  vi.restoreAllMocks();
});

/** A page with the shim installed over a fake transport that records everything. */
function setup() {
  const win = newWindow();
  const warn = vi.spyOn(win.console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(win.console, "error").mockImplementation(() => {});
  const sent: Record<string, unknown>[] = [];
  let deliver: (data: unknown) => void = () => {
    throw new Error("the shim never called listen()");
  };
  const transport: ShimTransport = {
    send: (json) => sent.push(JSON.parse(json)),
    listen: (onMessage) => {
      deliver = onMessage;
    },
  };
  const api = createShim(win, transport, { name: "Test TV", tier: "tv" });
  if (!api) throw new Error("createShim returned null");

  const events: { type: string; detail: unknown }[] = [];
  for (const type of ["slimtv:input", "slimtv:pause", "slimtv:resume"]) {
    win.addEventListener(type, (event) => {
      events.push({ type, detail: (event as CustomEvent).detail });
    });
  }
  const inputs = (): InputDetail[] =>
    events.filter((e) => e.type === "slimtv:input").map((e) => e.detail as InputDetail);

  const send = (message: unknown): void => deliver(JSON.stringify(message));
  const press = (fields: Partial<InputDetail> = {}): void =>
    send({
      type: "input",
      action: "confirm",
      state: "down",
      repeat: false,
      source: "remote",
      player: 1,
      ...fields,
    });
  const release = (fields: Partial<InputDetail> = {}): void =>
    press({ state: "up", ...fields } as Partial<InputDetail>);

  return { win, api, sent, deliver: (data: unknown) => deliver(data), send, press, release, events, inputs, warn, error };
}

describe("installing", () => {
  it("installs a read-only window.SlimTV and sends hello first", () => {
    const { win, api, sent } = setup();
    expect(win.SlimTV).toBe(api);
    expect(api.bridge).toBe(RELEASE_NAME);
    expect(api.device).toEqual({ name: "Test TV", tier: "tv" });
    expect(sent).toEqual([{ type: "hello", bridge: RELEASE_NAME }]);

    expect(() => {
      (win as { SlimTV?: unknown }).SlimTV = {};
    }).toThrow();
    expect(win.SlimTV).toBe(api);
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.isFrozen(api.input)).toBe(true);
    expect(Object.isFrozen(api.device)).toBe(true);
    // Configurable, so a classic script declaring its own top-level SlimTV still loads.
    expect(Object.getOwnPropertyDescriptor(win, "SlimTV")?.configurable).toBe(true);
  });

  it("leaves a second copy of the shim alone, silently", () => {
    const { win, api } = setup();
    const sent: string[] = [];
    const again = createShim(win, { send: (j) => sent.push(j), listen: () => {} }, {
      name: "x",
      tier: "tv",
    });
    expect(again).toBeNull();
    expect(win.SlimTV).toBe(api);
    expect(sent).toEqual([]);
  });

  it("refuses to replace a window.SlimTV it didn't create, and reports it", () => {
    const win = newWindow();
    const error = vi.spyOn(win.console, "error").mockImplementation(() => {});
    const foreign = { launcher: true };
    (win as { SlimTV?: unknown }).SlimTV = foreign;
    const sent: Record<string, unknown>[] = [];
    const listen = vi.fn();
    const api = createShim(win, { send: (j) => sent.push(JSON.parse(j)), listen }, {
      name: "x",
      tier: "tv",
    });
    expect(api).toBeNull();
    expect(win.SlimTV).toBe(foreign);
    expect(error).toHaveBeenCalledOnce();
    expect(listen).not.toHaveBeenCalled();
    expect(sent[0]).toEqual({ type: "hello", bridge: RELEASE_NAME });
    expect(sent[1]).toMatchObject({ type: "log", level: "error" });
  });

  it("still installs, with a warning, when SlimTVNative is missing", () => {
    const win = newWindow();
    const warn = vi.spyOn(win.console, "warn").mockImplementation(() => {});
    const api = createShim(win, nativeTransport(win), readDevice(win));
    expect(api).not.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(() => {
      api?.ready();
      api?.exit();
      api?.log("info", "hi");
    }).not.toThrow();
  });
});

describe("game to SlimTV", () => {
  it("sends ready once per page load", () => {
    const { api, sent } = setup();
    api.ready();
    api.ready();
    expect(sent.filter((m) => m.type === "ready")).toHaveLength(1);
  });

  it("sends exit every time", () => {
    const { api, sent } = setup();
    api.exit();
    api.exit();
    expect(sent.filter((m) => m.type === "exit")).toHaveLength(2);
  });

  it("sends logs, cut to the limit, with unknown levels as info", () => {
    const { api, sent } = setup();
    const loose = api as unknown as { log(level: unknown, message: unknown): void };
    api.log("warn", "careful");
    loose.log("loud", 42);
    api.log("debug", "x".repeat(LOG_MESSAGE_MAX + 50));
    loose.log("error", Symbol("s"));
    loose.log("error", {
      toString() {
        throw new Error("no");
      },
    });
    const logs = sent.filter((m) => m.type === "log");
    expect(logs[0]).toEqual({ type: "log", level: "warn", message: "careful" });
    expect(logs[1]).toEqual({ type: "log", level: "info", message: "42" });
    expect((logs[2]?.message as string).length).toBe(LOG_MESSAGE_MAX);
    expect(logs[3]).toEqual({ type: "log", level: "error", message: "Symbol(s)" });
    expect(logs[4]?.level).toBe("error");
  });

  it("keeps a log of escaped characters within the wire limit", () => {
    const { api, sent } = setup();
    api.log("info", "\u0001".repeat(LOG_MESSAGE_MAX));
    const log = sent.at(-1);
    expect(log?.type).toBe("log");
    expect(JSON.stringify(log).length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect((log?.message as string).length).toBeGreaterThan(600);
  });

  it("never throws when the transport does", () => {
    const win = newWindow();
    const error = vi.spyOn(win.console, "error").mockImplementation(() => {});
    const api = createShim(
      win,
      {
        send: () => {
          throw new Error("native is gone");
        },
        listen: () => {},
      },
      { name: "x", tier: "tv" },
    );
    expect(() => api?.exit()).not.toThrow();
    expect(error).toHaveBeenCalled();
  });
});

describe("SlimTV to game", () => {
  it("dispatches input with the contract's fields", () => {
    const { press, inputs } = setup();
    press({ action: "left", source: "gamepad", player: 2 });
    expect(inputs()).toEqual([
      { action: "left", state: "down", repeat: false, source: "gamepad", player: 2 },
    ]);
    expect(Object.isFrozen(inputs()[0])).toBe(true);
  });

  it("tracks isDown per player and for any player", () => {
    const { api, press, release } = setup();
    press({ action: "up", source: "gamepad", player: 2 });
    expect(api.input.isDown("up")).toBe(true);
    expect(api.input.isDown("up", 2)).toBe(true);
    expect(api.input.isDown("up", 1)).toBe(false);
    expect(api.input.isDown("down")).toBe(false);
    release({ action: "up", source: "gamepad", player: 2 });
    expect(api.input.isDown("up")).toBe(false);
  });

  it("answers false for an unknown action or invalid player", () => {
    const { api, press } = setup();
    press();
    const loose = api.input as unknown as { isDown(a: unknown, p?: unknown): boolean };
    expect(loose.isDown("jump")).toBe(false);
    expect(loose.isDown("confirm", 0)).toBe(false);
    expect(loose.isDown("confirm", 1.5)).toBe(false);
    expect(loose.isDown("confirm", "1")).toBe(false);
    expect(loose.isDown("confirm", 1)).toBe(true);
  });

  it("keeps an action held on two sources down until both release", () => {
    const { api, press, release } = setup();
    press({ source: "remote" });
    press({ source: "gamepad" });
    release({ source: "remote" });
    expect(api.input.isDown("confirm", 1)).toBe(true);
    release({ source: "gamepad" });
    expect(api.input.isDown("confirm", 1)).toBe(false);
  });

  it("passes repeats of a held button without changing isDown", () => {
    const { api, press, release, inputs } = setup();
    press();
    press({ repeat: true });
    press({ repeat: true });
    expect(inputs().map((d) => d.repeat)).toEqual([false, true, true]);
    expect(api.input.isDown("confirm")).toBe(true);
    release();
    expect(api.input.isDown("confirm")).toBe(false);
  });

  it("drops events that don't change anything", () => {
    const { press, release, inputs } = setup();
    release(); // up for a button that isn't down
    press({ repeat: true }); // repeat for a button that isn't down
    press();
    press(); // down for a button already down
    expect(inputs()).toHaveLength(1);
  });

  it("clears held buttons on pause without sending ups", () => {
    const { api, send, press, release, events, inputs } = setup();
    press();
    press({ action: "left", source: "gamepad", player: 2 });
    send({ type: "pause" });
    expect(api.input.isDown("confirm")).toBe(false);
    expect(api.input.isDown("left")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "slimtv:pause", detail: null });
    release(); // the up for a button held across the pause
    expect(inputs()).toHaveLength(2);
    send({ type: "resume" });
    expect(events.at(-1)).toEqual({ type: "slimtv:resume", detail: null });
  });
});

describe("the buttons added after Steady Heron", () => {
  it.each(["l1", "r1", "l2", "r2", "l3", "r3"] as const)("passes %s down and up like any other", (action) => {
    const { press, release, inputs, api } = setup();
    press({ action, source: "gamepad", player: 2 });
    expect(api.input.isDown(action, 2)).toBe(true);
    release({ action, source: "gamepad", player: 2 });
    expect(api.input.isDown(action)).toBe(false);
    expect(inputs().map((d) => `${d.action} ${d.state}`)).toEqual([`${action} down`, `${action} up`]);
  });
});

describe("stick positions", () => {
  const stick = (fields: Record<string, unknown> = {}) => ({ type: "stick", stick: "left", x: 0, y: 0, player: 1, ...fields });

  it("reads 0, 0 for every stick until SlimTV reports one", () => {
    const { api } = setup();
    expect(api.input.stick("left")).toEqual({ x: 0, y: 0 });
    expect(api.input.stick("right", 3)).toEqual({ x: 0, y: 0 });
  });

  it("keeps each player's sticks, with no event", () => {
    const { send, api, events } = setup();
    send(stick({ x: 0.5, y: -0.25 }));
    send(stick({ stick: "right", x: -1, y: 0, player: 2 }));
    expect(api.input.stick("left", 1)).toEqual({ x: 0.5, y: -0.25 });
    expect(api.input.stick("right", 2)).toEqual({ x: -1, y: 0 });
    expect(api.input.stick("left", 2)).toEqual({ x: 0, y: 0 });
    expect(Object.isFrozen(api.input.stick("left", 1))).toBe(true);
    expect(events).toEqual([]);
    send(stick({ x: 0, y: 0 }));
    expect(api.input.stick("left", 1)).toEqual({ x: 0, y: 0 });
  });

  it("answers for whoever pushes a stick furthest when no player is given", () => {
    const { send, api } = setup();
    send(stick({ x: 0.3, y: 0, player: 1 }));
    send(stick({ x: 0, y: -0.9, player: 3 }));
    expect(api.input.stick("left")).toEqual({ x: 0, y: -0.9 });
    send(stick({ x: 0, y: 0.3, player: 2 }));
    send(stick({ x: 0, y: 0, player: 3 }));
    // Players 1 and 2 push equally far: the lower number wins.
    expect(api.input.stick("left")).toEqual({ x: 0.3, y: 0 });
  });

  it("answers 0, 0 for an unknown stick or an invalid player", () => {
    const { send, api } = setup();
    send(stick({ x: 1, y: 0 }));
    expect(api.input.stick("middle" as "left")).toEqual({ x: 0, y: 0 });
    expect(api.input.stick("left", 0)).toEqual({ x: 0, y: 0 });
    expect(api.input.stick("left", 1.5)).toEqual({ x: 0, y: 0 });
    expect(api.input.stick("left", MAX_PLAYERS + 1)).toEqual({ x: 0, y: 0 });
  });

  it("puts every stick back to the centre on pause", () => {
    const { send, api } = setup();
    send(stick({ x: 1, y: 0 }));
    send({ type: "pause" });
    expect(api.input.stick("left", 1)).toEqual({ x: 0, y: 0 });
  });

  it("reads -0 as 0", () => {
    const { deliver, api } = setup();
    deliver('{"type":"stick","stick":"left","x":-0,"y":0.5,"player":1}');
    expect(Object.is(api.input.stick("left", 1).x, 0)).toBe(true);
  });

  const badSticks: [string, Record<string, unknown>][] = [
    ["unknown stick", { stick: "middle" }],
    ["x past the edge", { x: 1.01 }],
    ["y past the edge", { y: -1.5 }],
    ["x as text", { x: "0.5" }],
    ["y missing", { y: undefined }],
    ["player 0", { player: 0 }],
    ["player over the maximum", { player: MAX_PLAYERS + 1 }],
    ["fractional player", { player: 2.5 }],
  ];

  it.each(badSticks)("ignores a stick message with a bad field (%s)", (_name, fields) => {
    const { send, api, warn } = setup();
    send(stick({ x: 0.5, ...fields }));
    expect(api.input.stick("left")).toEqual({ x: 0, y: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("bad messages", () => {
  const badInputs: [string, Record<string, unknown>][] = [
    ["unknown action", { action: "jump" }],
    ["player 0", { player: 0 }],
    ["fractional player", { player: 1.5 }],
    ["player over the maximum", { player: MAX_PLAYERS + 1 }],
    ["player as text", { player: "1" }],
    ["unknown source", { source: "gamepad2" }],
    ["unknown state", { state: "held" }],
    ["repeat not a boolean", { repeat: "no" }],
    ["repeating up", { state: "up", repeat: true }],
  ];

  it.each(badInputs)("ignores an input with a bad field (%s)", (_name, fields) => {
    const { send, inputs, api } = setup();
    send({ type: "input", action: "confirm", state: "down", repeat: false, source: "remote", player: 1, ...fields });
    expect(inputs()).toEqual([]);
    expect(api.input.isDown("confirm")).toBe(false);
  });

  it("ignores every kind of bad message without throwing", () => {
    const { deliver, events } = setup();
    expect(() => {
      deliver(42);
      deliver(null);
      deliver("{not json");
      deliver("x".repeat(MAX_MESSAGE_LENGTH + 1));
      deliver(JSON.stringify({ type: "input", action: "confirm" }).padEnd(MAX_MESSAGE_LENGTH + 1));
      deliver("[]");
      deliver('"text"');
      deliver('{"no":"type"}');
      deliver('{"type":"launch-missiles"}');
      deliver('{"type":7}');
    }).not.toThrow();
    expect(events).toEqual([]);
  });

  it("reports each kind once, to the console and to SlimTV", () => {
    const { deliver, warn, sent } = setup();
    deliver('{"type":"one"}');
    deliver('{"type":"two"}');
    deliver("{bad");
    deliver("{bad");
    expect(warn).toHaveBeenCalledTimes(2);
    const warnings = sent.filter((m) => m.type === "log" && m.level === "warn");
    expect(warnings).toHaveLength(2);
    expect(String(warnings[0]?.message)).toContain("unknown-type");
    expect(String(warnings[1]?.message)).toContain("not-json");
  });

  it("reports every one of the seven kinds exactly once, however often each arrives", () => {
    const { deliver, warn, sent } = setup();
    const examples: [string, unknown][] = [
      ["not-a-string", 42],
      ["too-long", "x".repeat(MAX_MESSAGE_LENGTH + 1)],
      ["not-json", "{bad"],
      ["no-type", "[]"],
      ["unknown-type", '{"type":"launch-missiles"}'],
      ["bad-input", JSON.stringify({ type: "input", action: "jump", state: "down", repeat: false, source: "remote", player: 1 })],
      ["bad-stick", JSON.stringify({ type: "stick", stick: "middle", x: 0, y: 0, player: 1 })],
    ];
    for (let round = 0; round < 3; round++) for (const [, data] of examples) deliver(data);
    expect(warn).toHaveBeenCalledTimes(examples.length);
    const warnings = sent.filter((m) => m.type === "log" && m.level === "warn").map((m) => String(m.message));
    expect(warnings).toHaveLength(examples.length);
    examples.forEach(([kind], i) => expect(warnings[i]).toContain(`(${kind})`));
  });

  it("survives a listener that throws", () => {
    const { win, press, api } = setup();
    win.addEventListener("slimtv:input", () => {
      throw new Error("game bug");
    });
    expect(() => press()).not.toThrow();
    expect(api.input.isDown("confirm")).toBe(true);
  });
});

describe("native transport and config", () => {
  it("reads the device from __SLIMTV_CONFIG__ and falls back when it's missing or malformed", () => {
    const win = newWindow();
    expect(readDevice(win)).toEqual({ name: "unknown", tier: "tv" });
    win.__SLIMTV_CONFIG__ = { device: { name: "Onn 4K Pro Gen 2", tier: "tv" } };
    expect(readDevice(win)).toEqual({ name: "Onn 4K Pro Gen 2", tier: "tv" });
    (win as { __SLIMTV_CONFIG__?: unknown }).__SLIMTV_CONFIG__ = { device: { name: 5, extra: 1 } };
    expect(readDevice(win)).toEqual({ name: "unknown", tier: "tv" });
  });

  it("talks through postMessage and the message listener", () => {
    const win = newWindow();
    const posted: string[] = [];
    let listener: ((event: { data: unknown }) => void) | undefined;
    win.SlimTVNative = {
      postMessage: (m) => posted.push(m),
      addEventListener: (_type, l) => {
        listener = l;
      },
    };
    const transport = nativeTransport(win);
    const got: unknown[] = [];
    transport?.send("hi");
    transport?.listen((data) => got.push(data));
    listener?.({ data: "from native" });
    expect(posted).toEqual(["hi"]);
    expect(got).toEqual(["from native"]);
  });

  it("treats a native object without addEventListener as missing", () => {
    const win = newWindow();
    (win as { SlimTVNative?: unknown }).SlimTVNative = { postMessage: () => {} };
    expect(nativeTransport(win)).toBeNull();
  });
});

describe("the built dist/slimtv-shim.js", () => {
  async function runBuilt(win: ShimWindow): Promise<void> {
    // As SlimTV injects it: the config line, then the shim, as one script.
    const shim = await readFile(new URL("../dist/slimtv-shim.js", import.meta.url), "utf8");
    const config = { device: { name: 'Onn "4K" Pro\nGen 2', tier: "tv" } };
    const code = `window.__SLIMTV_CONFIG__ = ${JSON.stringify(config)};\n${shim}`;
    new Function("window", "console", code)(win, win.console);
  }

  function nativePage() {
    const win = newWindow();
    const posted: Record<string, unknown>[] = [];
    const listeners: ((event: { data: unknown }) => void)[] = [];
    win.SlimTVNative = {
      postMessage: (m) => posted.push(JSON.parse(m)),
      addEventListener: (_type, l) => listeners.push(l),
    };
    const fromNative = (message: unknown) => {
      for (const l of listeners) l({ data: JSON.stringify(message) });
    };
    return { win, posted, listeners, fromNative };
  }

  it("works end to end over SlimTVNative", async () => {
    const { win, posted, fromNative } = nativePage();
    await runBuilt(win);
    const api = win.SlimTV as SlimTVApi;
    expect(api.bridge).toBe(RELEASE_NAME);
    expect(api.device.name).toBe('Onn "4K" Pro\nGen 2');
    expect(posted[0]).toEqual({ type: "hello", bridge: RELEASE_NAME });
    const seen: unknown[] = [];
    win.addEventListener("slimtv:input", (e) => seen.push((e as CustomEvent).detail));
    fromNative({ type: "input", action: "back", state: "down", repeat: false, source: "remote", player: 1 });
    expect(seen).toHaveLength(1);
    expect(api.input.isDown("back")).toBe(true);
    api.ready();
    expect(posted.at(-1)).toEqual({ type: "ready" });
  });

  it("is harmless when injected twice", async () => {
    const { win, posted, listeners, fromNative } = nativePage();
    await runBuilt(win);
    const first = win.SlimTV;
    await runBuilt(win);
    expect(win.SlimTV).toBe(first);
    expect(posted.filter((m) => m.type === "hello")).toHaveLength(1);
    expect(listeners).toHaveLength(1);
    const seen: unknown[] = [];
    win.addEventListener("slimtv:input", (e) => seen.push((e as CustomEvent).detail));
    fromNative({ type: "input", action: "up", state: "down", repeat: false, source: "remote", player: 1 });
    expect(seen).toHaveLength(1);
  });
});
