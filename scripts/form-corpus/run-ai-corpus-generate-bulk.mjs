#!/usr/bin/env node
/**
 * Run many syn-ai batches sequentially with checkpoint/resume.
 *
 * Usage:
 *   node scripts/form-corpus/run-ai-corpus-generate-bulk.mjs --total=4000 --start-id=syn-ai-0001
 *   node scripts/form-corpus/run-ai-corpus-generate-bulk.mjs --resume
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBatchLimit, parseLimitArg } from './lib/batch-cap.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROGRESS_PATH = join(FIXTURE_ROOT, 'ai-corpus-bulk-progress.json');
const REPORT_PATH = join(FIXTURE_ROOT, 'ai-corpus-batch-report.json');
const BATCH_RUNNER = join(ROOT, 'scripts/form-corpus/run-ai-corpus-batch.mjs');

function parseArg(name, fallback = null) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function parseStartNum(id) {
    const match = /^syn-ai-(\d+)$/.exec(id);

    return match ? Number(match[1]) : null;
}

function formatId(num) {
    return `syn-ai-${String(num).padStart(4, '0')}`;
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

function runBatch(startId, limit, batchIndex, complexityTier = 'high') {
    const startedAt = Date.now();
    const result = spawnSync(
        process.execPath,
        [
            BATCH_RUNNER,
            `--start-id=${startId}`,
            `--limit=${limit}`,
            `--batch-index=${batchIndex}`,
            `--complexity-tier=${complexityTier}`,
        ],
        {
            cwd: ROOT,
            stdio: 'inherit',
            env: process.env,
        },
    );

    let report = null;

    if (existsSync(REPORT_PATH)) {
        report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
    }

    return {
        start_id: startId,
        limit,
        batch_index: batchIndex,
        exit_code: result.status ?? 1,
        duration_ms: Date.now() - startedAt,
        report,
    };
}

function main() {
    const resume = hasFlag('resume');
    const total = Number(parseArg('total', resume ? null : '4000'));
    const batchSize = assertBatchLimit(parseLimitArg() ?? Number(parseArg('batch-size', '50')));
    const startIdArg = parseArg('start-id', 'syn-ai-0001');
    const complexityTier = parseArg('complexity-tier', 'high');

    let progress = resume ? loadProgress() : null;

    if (resume && !progress) {
        console.error(`No progress file at ${PROGRESS_PATH}. Run without --resume first.`);

        process.exit(1);
    }

    if (!progress) {
        const startNum = parseStartNum(startIdArg);

        if (startNum === null) {
            console.error(`Invalid --start-id=${startIdArg}. Expected syn-ai-NNNN.`);

            process.exit(1);
        }

        if (!Number.isFinite(total) || total < 1) {
            console.error('--total must be a positive integer.');

            process.exit(1);
        }

        progress = {
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            target_total: total,
            batch_size: batchSize,
            complexity_tier: complexityTier,
            next_start_num: startNum,
            generated_count: 0,
            passed_count: 0,
            draft_count: 0,
            vetted_count: 0,
            batches: [],
        };
    }

    console.log(
        `AI corpus bulk: target=${progress.target_total}, next=${formatId(progress.next_start_num)}, batch=${progress.batch_size}`,
    );

    saveProgress(progress);

    while (progress.generated_count < progress.target_total) {
        const remaining = progress.target_total - progress.generated_count;
        const limit = Math.min(progress.batch_size, remaining);
        const startId = formatId(progress.next_start_num);
        const batchIndex = progress.batches.length;

        console.log(`\n=== Batch ${batchIndex + 1}: ${startId} x ${limit} ===`);

        const batch = runBatch(startId, limit, batchIndex, progress.complexity_tier ?? complexityTier);
        progress.batches.push(batch);

        const passed = batch.report?.passed ?? 0;
        const failed = batch.report?.failed ?? 0;

        progress.generated_count += limit;
        progress.passed_count += passed;
        progress.draft_count += failed;
        progress.next_start_num += limit;
        progress.last_batch = {
            start_id: startId,
            limit,
            passed,
            failed,
            finished_at: new Date().toISOString(),
            orchestrator: batch.report?.orchestrator ?? null,
        };

        saveProgress(progress);

        console.log(
            `Batch done: passed=${passed}, draft=${failed}, total progress=${progress.generated_count}/${progress.target_total}`,
        );

        if (batch.exit_code !== 0) {
            console.error(`Batch exited with code ${batch.exit_code}. Progress saved; re-run with --resume.`);

            process.exit(batch.exit_code);
        }
    }

    console.log('\nAI bulk generation complete.');
    console.log(`Progress: ${PROGRESS_PATH}`);
    console.log(
        `Summary: generated=${progress.generated_count}, passed=${progress.passed_count}, draft=${progress.draft_count}`,
    );
}

main();
