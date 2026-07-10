#!/usr/bin/env node
/**
 * Master orchestrator for the ~8k net-new corpus growth plan.
 *
 * Usage:
 *   node scripts/form-corpus/run-corpus-growth-plan.mjs --track=ai --total=4000
 *   node scripts/form-corpus/run-corpus-growth-plan.mjs --track=bridge-scrape --total=2500
 *   node scripts/form-corpus/run-corpus-growth-plan.mjs --track=firecrawl --total=2500 --force-firecrawl
 *   node scripts/form-corpus/run-corpus-growth-plan.mjs --track=wizard --total=500
 *   node scripts/form-corpus/run-corpus-growth-plan.mjs --track=targeted --total=500
 *   node scripts/form-corpus/run-corpus-growth-plan.mjs --track=mechanical --total=500 --limit=500
 *   node scripts/form-corpus/run-corpus-growth-plan.mjs --status
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const STATUS_PATH = join(FIXTURE_ROOT, 'corpus-growth-plan-status.json');

function parseArg(name, fallback = null) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function count(prefix) {
    return loadManifest().scenarios.filter((row) => row.id.startsWith(prefix))
        .length;
}

function countWebScraped() {
    return loadManifest().scenarios.filter(
        (row) =>
            row.id.startsWith('web-') && !row.id.startsWith('web-flow-ai-'),
    ).length;
}

function countBridgeScrape() {
    return loadManifest().scenarios.filter(
        (row) => row.source === 'bridge-scrape',
    ).length;
}

function countBridgeManual() {
    return loadManifest().scenarios.filter((row) => row.source === 'bridge')
        .length;
}

function snapshotStatus() {
    const manifest = loadManifest();

    return {
        generated_at: new Date().toISOString(),
        totals: {
            manifest_scenarios: manifest.scenarios.length,
            syn_ai: count('syn-ai-'),
            web_scraped: countWebScraped(),
            web: countWebScraped(),
            bridge_scrape: countBridgeScrape(),
            bridge_manual: countBridgeManual(),
            bridge: countBridgeManual(),
            syn_hq: count('syn-hq-'),
            web_flow_ai: manifest.scenarios.filter((row) =>
                row.flow_group?.startsWith('web-flow-ai-'),
            ).length,
            wizard_flow_groups: new Set(
                manifest.scenarios.map((row) => row.flow_group).filter(Boolean),
            ).size,
        },
        targets: {
            syn_ai: 4000,
            bridge_scrape_web_net_new: 2500,
            bridge_manual_net_new: 1500,
            targeted_hq: 500,
            wizard_flows: 500,
        },
        progress_files: {
            ai: join(FIXTURE_ROOT, 'ai-corpus-bulk-progress.json'),
            bridge_scrape: join(
                FIXTURE_ROOT,
                'bridge-scrape-bulk-progress.json',
            ),
            bridge_scrape_batch: join(
                FIXTURE_ROOT,
                'bridge-scrape-progress.json',
            ),
            bridge_manual: join(FIXTURE_ROOT, 'bridge-capture-sprint.json'),
            firecrawl: join(FIXTURE_ROOT, 'firecrawl-bulk-progress.json'),
        },
    };
}

function runNode(script, args = []) {
    const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
    });

    return result.status ?? 1;
}

function main() {
    if (hasFlag('status')) {
        const status = snapshotStatus();
        writeFileSync(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);
        console.log(JSON.stringify(status, null, 2));

        return;
    }

    const track = parseArg('track');
    const total = parseArg('total');
    const startId = parseArg('start-id');
    const resume = hasFlag('resume');

    const engine = parseArg('engine');
    const resolvedTrack =
        track === 'firecrawl' && engine === 'bridge' ? 'bridge-scrape' : track;

    if (!resolvedTrack) {
        console.error(
            'Pass --track=ai|bridge-scrape|firecrawl|wizard|targeted|mechanical or --status',
        );

        process.exit(1);
    }

    const args = [];

    if (total) {
        args.push(`--total=${total}`);
    }

    if (startId) {
        args.push(`--start-id=${startId}`);
    }

    if (resume) {
        args.push('--resume');
    }

    if (hasFlag('force-firecrawl')) {
        args.push('--force-firecrawl');
    }

    let exitCode = 0;

    switch (resolvedTrack) {
        case 'ai':
            exitCode = runNode(
                'scripts/form-corpus/run-ai-corpus-generate-bulk.mjs',
                args,
            );
            break;
        case 'bridge-scrape':
            exitCode = runNode(
                'scripts/form-corpus/run-bridge-scrape-bulk.mjs',
                args,
            );
            break;
        case 'firecrawl':
            exitCode = runNode(
                'scripts/form-corpus/run-firecrawl-generate-bulk.mjs',
                args,
            );
            break;
        case 'wizard':
        case 'targeted':
        case 'mechanical':
            console.error(
                'Disabled: templated clone generators removed. Use --track=bridge-scrape for real web captures.',
            );
            process.exit(1);
            break;
        default:
            console.error(`Unknown track: ${resolvedTrack}`);
            process.exit(1);
    }

    const status = snapshotStatus();
    writeFileSync(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);

    process.exit(exitCode);
}

main();
