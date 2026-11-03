// The keyboard keys the kit's desktop input reads for each action. Keys are KeyboardEvent.code
// values: physical positions, so WASD stays WASD on any keyboard layout.

import type { Action } from "../contract";

/** Keys for each action. An action left out has no keys. */
export type Keymap = Readonly<Partial<Record<Action, readonly string[]>>>;

export const DEFAULT_KEYMAP: Keymap = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  confirm: ["Enter", "NumpadEnter", "Space"],
  back: ["Escape", "Backspace"],
  menu: ["Tab"],
  action1: ["KeyZ"],
  action2: ["KeyX"],
  l1: ["KeyQ"],
  r1: ["KeyE"],
  l2: ["Digit1"],
  r2: ["Digit3"],
  l3: ["KeyC"],
  r3: ["KeyV"],
};
