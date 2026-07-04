#!/usr/bin/env node
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR, HTML_DIR } from './lib/paths.mjs';

const ids = process.argv.slice(2);

if (ids.length === 0) {
    console.error('Usage: node remove-scenario.mjs <id> [id...]');
    process.exit(1);
}

const manifest = loadManifest();
let removed = 0;

for (const id of ids) {
    const index = manifest.scenarios.findIndex((row) => row.id === id);

    if (index === -1) {
        console.warn(`Not in manifest: ${id}`);
        continue;
    }

    manifest.scenarios.splice(index, 1);

    for (const path of [join(HTML_DIR, `${id}.html`), join(EXPECTED_DIR, `${id}.json`)]) {
        if (existsSync(path)) {
            unlinkSync(path);
        }
    }

    removed += 1;
    console.log(`Removed ${id}`);
}

saveManifest(manifest);
console.log(`Removed ${removed} scenario(s). ${manifest.scenarios.length} remain.`);
