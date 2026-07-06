#!/usr/bin/env node
/**
 * Orchestrate complex form corpus vetting: deterministic checks + optional Sail live scoring.
 *
 * Usage:
 *   node scripts/form-corpus/run-complex-form-vetting.mjs
 *   node scripts/form-corpus/run-complex-form-vetting.mjs --live --limit=10
 *   node scripts/form-corpus/run-complex-form-vetting.mjs --skip-live
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDeterministicAnswerVetting } from './lib/deterministic-answer-vetting.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCORING_PATH = join(ROOT, 'tests/fixtures/extension-e2e/complex-form-scoring-scenarios.json');
const REPORT_PATH = join(ROOT, 'tests/fixtures/extension-e2e/complex-form-vetting-report.json');
const sailBin = join(ROOT, 'vendor/bin/sail');

const args = process.argv.slice(2);
const skipLive = args.includes('--skip-live');
const live = args.includes('--live');
const limitArg = args.find((arg) => arg.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? Number(limitArg) : null;
const sampleArg = args.find((arg) => arg.startsWith('--sample='))?.split('=')[1];
const sampleSize = sampleArg ? Number(sampleArg) : 50;

function runNodeScript(script, scriptArgs = []) {
    const result = spawnSync(process.execPath, [join(ROOT, script), ...scriptArgs], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
        console.error(result.stderr || result.stdout);
        process.exit(result.status ?? 1);
    }

    return result.stdout;
}

function loadScoringManifest() {
    if (!existsSync(SCORING_PATH)) {
        console.error(`Missing ${SCORING_PATH}. Run: npm run form-corpus:build-complex-scoring`);
        process.exit(1);
    }

    return JSON.parse(readFileSync(SCORING_PATH, 'utf8'));
}

function runLiveScoring(entryLimit) {
    if (!existsSync(sailBin)) {
        console.error('Sail not found. Full live scoring: NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan complex-form:score');

        return { skipped: true, reason: 'sail_missing' };
    }

    if (!process.env.NANOGPT_LIVE_TESTS && !args.includes('--force')) {
        console.error('Set NANOGPT_LIVE_TESTS=1 for live NanoGPT scoring, or pass --force.');

        return { skipped: true, reason: 'nanogpt_gate' };
    }

    const artisanArgs = ['artisan', 'complex-form:score'];

    if (entryLimit && entryLimit > 0) {
        artisanArgs.push(`--limit=${entryLimit}`);
    }

    const result = spawnSync(sailBin, artisanArgs, {
        cwd: ROOT,
        stdio: 'inherit',
        env: {
            ...process.env,
            NANOGPT_LIVE_TESTS: process.env.NANOGPT_LIVE_TESTS || '1',
        },
    });

    return { skipped: false, exit_code: result.status ?? 1 };
}

function main() {
    console.error('Phase 1/3: validate complex corpus...');
    runNodeScript('scripts/form-corpus/validate-complex-corpus.mjs');

    console.error('Phase 2/3: deterministic persona answer vetting...');
    const scoringManifest = loadScoringManifest();
    const deterministic = runDeterministicAnswerVetting(scoringManifest.scenarios || [], { sampleSize });

    const report = {
        generated_at: new Date().toISOString(),
        corpus: { id_prefix: 'syn-complex-500-', expected_count: 500 },
        scoring_manifest: {
            path: SCORING_PATH,
            scenario_count: scoringManifest.scenario_count ?? scoringManifest.scenarios?.length ?? 0,
        },
        deterministic,
        live: null,
    };

    if (!skipLive && (live || process.env.NANOGPT_LIVE_TESTS)) {
        console.error('Phase 3/3: live NanoGPT scoring via Sail...');
        report.live = runLiveScoring(limit);
    } else {
        console.error('Phase 3/3: skipped live NanoGPT (use --live with NANOGPT_LIVE_TESTS=1 and Sail)');
        report.live = {
            skipped: true,
            command: 'NANOGPT_LIVE_TESTS=1 ./vendor/bin/sail artisan complex-form:score --limit=10',
        };
    }

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

    console.log(JSON.stringify({
        report: REPORT_PATH,
        deterministic_pass_rate: deterministic.pass_rate,
        deterministic_sampled: deterministic.sampled,
        live: report.live,
    }, null, 2));

    if (deterministic.passed < deterministic.sampled) {
        process.exit(1);
    }
}

main();
