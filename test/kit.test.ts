// @vitest-environment happy-dom
// Tests for the game kit (src/kit/) in a fake page, against the package entry games import.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InputDetail, SlimTVApi } from "../src/contract";
import { createShim, type ShimWindow } from "../src/shim/core";
import { resetChecks } from "../src/kit/slimtv";
import { SHIM_MARK } from "../src/mark";
import * as kit from "../src/kit/index";

const win = window as unknown as ShimWindow;

/** Installs the real shim over a fake transport, as if SlimTV injected it. */
function installShim() {
  const sent: Record<string, unknown>[] = [];
  let deliver: (data: unknown) => void = () => {};
  const api = createShim(
    win,
    { send: (j) => sent.push(JSON.parse(j)), listen: (fn) => (deliver = fn) },
    { name: "Onn 4K Pro Gen 2", tier: "tv" },
  ) as SlimTVApi;
  const fromNative = (fields: Partial<InputDetail>) =>
    deliver(
      JSON.stringify({ type: "input", action: "confirm", state: "down", repeat: false, source: "remote", player: 1, ...fields }),
    );
  return { api, sent, deliver: (message: unknown) => deliver(JSON.stringify(message)), fromNative };
}

function key(type: "keydown" | "keyup", code: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init }));
}

beforeEach(() => {
  resetChecks();
});

afterEach(() => {
  delete (navigator as { getGamepads?: unknown }).getGamepads;
  delete (window as { SlimTV?: unknown }).SlimTV;
  window.history.replaceState(null, "", "/");
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("importing", () => {
  it("adds no listeners and no globals", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const before = new Set(Object.keys(window));
    vi.resetModules();
    await import("slimtv-game-bridge");
    expect(add).not.toHaveBeenCalled();
    expect(Object.keys(window).filter((k) => !before.has(k))).toEqual([]);
  });
});

describe("outside SlimTV", () => {
  it("reports no TV and every call is a no-op", () => {
    expect(kit.isSlimTV()).toBe(false);
    expect(kit.device()).toBeNull();
    expect(kit.bridgeRelease()).toBeNull();
    expect(() => {
      kit.ready();
      kit.exit();
      kit.log("info", "x");
      kit.keepAwake();
    }).not.toThrow();
  });

  it("counts ?platform=slimtv as TV mode without the bridge", () => {
    window.history.replaceState(null, "", "/?platform=slimtv");
    expect(kit.isSlimTV()).toBe(true);
    expect(kit.device()).toBeNull();
  });
});

describe("inside SlimTV", () => {
  it("passes calls to window.SlimTV", () => {
    const { sent } = installShim();
    expect(kit.isSlimTV()).toBe(true);
    expect(kit.bridgeRelease()).toBe(kit.RELEASE_NAME);
    expect(kit.device()).toEqual({ name: "Onn 4K Pro Gen 2", tier: "tv" });
    kit.ready();
    kit.exit();
    kit.log("warn", "hello");
    kit.keepAwake();
    expect(sent.slice(1)).toEqual([
      { type: "ready" },
      { type: "exit" },
      { type: "log", level: "warn", message: "hello" },
      { type: "awake" },
    ]);
  });

  it("does nothing on keepAwake under an older shim that doesn't have it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const older = {
      bridge: "Brisk Otter",
      device: { name: "Onn 4K Pro Gen 2", tier: "tv" },
      ready() {},
      exit() {},
      log() {},
      input: { isDown: () => false, stick: () => ({ x: 0, y: 0 }) },
      [SHIM_MARK]: "Brisk Otter",
    };
    Object.defineProperty(window, "SlimTV", { value: older, configurable: true });
    expect(() => kit.keepAwake()).not.toThrow();
  });

  it("calls pause and resume handlers until they are removed", () => {
    const { deliver } = installShim();
    const calls: string[] = [];
    const stopPause = kit.onPause(() => calls.push("pause"));
    kit.onResume(() => calls.push("resume"));
    deliver({ type: "pause" });
    deliver({ type: "resume" });
    stopPause();
    deliver({ type: "pause" });
    expect(calls).toEqual(["pause", "resume"]);
  });

  it("warns once when the bridge's release differs from the kit's", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.fn();
    const other = { bridge: "Other Owl", device: { name: "x", tier: "tv" }, ready() {}, exit() {}, log, input: { isDown: () => false } };
    Object.defineProperty(other, SHIM_MARK, { value: "Other Owl" });
    Object.defineProperty(window, "SlimTV", { value: other, configurable: true });
    kit.ready();
    kit.isSlimTV();
    kit.device();
    expect(warn).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toBe("warn");
  });

  it("ignores a window.SlimTV the shim didn't create, warning once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Like the launcher's Java interface leaking into the game WebView: no input, no methods.
    Object.defineProperty(window, "SlimTV", { value: { launcher: true }, configurable: true });
    expect(kit.isSlimTV()).toBe(false);
    expect(kit.device()).toBeNull();
    expect(() => {
      kit.ready();
      kit.exit();
      kit.log("info", "x");
    }).not.toThrow();
    const input = kit.createInput({ gamepads: false });
    expect(input.mode).toBe("desktop");
    expect(() => input.isDown("confirm")).not.toThrow();
    input.dispose();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not warn when the releases match", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installShim();
    kit.ready();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("createInput inside SlimTV", () => {
  it("reads only the bridge, never the keyboard", () => {
    const { fromNative } = installShim();
    const input = kit.createInput();
    expect(input.mode).toBe("slimtv");
    const seen: InputDetail[] = [];
    input.on((d) => seen.push(d));
    key("keydown", "Enter");
    expect(seen).toEqual([]);
    fromNative({ action: "left", source: "gamepad", player: 2 });
    expect(seen).toEqual([{ action: "left", state: "down", repeat: false, source: "gamepad", player: 2 }]);
    expect(input.isDown("left", 2)).toBe(true);
    input.dispose();
  });

  it("sends an up for everything held when SlimTV pauses", () => {
    const { fromNative, deliver } = installShim();
    const input = kit.createInput();
    const seen: string[] = [];
    input.on((d) => seen.push(`${d.action} ${d.state} ${d.source} p${d.player}`));
    fromNative({ action: "right" });
    fromNative({ action: "confirm", source: "gamepad", player: 2 });
    deliver({ type: "pause" });
    expect(seen).toEqual([
      "right down remote p1",
      "confirm down gamepad p2",
      "right up remote p1",
      "confirm up gamepad p2",
    ]);
    expect(input.isDown("right")).toBe(false);
    // The real "up" arriving later is dropped by the shim, so nothing is doubled.
    fromNative({ action: "right", state: "up" });
    expect(seen).toHaveLength(4);
    input.dispose();
  });

  it("sees a button already held when the input is created", () => {
    const { fromNative, deliver } = installShim();
    fromNative({ action: "right" });
    const input = kit.createInput();
    expect(input.isDown("right")).toBe(true);
    deliver({ type: "pause" });
    expect(input.isDown("right")).toBe(false);
    input.dispose();
    fromNative({ action: "left" });
    expect(input.isDown("left")).toBe(false);
  });

  it("reports pressed() between poll() calls", () => {
    const { fromNative } = installShim();
    const input = kit.createInput();
    fromNative({ action: "back" });
    input.poll();
    expect(input.pressed("back")).toBe(true);
    expect(input.pressed("back", 1)).toBe(true);
    input.poll();
    expect(input.pressed("back")).toBe(false);
    input.dispose();
  });

  it("stops after dispose", () => {
    const { fromNative } = installShim();
    const input = kit.createInput();
    const handler = vi.fn();
    input.on(handler);
    input.dispose();
    fromNative({});
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("createInput on a computer", () => {
  it("maps keys by physical position, as the remote, player 1", () => {
    const input = kit.createInput({ gamepads: false });
    expect(input.mode).toBe("desktop");
    const seen: InputDetail[] = [];
    input.on((d) => seen.push(d));
    key("keydown", "KeyW");
    key("keyup", "KeyW");
    expect(seen).toEqual([
      { action: "up", state: "down", repeat: false, source: "remote", player: 1 },
      { action: "up", state: "up", repeat: false, source: "remote", player: 1 },
    ]);
    input.dispose();
  });

  it("keeps an action down until the last of its keys is released", () => {
    const input = kit.createInput({ gamepads: false });
    const seen: string[] = [];
    input.on((d) => seen.push(`${d.action} ${d.state}`));
    key("keydown", "KeyW");
    key("keydown", "ArrowUp");
    key("keyup", "KeyW");
    expect(input.isDown("up")).toBe(true);
    key("keyup", "ArrowUp");
    expect(input.isDown("up")).toBe(false);
    expect(seen).toEqual(["up down", "up up"]);
    input.dispose();
  });

  it("passes key repeats as repeats", () => {
    const input = kit.createInput({ gamepads: false });
    const seen: boolean[] = [];
    input.on((d) => seen.push(d.repeat));
    key("keydown", "Enter");
    key("keydown", "Enter", { repeat: true });
    expect(seen).toEqual([false, true]);
    input.dispose();
  });

  it("ignores typing in text boxes and shortcuts with modifier keys", () => {
    const input = kit.createInput({ gamepads: false });
    const handler = vi.fn();
    input.on(handler);
    const box = document.createElement("input");
    document.body.append(box);
    key("keydown", "KeyW", {}, box);
    key("keydown", "KeyS", { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
    input.dispose();
  });

  it("uses the game's own keymap", () => {
    const input = kit.createInput({ gamepads: false, keymap: { confirm: ["KeyJ"] } });
    const seen: string[] = [];
    input.on((d) => seen.push(d.action));
    key("keydown", "Enter");
    key("keydown", "KeyJ");
    expect(seen).toEqual(["confirm"]);
    input.dispose();
  });

  it("stops the browser's handling of mapped keys unless told not to", () => {
    const strict = kit.createInput({ gamepads: false });
    const event = new KeyboardEvent("keydown", { code: "Tab", cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const unmapped = new KeyboardEvent("keydown", { code: "KeyP", cancelable: true });
    window.dispatchEvent(unmapped);
    expect(unmapped.defaultPrevented).toBe(false);
    strict.dispose();

    const plain = kit.createInput({ gamepads: false, preventDefault: false });
    const event2 = new KeyboardEvent("keydown", { code: "Tab", cancelable: true });
    window.dispatchEvent(event2);
    expect(event2.defaultPrevented).toBe(false);
    plain.dispose();
  });

  it("releases held keys when the window loses focus or Cmd is pressed", () => {
    const input = kit.createInput({ gamepads: false });
    const seen: string[] = [];
    input.on((d) => seen.push(`${d.action} ${d.state}`));
    key("keydown", "Enter");
    window.dispatchEvent(new Event("blur"));
    expect(input.isDown("confirm")).toBe(false);
    key("keydown", "KeyD");
    key("keydown", "MetaLeft", { metaKey: true });
    expect(input.isDown("right")).toBe(false);
    expect(seen).toEqual(["confirm down", "confirm up", "right down", "right up"]);
    input.dispose();
  });

  it("goes quiet on dispose, even when called from a handler", () => {
    const input = kit.createInput({ gamepads: false });
    const seen: string[] = [];
    input.on((d) => {
      seen.push(`first ${d.action} ${d.state}`);
      if (d.action === "back") input.dispose();
    });
    input.on((d) => seen.push(`second ${d.action} ${d.state}`));
    key("keydown", "Enter");
    key("keydown", "Escape");
    expect(seen).toEqual(["first confirm down", "second confirm down", "first back down"]);
    expect(input.isDown("confirm")).toBe(false);
    key("keyup", "Enter");
    expect(seen).toHaveLength(3);
  });

  it("ignores typing in contenteditable elements", () => {
    const input = kit.createInput({ gamepads: false });
    const handler = vi.fn();
    input.on(handler);
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.append(editor);
    key("keydown", "KeyW", {}, editor);
    expect(handler).not.toHaveBeenCalled();
    input.dispose();
  });

  it("reports pressed() for the frame between two poll() calls", () => {
    const input = kit.createInput({ gamepads: false });
    key("keydown", "Enter");
    expect(input.pressed("confirm")).toBe(false);
    input.poll();
    expect(input.pressed("confirm")).toBe(true);
    expect(input.pressed("confirm", 1)).toBe(true);
    expect(input.pressed("confirm", 2)).toBe(false);
    key("keydown", "Enter", { repeat: true });
    input.poll();
    expect(input.pressed("confirm")).toBe(false);
    input.dispose();
  });

  it("reads controllers each frame while one is connected", async () => {
    let pads: unknown[] = [];
    Object.defineProperty(navigator, "getGamepads", { value: () => pads, configurable: true });
    const buttons = (pressed: number[]) => Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
    pads = [{ index: 0, mapping: "standard", connected: true, buttons: buttons([0]), axes: [0, 0] }];
    const input = kit.createInput();
    const seen: string[] = [];
    input.on((d) => seen.push(`${d.action} ${d.state} ${d.source} p${d.player}`));
    await vi.waitFor(() => expect(seen).toEqual(["confirm down gamepad p1"]));
    expect(input.isDown("confirm", 1)).toBe(true);
    pads = [];
    await vi.waitFor(() => expect(seen).toEqual(["confirm down gamepad p1", "confirm up gamepad p1"]));
    input.dispose();
  });

  it("keeps an action held by the keyboard and a controller down until both let go", async () => {
    const buttons = (pressed: number[]) => Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
    let pads: unknown[] = [{ index: 0, mapping: "standard", connected: true, buttons: buttons([0]), axes: [0, 0] }];
    Object.defineProperty(navigator, "getGamepads", { value: () => pads, configurable: true });
    const input = kit.createInput();
    await vi.waitFor(() => expect(input.isDown("confirm")).toBe(true));
    key("keydown", "Enter");
    pads = [{ index: 0, mapping: "standard", connected: true, buttons: buttons([]), axes: [0, 0] }];
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    expect(input.isDown("confirm", 1)).toBe(true);
    key("keyup", "Enter");
    expect(input.isDown("confirm")).toBe(false);
    input.dispose();
  });

  it("releases controllers when the window loses focus and reads them again on return", async () => {
    const buttons = (pressed: number[]) => Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
    const pads = [{ index: 0, mapping: "standard", connected: true, buttons: buttons([1]), axes: [0, 0] }];
    Object.defineProperty(navigator, "getGamepads", { value: () => pads, configurable: true });
    const input = kit.createInput();
    const seen: string[] = [];
    input.on((d) => seen.push(`${d.action} ${d.state}`));
    await vi.waitFor(() => expect(seen).toEqual(["back down"]));
    window.dispatchEvent(new Event("blur"));
    expect(seen).toEqual(["back down", "back up"]);
    expect(input.isDown("back")).toBe(false);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    expect(seen).toHaveLength(2);
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(seen).toEqual(["back down", "back up", "back down"]));
    input.dispose();
  });

  it("keeps menu down while Tab and the first controller's Start both hold it", async () => {
    const buttons = (pressed: number[]) => Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
    const pads = [{ index: 0, mapping: "standard", connected: true, buttons: buttons([9]), axes: [0, 0] }];
    Object.defineProperty(navigator, "getGamepads", { value: () => pads, configurable: true });
    const input = kit.createInput();
    const seen: string[] = [];
    input.on((d) => seen.push(`${d.action} ${d.state} ${d.source}`));
    await vi.waitFor(() => expect(seen).toEqual(["menu down gamepad"]));
    key("keydown", "Tab");
    key("keyup", "Tab");
    expect(input.isDown("menu", 1)).toBe(true);
    expect(seen).toEqual(["menu down gamepad"]);
    input.dispose();
  });

  it("gives up on controllers, warning once, where they can't be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getGamepads = vi.fn(() => {
      throw new Error("blocked by Permissions-Policy");
    });
    Object.defineProperty(navigator, "getGamepads", { value: getGamepads, configurable: true });
    const input = kit.createInput();
    await vi.waitFor(() => expect(getGamepads).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event("gamepadconnected"));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    expect(getGamepads).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    input.dispose();
  });
});

describe("stick positions", () => {
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const buttons = () => Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));

  it("asks the shim inside SlimTV", () => {
    const { deliver } = installShim();
    const input = kit.createInput();
    deliver({ type: "stick", stick: "right", x: 0.25, y: -1, player: 2 });
    expect(input.stick("right", 2)).toEqual({ x: 0.25, y: -1 });
    expect(input.stick("right")).toEqual({ x: 0.25, y: -1 });
    input.dispose();
    expect(input.stick("right", 2)).toEqual({ x: 0, y: 0 });
  });

  it("reads 0, 0 under an older shim that doesn't report sticks", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const older = {
      bridge: "Steady Heron",
      device: { name: "Onn 4K Pro Gen 2", tier: "tv" },
      ready() {},
      exit() {},
      log() {},
      input: { isDown: () => false },
      [SHIM_MARK]: "Steady Heron",
    };
    Object.defineProperty(window, "SlimTV", { value: older, configurable: true });
    const input = kit.createInput();
    expect(input.mode).toBe("slimtv");
    expect(input.stick("left")).toEqual({ x: 0, y: 0 });
    input.dispose();
  });

  it("reads controllers' sticks on a computer, and forgets them on dispose", async () => {
    let pads: unknown[] = [{ index: 0, mapping: "standard", connected: true, buttons: buttons(), axes: [0, 0, 1, 0] }];
    Object.defineProperty(navigator, "getGamepads", { value: () => pads, configurable: true });
    const input = kit.createInput();
    window.dispatchEvent(new Event("gamepadconnected"));
    await vi.waitFor(() => expect(input.stick("right", 1)).toEqual({ x: 1, y: 0 }));
    expect(input.stick("left", 1)).toEqual({ x: 0, y: 0 });
    pads = [{ index: 0, mapping: "standard", connected: true, buttons: buttons(), axes: [0, -1, 1, 0] }];
    await vi.waitFor(() => expect(input.stick("left")).toEqual({ x: 0, y: -1 }));
    window.dispatchEvent(new Event("blur"));
    expect(input.stick("right")).toEqual({ x: 0, y: 0 });
    window.dispatchEvent(new Event("focus"));
    await frames();
    expect(input.stick("right")).toEqual({ x: 1, y: 0 });
    input.dispose();
    expect(input.stick("right")).toEqual({ x: 0, y: 0 });
  });

  it("reads the new buttons from keys on a computer, as the first controller", () => {
    const input = kit.createInput({ gamepads: false });
    const seen: string[] = [];
    input.on((d) => seen.push(`${d.action} ${d.source}`));
    for (const code of ["KeyQ", "KeyE", "Digit1", "Digit3", "KeyC", "KeyV"]) key("keydown", code);
    expect(seen).toEqual(["l1 gamepad", "r1 gamepad", "l2 gamepad", "r2 gamepad", "l3 gamepad", "r3 gamepad"]);
    input.dispose();
  });
});
