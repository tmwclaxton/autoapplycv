#!/usr/bin/env node
/**
 * Track bridge capture sprint progress toward ~1,500 net-new fixtures.
 *
 * Usage:
 *   node scripts/form-corpus/bridge-capture-sprint.mjs --status
 *   node scripts/form-corpus/bridge-capture-sprint.mjs --record --id=web-bridge-example-001
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const PROGRESS_PATH = join(FIXTURE_ROOT, 'bridge-capture-sprint.json');
const TARGET = 1500;

function parseArg(name) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : null;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function loadProgress() {
    if (!existsSync(PROGRESS_PATH)) {
        return {
            target: TARGET,
            recorded_ids: [],
            sessions: [],
        };
    }

    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
}

function saveProgress(progress) {
    progress.updated_at = new Date().toISOString();
    writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`);
}

function bridgeCount() {
    return loadManifest().scenarios.filter((row) => row.source === 'bridge').length;
}

function main() {
    const progress = loadProgress();
    const manifestBridge = bridgeCount();

    if (hasFlag('status')) {
        console.log(JSON.stringify({
            target: TARGET,
            manifest_bridge_count: manifestBridge,
            recorded_ids: progress.recorded_ids.length,
            remaining: Math.max(0, TARGET - manifestBridge),
            progress_file: PROGRESS_PATH,
            checklist: [
                'extension_status',
                'get_field_inventory',
                'read_field_values',
                'read_form_validation',
                'save_fixture',
                'propose-expectations.mjs --id=<id>',
                'optional inventory-golden sidecar',
            ],
        }, null, 2));

        return;
    }

    const id = parseArg('id');

    if (!id) {
        console.error('Pass --status or --record --id=...');

        process.exit(1);
    }

    if (!progress.recorded_ids.includes(id)) {
        progress.recorded_ids.push(id);
    }

    progress.sessions.push({
        id,
        recorded_at: new Date().toISOString(),
    });
    saveProgress(progress);

    console.log(JSON.stringify({
        recorded: id,
        total_recorded: progress.recorded_ids.length,
        manifest_bridge_count: bridgeCount(),
    }, null, 2));
}

main();
