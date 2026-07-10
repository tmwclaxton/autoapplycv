#!/usr/bin/env node
/**
 * Run dual-oracle 300 campaign batches (max 50 each). Does not chain beyond
 * --batches=N in one process without an explicit flag.
 *
 * Usage:
 *   node scripts/form-corpus/run-dual-oracle-300-batches.mjs --batches=1
 *   node scripts/form-corpus/run-dual-oracle-300-batches.mjs --start=1 --batches=6
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBatchLimit } from './lib/batch-cap.mjs';
import {
    DUAL_ORACLE_300_TARGET,
    loadDualOracle300Progress,
} from './lib/dual-oracle-300-progress.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArg(name, fallback) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function runBatch(batchIndex) {
    const batchId = `oracle-url-queue-batch-${String(batchIndex).padStart(2, '0')}`;
    const urlsFile = join(FIXTURE_ROOT, `${batchId}.json`);

    if (!existsSync(urlsFile)) {
        throw new Error(`Missing batch file: ${urlsFile}`);
    }

    const progress = loadDualOracle300Progress();

    if (progress.agree_ids.length >= (progress.target || DUAL_ORACLE_300_TARGET)) {
        console.log(`Campaign already at ${progress.agree_ids.length}/${progress.target}`);

        return { skipped: true };
    }

    console.log(`\n######## Running ${batchId} ########`);
    const result = spawnSync(
        process.execPath,
        [
            'scripts/form-corpus/curated-oracle-capture.mjs',
            '--limit=50',
            `--urls-file=${urlsFile}`,
            `--batch-id=${batchId}`,
        ],
        {
            cwd: ROOT,
            stdio: 'inherit',
            env: process.env,
        },
    );

    if (result.status !== 0) {
        throw new Error(`${batchId} exited ${result.status}`);
    }

    return { skipped: false };
}

function topUpBatchFromReserve(batchIndex) {
    const batchId = `oracle-url-queue-batch-${String(batchIndex).padStart(2, '0')}`;
    const batchPath = join(FIXTURE_ROOT, `${batchId}.json`);
    const reservePath = join(FIXTURE_ROOT, 'oracle-url-queue-reserve.json');

    if (!existsSync(batchPath) || !existsSync(reservePath)) {
        return;
    }

    const progress = loadDualOracle300Progress();
    const skippedUrls = new Set(
        (progress.skipped || [])
            .filter((row) => row.batch_id === batchId && row.page_url)
            .map((row) => row.page_url),
    );

    if (skippedUrls.size === 0) {
        return;
    }

    const reserve = JSON.parse(readFileSync(reservePath, 'utf8'));
    const reserveUrls = Array.isArray(reserve.urls) ? reserve.urls : [];
    const replacements = reserveUrls.splice(0, skippedUrls.size);

    if (replacements.length === 0) {
        return;
    }

    writeFileSync(reservePath, `${JSON.stringify(reserve, null, 2)}\n`);
    const topUpPath = join(FIXTURE_ROOT, `${batchId}-topup.json`);
    writeFileSync(
        topUpPath,
        `${JSON.stringify({
            version: 1,
            batch_id: `${batchId}-topup`,
            urls: replacements,
        }, null, 2)}\n`,
    );

    console.log(`\n######## Top-up ${batchId} with ${replacements.length} reserve URLs ########`);
    spawnSync(
        process.execPath,
        [
            'scripts/form-corpus/curated-oracle-capture.mjs',
            `--limit=${assertBatchLimit(replacements.length)}`,
            `--urls-file=${topUpPath}`,
            `--batch-id=${batchId}-topup`,
        ],
        { cwd: ROOT, stdio: 'inherit', env: process.env },
    );
}

function main() {
    const start = Number(parseArg('start', '1'));
    const batches = Number(parseArg('batches', '1'));

    if (!Number.isFinite(start) || start < 1 || start > 6) {
        throw new Error('--start must be 1..6');
    }

    if (!Number.isFinite(batches) || batches < 1 || batches > 6) {
        throw new Error('--batches must be 1..6 (never auto-chain beyond one invocation without explicit count)');
    }

    for (let i = 0; i < batches; i += 1) {
        const batchIndex = start + i;

        if (batchIndex > 6) {
            break;
        }

        const progress = loadDualOracle300Progress();

        if (progress.agree_ids.length >= (progress.target || DUAL_ORACLE_300_TARGET)) {
            console.log('Campaign target reached - stopping.');
            break;
        }

        runBatch(batchIndex);
        topUpBatchFromReserve(batchIndex);
    }

    const finalProgress = loadDualOracle300Progress();
    console.log(JSON.stringify({
        agrees: finalProgress.agree_ids.length,
        target: finalProgress.target,
        batches_recorded: finalProgress.batches.length,
        skipped: finalProgress.skipped.length,
        disagree_triage: finalProgress.disagree_triage.length,
        patterns_fixed: finalProgress.patterns_fixed,
    }, null, 2));
}

main();
