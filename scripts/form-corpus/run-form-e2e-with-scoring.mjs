#!/usr/bin/env node
/**
 * Full form E2E pipeline: extension fill + NanoGPT answer scoring.
 *
 * Sail-only live tier (requires NANOGPT_LIVE_TESTS=1 and ./vendor/bin/sail up).
 *
 * Usage:
 *   npm run build:extension
 *   NANOGPT_LIVE_TESTS=1 npm run form-corpus:form-e2e-scoring -- --limit=5
 *   NANOGPT_LIVE_TESTS=1 npm run form-corpus:form-e2e-scoring -- --skip-e2e --limit=10
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    runExtensionE2eBatch,
    summarizeE2eReport,
} from './lib/extension-fill-e2e.mjs';
import { loadManifest } from './lib/manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCORING_MANIFEST_PATH = join(ROOT, 'tests/fixtures/extension-e2e/form-e2e-scoring-scenarios.json');
const E2E_REPORT_PATH = join(ROOT, 'tests/fixtures/extension-e2e/form-e2e-scoring-e2e-report.json');

const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith('--limit='))?.split('=')[1];
const limit = limitArg ? Number(limitArg) : null;
const skipE2e = args.includes('--skip-e2e');
const force = args.includes('--force');
const failOnE2e = args.includes('--fail-on-e2e');
const sailBin = join(ROOT, 'vendor/bin/sail');

function requireLiveGate() {
    if (force) {
        return;
    }

    if (!process.env.NANOGPT_LIVE_TESTS) {
        console.error('Set NANOGPT_LIVE_TESTS=1 for live NanoGPT scoring (Sail/local only, not CI).');
        console.error('Pass --force to bypass this gate.');
        process.exit(1);
    }

    if (!existsSync(sailBin)) {
        console.error('Sail is required for the full scoring pipeline. Run: ./vendor/bin/sail up -d');
        process.exit(1);
    }
}

function loadScoringManifest() {
    if (!existsSync(SCORING_MANIFEST_PATH)) {
        console.error(`Missing ${SCORING_MANIFEST_PATH}. Run: npm run form-corpus:build-form-e2e-scoring`);
        process.exit(1);
    }

    return JSON.parse(readFileSync(SCORING_MANIFEST_PATH, 'utf8'));
}

function resolveScenarios(scoringManifest) {
    const manifest = loadManifest();
    const byId = new Map(manifest.scenarios.map((scenario) => [scenario.id, scenario]));

    let entries = scoringManifest.scenarios || [];

    if (limit && limit > 0) {
        entries = entries.slice(0, limit);
    }

    const scenarios = entries
        .map((entry) => byId.get(entry.id))
        .filter(Boolean);

    return { entries, scenarios };
}

function runArtisanScore(entryLimit) {
    const artisanArgs = ['artisan', 'form-e2e:score'];

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

    return result.status ?? 1;
}

async function main() {
    requireLiveGate();

    const scoringManifest = loadScoringManifest();
    const { entries, scenarios } = resolveScenarios(scoringManifest);

    if (scenarios.length === 0) {
        console.error('No scoring scenarios resolved from form manifest.');
        process.exit(1);
    }

    console.error(`Form E2E + scoring pipeline on ${scenarios.length} fixtures (${entries.length} scoring entries)`);

    let e2eExit = 0;

    if (!skipE2e) {
        if (!process.env.EXTENSION_E2E && !force) {
            console.error('Set EXTENSION_E2E=1 for extension fill E2E, or pass --skip-e2e / --force.');
            process.exit(1);
        }

        console.error('Phase 1/2: extension fill E2E...');

        let completed = 0;
        const e2eReport = await runExtensionE2eBatch({
            scenarios,
            reportPath: E2E_REPORT_PATH,
            onProgress(result) {
                completed += 1;
                const status = result.passed ? 'PASS' : 'FAIL';
                console.error(`  [${completed}/${scenarios.length}] ${status} ${result.id}`);
            },
        });

        const summary = summarizeE2eReport(e2eReport);
        console.error(`E2E pass rate: ${(summary.pass_rate * 100).toFixed(1)}% (${summary.passed}/${summary.total})`);

        if (failOnE2e && summary.passed < summary.total) {
            e2eExit = 1;
        }
    } else {
        console.error('Phase 1/2: skipped extension E2E (--skip-e2e)');
    }

    console.error('Phase 2/2: NanoGPT answer scoring via Sail...');
    const scoreExit = runArtisanScore(limit && limit > 0 ? limit : null);

    const exitCode = scoreExit !== 0 ? scoreExit : e2eExit;
    process.exit(exitCode);
}

await main();
