// Compile-only checks for src/contract.ts, run by `npm run typecheck`. Nothing here executes.
// Each @ts-expect-error line must fail to compile; if one starts compiling, the types got looser.

import type {
  Action,
  InputDetail,
  NativeToShimMessage,
  ShimToNativeMessage,
  SlimTVApi,
} from "../src/contract";
import { ACTIONS } from "../src/contract";

// The global window event map is merged, so a game gets a typed detail with no casts.
window.addEventListener("slimtv:input", (event) => {
  const action: Action = event.detail.action;
  const player: number = event.detail.player;
  void action;
  void player;
});
window.addEventListener("slimtv:pause", (event) => void event.type);

// window.SlimTV is optional: code must check for it.
// @ts-expect-error SlimTV may be undefined outside SlimTV
window.SlimTV.ready();
window.SlimTV?.input.isDown("confirm");
window.SlimTV?.input.isDown("confirm", 2);
// @ts-expect-error "jump" is not an action
window.SlimTV?.input.isDown("jump");
window.SlimTV?.input.isDown("r2", 1);
const position: { x: number; y: number } | undefined = window.SlimTV?.input.stick("right", 2);
void position;
// @ts-expect-error "middle" is not a stick
window.SlimTV?.input.stick("middle");

// ACTIONS and Action agree.
const first: Action = ACTIONS[0];
void first;

// Wire messages are discriminated by "type".
function describe(message: NativeToShimMessage): string {
  switch (message.type) {
    case "input":
      return `${message.action} ${message.state} p${message.player}`;
    case "stick":
      return `${message.stick} ${message.x},${message.y} p${message.player}`;
    case "pause":
    case "resume":
      return message.type;
  }
}
void describe;

const hello: ShimToNativeMessage = { type: "hello", bridge: "Steady Heron" };
void hello;
// @ts-expect-error a log message needs a level
const badLog: ShimToNativeMessage = { type: "log", message: "x" };
void badLog;
// @ts-expect-error "gamepad2" is not a source
const badDetail: InputDetail = { action: "up", state: "down", repeat: false, source: "gamepad2", player: 1 };
void badDetail;

// @ts-expect-error an "up" never repeats
const upRepeat: InputDetail = { action: "up", state: "up", repeat: true, source: "remote", player: 1 };
void upRepeat;

// SlimTVApi's fields are read-only.
declare const api: SlimTVApi;
// @ts-expect-error bridge is read-only
api.bridge = "Other Name";
