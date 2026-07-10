#!/usr/bin/env node
/**
 * Regenerate weak syn-ai fixtures with high-complexity tier.
 *
 * Usage:
 *   node scripts/form-corpus/run-ai-repair-weak.mjs
 *   node scripts/form-corpus/run-ai-repair-weak.mjs --ids=syn-ai-0002,syn-ai-0004
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_IDS = ['syn-ai-0002', 'syn-ai-0004', 'syn-ai-0007', 'syn-ai-0008'];

function parseArg(name, fallback = null) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function main() {
    const ids = (parseArg('ids') || DEFAULT_IDS.join(',')).split(',').map((id) => id.trim()).filter(Boolean);

    console.log(`Repairing ${ids.length} weak syn-ai fixture(s) with complexity-tier=high`);

    let passed = 0;

    for (const id of ids) {
        console.log(`\n=== ${id} ===`);
        const result = spawnSync('php', [
            join(ROOT, 'artisan'),
            'form-corpus:generate-ai',
            `--id=${id}`,
            '--complexity-tier=high',
        ], { cwd: ROOT, stdio: 'inherit', env: process.env });

        if ((result.status ?? 1) === 0) {
            passed++;
        }
    }

    console.log('\n=== Post-repair: propose + scrutinize ===');

    for (const id of ids) {
        spawnSync(process.execPath, [
            join(ROOT, 'scripts/form-corpus/propose-expectations.mjs'),
            `--id=${id}`,
            '--force',
        ], { cwd: ROOT, stdio: 'inherit' });
    }

    spawnSync(process.execPath, [join(ROOT, 'scripts/form-corpus/scrutinize-ai-corpus.mjs')], {
        cwd: ROOT,
        stdio: 'inherit',
    });

    console.log(`\nRepair complete: ${passed}/${ids.length} artisan runs exited 0`);
    process.exit(passed === ids.length ? 0 : 1);
}

main();
