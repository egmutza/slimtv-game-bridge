// Merges input from several readers (the keyboard and controllers) that can report the same action,
// source and player. On a computer, the keyboard's keys for controller-only buttons count as the
// first controller, so a key and a real controller can hold the same button at once. The button
// goes down with the first holder and up with the last, as for two controls on one controller.

import type { InputDetail } from "./contract";

/** Returns a function that gives each reader (by name) its own `emit`, merged into `emit`. */
export function mergeInputs(emit: (detail: InputDetail) => void): (reader: string) => (detail: InputDetail) => void {
  const holders = new Map<string, Set<string>>();
  return (reader) => (detail) => {
    const key = `${detail.action}|${detail.source}|${detail.player}`;
    let held = holders.get(key);
    if (!held) {
      held = new Set();
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
