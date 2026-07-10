#!/usr/bin/env node
/**
 * Run many extension-bridge scrape batches sequentially with checkpoint/resume.
 *
 * Prerequisites:
 *   npm run extension-bridge
 *   Extension loaded from extension/dist/ with bridge connected
 *
 * Usage:
 *   node scripts/form-corpus/run-bridge-scrape-bulk.mjs --total=2500
 *   node scripts/form-corpus/run-bridge-scrape-bulk.mjs --resume
 *   node scripts/form-corpus/run-bridge-scrape-bulk.mjs --total=2500 --max-batches-per-run=3
 *
 * Operator note: tail tests/fixtures/form-extraction/bridge-scrape-bulk.log (or stdio)
 * and review the first batch before leaving long runs unattended.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBatchLimit, parseLimitArg } from './lib/batch-cap.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROGRESS_PATH = join(FIXTURE_ROOT, 'bridge-scrape-bulk-progress.json');
const SCRAPE_PROGRESS_PATH = join(FIXTURE_ROOT, 'bridge-scrape-progress.json');
const SCRAPER = join(ROOT, 'scripts/form-corpus/scrape-bridge.mjs');

function parseArg(name, fallback = null) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function countBridgeScrapeFixtures() {
    return loadManifest().scenarios.filter(
        (row) => row.source === 'bridge-scrape',
    ).length;
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

function loadScrapeProgressSummary() {
    if (!existsSync(SCRAPE_PROGRESS_PATH)) {
        return null;
    }

    try {
        const scrapeProgress = JSON.parse(
            readFileSync(SCRAPE_PROGRESS_PATH, 'utf8'),
        );

        return {
            scraped: scrapeProgress.scraped ?? 0,
            accepted: scrapeProgress.accepted ?? 0,
            skipped_count: scrapeProgress.skipped?.length ?? 0,
            attempted_count: scrapeProgress.attempted_urls?.length ?? 0,
            last_url: scrapeProgress.last_url ?? null,
        };
    } catch {
        return null;
    }
}

function appendRunningSummary(progress, batchResult) {
    const scrapeSummary = loadScrapeProgressSummary();
    progress.running_summary = {
        batches_completed: progress.batches.length,
        net_accepted: progress.generated_count,
        target_total: progress.target_total,
        last_batch: batchResult,
        scrape_checkpoint: scrapeSummary,
        updated_at: new Date().toISOString(),
    };
    saveProgress(progress);

    console.log(
        `Running summary: batches=${progress.batches.length}, net accepted=${progress.generated_count}/${progress.target_total}, last batch accepted=${batchResult.accepted}, scrape skipped=${scrapeSummary?.skipped_count ?? 'n/a'}`,
    );
}

function runBatch(limit) {
    const startedAt = Date.now();
    const result = spawnSync(process.execPath, [SCRAPER, `--limit=${limit}`], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
    });

    return {
        limit,
        exit_code: result.status ?? 1,
        duration_ms: Date.now() - startedAt,
        bridge_scrape_count: countBridgeScrapeFixtures(),
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
    const resume = hasFlag('resume');
    const total = Number(parseArg('total', resume ? null : '2500'));
    const batchSize = assertBatchLimit(
        parseLimitArg() ?? Number(parseArg('batch-size', '50')),
    );
    const maxBatchesPerRun = Number(parseArg('max-batches-per-run', '0'));
    const baselineBridgeScrape = countBridgeScrapeFixtures();
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
            max_batches_per_run:
                Number.isFinite(maxBatchesPerRun) && maxBatchesPerRun > 0
                    ? maxBatchesPerRun
                    : null,
            baseline_bridge_scrape_count: baselineBridgeScrape,
            baseline_web_count: baselineWeb,
            generated_count: 0,
            batches: [],
        };
    }

    const batchesThisRunLimit =
        progress.max_batches_per_run ??
        (Number.isFinite(maxBatchesPerRun) && maxBatchesPerRun > 0
            ? maxBatchesPerRun
            : null);
    const batchesAtStart = progress.batches.length;

    console.log(
        `Bridge scrape bulk: target=${progress.target_total} net-new bridge-scrape fixtures, batch=${progress.batch_size}, current bridge-scrape=${countBridgeScrapeFixtures()}, web=${countWebFixtures()}${batchesThisRunLimit ? `, max batches this run=${batchesThisRunLimit}` : ''}`,
    );
    console.log(
        'Prerequisites: npm run extension-bridge + extension loaded from extension/dist/',
    );
    console.log(
        'Monitor: tail progress file and review the first batch before unattended overnight runs.',
    );

    while (progress.generated_count < progress.target_total) {
        const remaining = progress.target_total - progress.generated_count;
        const limit = Math.min(progress.batch_size, remaining);

        console.log(
            `\n=== Bridge scrape batch ${progress.batches.length + 1}: limit=${limit} ===`,
        );

        refreshApplyPool(progress.batches.length);

        const beforeBridgeScrape = countBridgeScrapeFixtures();
        const batch = runBatch(limit);
        const accepted = Math.max(
            0,
            batch.bridge_scrape_count - beforeBridgeScrape,
        );

        batch.accepted = accepted;
        progress.batches.push(batch);
        progress.generated_count += accepted;
        progress.last_batch = batch;
        appendRunningSummary(progress, batch);

        console.log(
            `Batch done: accepted=${accepted}, total progress=${progress.generated_count}/${progress.target_total}`,
        );

        if (
            batchesThisRunLimit &&
            progress.batches.length - batchesAtStart >= batchesThisRunLimit
        ) {
            console.log(
                `Reached --max-batches-per-run=${batchesThisRunLimit}. Progress saved; review bridge-scrape-bulk-progress.json then re-run with --resume.`,
            );

            process.exit(0);
        }

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
        }
    }

    console.log('\nBridge scrape bulk generation complete.');
    console.log(`Progress: ${PROGRESS_PATH}`);
}

main();
