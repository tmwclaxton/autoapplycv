#!/usr/bin/env node
/**
 * Run many Firecrawl batches sequentially with checkpoint/resume.
 *
 * Usage:
 *   node scripts/form-corpus/run-firecrawl-generate-bulk.mjs --total=2500
 *   node scripts/form-corpus/run-firecrawl-generate-bulk.mjs --resume
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBatchLimit, parseLimitArg } from './lib/batch-cap.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROGRESS_PATH = join(FIXTURE_ROOT, 'firecrawl-bulk-progress.json');
const RUNNER = join(ROOT, 'scripts/form-corpus/run-firecrawl-corpus-300.mjs');

function parseArg(name, fallback = null) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function countWebFixtures() {
    return loadManifest().scenarios.filter((row) => row.id.startsWith('web-'))
        .length;
}

function loadProgress() {
    if (!existsSync(PROGRESS_PATH)) {
        return null;
    }

    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
}

function saveProgress(progress) {
    progress.updated_at = new Date().toISOString();
    writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`);
}

function runBatch(limit, batchIndex) {
    const startedAt = Date.now();
    const args = [
        RUNNER,
        `--limit=${limit}`,
        '--skip-extension-e2e',
        '--use-matrix-report',
    ];

    if (batchIndex > 0) {
        args.push('--skip-discover');
    }

    const result = spawnSync(process.execPath, args, {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
    });

    return {
        limit,
        batch_index: batchIndex,
        exit_code: result.status ?? 1,
        duration_ms: Date.now() - startedAt,
        web_count: countWebFixtures(),
    };
}

function refreshApplyPool(batchIndex) {
    if (batchIndex === 0) {
        return;
    }

    console.log('\n=== Refresh apply URL pool (includes foreign boards) ===');
    spawnSync(
        process.execPath,
        [join(ROOT, 'scripts/form-corpus/refresh-apply-urls.mjs')],
        {
            cwd: ROOT,
            stdio: 'inherit',
            env: process.env,
        },
    );
}

function main() {
    if (!hasFlag('force-firecrawl')) {
        console.error(
            'Firecrawl bulk is disabled by default to preserve credits. Use extension bridge scrape instead:',
        );
        console.error(
            '  npm run form-corpus:bridge-scrape:bulk -- --total=2500',
        );
        console.error(
            '  npm run form-corpus:growth-plan -- --track=bridge-scrape --total=2500',
        );
        console.error(
            'Prerequisites: npm run extension-bridge + extension loaded from extension/dist/',
        );
        console.error('Pass --force-firecrawl to run Firecrawl anyway.');

        process.exit(1);
    }

    const resume = hasFlag('resume');
    const total = Number(parseArg('total', resume ? null : '2500'));
    const batchSize = assertBatchLimit(
        parseLimitArg() ?? Number(parseArg('batch-size', '50')),
    );
    const baselineWeb = countWebFixtures();

    let progress = resume ? loadProgress() : null;

    if (resume && !progress) {
        console.error(
            `No progress file at ${PROGRESS_PATH}. Run without --resume first.`,
        );

        process.exit(1);
    }

    if (!progress) {
        if (!Number.isFinite(total) || total < 1) {
            console.error('--total must be a positive integer.');

            process.exit(1);
        }

        progress = {
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            target_total: total,
            batch_size: batchSize,
            baseline_web_count: baselineWeb,
            generated_count: 0,
            batches: [],
        };
    }

    console.log(
        `Firecrawl bulk: target=${progress.target_total} net-new web fixtures, batch=${progress.batch_size}, current web=${countWebFixtures()}`,
    );

    while (progress.generated_count < progress.target_total) {
        const remaining = progress.target_total - progress.generated_count;
        const limit = Math.min(progress.batch_size, remaining);

        console.log(
            `\n=== Firecrawl batch ${progress.batches.length + 1}: limit=${limit} ===`,
        );

        refreshApplyPool(progress.batches.length);

        const beforeWeb = countWebFixtures();
        const batch = runBatch(limit, progress.batches.length);
        const accepted = Math.max(0, batch.web_count - beforeWeb);

        batch.accepted = accepted;
        progress.batches.push(batch);
        progress.generated_count += accepted;
        progress.last_batch = batch;
        saveProgress(progress);

        console.log(
            `Batch done: accepted=${accepted}, total progress=${progress.generated_count}/${progress.target_total}`,
        );

        if (batch.exit_code !== 0) {
            console.error(
                `Batch exited with code ${batch.exit_code}. Progress saved; re-run with --resume.`,
            );

            process.exit(batch.exit_code);
        }

        if (accepted === 0) {
            console.warn(
                'No new fixtures accepted this batch. Refreshing pool and continuing (use --resume after manual fix if repeated).',
            );
            spawnSync(
                process.execPath,
                [join(ROOT, 'scripts/form-corpus/refresh-apply-urls.mjs')],
                {
                    cwd: ROOT,
                    stdio: 'inherit',
                    env: process.env,
                },
            );

            if (
                progress.batches.filter((row) => row.accepted === 0).length >= 3
            ) {
                console.error(
                    'Three consecutive empty batches. Progress saved; re-run with --resume after reviewing discover/scrape filters.',
                );

                process.exit(1);
            }

            continue;
        }
    }

    console.log('\nFirecrawl bulk generation complete.');
    console.log(`Progress: ${PROGRESS_PATH}`);
}

main();
