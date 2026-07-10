#!/usr/bin/env node
/**
 * Generate high-complexity syn-ai fixtures with checkpoint/resume.
 *
 * Usage:
 *   node scripts/form-corpus/run-ai-complex-batch.mjs
 *   node scripts/form-corpus/run-ai-complex-batch.mjs --start-id=syn-ai-0009 --total=100
 *   node scripts/form-corpus/run-ai-complex-batch.mjs --resume
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBatchLimit } from './lib/batch-cap.mjs';
import { FIXTURE_ROOT, HTML_DIR } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROGRESS_PATH = join(FIXTURE_ROOT, 'ai-complex-batch-progress.json');
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

function highestGeneratedNum(minNum) {
    let highest = minNum - 1;

    for (const file of readdirSync(HTML_DIR)) {
        const match = /^syn-ai-(\d+)\.html$/.exec(file);

        if (!match) {
            continue;
        }

        const num = Number(match[1]);

        if (num >= minNum && num > highest) {
            highest = num;
        }
    }

    return highest;
}

function loadProgress() {
    if (!existsSync(PROGRESS_PATH)) {
        return null;
    }

    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8'));
}

function runBatch(startId, limit, batchIndex, { skipPost = true } = {}) {
    const startedAt = Date.now();
    const args = [
        BATCH_RUNNER,
        `--start-id=${startId}`,
        `--limit=${limit}`,
        `--batch-index=${batchIndex}`,
        '--complexity-tier=high',
    ];

    if (skipPost) {
        args.push('--skip-post');
    }

    const result = spawnSync(process.execPath, args, {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
    });

    let report = null;
    const reportPath = join(FIXTURE_ROOT, 'ai-corpus-batch-report.json');

    if (existsSync(reportPath)) {
        report = JSON.parse(readFileSync(reportPath, 'utf8'));
    }

    return {
        start_id: startId,
        limit,
        exit_code: result.status ?? 1,
        duration_ms: Date.now() - startedAt,
        report,
    };
}

function runPostPipeline(startId, limit) {
    console.log(`\n=== Post-pipeline for ${startId} x ${limit} ===`);

    spawnSync(process.execPath, [
        join(ROOT, 'scripts/form-corpus/propose-expectations.mjs'),
        '--id-prefix=syn-ai-',
        `--start-id=${startId}`,
        `--limit=${limit}`,
        '--force',
    ], { cwd: ROOT, stdio: 'inherit' });

    spawnSync(process.execPath, [
        join(ROOT, 'scripts/form-corpus/run-fill-verify.mjs'),
        '--id-prefix=syn-ai-',
        `--start-id=${startId}`,
        `--limit=${limit}`,
        '--check-validity',
        '--check-a11y',
        '--check-errors',
        '--workers=8',
        '--json-only',
    ], { cwd: ROOT, stdio: 'inherit' });
}

function main() {
    const resume = hasFlag('resume');
    const total = Number(parseArg('total', resume ? null : '100'));
    const startId = parseArg('start-id', 'syn-ai-0009');
    const chunkSize = assertBatchLimit(Number(parseArg('chunk-size', '10')));
    const startNum = parseStartNum(startId);

    if (startNum === null) {
        console.error(`Invalid start id: ${startId}`);
        process.exit(1);
    }

    let progress = resume ? loadProgress() : null;

    if (resume && !progress) {
        console.error(`No progress file at ${PROGRESS_PATH}`);
        process.exit(1);
    }

    if (!progress) {
        progress = {
            started_at: new Date().toISOString(),
            complexity_tier: 'high',
            target_total: total,
            chunk_size: chunkSize,
            start_num: startNum,
            next_start_num: startNum,
            generated_count: 0,
            passed_count: 0,
            chunks: [],
            post_pipeline_runs: [],
        };
    }

    const targetTotal = progress.target_total;
    const resumeNum = highestGeneratedNum(progress.start_num ?? startNum);
    const resumeFrom = Math.max(progress.next_start_num ?? startNum, resumeNum + 1);

    if (resumeFrom > progress.next_start_num) {
        console.log(`Resuming from ${formatId(resumeFrom)} (found HTML through ${formatId(resumeNum)})`);
        progress.next_start_num = resumeFrom;
        progress.generated_count = Math.max(0, resumeFrom - (progress.start_num ?? startNum));
    }

    console.log(
        `High-complexity AI batch: ${targetTotal} fixtures from ${formatId(progress.start_num ?? startNum)}, chunk=${chunkSize}`,
    );

    while (progress.generated_count < targetTotal) {
        const remaining = targetTotal - progress.generated_count;
        const limit = Math.min(chunkSize, remaining);
        const batchStartId = formatId(progress.next_start_num);
        const batchIndex = progress.chunks.length;

        console.log(`\n=== Complex chunk ${batchIndex + 1}: ${batchStartId} x ${limit} ===`);

        const batch = runBatch(batchStartId, limit, batchIndex);
        progress.chunks.push(batch);
        progress.generated_count += limit;
        progress.passed_count += batch.report?.passed ?? 0;
        progress.next_start_num += limit;
        progress.updated_at = new Date().toISOString();
        writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`);

        if (batch.exit_code !== 0) {
            console.error(`Chunk failed with exit ${batch.exit_code}. Progress saved; re-run with --resume.`);
            process.exit(batch.exit_code);
        }

        if (progress.generated_count % 50 === 0 || progress.generated_count >= targetTotal) {
            const blockSize = progress.generated_count % 50 === 0 ? 50 : (progress.generated_count % 50);
            const blockStartNum = progress.next_start_num - blockSize;
            const blockStartId = formatId(blockStartNum);
            runPostPipeline(blockStartId, blockSize);
            progress.post_pipeline_runs.push({ start_id: blockStartId, limit: blockSize, at: new Date().toISOString() });
            writeFileSync(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`);
        }
    }

    console.log('\nRunning final scrutiny + weak fixture repair...');
    spawnSync(process.execPath, [join(ROOT, 'scripts/form-corpus/scrutinize-ai-corpus.mjs')], {
        cwd: ROOT,
        stdio: 'inherit',
    });

    spawnSync(process.execPath, [join(ROOT, 'scripts/form-corpus/run-ai-repair-weak.mjs')], {
        cwd: ROOT,
        stdio: 'inherit',
    });

    console.log(`\nComplex batch complete. Progress: ${PROGRESS_PATH}`);
}

main();
