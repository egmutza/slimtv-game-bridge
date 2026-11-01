// Builds the bridge test page into site/, which GitHub Pages publishes
// (https://egmutza.github.io/slimtv-game-bridge/test/). site/ is never committed.

import { build } from "esbuild";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";

await rm("site", { recursive: true, force: true });
await mkdir("site/test", { recursive: true });

await build({
  entryPoints: ["test-page/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  charset: "utf8",
  outfile: "site/test/main.js",
});
await copyFile("test-page/index.html", "site/test/index.html");

// The site's root just points at the test page.
await writeFile(
  "site/index.html",
  `<!doctype html>
<meta charset="utf-8">
<title>slimtv-game-bridge</title>
<meta http-equiv="refresh" content="0; url=test/">
<a href="test/">Bridge Test</a>
`,
);
console.log("build-site: wrote site/ (open site/test/index.html through a local server)");
