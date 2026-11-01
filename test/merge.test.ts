// Tests for merging the keyboard and controllers (src/merge.ts).

import { describe, expect, it } from "vitest";
import type { InputDetail } from "../src/contract";
import { mergeInputs } from "../src/merge";

const down = (repeat = false): InputDetail => ({ action: "menu", state: "down", repeat, source: "gamepad", player: 1 });
const up: InputDetail = { action: "menu", state: "up", repeat: false, source: "gamepad", player: 1 };

describe("mergeInputs", () => {
  it("goes down with the first holder and up with the last", () => {
    const out: string[] = [];
    const from = mergeInputs((d) => out.push(`${d.state}${d.repeat ? " repeat" : ""}`));
    const keys = from("keyboard");
    const pads = from("gamepads");
    pads(down());
    keys(down());
    keys(down(true));
    keys(up);
    expect(out).toEqual(["down", "down repeat"]);
    pads(up);
    expect(out).toEqual(["down", "down repeat", "up"]);
  });

  it("ignores an up or repeat from a reader that isn't holding", () => {
    const out: string[] = [];
    const from = mergeInputs((d) => out.push(d.state));
    from("keyboard")(up);
    from("keyboard")(down(true));
    expect(out).toEqual([]);
  });
});
