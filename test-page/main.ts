// The bridge test page: SlimTV opens it like a game, to check SlimTV's side of the contract on the
// TV. On a computer, ?platform=slimtv&fakebridge=1 runs it under the fake bridge instead.

import "../src/fake/auto";
import { ACTIONS, STICKS, type InputDetail } from "../src/contract";
import { bridgeRelease, createInput, device, exit, isSlimTV, log, onPause, onResume, ready, RELEASE_NAME } from "../src/kit/index";

declare global {
  interface Window {
    __shimFirst?: boolean;
    __slimtvConsole?: string[];
  }
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const time = (): string => new Date().toLocaleTimeString([], { hour12: false });

function row(list: HTMLElement, label: string, value: string, tone?: "ok" | "bad" | "warn"): void {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  if (tone) dd.className = tone;
  list.append(dt, dd);
}

// ----- Header: releases, and whether the shim came first --------------------------------------

const fake = new URLSearchParams(location.search).get("fakebridge") === "1";
const bridge = bridgeRelease();
$("releases").textContent =
  `shim: ${bridge ?? "none"} · kit: ${RELEASE_NAME}` + (bridge && bridge !== RELEASE_NAME ? " (different!)" : "");
const first = $("shim-first");
if (window.__shimFirst) {
  first.textContent = "Shim arrived before page scripts";
  first.className = "ok";
} else if (bridge && fake) {
  first.textContent = "Fake bridge (on a computer)";
  first.className = "warn";
} else if (bridge) {
  first.textContent = "Shim arrived after page scripts";
  first.className = "bad";
} else {
  first.textContent = isSlimTV() ? "TV mode, but no bridge" : "Not in SlimTV";
  first.className = "bad";
}

// ----- Input log and counter ------------------------------------------------------------------

const logList = $("log");
const countLabel = $("count");
let received = 0;
function addLog(text: string, tone?: "ok" | "bad" | "warn"): void {
  const li = document.createElement("li");
  li.textContent = `${time()}  ${text}`;
  if (tone) li.className = tone;
  logList.prepend(li);
  while (logList.children.length > 40) logList.lastElementChild?.remove();
}
function countEvent(): void {
  received++;
  countLabel.textContent = `(${received} from SlimTV)`;
}

const input = createInput();
input.on((d: InputDetail) => {
  queueDraw();
  countEvent();
  addLog(`${d.action.padEnd(8)} ${d.state.padEnd(4)} ${d.repeat ? "repeat" : "      "} ${d.source.padEnd(7)} p${d.player}`);
  if (d.state !== "down") return;
  if (d.action === "left" || d.action === "right") moveFocus(d.action === "left" ? -1 : 1);
  if (d.action === "confirm" && !d.repeat && document.activeElement instanceof HTMLButtonElement) {
    document.activeElement.click();
  }
});
onPause(() => {
  countEvent();
  addLog("pause", "warn");
  log("info", "bridge test: paused");
});
onResume(() => {
  countEvent();
  addLog("resume", "ok");
});

// ----- Held-now grid --------------------------------------------------------------------------
// Redrawn only when an input or a pause could have changed it, at most once a frame, and only the
// cells that changed. This page measures the TV, so it must not keep the TV busy while idle. The
// window's own slimtv:* events are heard as well as the kit's handler: the kit doesn't pass on the
// "up" for a button that was already held when the page loaded, and the grid would keep it down.

const PLAYERS = [1, 2, 3, 4];
/** The grid's columns: any player, then each player. */
const COLUMNS = [undefined, ...PLAYERS];
const grid = $<HTMLTableElement>("grid");
const head = grid.insertRow();
for (const label of ["Action", "Any", ...PLAYERS.map((p) => `P${p}`)]) {
  const th = document.createElement("th");
  th.textContent = label;
  head.append(th);
}
const cells = ACTIONS.map((action) => {
  const tr = grid.insertRow();
  tr.insertCell().textContent = action;
  return { action, row: COLUMNS.map(() => ({ cell: tr.insertCell(), held: false })) };
});
function drawGrid(): void {
  for (const { action, row } of cells) {
    for (let i = 0; i < COLUMNS.length; i++) {
      const entry = row[i]!;
      const held = input.isDown(action, COLUMNS[i]);
      if (held === entry.held) continue;
      entry.held = held;
      entry.cell.className = held ? "held" : "";
      entry.cell.textContent = held ? "down" : "";
    }
  }
}
let drawQueued = false;
function queueDraw(): void {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    drawGrid();
  });
}
drawGrid();
addEventListener("slimtv:input", queueDraw);
addEventListener("slimtv:pause", queueDraw);

// ----- Sticks-now table -----------------------------------------------------------------------
// Stick positions arrive with no event, so they are read ten times a second, and a cell is
// written only when its text changes.

const sticksTable = $<HTMLTableElement>("sticks");
const sticksHead = sticksTable.insertRow();
for (const label of ["Player", ...STICKS.map((s) => `${s[0]!.toUpperCase()}${s.slice(1)}`)]) {
  const th = document.createElement("th");
  th.textContent = label;
  sticksHead.append(th);
}
const stickCells = PLAYERS.map((player) => {
  const tr = sticksTable.insertRow();
  tr.insertCell().textContent = `P${player}`;
  return { player, row: STICKS.map((stick) => ({ stick, cell: tr.insertCell(), text: "" })) };
});
const axis = (value: number): string => (value < 0 ? "" : "+") + value.toFixed(2);
function drawSticks(): void {
  for (const { player, row } of stickCells) {
    for (const entry of row) {
      const { x, y } = input.stick(entry.stick, player);
      const text = x === 0 && y === 0 ? "" : `${axis(x)} ${axis(y)}`;
      if (text === entry.text) continue;
      entry.text = text;
      entry.cell.textContent = text;
      entry.cell.className = text ? "held" : "";
    }
  }
}
drawSticks();
setInterval(drawSticks, 100);

// ----- Buttons and focus ----------------------------------------------------------------------

const buttons = [$<HTMLButtonElement>("ready"), $<HTMLButtonElement>("exit"), $<HTMLButtonElement>("tone")];
function moveFocus(step: number): void {
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = buttons[(at + step + buttons.length) % buttons.length] ?? buttons[0];
  next?.focus();
}
buttons[0]?.focus();

const readyHint = $("ready-hint");
readyHint.textContent = "Not ready yet: Back should leave at once.";
readyHint.className = "warn";
buttons[0]!.addEventListener("click", () => {
  ready();
  addLog("ready() sent", "ok");
  readyHint.textContent = "Ready sent: SlimTV's loading screen should be gone, and Back only leaves when held.";
  readyHint.className = "ok";
});
buttons[1]!.addEventListener("click", () => {
  addLog("exit() sent", "warn");
  exit();
});
buttons[2]!.addEventListener("click", () => void playTone("Play tone"));

// ----- Device and screen ----------------------------------------------------------------------

function drawScreen(): void {
  const list = $("screen");
  list.replaceChildren();
  const d = device();
  row(list, "Device", d ? `${d.name} (tier ${d.tier})` : "none");
  row(list, "Window", `${innerWidth} x ${innerHeight}`, innerWidth === 1920 && innerHeight === 1080 ? "ok" : "warn");
  row(list, "Pixel ratio", String(devicePixelRatio));
  row(list, "Visual viewport", visualViewport ? `${Math.round(visualViewport.width)} x ${Math.round(visualViewport.height)}, scale ${visualViewport.scale}` : "n/a");
  row(list, "Screen", `${screen.width} x ${screen.height}`);
  row(list, "Expected", "1920 x 1080 at pixel ratio 2 (provisional)", "warn");
  row(list, "User agent", navigator.userAgent);
}
drawScreen();
addEventListener("resize", drawScreen);

// ----- Audio with no button press -------------------------------------------------------------

async function playTone(trigger: string): Promise<void> {
  const list = $("audio");
  list.replaceChildren();
  row(list, "Started by", trigger);
  const Context = window.AudioContext;
  if (!Context) {
    row(list, "Web Audio", "not available", "bad");
    return;
  }
  const context = new Context();
  const tone = context.createOscillator();
  const gain = context.createGain();
  tone.frequency.value = 440;
  gain.gain.value = 0.08;
  tone.connect(gain).connect(context.destination);
  tone.start();
  tone.stop(context.currentTime + 0.4);
  await new Promise((r) => setTimeout(r, 500));
  const running = context.state === "running";
  const onTV = Boolean(bridge) && !fake;
  row(list, "Audio state", context.state, running ? "ok" : onTV ? "bad" : "warn");
  row(
    list,
    "Result",
    running
      ? "Allowed: you should have heard a short tone."
      : onTV
        ? "Blocked: most likely SlimTV's setMediaPlaybackRequiresUserGesture(false) is missing."
        : "Blocked, as a computer's browser does before the first click. Only the TV's result counts.",
    running ? "ok" : onTV ? "bad" : "warn",
  );
  void context.close();
}
void playTone("page load");

// ----- Storage across launches ----------------------------------------------------------------

const STORE = "bridge-test-launch";

async function drawStorage(): Promise<void> {
  const list = $("storage");
  const now = new Date().toISOString();
  const describe = (previous: string | null | undefined): [string, "ok" | "warn"] =>
    previous ? [`kept from ${new Date(previous).toLocaleString()}`, "ok"] : ["nothing saved before (first launch?)", "warn"];

  try {
    const previous = localStorage.getItem(STORE);
    localStorage.setItem(STORE, now);
    row(list, "localStorage", ...describe(previous));
  } catch (error) {
    row(list, "localStorage", `unavailable: ${String(error)}`, "bad");
  }

  const cookie = document.cookie.split("; ").find((c) => c.startsWith(`${STORE}=`));
  document.cookie = `${STORE}=${encodeURIComponent(now)}; max-age=31536000; path=/; SameSite=Lax; Secure`;
  row(list, "Cookie", ...describe(cookie ? decodeURIComponent(cookie.slice(STORE.length + 1)) : null));

  try {
    const previous = await new Promise<string | undefined>((resolve, reject) => {
      const open = indexedDB.open("bridge-test", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("launches");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const store = db.transaction("launches", "readwrite").objectStore("launches");
        const get = store.get("last");
        get.onsuccess = () => {
          store.put(now, "last");
          resolve(get.result as string | undefined);
        };
        get.onerror = () => reject(get.error);
        store.transaction.oncomplete = () => db.close();
      };
    });
    row(list, "IndexedDB", ...describe(previous));
  } catch (error) {
    row(list, "IndexedDB", `unavailable: ${String(error)}`, "bad");
  }
  row(list, "How to check", "Exit, open Bridge Test again, and each line should say kept.");
}
void drawStorage();

// ----- Shim warnings (bad messages from native) -----------------------------------------------

const warnings = $("warnings");
let shown = 0;
function drawWarnings(): void {
  const lines = window.__slimtvConsole ?? [];
  if (lines.length === shown) return;
  if (shown === 0) warnings.replaceChildren();
  for (const line of lines.slice(shown)) {
    const li = document.createElement("li");
    li.textContent = line;
    li.className = line.startsWith("error") ? "bad" : "warn";
    warnings.append(li);
  }
  shown = lines.length;
}
drawWarnings();
addEventListener("bridge-test:console", drawWarnings);
