#!/usr/bin/env node
/**
 * Ensure all syn-ai-* fixtures pass: propose, regenerate failures, vet, fill-verify.
 *
 * Usage:
 *   node scripts/form-corpus/ensure-ai-corpus-passes.mjs
 *   node scripts/form-corpus/ensure-ai-corpus-passes.mjs --regenerate-only
 *   node scripts/form-corpus/ensure-ai-corpus-passes.mjs --skip-regenerate
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT, HTML_DIR } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRUTINY_PATH = join(FIXTURE_ROOT, 'ai-corpus-scrutiny-report.json');

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
        env: process.env,
    });

    return result.status ?? 1;
}

function runPhp(args) {
    const result = spawnSync('php', [join(ROOT, 'artisan'), ...args], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
    });

    return result.status ?? 1;
}

function synAiIdsWithHtml() {
    const manifest = loadManifest();

    return manifest.scenarios
        .filter((row) => row.id.startsWith('syn-ai-'))
        .filter((row) => existsSync(join(HTML_DIR, row.html_file || `${row.id}.html`)))
        .map((row) => row.id)
        .sort();
}

function failedScrutinyIds() {
    if (!existsSync(SCRUTINY_PATH)) {
        return [];
    }

    const report = JSON.parse(readFileSync(SCRUTINY_PATH, 'utf8'));

    return (report.results || [])
        .filter((row) => row.passed === false)
        .map((row) => row.id);
}

function main() {
    const skipRegenerate = hasFlag('skip-regenerate');
    const regenerateOnly = hasFlag('regenerate-only');
    const maxRounds = Number(parseArg('max-rounds', '2'));

    console.log('=== Ensure syn-ai corpus passes ===\n');

    if (!regenerateOnly) {
        console.log('Step 1: Propose expectations for all syn-ai HTML...');
        const proposeExit = runNode('scripts/form-corpus/propose-expectations.mjs', [
            '--id-prefix=syn-ai-',
            '--force',
        ]);

        if (proposeExit !== 0) {
            process.exit(proposeExit);
        }

        console.log('\nStep 2: Tag variety metadata...');
        runNode('scripts/form-corpus/tag-fixture-variety.mjs', ['--id-prefix=syn-ai-']);
    }

    if (!skipRegenerate) {
        for (let round = 1; round <= maxRounds; round++) {
            console.log(`\nStep 3: Scrutinize (round ${round})...`);
            runNode('scripts/form-corpus/scrutinize-ai-corpus.mjs');

            const failures = failedScrutinyIds();

            if (failures.length === 0) {
                console.log('All syn-ai fixtures pass scrutiny.');
                break;
            }

            console.log(`Regenerating ${failures.length} failing fixture(s): ${failures.join(', ')}`);

            for (const id of failures) {
                console.log(`\n--- Regenerate ${id} (high tier) ---`);
                const exit = runPhp([
                    'form-corpus:generate-ai',
                    `--id=${id}`,
                    '--complexity-tier=high',
                ]);

                if (exit !== 0) {
                    console.warn(`Warning: ${id} generation exited ${exit}`);
                }

                runNode('scripts/form-corpus/propose-expectations.mjs', [`--id=${id}`, '--force']);
                runNode('scripts/form-corpus/tag-fixture-variety.mjs', [`--id=${id}`]);
            }
        }
    }

    console.log('\nStep 4: Validate AI corpus...');
    const validateExit = runNode('scripts/form-corpus/validate-ai-corpus.mjs');

    console.log('\nStep 5: Vet syn-ai fixtures...');
    const vetExit = runNode('scripts/form-corpus/vet-corpus.mjs', [
        '--id-prefix=syn-ai-',
        '--pending-only',
        '--slim-report',
    ]);

    console.log('\nStep 6: Fill-verify syn-ai fixtures...');
    const fillExit = runNode('scripts/form-corpus/run-fill-verify.mjs', [
        '--id-prefix=syn-ai-',
        '--check-validity',
        '--check-a11y',
        '--check-errors',
        '--workers=8',
        '--json-only',
    ]);

    console.log('\nStep 7: Final scrutiny report...');
    runNode('scripts/form-corpus/scrutinize-ai-corpus.mjs');

    const remaining = failedScrutinyIds();
    const summary = {
        syn_ai_with_html: synAiIdsWithHtml().length,
        scrutiny_failures: remaining,
        validate_exit: validateExit,
        vet_exit: vetExit,
        fill_verify_exit: fillExit,
        passed: remaining.length === 0 && validateExit === 0 && vetExit === 0 && fillExit === 0,
    };

    console.log('\n=== Summary ===');
    console.log(JSON.stringify(summary, null, 2));

    process.exit(summary.passed ? 0 : 1);
}

main();
