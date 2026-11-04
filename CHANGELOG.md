# Changelog

Each release has an "Adjective Animal" name and a git tag that is the name in lowercase with
hyphens. A change that needs SlimTV and every game updated together is marked **BREAKING**. See
"Versioning" in [CONTRACT.md](CONTRACT.md).

## Wakeful Owl (wakeful-owl)

Nothing here is **BREAKING**: SlimTV and games can each take it up on their own, though see the
note on checking games before SlimTV takes it up.

- **Contract**: `SlimTV.keepAwake()` keeps the screen on, with no screensaver, for 5 minutes from
  the latest call. A game that should stay on screen while nobody touches the remote calls it
  every 2 minutes for as long as that lasts. There is no call to stop: the lease runs out on its
  own. A pause ends it. See "Keeping the screen on" in [CONTRACT.md](CONTRACT.md).
- **Contract**: a new `awake` message from the shim to SlimTV. The shim sends at most one every
  30 seconds, however often the game calls `keepAwake()`, and the first one after a resume at
  once. A SlimTV from before Wakeful Owl ignores it as an unknown message.
- **Contract**: SlimTV no longer keeps the screen on for every game. Without `keepAwake()`, the
  TV's own idle rules apply, so a game left untouched gets the screensaver, as any other app does.
- **Check before SlimTV takes this up**: once it does, any game gets the screensaver after the
  TV's idle time (10 minutes on the Onn) without a button press, whatever release it is built
  with. A game being played is never idle that long. One with long stretches nobody plays
  through (a video, an attract mode, a page people use from their phones) calls `keepAwake()`
  first.
- **Kit**: `keepAwake()`, which does nothing outside SlimTV or under an older shim. New exports:
  `AWAKE_LEASE_MS`, `AWAKE_RENEW_MS` and `AWAKE_SEND_GAP_MS`.
- **Fake bridge and test page**: under the fake bridge, `keepAwake()` shows a note saying what
  SlimTV would do. The bridge test page has a Keep awake button that calls it every 2 minutes
  while on.

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
