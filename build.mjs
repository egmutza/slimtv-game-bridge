// Builds dist/ from src/. `node build.mjs` writes the files; `node build.mjs --check` writes
// nothing and fails if dist/ doesn't match what the source builds to. dist/ is committed so
// games and SlimTV install it with no build step (see CLAUDE.md), so it must never go stale.

import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const check = process.argv.includes("--check");

// Read the release name from its one home, src/release.ts.
const releaseSource = await readFile("src/release.ts", "utf8");
const name = releaseSource.match(/RELEASE_NAME = "([^"]+)"/)?.[1];
const tag = releaseSource.match(/RELEASE_TAG = "([^"]+)"/)?.[1];
if (!name || !tag) throw new Error("build: could not read the release name from src/release.ts");

/** The shim must stay small: SlimTV injects it into every game page. */
const SHIM_MAX_BYTES = 10 * 1024;

const outputs = [];

const shim = await build({
  entryPoints: ["src/shim/entry.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  platform: "browser",
  charset: "utf8",
  legalComments: "none",
  write: false,
  outfile: "dist/slimtv-shim.js",
  banner: {
    js:
      `// slimtv-game-bridge shim, release ${name} (tag ${tag}).\n` +
      "// SlimTV injects this into every game page. Built from src/shim by build.mjs; do not edit.\n" +
      "// The contract it follows: CONTRACT.md in https://github.com/egmutza/slimtv-game-bridge",
  },
});
const shimFile = shim.outputFiles[0];
if (shimFile.contents.length > SHIM_MAX_BYTES) {
  throw new Error(`build: the shim is ${shimFile.contents.length} bytes, over the ${SHIM_MAX_BYTES} byte limit`);
}
outputs.push({ path: "dist/slimtv-shim.js", text: shimFile.text });

let stale = 0;
for (const { path, text } of outputs) {
  if (check) {
    const current = await readFile(path, "utf8").catch(() => null);
    if (current !== text) {
      console.error(`check:dist: ${path} is out of date. Run npm run build and commit the result.`);
      stale++;
    }
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
    console.log(`build: wrote ${path} (${Buffer.byteLength(text)} bytes)`);
  }
}
if (stale) process.exit(1);
if (check) console.log("check:dist: dist/ matches the source.");
