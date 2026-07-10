#!/usr/bin/env node
/**
 * Remove templated clone fixtures (web-flow-ai-*, syn-hq-*) from disk and manifest.
 *
 * Usage:
 *   node scripts/form-corpus/purge-clone-fixtures.mjs
 *   node scripts/form-corpus/purge-clone-fixtures.mjs --dry-run
 */
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest } from './lib/manifest.mjs';
import { EXPECTED_DIR, HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';

const CLONE_PREFIXES = ['web-flow-ai-', 'syn-hq-'];
const dryRun = process.argv.includes('--dry-run');

function isCloneId(id) {
    return CLONE_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function removeFile(path) {
    if (!existsSync(path)) {
        return false;
    }

    if (!dryRun) {
        unlinkSync(path);
    }

    return true;
}

function main() {
    const manifest = loadManifest();
    const removed = {
        manifest: 0,
        html: 0,
        expected: 0,
    };

    const kept = manifest.scenarios.filter((scenario) => {
        if (!isCloneId(scenario.id)) {
            return true;
        }

        removed.manifest += 1;
        removed.html += removeFile(join(HTML_DIR, scenario.html_file || `${scenario.id}.html`)) ? 1 : 0;
        removed.expected += removeFile(join(EXPECTED_DIR, `${scenario.id}.json`)) ? 1 : 0;

        return false;
    });

    if (!dryRun) {
        saveManifest({ ...manifest, scenarios: kept });
    }

    for (const dir of [HTML_DIR, EXPECTED_DIR]) {
        for (const file of readdirSync(dir)) {
            if (!CLONE_PREFIXES.some((prefix) => file.startsWith(prefix))) {
                continue;
            }

            const path = join(dir, file);

            if (dir === HTML_DIR && file.endsWith('.html')) {
                removed.html += removeFile(path) ? 1 : 0;
            }

            if (dir === EXPECTED_DIR && file.endsWith('.json')) {
                removed.expected += removeFile(path) ? 1 : 0;
            }
        }
    }

    console.log(JSON.stringify({
        dry_run: dryRun,
        removed,
        manifest_remaining: kept.length,
        manifest_path: MANIFEST_PATH,
    }, null, 2));
}

main();
