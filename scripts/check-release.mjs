// Checks that the release name agrees everywhere it appears: src/release.ts (its one hand-written
// home), CONTRACT.md, CHANGELOG.md, the README's install command and download links, and the
// built shim's banner. Run by `npm run check:release` before tagging (see README.md "Making a
// release") and by CI on every push.

import { readFile } from "node:fs/promises";

const problems = [];
const release = await readFile("src/release.ts", "utf8");
const name = release.match(/RELEASE_NAME = "([^"]+)"/)?.[1];
const tag = release.match(/RELEASE_TAG = "([^"]+)"/)?.[1];

if (!name || !tag) {
  problems.push("src/release.ts: RELEASE_NAME or RELEASE_TAG not found");
} else {
  if (!/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name)) problems.push(`release name "${name}" is not "Adjective Animal"`);
  const expectedTag = name.toLowerCase().replace(/ /g, "-");
  if (tag !== expectedTag) problems.push(`RELEASE_TAG "${tag}" should be "${expectedTag}"`);

  const contract = await readFile("CONTRACT.md", "utf8");
  if (!contract.includes(`Release: **${name}** (tag \`${tag}\`)`)) {
    problems.push(`CONTRACT.md: the "Release:" line doesn't name ${name} (${tag})`);
  }
  const changelog = await readFile("CHANGELOG.md", "utf8");
  const firstEntry = changelog.match(/^## (.+)$/m)?.[1];
  if (firstEntry !== `${name} (${tag})`) {
    problems.push(`CHANGELOG.md: the newest entry is "${firstEntry}", not "${name} (${tag})"`);
  }
  // The README's install command and release download links must name this release's tag.
  const readme = await readFile("README.md", "utf8");
  for (const [label, pattern] of [
    ["install tag", /slimtv-game-bridge#([A-Za-z0-9._-]+)/g],
    ["release download link", /\/releases\/download\/([A-Za-z0-9._-]+)\//g],
  ]) {
    const found = [...readme.matchAll(pattern)].map((m) => m[1]);
    if (found.length === 0) problems.push(`README.md: no ${label} found`);
    for (const other of new Set(found.filter((t) => t !== tag))) {
      problems.push(`README.md: a ${label} names "${other}", not "${tag}"`);
    }
  }
  const shim = await readFile("dist/slimtv-shim.js", "utf8");
  if (!shim.startsWith(`// slimtv-game-bridge shim, release ${name} (tag ${tag}).`)) {
    problems.push("dist/slimtv-shim.js: the banner doesn't name this release (run npm run build)");
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`check:release: ${problem}`);
  process.exit(1);
}
console.log(`check:release: ${name} (${tag}) agrees everywhere.`);
