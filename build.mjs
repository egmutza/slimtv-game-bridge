// Builds dist/ from src/. `node build.mjs` writes the files; `node build.mjs --check` writes
// nothing and fails if dist/ doesn't match what the source builds to. dist/ is committed so
// games and SlimTV install it with no build step (see CLAUDE.md), so it must never go stale.

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

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

// The kit: one readable ES module for games to import.
const kit = await build({
  entryPoints: ["src/kit/index.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  charset: "utf8",
  legalComments: "none",
  write: false,
  outfile: "dist/kit.js",
  banner: {
    js:
      `// slimtv-game-bridge kit, release ${name} (tag ${tag}).\n` +
      "// Built from src/kit by build.mjs; do not edit.",
  },
});
outputs.push({ path: "dist/kit.js", text: kit.outputFiles[0].text });

// The fake bridge, for trying a game in TV mode on a computer: the module itself, and the entry
// that installs it when the address asks for it.
for (const [entry, out, what] of [
  ["src/fake/index.ts", "dist/fake.js", "fake bridge"],
  ["src/fake/auto.ts", "dist/fake-auto.js", "fake bridge auto-install entry"],
]) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    charset: "utf8",
    legalComments: "none",
    write: false,
    outfile: out,
    banner: {
      js:
        `// slimtv-game-bridge ${what}, release ${name} (tag ${tag}).\n` +
        "// For trying a game on a computer; inside SlimTV it does nothing. Built by build.mjs; do not edit.",
    },
  });
  outputs.push({ path: out, text: result.outputFiles[0].text });
}

// The kit's TypeScript declarations, from tsc (tsconfig.build.json), into dist/types/.
const typesDir = await mkdtemp(join(tmpdir(), "slimtv-game-bridge-types-"));
try {
  execFileSync("npx", ["tsc", "-p", "tsconfig.build.json", "--outDir", typesDir], { stdio: "inherit" });
  for (const file of await listFiles(typesDir)) {
    outputs.push({ path: join("dist/types", relative(typesDir, file)), text: await readFile(file, "utf8") });
  }
} finally {
  await rm(typesDir, { recursive: true, force: true });
}

let stale = 0;
const expected = new Set(outputs.map((o) => o.path));
const existing = await listFiles("dist").catch(() => []);
for (const path of existing) {
  if (expected.has(path)) continue;
  if (check) {
    console.error(`check:dist: ${path} is no longer built. Run npm run build and commit the result.`);
    stale++;
  } else {
    await rm(path);
    console.log(`build: removed ${path}`);
  }
}
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

async function listFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else files.push(path);
  }
  return files;
}
