#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCuratedManifest, buildSmokeManifest, CURATED_MANIFEST_PATH } from './lib/curated-manifest.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const manifest = buildCuratedManifest();
const smokeManifest = buildSmokeManifest(manifest);

writeFileSync(CURATED_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(FIXTURE_ROOT, 'fill-verify-smoke.json'), `${JSON.stringify(smokeManifest, null, 2)}\n`);

const byPlatform = {};

for (const scenario of manifest.scenarios) {
    byPlatform[scenario.platform] = (byPlatform[scenario.platform] || 0) + 1;
}

console.log(`Wrote ${manifest.scenarios.length} curated scenarios → ${CURATED_MANIFEST_PATH}`);
console.log(`Wrote ${smokeManifest.scenarios.length} smoke scenarios → ${join(FIXTURE_ROOT, 'fill-verify-smoke.json')}`);
console.log('By platform:');

for (const [platform, count] of Object.entries(byPlatform).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`  ${platform}: ${count}`);
}

console.log(`Playwright tier: ${manifest.scenarios.filter((scenario) => scenario.playwright).length}`);
