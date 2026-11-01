# Changelog

Each release has an "Adjective Animal" name and a git tag that is the name in lowercase with
hyphens. A change that needs SlimTV and every game updated together is marked **BREAKING**. See
"Versioning" in [CONTRACT.md](CONTRACT.md).

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
