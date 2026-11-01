// @vitest-environment happy-dom
// Tests for the fake bridge (src/fake/): a game in TV mode on a computer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InputDetail } from "../src/contract";
import { BACK_HOLD_MS, installFakeBridge, PAUSE_KEY, type FakeBridge } from "../src/fake/index";
import * as kit from "../src/kit/index";
import { resetChecks } from "../src/kit/slimtv";

let bridge: FakeBridge | null = null;

function install(): FakeBridge {
  bridge = installFakeBridge();
  if (!bridge) throw new Error("the fake bridge did not install");
  return bridge;
}

function key(type: "keydown" | "keyup", code: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** Every slimtv:* event the page sees, briefly. */
function watch() {
  const seen: string[] = [];
  const onInput = (e: Event) => {
    const d = (e as CustomEvent<InputDetail>).detail;
    seen.push(`${d.action} ${d.state}${d.repeat ? " repeat" : ""} ${d.source} p${d.player}`);
  };
  const onPause = () => seen.push("pause");
  const onResume = () => seen.push("resume");
  window.addEventListener("slimtv:input", onInput);
  window.addEventListener("slimtv:pause", onPause);
  window.addEventListener("slimtv:resume", onResume);
  return seen;
}

const toasts = () =>
  [...document.querySelectorAll("[data-slimtv-fake-bridge] > div")].map((n) => n.textContent ?? "");

beforeEach(() => {
  resetChecks();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  bridge?.uninstall();
  bridge = null;
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  delete (window as { SlimTVNative?: unknown }).SlimTVNative;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("installing", () => {
  it("installs the real shim, which the kit recognizes", () => {
    install();
    expect(kit.isSlimTV()).toBe(true);
    expect(kit.bridgeRelease()).toBe(kit.RELEASE_NAME);
    expect(kit.device()?.tier).toBe("tv");
    const input = kit.createInput();
    expect(input.mode).toBe("slimtv");
    input.dispose();
  });

  it("does nothing the second time", () => {
    install();
    const seen = watch();
    expect(installFakeBridge()).toBeNull();
    key("keydown", "Enter");
    expect(seen).toEqual(["confirm down remote p1"]);
  });

  it("removes its listeners on uninstall, and a second uninstall is harmless", () => {
    const first = install();
    first.uninstall();
    const pageKeys: string[] = [];
    window.addEventListener("keydown", (e) => pageKeys.push(e.code));
    key("keydown", "Enter");
    expect(pageKeys).toEqual(["Enter"]);
    expect("SlimTV" in window).toBe(false);
    const second = install();
    first.uninstall();
    expect(window.SlimTV).toBeDefined();
    second.uninstall();
  });

  it("does nothing when a bridge is already in the page", () => {
    Object.defineProperty(window, "SlimTV", { value: {}, configurable: true });
    expect(installFakeBridge()).toBeNull();
    delete (window as { SlimTV?: unknown }).SlimTV;
  });
});

describe("keyboard as the remote", () => {
  it("sends mapped keys through the bridge and hides them from the page", () => {
    install();
    const seen = watch();
    const pageKeys: string[] = [];
    window.addEventListener("keydown", (e) => pageKeys.push(e.code));
    document.addEventListener("keydown", (e) => pageKeys.push(e.code));
    const down = key("keydown", "ArrowLeft");
    key("keydown", "ArrowLeft", { repeat: true });
    key("keyup", "ArrowLeft");
    expect(seen).toEqual([
      "left down remote p1",
      "left down repeat remote p1",
      "left up remote p1",
    ]);
    expect(pageKeys).toEqual([]);
    expect(down.defaultPrevented).toBe(true);
  });

  it("sends keys for buttons the remote lacks as the first controller", () => {
    install();
    const seen = watch();
    key("keydown", "Tab");
    key("keydown", "KeyZ");
    key("keydown", "Enter");
    expect(seen).toEqual(["menu down gamepad p1", "action1 down gamepad p1", "confirm down remote p1"]);
  });

  it("hides the release of a mapped key it wasn't tracking", () => {
    install();
    const pageKeys: string[] = [];
    window.addEventListener("keyup", (e) => pageKeys.push(e.code));
    key("keyup", "Enter"); // held since before the bridge, a pause or a blur
    key("keyup", "KeyQ");
    expect(pageKeys).toEqual(["KeyQ"]);
  });

  it("leaves the release of a shortcut visible to the page", () => {
    install();
    const pageKeys: string[] = [];
    window.addEventListener("keydown", (e) => pageKeys.push(`down ${e.code}`));
    window.addEventListener("keyup", (e) => pageKeys.push(`up ${e.code}`));
    key("keydown", "KeyZ", { ctrlKey: true });
    key("keyup", "KeyZ", { ctrlKey: true });
    // Ctrl let go first: the Z's release has no Ctrl on it, and must still reach the page.
    key("keydown", "KeyZ", { ctrlKey: true });
    key("keyup", "KeyZ");
    expect(pageKeys).toEqual(["down KeyZ", "up KeyZ", "down KeyZ", "up KeyZ"]);
    // A plain Z afterwards is the game's again.
    key("keydown", "KeyZ");
    key("keyup", "KeyZ");
    expect(pageKeys).toHaveLength(4);
  });

  it("releases held keys when the window loses focus", () => {
    install();
    kit.ready();
    const seen = watch();
    key("keydown", "ArrowUp");
    window.dispatchEvent(new Event("blur"));
    expect(seen).toEqual(["up down remote p1", "up up remote p1"]);
  });

  it("lets unmapped keys and typing in text boxes through", () => {
    install();
    const seen = watch();
    const pageKeys: string[] = [];
    window.addEventListener("keydown", (e) => pageKeys.push(e.code));
    key("keydown", "KeyQ");
    const box = document.createElement("input");
    document.body.append(box);
    key("keydown", "KeyW", {}, box);
    expect(seen).toEqual([]);
    expect(pageKeys).toEqual(["KeyQ", "KeyW"]);
  });

  it("works with the kit's createInput, with no doubled input", () => {
    install();
    const input = kit.createInput();
    const seen: string[] = [];
    input.on((d) => seen.push(`${d.action} ${d.state}`));
    key("keydown", "Enter");
    key("keyup", "Enter");
    expect(seen).toEqual(["confirm down", "confirm up"]);
    input.dispose();
  });
});

describe("pause and resume", () => {
  it("toggles with F9, hiding the key from the page", () => {
    install();
    const seen = watch();
    const pageKeys: string[] = [];
    window.addEventListener("keydown", (e) => pageKeys.push(e.code));
    key("keydown", PAUSE_KEY);
    key("keyup", PAUSE_KEY);
    key("keydown", PAUSE_KEY);
    expect(seen).toEqual(["pause", "resume"]);
    expect(pageKeys).toEqual([]);
    expect(toasts().some((t) => t.includes("Paused"))).toBe(true);
  });

  it("forgets held buttons on pause and sends nothing until resume", () => {
    install();
    const seen = watch();
    key("keydown", "Enter");
    key("keydown", PAUSE_KEY);
    expect(window.SlimTV?.input.isDown("confirm")).toBe(false);
    key("keyup", "Enter");
    key("keydown", "KeyZ");
    key("keydown", PAUSE_KEY);
    key("keydown", "KeyX");
    expect(seen).toEqual(["confirm down remote p1", "pause", "resume", "action2 down gamepad p1"]);
  });

  it("lets the kit release held buttons on pause", () => {
    install();
    const input = kit.createInput();
    const seen: string[] = [];
    input.on((d) => seen.push(`${d.action} ${d.state}`));
    key("keydown", "ArrowRight");
    key("keydown", PAUSE_KEY);
    expect(seen).toEqual(["right down", "right up"]);
    input.dispose();
  });
});

describe("ready, exit and log", () => {
  it("shows what SlimTV would do", () => {
    install();
    kit.ready();
    kit.exit();
    expect(toasts()).toEqual([
      "ready(): SlimTV would hide its loading screen.",
      "exit(): SlimTV would return to the home screen.",
    ]);
  });

  it("writes logs to the console", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    install();
    kit.log("warn", "low fuel");
    expect(warn).toHaveBeenCalledWith("[SlimTV log]", "low fuel");
  });
});

describe("the escape hatches", () => {
  it("blocks Back before ready() and says SlimTV would exit", () => {
    install();
    const seen = watch();
    key("keydown", "Escape");
    key("keyup", "Escape");
    expect(seen).toEqual([]);
    expect(toasts()).toEqual(["Back before ready(): SlimTV would exit to the home screen now."]);
    kit.ready();
    key("keydown", "Escape");
    expect(seen).toEqual(["back down remote p1"]);
  });

  it("says SlimTV would exit when Back is held for 1 second", () => {
    vi.useFakeTimers();
    install();
    kit.ready();
    key("keydown", "Escape");
    vi.advanceTimersByTime(BACK_HOLD_MS - 1);
    expect(toasts().filter((t) => t.startsWith("Back held"))).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(toasts().filter((t) => t.startsWith("Back held"))).toHaveLength(1);
  });

  it("doesn't when the game pauses before the second is up", () => {
    vi.useFakeTimers();
    install();
    kit.ready();
    key("keydown", "Escape");
    vi.advanceTimersByTime(BACK_HOLD_MS / 2);
    key("keydown", PAUSE_KEY);
    vi.advanceTimersByTime(BACK_HOLD_MS);
    expect(toasts().filter((t) => t.startsWith("Back held"))).toEqual([]);
  });

  it("keeps a blocked Back blocked, even if ready() comes while it is held", () => {
    install();
    const seen = watch();
    key("keydown", "Escape");
    kit.ready();
    key("keydown", "Escape", { repeat: true });
    key("keyup", "Escape");
    expect(seen).toEqual([]);
    key("keydown", "Escape");
    expect(seen).toEqual(["back down remote p1"]);
  });

  it("doesn't when Back is let go in time", () => {
    vi.useFakeTimers();
    install();
    kit.ready();
    key("keydown", "Escape");
    vi.advanceTimersByTime(BACK_HOLD_MS / 2);
    key("keyup", "Escape");
    vi.advanceTimersByTime(BACK_HOLD_MS);
    expect(toasts().filter((t) => t.startsWith("Back held"))).toEqual([]);
  });
});

describe("controllers", () => {
  const buttons = (pressed: number[]) => Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  afterEach(() => {
    delete (navigator as { getGamepads?: unknown }).getGamepads;
  });

  it("block a controller's Back before ready()", async () => {
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [{ index: 0, mapping: "standard", connected: true, buttons: buttons([1]), axes: [0, 0] }],
      configurable: true,
    });
    install();
    const seen = watch();
    window.dispatchEvent(new Event("gamepadconnected"));
    await vi.waitFor(() => expect(toasts()).toContain("Back before ready(): SlimTV would exit to the home screen now."));
    expect(seen).toEqual([]);
  });

  it("send nothing while paused, and keep their player numbers across a pause", async () => {
    let pads: unknown[] = [
      { index: 0, mapping: "standard", connected: true, buttons: buttons([]), axes: [0, 0] },
      { index: 1, mapping: "standard", connected: true, buttons: buttons([]), axes: [0, 0] },
    ];
    Object.defineProperty(navigator, "getGamepads", { value: () => pads, configurable: true });
    install();
    const seen = watch();
    window.dispatchEvent(new Event("gamepadconnected"));
    await frames();
    pads = [null, { index: 1, mapping: "standard", connected: true, buttons: buttons([]), axes: [0, 0] }];
    await frames();
    key("keydown", PAUSE_KEY);
    pads = [null, { index: 1, mapping: "standard", connected: true, buttons: buttons([3]), axes: [0, 0] }];
    await frames();
    expect(seen).toEqual(["pause"]);
    key("keydown", PAUSE_KEY);
    await vi.waitFor(() => expect(seen).toEqual(["pause", "resume", "action2 down gamepad p2"]));
  });

  it("send gamepad input through the bridge", async () => {
    const buttons = (pressed: number[]) => Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
    let pads: unknown[] = [{ index: 0, mapping: "standard", connected: true, buttons: buttons([3]), axes: [0, 0] }];
    Object.defineProperty(navigator, "getGamepads", { value: () => pads, configurable: true });
    install();
    const seen = watch();
    window.dispatchEvent(new Event("gamepadconnected"));
    await vi.waitFor(() => expect(seen).toEqual(["action2 down gamepad p1"]));
    pads = [];
    await vi.waitFor(() => expect(seen).toEqual(["action2 down gamepad p1", "action2 up gamepad p1"]));
  });
});

describe("the auto-install entry", () => {
  async function importAuto(): Promise<void> {
    vi.resetModules();
    await import("../src/fake/auto");
  }

  afterEach(() => {
    // The auto entry has no handle to uninstall with, so clean up what it installed. Its key
    // listeners stay on this page, so keep this block last in the file.
    delete (window as { SlimTV?: unknown }).SlimTV;
    delete (window as unknown as Record<symbol, unknown>)[Symbol.for("slimtv-game-bridge.fake")];
  });

  it("installs only with ?platform=slimtv&fakebridge=1", async () => {
    window.history.replaceState(null, "", "/?platform=slimtv");
    await importAuto();
    expect("SlimTV" in window).toBe(false);
    window.history.replaceState(null, "", "/?platform=slimtv&fakebridge=1");
    await importAuto();
    expect("SlimTV" in window).toBe(true);
  });

  it("needs both address parts", async () => {
    window.history.replaceState(null, "", "/?fakebridge=1");
    await importAuto();
    expect("SlimTV" in window).toBe(false);
  });

  it("stays out of the way when a shim is already in the page", async () => {
    window.history.replaceState(null, "", "/?platform=slimtv&fakebridge=1");
    const existing = { already: true };
    Object.defineProperty(window, "SlimTV", { value: existing, configurable: true });
    await importAuto();
    expect(window.SlimTV).toBe(existing);
  });

  it("stays out of the way inside the real SlimTV", async () => {
    window.history.replaceState(null, "", "/?platform=slimtv&fakebridge=1");
    (window as { SlimTVNative?: unknown }).SlimTVNative = { postMessage() {}, addEventListener() {} };
    await importAuto();
    expect("SlimTV" in window).toBe(false);
  });
});
