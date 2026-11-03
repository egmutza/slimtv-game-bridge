// The slimtv-game-bridge release this build belongs to, and the code's only copy of its name: the
// shim reports it as SlimTV.bridge, the kit compares against it, and the build stamps it into
// dist/. The docs repeat it (CONTRACT.md, CHANGELOG.md, README.md), and `npm run check:release`
// checks that they agree with this file. See "Versioning" in CONTRACT.md.

/** The release's "Adjective Animal" name, for example "Steady Heron". */
export const RELEASE_NAME = "Brisk Otter";

/** The git tag for this release: the name in lowercase with hyphens. */
export const RELEASE_TAG = "brisk-otter";
