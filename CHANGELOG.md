# Changelog

Each release has an "Adjective Animal" name and a git tag that is the name in lowercase with
hyphens. A change that needs SlimTV and every game updated together is marked **BREAKING**. See
"Versioning" in [CONTRACT.md](CONTRACT.md).

## Brisk Otter (brisk-otter)

Nothing here is **BREAKING**: SlimTV and games can each take it up on their own, though see the
note on checking games before SlimTV takes it up.

- **Contract**: player numbers go up to 16. A controller that connects while all 16 are taken
  gets no number until one frees up, and the shim ignores input for a higher number as a bad
  message. That keeps the shim's record of held buttons bounded whatever SlimTV sends.
- **Contract**: SlimTV rate-limits every message from the page before parsing it, not only
  `log`, so a page can't keep SlimTV's main thread (and the held-Back escape hatch) busy.
- **Kit**: `MAX_PLAYERS` is exported. On a computer, controllers past the 16th are ignored, with
  one warning.
- **Contract**: six new actions for controllers: `l1` and `r1` (shoulder buttons), `l2` and `r2`
  (triggers, analog ones pressed past halfway) and `l3` and `r3` (sticks pressed in). The remote
  has none of them, so a game that needs them can't be played with the remote alone. Games
  ignore actions they don't know, as more may come.
- **Contract**: games can read where each stick is pushed with `SlimTV.input.stick()`, from a new
  `stick` message SlimTV sends. A shim from an earlier release ignores those messages, logging
  one warning.
- **Check before SlimTV takes this up**: once SlimTV sends the new actions, every game gets them,
  whatever release it is built with. A game that treats an action it doesn't know as some other
  action (a direction, say) misbehaves until it ignores them. Check each game first.
- **Kit**: `createInput()` reads the new buttons and both sticks from controllers on a computer
  (standard buttons 4 to 7, 10 and 11, and axes 0 to 3), and `input.stick()` answers on the TV and
  on a computer. Under an older SlimTV, sticks read 0, 0. New keys on a computer: Q and E for the
  shoulders, 1 and 3 for the triggers, C and V for the sticks pressed in. New exports:
  `STICKS`, `STICK_DEAD_ZONE`, `TRIGGER_PRESS`, `TRIGGER_RELEASE` and `GAMEPAD_TRIGGERS`.
- **Fake bridge and test page**: the new buttons and the sticks work under the fake bridge, and
  the bridge test page shows each player's stick positions.
- **Package**: the kit and the fake bridge share their common code through a chunk file in
  `dist/`, so a game that imports both carries about 7 KB less. Imports are unchanged. A game
  that copies files out of `dist/` instead of installing the package must copy the `chunk-*.js`
  files too; their names change with each release.

## Steady Heron (steady-heron)

The first release.

- **Contract**: [CONTRACT.md](CONTRACT.md), the rules SlimTV and its games follow: detection,
  ready, exit and log, input from the remote and controllers, pause and resume, players, Back
  rules, rendering, the wire protocol, and what SlimTV's game WebView must do.
- **Shim** (`dist/slimtv-shim.js`, with its SHA-256 in `dist/slimtv-shim.js.sha256`): the script
  SlimTV injects into every game page. It creates `window.SlimTV`.
- **Kit** (`slimtv-game-bridge`): `isSlimTV()`, `device()`, `bridgeRelease()`, `ready()`,
  `exit()`, `log()`, `onPause()`, `onResume()`, and `createInput()`, one input layer for the TV
  (through SlimTV) and computers (keyboard and controllers, with the same rules).
- **Fake bridge** (`slimtv-game-bridge/fake`, `slimtv-game-bridge/fake/auto`): SlimTV imitated on
  a computer, for trying a game in TV mode without the TV.
- **Bridge test page**: <https://egmutza.github.io/slimtv-game-bridge/test/>, for checking SlimTV's
  side of the contract on the TV.
