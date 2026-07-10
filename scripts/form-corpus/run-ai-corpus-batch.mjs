#!/usr/bin/env node
/**
 * Run one syn-ai batch (max 50): generate, propose, vet, fill-verify, matrix report.
 *
 * Usage:
 *   node scripts/form-corpus/run-ai-corpus-batch.mjs --limit=50 --start-id=syn-ai-0001
 *   node scripts/form-corpus/run-ai-corpus-batch.mjs --dry-run
 *   node scripts/form-corpus/run-ai-corpus-batch.mjs --skip-post
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBatchLimit, parseLimitArg } from './lib/batch-cap.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';
import { pickMatrixTargetCell } from './lib/pick-matrix-target.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = join(FIXTURE_ROOT, 'ai-corpus-batch-report.json');

function parseArg(name, fallback = null) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function runNode(script, args = []) {
    const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
        cwd: ROOT,
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=4096',
        },
    });

    return result.status ?? 1;
}

function runPhp(artisanArgs) {
    const result = spawnSync('php', [join(ROOT, 'artisan'), ...artisanArgs], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
    });

    return result.status ?? 1;
}

function main() {
    const limit = assertBatchLimit(parseLimitArg() ?? parseArg('limit', '50'));
    const startId = parseArg('start-id', 'syn-ai-0001');
    const batchIndex = Number(parseArg('batch-index', '0'));
    const targetCell = parseArg('target-cell', '') || pickMatrixTargetCell(batchIndex) || '';
    const complexityTier = parseArg('complexity-tier', 'standard');
    const dryRun = hasFlag('dry-run');
    const skipPost = hasFlag('skip-post');
    const artisanArgs = [
        'form-corpus:generate-ai',
        `--start-id=${startId}`,
        `--limit=${limit}`,
        `--complexity-tier=${complexityTier}`,
    ];

    if (targetCell) {
        artisanArgs.push(`--target-cell=${targetCell}`);
    }

    if (dryRun) {
        artisanArgs.push('--dry-run');
    }

    console.log(`AI corpus batch: start=${startId}, limit=${limit}, target_cell=${targetCell || '(random brief)'}`);

    const generateExit = dryRun ? runPhp(artisanArgs) : runPhp(artisanArgs);

    let report = null;

    if (existsSync(REPORT_PATH)) {
        report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
    }

    const orchestrator = {
        limit,
        start_id: startId,
        target_cell: targetCell,
        batch_index: batchIndex,
        dry_run: dryRun,
        generate_exit_code: generateExit,
        post_pipeline: {},
    };

    if (!dryRun && !skipPost && generateExit === 0) {
        console.log('\n=== Post-batch: propose expectations ===');
        orchestrator.post_pipeline.propose = runNode('scripts/form-corpus/propose-expectations.mjs', [
            '--id-prefix=syn-ai-',
            `--start-id=${startId}`,
            `--limit=${limit}`,
            '--force',
        ]);

        console.log('\n=== Post-batch: validate-ai-corpus ===');
        orchestrator.post_pipeline.validate = runNode('scripts/form-corpus/validate-ai-corpus.mjs', [
            `--limit=${limit}`,
        ]);

        console.log('\n=== Post-batch: vet ===');
        orchestrator.post_pipeline.vet = runNode('scripts/form-corpus/vet-corpus.mjs', [
            '--id-prefix=syn-ai-',
            `--start-id=${startId}`,
            `--limit=${limit}`,
            '--pending-only',
            '--slim-report',
        ]);

        console.log('\n=== Post-batch: fill-verify ===');
        orchestrator.post_pipeline.fill_verify = runNode('scripts/form-corpus/run-fill-verify.mjs', [
            '--id-prefix=syn-ai-',
            `--start-id=${startId}`,
            `--limit=${limit}`,
            '--check-validity',
            '--check-a11y',
            '--check-errors',
            '--workers=8',
            '--json-only',
        ]);

        console.log('\n=== Post-batch: variety matrix report ===');
        orchestrator.post_pipeline.matrix = runNode('scripts/form-corpus/report-variety-matrix.mjs', ['--json-only']);
    } else if (skipPost) {
        orchestrator.post_pipeline = { skipped: true };
    }

    if (report) {
        report.orchestrator = orchestrator;
        writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    }

    const postFailed = Object.values(orchestrator.post_pipeline || {})
        .some((code) => typeof code === 'number' && code !== 0);

    process.exit(generateExit !== 0 ? generateExit : (postFailed ? 1 : 0));
}

main();
