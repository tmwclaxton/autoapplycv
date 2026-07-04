#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './lib/manifest.mjs';
import { buildSnapshotFromFile } from './lib/snapshot-runner.mjs';
import { FIXTURE_ROOT, HTML_DIR } from './lib/paths.mjs';

const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
const all = process.argv.includes('--all');
const htmlArg = process.argv.find((arg) => arg.startsWith('--html='))?.split('=')[1];
const pageUrlArg = process.argv.find((arg) => arg.startsWith('--page-url='))?.split('=')[1];
const pageTitleArg = process.argv.find((arg) => arg.startsWith('--page-title='))?.split('=')[1];
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.split('=')[1];
const SNAPSHOTS_PATH = outputArg || join(FIXTURE_ROOT, 'snapshots.json');

function emit(snapshot) {
    process.stdout.write(`${JSON.stringify(snapshot)}\n`);
}

if (htmlArg) {
    emit(buildSnapshotFromFile(htmlArg, pageUrlArg || 'https://example.test/apply', pageTitleArg || 'Job Application'));
    process.exit(0);
}

const manifest = loadManifest();

if (idArg) {
    const scenario = manifest.scenarios.find((row) => row.id === idArg);

    if (!scenario) {
        console.error(`Unknown scenario id: ${idArg}`);
        process.exit(1);
    }

    emit(buildSnapshotFromFile(
        join(HTML_DIR, scenario.html_file),
        scenario.page_url,
        scenario.page_title,
    ));
    process.exit(0);
}

if (all) {
    const output = {};

    for (const scenario of manifest.scenarios) {
        const htmlPath = join(HTML_DIR, scenario.html_file);

        if (!existsSync(htmlPath)) {
            continue;
        }

        output[scenario.id] = buildSnapshotFromFile(htmlPath, scenario.page_url, scenario.page_title);
    }

    writeFileSync(SNAPSHOTS_PATH, `${JSON.stringify(output)}\n`);
    console.log(`Wrote ${Object.keys(output).length} snapshots → ${SNAPSHOTS_PATH}`);
    process.exit(0);
}

console.error('Usage: run-snapshot.mjs --id=... | --all | --html=path [--page-url=] [--page-title=]');
process.exit(1);
