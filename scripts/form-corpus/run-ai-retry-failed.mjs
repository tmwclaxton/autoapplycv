#!/usr/bin/env node
/**
 * Retry syn-ai fixtures that failed in the latest batch report.
 *
 * Usage:
 *   node scripts/form-corpus/run-ai-retry-failed.mjs
 *   node scripts/form-corpus/run-ai-retry-failed.mjs --report=path/to/report.json
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_ROOT } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_REPORT = join(FIXTURE_ROOT, 'ai-corpus-batch-report.json');

function parseArg(name, fallback = null) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function main() {
    const reportPath = parseArg('report', DEFAULT_REPORT);

    if (!existsSync(reportPath)) {
        console.error(`Report not found: ${reportPath}`);
        process.exit(1);
    }

    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const failedIds = (report.results || [])
        .filter((row) => !row.passed && !row.dry_run)
        .map((row) => row.id)
        .filter(Boolean);

    if (failedIds.length === 0) {
        console.log('No failed fixtures in batch report.');
        process.exit(0);
    }

    console.log(`Retrying ${failedIds.length} failed fixture(s): ${failedIds.join(', ')}`);

    for (const id of failedIds) {
        console.log(`\n=== ${id} ===`);
        spawnSync('php', [
            join(ROOT, 'artisan'),
            'form-corpus:generate-ai',
            `--id=${id}`,
            '--complexity-tier=high',
        ], { cwd: ROOT, stdio: 'inherit', env: process.env });
    }

    spawnSync(process.execPath, [join(ROOT, 'scripts/form-corpus/scrutinize-ai-corpus.mjs')], {
        cwd: ROOT,
        stdio: 'inherit',
    });
}

main();
