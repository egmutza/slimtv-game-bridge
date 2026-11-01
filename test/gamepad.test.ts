// Tests for the controller reader (src/gamepad.ts): stick thresholds, D-pad and stick together,
// player numbers, and disconnects.

import { describe, expect, it } from "vitest";
import type { InputDetail } from "../src/contract";
import { createGamepadReader, type GamepadLike } from "../src/gamepad";

function pad(index: number, fields: { buttons?: number[]; axes?: number[]; mapping?: string } = {}): GamepadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: fields.buttons?.includes(i) ?? false }));
  return { index, mapping: fields.mapping ?? "standard", connected: true, buttons, axes: fields.axes ?? [0, 0, 0, 0] };
}

function setup() {
  const events: InputDetail[] = [];
  const warnings: string[] = [];
  const reader = createGamepadReader((d) => events.push(d), (w) => warnings.push(w));
  const brief = () => events.splice(0).map((e) => `${e.action} ${e.state} p${e.player}`);
  return { reader, events, warnings, brief };
}

describe("gamepad reader", () => {
  it("maps standard buttons to actions", () => {
    const { reader, brief } = setup();
    reader.read([pad(0, { buttons: [0, 1, 2, 3, 9] })]);
    expect(brief()).toEqual([
      "confirm down p1",
      "back down p1",
      "menu down p1",
      "action1 down p1",
      "action2 down p1",
    ]);
    reader.read([pad(0)]);
    expect(brief()).toHaveLength(5);
  });

  it("presses the stick at 0.5 and releases it below 0.35", () => {
    const { reader, brief } = setup();
    reader.read([pad(0, { axes: [0.49, 0] })]);
    expect(brief()).toEqual([]);
    reader.read([pad(0, { axes: [0.5, 0] })]);
    expect(brief()).toEqual(["right down p1"]);
    reader.read([pad(0, { axes: [0.36, 0] })]);
    reader.read([pad(0, { axes: [0.35, 0] })]);
    expect(brief()).toEqual([]);
    reader.read([pad(0, { axes: [0.34, 0] })]);
    expect(brief()).toEqual(["right up p1"]);
    reader.read([pad(0, { axes: [0, -0.9] })]);
    expect(brief()).toEqual(["up down p1"]);
  });

  it("sends one down and one up for a direction held by the D-pad and the stick", () => {
    const { reader, brief } = setup();
    reader.read([pad(0, { buttons: [14] })]);
    reader.read([pad(0, { buttons: [14], axes: [-1, 0] })]);
    reader.read([pad(0, { axes: [-1, 0] })]);
    expect(brief()).toEqual(["left down p1"]);
    reader.read([pad(0)]);
    expect(brief()).toEqual(["left up p1"]);
  });

  it("numbers players by the lowest free number, and frees it on disconnect after releasing", () => {
    const { reader, brief } = setup();
    reader.read([pad(0), pad(1, { buttons: [0] })]);
    expect(brief()).toEqual(["confirm down p2"]);
    reader.read([pad(0, { buttons: [0] }), null]);
    expect(brief()).toEqual(["confirm up p2", "confirm down p1"]);
    reader.read([pad(0, { buttons: [0] }), pad(1, { buttons: [1] })]);
    expect(brief()).toEqual(["back down p2"]);
  });

  it("keeps player 2's number when player 1 unplugs and comes back", () => {
    const { reader, brief } = setup();
    reader.read([pad(0), pad(1)]);
    reader.read([null, pad(1)]);
    reader.read([pad(2, { buttons: [0] }), pad(1, { buttons: [1] })]);
    // The returning controller (index 2) gets player 1 back; index 1 stays player 2.
    expect(brief().sort()).toEqual(["back down p2", "confirm down p1"]);
  });

  it("ignores controllers without the standard mapping, warning once", () => {
    const { reader, brief, warnings } = setup();
    reader.read([pad(0, { mapping: "", buttons: [0] })]);
    reader.read([pad(0, { mapping: "", buttons: [0] })]);
    expect(brief()).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("releases everything on releaseAll", () => {
    const { reader, brief } = setup();
    reader.read([pad(0, { buttons: [0] }), pad(1, { buttons: [12] })]);
    brief();
    reader.releaseAll();
    expect(brief()).toEqual(["confirm up p1", "up up p2"]);
  });

  it("never sends repeats", () => {
    const { reader, events } = setup();
    reader.read([pad(0, { buttons: [0] })]);
    reader.read([pad(0, { buttons: [0] })]);
    expect(events.every((e) => !e.repeat)).toBe(true);
  });
});
