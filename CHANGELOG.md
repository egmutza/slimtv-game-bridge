# Changelog

Each release has an "Adjective Animal" name and a git tag that is the name in lowercase with
hyphens. A change that needs SlimTV and every game updated together is marked **BREAKING**. See
"Versioning" in [CONTRACT.md](CONTRACT.md).

## Unreleased

Changes on `main` since the last release. They get the next release's name when it is made.
Nothing here is **BREAKING**: SlimTV and games can each take it up on their own.

- **Contract**: player numbers go up to 16. A controller that connects while all 16 are taken
  gets no number until one frees up, and the shim ignores input for a higher number as a bad
  message. That keeps the shim's record of held buttons bounded whatever SlimTV sends.
- **Contract**: SlimTV rate-limits every message from the page before parsing it, not only
  `log`, so a page can't keep SlimTV's main thread (and the held-Back escape hatch) busy.
- **Kit**: `MAX_PLAYERS` is exported. On a computer, controllers past the 16th are ignored, with
  one warning.
- **Package**: the kit and the fake bridge share their common code through a chunk file in
  `dist/`, so a game that imports both carries about 7 KB less. Imports are unchanged.

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
