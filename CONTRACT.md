# SlimTV Game Bridge contract

Release: **Steady Heron** (tag `steady-heron`)

This file is the source of truth for how SlimTV and the web games it launches talk to each other.
SlimTV builds the Android side. This repo (slimtv-game-bridge) builds the JavaScript side: the
shim SlimTV injects into every game page, and the kit games import. The types in
`src/contract.ts` follow this file; if the two ever disagree, this file wins and the types are a
bug.

"Game bridge" here never means `slimtv-bridge`, the Python service on the home server. That is a
different project with its own release names.

Items marked **(added)** were not in the first draft of the contract. They fill gaps the first
draft left open.

## Contents

1. [Detection](#detection)
2. [Game to SlimTV](#game-to-slimtv)
3. [SlimTV to game](#slimtv-to-game)
4. [Polling](#polling)
5. [Actions](#actions)
6. [Players](#players)
7. [Input mapping (native side)](#input-mapping-native-side)
8. [Back rules](#back-rules)
9. [Rendering](#rendering)
10. [Wire protocol](#wire-protocol)
11. [Native side requirements](#native-side-requirements)
12. [Versioning](#versioning)

## Detection

- SlimTV injects `window.SlimTV` before any page script runs, and appends `?platform=slimtv` to
  the game's URL. Either signal means TV mode.
- `SlimTV.bridge` is the release name of the injected shim, for example `"Steady Heron"`.
- `SlimTV.device` is `{ name: "Onn 4K Pro Gen 2", tier: "tv" }`. Games use it to pick a quality
  preset.

## Game to SlimTV

| Call | Meaning |
| --- | --- |
| `SlimTV.ready()` | The game is loaded and interactive. SlimTV hides its loading overlay. |
| `SlimTV.exit()` | Return to the SlimTV home screen. |
| `SlimTV.log(level, message)` | Forwarded to logcat. `level` is `"debug"`, `"info"`, `"warn"` or `"error"`. |

- **(added)** `ready()` is sent to SlimTV once per page load. Later calls do nothing.
- **(added)** `exit()` is sent every time it is called. SlimTV treats a repeat as harmless.
- **(added)** `log()` converts `message` to a string and cuts it to 2000 characters, or shorter if
  needed to keep the whole wire message within 4096 characters. An unknown
  `level` is sent as `"info"`. (TypeScript games can only pass a valid level and a string; these
  rules are for plain JavaScript callers that pass something else anyway.)

## SlimTV to game

All three arrive as events on `window`.

| Event | `detail` | Meaning |
| --- | --- | --- |
| `slimtv:input` | `{ action, state, repeat, source, player }` | A button went down, up, or repeated. |
| `slimtv:pause` | `null` | The app lost focus (Home, screensaver, input switch). The game pauses its loop and audio. |
| `slimtv:resume` | `null` | The app is back. The game stays paused on its pause menu and never resumes play on its own. |

`slimtv:input` detail fields:

| Field | Values |
| --- | --- |
| `action` | One of the [actions](#actions). |
| `state` | `"down"` or `"up"`. |
| `repeat` | `true` for an auto-repeat of a button that is still held, otherwise `false`. |
| `source` | `"remote"` or `"gamepad"`. |
| `player` | 1-based player number: a whole number from 1 to 16. See [Players](#players). |

- **(added)** A repeat is always a `"down"` with `repeat: true`. It only follows an earlier
  `"down"` for the same action, source and player, and it doesn't change `isDown`.
- **(added)** Don't rely on repeats from any particular source or at any particular rate. A game
  that wants menu auto-repeat on every controller times it itself from `isDown`.
- **(added)** The shim passes on only changes. A `"down"` for a button that is already down, or
  an `"up"` or repeat for one that isn't, is dropped. That covers, for example, the `"up"` for a
  button that was held across a pause.
- **(added)** After `slimtv:pause`, every action counts as up. Android stops delivering key events
  once the app loses focus, so the "up" for a held button never comes. The shim clears its own
  held state on pause and sends no "up" events for it. A game that tracks held buttons itself
  clears them on `slimtv:pause` too.

## Polling

- `SlimTV.input.isDown(action)` returns `true` while that action is held. It is for games that
  read input in their frame loop.
- **(added)** `SlimTV.input.isDown(action, player)` asks about one player. Leaving `player` out
  means "any player". An unknown action or a `player` that isn't a valid player number returns
  `false`.
- **(added)** An action held on two sources at once (for example confirm on the remote and on the
  first controller, both player 1) stays down until both are released.

## Actions

`up`, `down`, `left`, `right`, `confirm`, `back`, `menu`, `action1`, `action2`

## Players

- Player numbers start at 1. The remote and the first controller are both player 1.
- **(added)** The remote is always player 1 and doesn't take up a controller's number.
  Controllers are numbered separately: each one that connects takes the lowest free number,
  starting at 1, so the first controller shares player 1 with the remote.
- **(added)** When a controller disconnects, SlimTV first sends an "up" for every action it was
  holding, then frees its number. So with two controllers, unplugging player 1's controller and
  plugging it back in makes it player 1 again, and player 2 keeps its number throughout.
- **(added)** Player numbers go up to 16. A controller that connects while all 16 are taken gets
  no number and sends nothing until another controller disconnects and frees one. The shim
  ignores input for a higher player number as a bad message.

## Input mapping (native side)

- **Remote:** D-pad to directions, center to `confirm`, Back to `back`.
- **Gamepad:** D-pad, hat, and left stick to directions. A/Cross to `confirm`, B/Circle to `back`,
  X/Square to `action1`, Y/Triangle to `action2`, Start/Options to `menu`.
- **Left stick:** a direction goes down when the stick passes 0.5 along that axis and goes up when
  it falls below 0.35. The gap stops a stick resting near the edge from flickering.
- **(added)** A direction held by more than one control on the same controller (D-pad and stick,
  say) sends one "down" when the first one presses it and one "up" when the last one releases it.
- Native key events never reach the page as `keydown`. All input arrives through the bridge.

## Back rules

- During gameplay, Back opens the pause menu.
- In the pause menu, Back resumes. The pause menu has an Exit item that calls `SlimTV.exit()`.
- On the game's top-level menu, Back calls `SlimTV.exit()`.
- **Escape hatch**, enforced natively so it works even if the page hangs:
  - Holding Back for 1 second always exits.
  - Back exits immediately if the game hasn't called `ready()`.

## Rendering

- The game draws a fixed 1920x1080 logical stage, scaled to fit the page.
- Canvas backing stores are never larger than 1920x1080, even when `devicePixelRatio` is above 1.
- **(added)** Expected page metrics on the Onn, provisional until measured with the bridge test
  page and recorded here in a later release:

  | Value | Expected |
  | --- | --- |
  | `innerWidth` x `innerHeight` | 1920 x 1080 |
  | `devicePixelRatio` | 2 |

  Games still scale the stage to whatever `innerWidth` and `innerHeight` actually report.

## Wire protocol

**Transport**
- The transport is the `SlimTVNative` object created by `addWebMessageListener`.
- Every message in both directions is a JSON string with a `"type"` field.

**Config**
- SlimTV prepends `window.__SLIMTV_CONFIG__ = { device }` to the shim source it injects.
- **(added)** Native writes that line's value with a JSON encoder, never by joining strings. A quote
  or line break in the device name would otherwise break the whole script, and the page would get
  no `window.SlimTV` at all.
- The shim reads it synchronously, before any page script runs.

**Shim to native**

| Message | When |
| --- | --- |
| `{ "type": "hello", "bridge": "Steady Heron" }` | First, as soon as the shim starts. It gives native the reply proxy it needs to send anything back. |
| `{ "type": "ready" }` | The game called `ready()`. |
| `{ "type": "exit" }` | The game called `exit()`. |
| `{ "type": "log", "level": "info", "message": "..." }` | The game called `log()`. |

**Native to shim**

| Message | Effect |
| --- | --- |
| `{ "type": "input", "action": "confirm", "state": "down", "repeat": false, "source": "remote", "player": 1 }` | Dispatches `slimtv:input` and updates `isDown`. |
| `{ "type": "pause" }` | Dispatches `slimtv:pause` and clears held state. |
| `{ "type": "resume" }` | Dispatches `slimtv:resume`. |

**Bad messages**
- Unknown message types are logged and ignored, never thrown.
- **(added)** The same goes for messages that aren't valid JSON, are longer than 4096 characters,
  or have a field outside the values listed in this contract. For example, an `input` with
  `action: "jump"`, `player: 0`, `player: 1.5` or `player: 17` is ignored.
- **(added)** The shim logs each kind of bad message once per page load, to the browser console
  and to native as a `warn` log. That way a native bug shows up in logcat without flooding it.

## Native side requirements

**(added)** This whole section is new. These are rules for SlimTV's game WebView. They live here
because getting any of them wrong breaks a game in ways the page cannot detect or work around.

**Injection**
- Register the `SlimTVNative` listener and the document-start shim script once per game
  WebView, before its first `loadUrl`. Neither one applies to a page that has already started
  loading. Both stay in effect for later navigations and reloads, so registering them again would
  inject the shim twice.
- Check `WebViewFeature.WEB_MESSAGE_LISTENER` and `WebViewFeature.DOCUMENT_START_SCRIPT` first.
  If either is missing, log it and open the game without the bridge rather than crashing.
- Scope both to the game's own HTTPS origins (the same list that limits its navigation), never
  `*`.
- Ignore any message whose `isMainFrame` is false or whose source origin isn't one of the game's
  origins. That stops an embedded ad or iframe from driving SlimTV.

**Reply proxy**
- Native can only send messages through the reply proxy it received with the shim's `hello`. It
  keeps that proxy and sends all input, pause and resume through it.
- A new `hello` arrives after every navigation or reload. Native replaces the proxy each time.
- **(added)** Leave WebView's back/forward cache off for the game WebView (it is off by default). A
  page restored from that cache doesn't run the shim again, so no new `hello` or `ready` arrives.
- Native sends nothing before the first `hello`. Input that happens before then is dropped.

**Messages**
- Parse every incoming message as JSON inside a try/catch. Ignore and log bad ones, never crash.
- **(added)** Treat every message as untrusted. The page can call `SlimTVNative` itself and skip
  the shim, so native checks everything the shim checks, without relying on it:
  - Ignore any message longer than 4096 characters, before parsing it.
  - Accept only the four types in "Shim to native", with exactly the fields shown. `level` must
    be one of the four levels, `bridge` and `message` must be strings, and a `message` longer
    than 2000 characters is ignored.
  - **(added)** Rate-limit every message, whatever its type, not only `log`: count it against a
    budget before parsing it, and drop it unparsed once the budget is spent. Messages arrive on
    the app's main thread, the same thread that watches for the held-Back escape hatch, so a page
    sending `hello`, `ready` or `exit` in a tight loop must not be able to keep that thread busy.
    `log` messages also must not flood logcat.

**Name clash**
- The game WebView must never get the launcher's own `SlimTV` Java interface (its
  `addJavascriptInterface`). That interface would take the `window.SlimTV` name before the shim
  runs. The shim refuses to overwrite an existing `window.SlimTV` and logs an error when it finds
  one it didn't create.

**Audio**
- Call `setMediaPlaybackRequiresUserGesture(false)` on the game WebView.
- Input reaches the page as bridge events, not real key presses, so Chromium never sees a user
  gesture. Without this setting, Web Audio and `<audio>` may never be allowed to start.
- On the Onn, the bridge test page plays a tone at load with no button press to confirm this
  works.

**Screen**
- The game WebView uses the same initial scale rule as the launcher:
  `setInitialScale(round(100 * displayWidthPixels / 1920))`.
- See [Rendering](#rendering) for what the page is expected to see.

**Storage and web features**
- JavaScript, DOM storage (off by default in WebView), IndexedDB and service workers are on.
- First-party cookies persist across launches. SlimTV calls `CookieManager.flush()` (which saves
  cookies to disk; it does not clear them) when the game pauses or closes.
- Third-party cookies stay off.

**Debugging**
- WebView remote debugging (chrome://inspect) is on in debug builds only, never in release
  builds.

**Messages from the shim**
- `ready`: hide the loading overlay.
- `exit`: close the game and return to the home screen with the game's tile focused.
- `log`: write to logcat at the matching priority, tagged so game logs can be filtered on their
  own.

## Versioning

- Each slimtv-game-bridge release gets an "Adjective Animal" name. The git tag is that name in
  lowercase with hyphens: Steady Heron is `steady-heron`.
- The name appears in the shim (`SlimTV.bridge`), the kit, the shim's log lines, and the test
  page header.
- Changes are additive whenever possible. A breaking change is marked **BREAKING** in
  `CHANGELOG.md` and requires updating SlimTV and every game.
- If a game's kit release differs from `SlimTV.bridge`, the kit logs a warning once and keeps
  running.
