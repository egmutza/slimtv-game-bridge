// Import this first in a game's entry file: `import "slimtv-game-bridge/fake/auto";`. It installs
// the fake bridge only when the address asks for it (?platform=slimtv&fakebridge=1) and the page
// isn't already inside SlimTV. Anywhere else, importing it does nothing.

import { installFakeBridge } from "./index";

if (typeof window !== "undefined" && !("SlimTVNative" in window) && !("SlimTV" in window)) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("platform") === "slimtv" && params.get("fakebridge") === "1") installFakeBridge();
}
