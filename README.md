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

Installing and pinning a release is covered once the first release is tagged.

## The fake bridge

Import it first in the game's entry file:

```ts
import "slimtv-game-bridge/fake/auto";
```

Then open the game with `?platform=slimtv&fakebridge=1` in the address. Anywhere else, including
inside the real SlimTV, the import does nothing. To install it yourself instead, call
`installFakeBridge()` from `slimtv-game-bridge/fake` before the game calls `createInput()`; an
input created earlier stays in computer mode and won't hear the keyboard.

Keys are hidden from the page, as on the TV, where key presses never reach a game page. Typing in
a text box is left alone. The TV remote has only the arrows, OK and Back, so only those keys act
as the remote. Tab, Z and X act as the first controller's buttons, as they would on the TV: a game
that needs them can't be played with the remote alone.

| Action | Keys (player 1) | Controller |
| --- | --- | --- |
| `up`, `down`, `left`, `right` | Arrow keys, W A S D | D-pad, left stick |
| `confirm` | Enter, keypad Enter, Space | A / Cross |
| `back` | Escape, Backspace | B / Circle |
| `menu` | Tab (as a controller) | Start / Options |
| `action1` | Z (as a controller) | X / Square |
| `action2` | X (as a controller) | Y / Triangle |
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
- any warnings the shim logs about bad messages from SlimTV.

Left and right move between its Ready, Exit and Play tone buttons and OK presses one. Before
Ready, Back should leave at once; after it, only holding Back for 1 second should. On a computer,
open it with `?platform=slimtv&fakebridge=1` to run it under the fake bridge.

## Working on this repo

```
npm run typecheck
npm test
npm run build        # rewrites dist/
npm run check:dist   # fails if dist/ is stale
npm run build:site   # builds the test page into site/ (not committed)
```

`dist/` is committed, so games and SlimTV install it without building anything. Never edit it by
hand.
