#!/usr/bin/env node
/**
 * Diff bridge inventory golden sidecars against mechanical JSDOM snapshot.
 *
 * Usage:
 *   node scripts/form-corpus/diff-inventory-golden.mjs --id=bridge-fixture-id
 *   node scripts/form-corpus/diff-inventory-golden.mjs --limit=50
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertBatchLimit, parseLimitArg } from './lib/batch-cap.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT, HTML_DIR } from './lib/paths.mjs';
import { buildSnapshotFromFile } from './lib/snapshot-runner.mjs';

const GOLDEN_DIR = join(FIXTURE_ROOT, 'inventory-golden');

function parseArg(name) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : null;
}

function normalizeLabel(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function main() {
    const id = parseArg('id');
    const limit = assertBatchLimit(parseLimitArg() ?? parseArg('limit', '50'));

    if (!existsSync(GOLDEN_DIR)) {
        console.log(JSON.stringify({ diffs: [], message: 'No inventory-golden directory yet' }, null, 2));

        return;
    }

    const manifest = loadManifest();
    const goldenFiles = readdirSync(GOLDEN_DIR).filter((name) => name.endsWith('.json'));
    let ids = goldenFiles.map((name) => name.replace(/\.json$/, ''));

    if (id) {
        ids = ids.filter((row) => row === id);
    }

    ids = ids.slice(0, limit);
    const diffs = [];

    for (const fixtureId of ids) {
        const scenario = manifest.scenarios.find((row) => row.id === fixtureId);

        if (!scenario) {
            diffs.push({ id: fixtureId, error: 'missing manifest scenario' });
            continue;
        }

        const goldenPath = join(GOLDEN_DIR, `${fixtureId}.json`);
        const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
        const htmlPath = join(HTML_DIR, scenario.html_file);

        if (!existsSync(htmlPath)) {
            diffs.push({ id: fixtureId, error: 'missing HTML' });
            continue;
        }

        const snapshot = buildSnapshotFromFile(
            htmlPath,
            scenario.page_url || `https://example.test/forms/${fixtureId}`,
            scenario.page_title || 'Job Application',
            scenario.interaction_steps || [],
        );

        const goldenLabels = new Set((golden.fields || golden.elements || []).map((row) => normalizeLabel(row.question || row.label)));
        const snapshotLabels = new Set((snapshot.elements || []).map((row) => normalizeLabel(row.question)));

        const missingInSnapshot = [...goldenLabels].filter((label) => label && !snapshotLabels.has(label));
        const extraInSnapshot = [...snapshotLabels].filter((label) => label && !goldenLabels.has(label));

        if (missingInSnapshot.length || extraInSnapshot.length) {
            diffs.push({
                id: fixtureId,
                missing_in_snapshot: missingInSnapshot.slice(0, 10),
                extra_in_snapshot: extraInSnapshot.slice(0, 10),
            });
        }
    }

    console.log(JSON.stringify({
        checked: ids.length,
        diff_count: diffs.length,
        diffs,
    }, null, 2));

    if (diffs.length > 0) {
        process.exit(1);
    }
}

main();
