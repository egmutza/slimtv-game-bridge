# slimtv-game-bridge

The JavaScript side of the contract between SlimTV (an Android TV home app) and the web games it
launches. [CONTRACT.md](CONTRACT.md) is the source of truth.

This repo ships three things:

- **The shim** (`dist/slimtv-shim.js`): the script SlimTV injects into every game page. It creates
  `window.SlimTV`.
- **The kit** (`slimtv-game-bridge`): what games import. TV detection, `ready()`, `exit()`, logging,
  pause and resume, and `createInput()`, one input layer that reads SlimTV on the TV and the
  keyboard and controllers on a computer, with the same rules.
- **The fake bridge** (`slimtv-game-bridge/fake/auto`): SlimTV imitated on a computer, for trying a
  game in TV mode without the TV.

Releases are named "Adjective Animal" and tagged in lowercase with hyphens: the first is Steady
Heron, tag `steady-heron`. What changed in each is in [CHANGELOG.md](CHANGELOG.md).

## Installing the kit in a game

```
npm install github:egmutza/slimtv-game-bridge#brisk-otter
```

Check that `package.json` names the tag itself (`github:egmutza/slimtv-game-bridge#brisk-otter`),
never a branch; `package-lock.json` then records the exact commit, so every build gets the same
code. Nothing is built on install: the package is the committed `dist/`.

```ts
import { createInput, isSlimTV, onPause, ready } from "slimtv-game-bridge";

if (isSlimTV()) {
  const input = createInput();
  input.on((press) => {
    // press.action is "up", "confirm", "back" and so on; press.state is "down" or "up".
  });
  // In the frame loop: where the right stick is pushed, x and y from -1 to 1.
  const { x, y } = input.stick("right");
  onPause(() => {
    // Pause the game loop and audio, and show the pause menu.
  });
}

// Once the game is loaded and interactive:
ready();
```

Importing the kit does nothing on its own. Outside SlimTV every call except `createInput()` is a
safe no-op. `createInput()` reads the keyboard and controllers on a computer, so a game that wants
phone and computer play untouched calls it only when `isSlimTV()` is true, as above. If the game's kit release differs from the shim SlimTV
injects, the kit logs one warning and carries on. Updating to a new release means changing the tag
and reading that release's entry in the changelog first: anything marked **BREAKING** needs SlimTV
and the game updated together.

## Pinning the shim in SlimTV

Each release on GitHub carries the shim and its SHA-256:

- <https://github.com/egmutza/slimtv-game-bridge/releases/download/brisk-otter/slimtv-shim.js>
- <https://github.com/egmutza/slimtv-game-bridge/releases/download/brisk-otter/slimtv-shim.js.sha256>

SlimTV keeps its own copy of the shim, checked against that hash
(`sha256sum -c slimtv-shim.js.sha256`), rather than fetching it at run time. When it injects the
shim, it puts `window.__SLIMTV_CONFIG__ = { device }` in front of it, written with a JSON encoder.
Everything else SlimTV's game WebView must do is in "Native side requirements" in
[CONTRACT.md](CONTRACT.md).

## The fake bridge

Import it first in the game's entry file:

```ts
import "slimtv-game-bridge/fake/auto";
```

Then open the game with `?platform=slimtv&fakebridge=1` in the address. Anywhere else, including
inside the real SlimTV, the import does nothing.

Left in a production build, it still does nothing on the TV, but every launch there loads about
12 KB of fake bridge code for no use. Anyone can also switch it on with that address in their own
browser tab. That only affects their own tab, but a game that wants none of it in production can
point the import at an empty file for production builds. With Vite, for example, in
`vite.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const empty = fileURLToPath(new URL("./src/empty.ts", import.meta.url));

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: mode === "production" ? { "slimtv-game-bridge/fake/auto": empty } : {},
  },
}));
```

where `src/empty.ts` is an empty file. The game then can't be tried under the fake bridge from a
production build, only from the dev server. To install it yourself instead, call
`installFakeBridge()` from `slimtv-game-bridge/fake` before the game calls `createInput()`; an
input created earlier stays in computer mode and won't hear the keyboard.

Keys are hidden from the page, as on the TV, where key presses never reach a game page. Typing in
a text box is left alone. The TV remote has only the arrows, OK and Back, so only those keys act
as the remote. The other keys in the table act as the first controller's buttons, as they would on
the TV: a game that needs any of those buttons can't be played with the remote alone. The sticks'
positions come only from a real controller; the keyboard has none.

| Action | Keys (player 1) | Controller |
| --- | --- | --- |
| `up`, `down`, `left`, `right` | Arrow keys, W A S D | D-pad, left stick |
| `confirm` | Enter, keypad Enter, Space | A / Cross |
| `back` | Escape, Backspace | B / Circle |
| `menu` | Tab (as a controller) | Start / Options |
| `action1` | Z (as a controller) | X / Square |
| `action2` | X (as a controller) | Y / Triangle |
| `l1`, `r1` (shoulders) | Q, E (as a controller) | LB, RB / L1, R1 / L, R |
| `l2`, `r2` (triggers) | 1, 3 (as a controller) | LT, RT / L2, R2 / ZL, ZR |
| `l3`, `r3` (sticks pressed in) | C, V (as a controller) | L3, R3 |
| `stick("left")`, `stick("right")` | | Left and right sticks |
| Pause and resume (like pressing Home) | F9 | |

Short notes at the bottom of the page show what SlimTV would do:

- `ready()`: SlimTV would hide its loading screen.
- `exit()`: SlimTV would return to the home screen.
- Back before `ready()`: SlimTV would exit at once. The game doesn't get that Back.
- Back held for 1 second: SlimTV would exit, whatever the game does.

Game logs (`log()`) go to the browser console.

What it can't show: on the TV, input never counts as a user gesture, so audio that waits for one
never starts. In a computer's browser a key press does count, so check audio on the TV itself.

## The bridge test page

SlimTV's built-in Bridge Test tile opens <https://egmutza.github.io/slimtv-game-bridge/test/>, built
from `test-page/` and published by GitHub Pages on every push to `main`. It checks SlimTV's side
of the contract on the TV:

- whether the shim arrived before the page's own scripts, and its release next to the kit's;
- every input and pause or resume event, with a live grid of held buttons per player;
- the window size, pixel ratio and screen the TV's browser reports;
- whether a tone can play at load with no button press;
- whether localStorage, a cookie and IndexedDB survive closing and reopening the page;
- any warnings the bridge logs (the shim, kit or fake bridge), such as bad messages from SlimTV.

Left and right move between its Ready, Exit and Play tone buttons and OK presses one. Before
Ready, Back should leave at once; after it, only holding Back for 1 second should. On a computer,
open it with `?platform=slimtv&fakebridge=1` to run it under the fake bridge.

## Making a release

1. Pick the next "Adjective Animal" name. Set it in `src/release.ts` (name and tag), the
   "Release:" line of `CONTRACT.md`, a new top entry in `CHANGELOG.md` (rename its "Unreleased"
   section to the new name and tag, and mark anything that needs SlimTV and every game updated
   together **BREAKING**), and the tag in this README's install command and download links.
2. `npm run build`, then `npm test`, `npm run check:dist` and `npm run check:release`.
3. Commit and push, and wait for CI to pass.
4. Install from the pushed commit into an empty project and import each entry, to be sure a game
   can install it.
5. Tag the commit and publish the GitHub release with the shim and its hash attached:
   `gh release create <tag> dist/slimtv-shim.js dist/slimtv-shim.js.sha256 --title "<Name>"`.

## Working on this repo

```
npm run typecheck
npm test
npm run build        # rewrites dist/
npm run check:dist   # fails if dist/ is stale
npm run check:release   # fails if the release name disagrees anywhere
npm run build:site   # builds the test page into site/ (not committed)
```

`dist/` is committed, so games and SlimTV install it without building anything. Never edit it by
hand.
