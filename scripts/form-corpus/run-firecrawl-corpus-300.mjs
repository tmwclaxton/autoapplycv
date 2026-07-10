#!/usr/bin/env node
/**
 * Discover + scrape job application forms via Firecrawl, vet, and stress-test Draft All fill.
 *
 * Usage:
 *   node scripts/form-corpus/run-firecrawl-corpus-300.mjs
 *   node scripts/form-corpus/run-firecrawl-corpus-300.mjs --limit=300 --skip-discover
 *   node scripts/form-corpus/run-firecrawl-corpus-300.mjs --skip-scrape --ids-file=./accepted-ids.json
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBatchLimit } from './lib/batch-cap.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';
import { runFillVerifyParallel } from './lib/run-fill-verify-parallel.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = join(FIXTURE_ROOT, 'firecrawl-corpus-300-report.json');

function parseArg(name, fallback = null) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function runNode(script, args = [], { inherit = true } = {}) {
    const result = spawnSync(process.execPath, [script, ...args], {
        cwd: ROOT,
        stdio: inherit ? 'inherit' : 'pipe',
        env: {
            ...process.env,
            NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=4096',
        },
    });

    if (result.status !== 0) {
        throw new Error(`${script} ${args.join(' ')} exited ${result.status}`);
    }

    return result;
}

function snapshotWebCounts() {
    const manifest = loadManifest();
    const web = manifest.scenarios.filter((row) => row.id.startsWith('web-'));

    return {
        total: manifest.scenarios.length,
        web: web.length,
        vetted: web.filter((row) => row.status === 'vetted').length,
        pending: web.filter((row) => (row.status ?? 'pending') === 'pending').length,
    };
}

function newWebIds(beforeIds) {
    const manifest = loadManifest();
    const before = new Set(beforeIds);

    return manifest.scenarios
        .filter((row) => row.id.startsWith('web-') && !before.has(row.id))
        .map((row) => row.id);
}

async function main() {
    const requestedLimit = parseArg('limit', '50');
    const limit = assertBatchLimit(Number(requestedLimit));
    const skipDiscover = hasFlag('skip-discover');
    const skipScrape = hasFlag('skip-scrape');
    const skipFillVerify = hasFlag('skip-fill-verify');
    const skipExtensionE2e = hasFlag('skip-extension-e2e');
    const scrapeDelay = parseArg('delay', '800');
    const maxAttempts = parseArg('max-attempts', String(Math.max(limit * 15, 5000)));
    const staticFirst = hasFlag('static-first');
    const applyOnly = !hasFlag('include-listings');
    const concurrency = parseArg('concurrency', '4');
    const idsFile = parseArg('ids-file', '');
    const extensionE2eLimit = Number(parseArg('extension-e2e-limit', '50'));
    const workers = parseArg('workers', '8');

    const startedAt = new Date().toISOString();
    const before = snapshotWebCounts();
    const beforeWebIds = loadManifest().scenarios.filter((row) => row.id.startsWith('web-')).map((row) => row.id);
    const report = {
        started_at: startedAt,
        limit,
        before,
        phases: {},
        accepted_ids: [],
        fill_verify: null,
        extension_e2e: null,
        after: null,
        finished_at: null,
    };

    console.log(`Firecrawl corpus batch: target ${limit} new web fixtures (currently ${before.web} web, ${before.pending} pending).`);

    console.log('\n=== Phase 0: Rebuild manifest from disk ===');
    runNode(join(ROOT, 'scripts/form-corpus/rebuild-manifest.mjs'));
    report.before = snapshotWebCounts();

    if (!skipDiscover) {
        console.log('\n=== Phase 1: Firecrawl discover ===');
        const t0 = Date.now();
        runNode(join(ROOT, 'scripts/form-corpus/discover.mjs'), [
            ...(hasFlag('use-matrix-report') ? ['--use-matrix-report'] : []),
        ]);
        report.phases.discover = { ok: true, duration_ms: Date.now() - t0 };
    } else {
        report.phases.discover = { skipped: true };
    }

    let acceptedIds = [];
    const scrapeRounds = Number(parseArg('scrape-rounds', '3'));
    let scrapeRound = 0;
    let totalAcceptedThisRun = 0;

    if (!skipScrape) {
        while (scrapeRound < scrapeRounds && totalAcceptedThisRun < limit) {
            scrapeRound += 1;
            const remaining = limit - totalAcceptedThisRun;
            console.log(`\n=== Phase 2.${scrapeRound}: Firecrawl scrape (${remaining} remaining) ===`);

            if (scrapeRound > 1) {
                runNode(join(ROOT, 'scripts/form-corpus/refresh-apply-urls.mjs'));
            }

            const t0 = Date.now();
            runNode(join(ROOT, 'scripts/form-corpus/scrape.mjs'), [
                `--limit=${remaining}`,
                `--max-attempts=${maxAttempts}`,
                `--delay=${scrapeDelay}`,
                `--concurrency=${concurrency}`,
                ...(staticFirst ? ['--static-first'] : []),
                ...(applyOnly ? ['--apply-only'] : []),
            ]);
            const roundAccepted = newWebIds(beforeWebIds).length - acceptedIds.length;
            acceptedIds = newWebIds(beforeWebIds);
            totalAcceptedThisRun = acceptedIds.length;
            report.phases[`scrape_${scrapeRound}`] = {
                ok: true,
                duration_ms: Date.now() - t0,
                accepted_this_round: roundAccepted,
                accepted_total: totalAcceptedThisRun,
            };

            if (roundAccepted === 0 && scrapeRound >= scrapeRounds) {
                console.log('No new fixtures accepted after all scrape rounds.');
                break;
            }

            if (roundAccepted === 0) {
                console.log(`No new fixtures accepted in round ${scrapeRound}; ${scrapeRounds - scrapeRound} round(s) remaining.`);
            }
        }

        report.phases.scrape = { rounds: scrapeRound, accepted: totalAcceptedThisRun };
        report.accepted_ids = acceptedIds;
        writeFileSync(join(FIXTURE_ROOT, 'firecrawl-corpus-300-accepted-ids.json'), `${JSON.stringify({ accepted_ids: acceptedIds }, null, 2)}\n`);

        if (acceptedIds.length > 0) {
            console.log('\n=== Phase 2b: Tag variety / pattern signatures ===');
            runNode(join(ROOT, 'scripts/form-corpus/tag-fixture-variety.mjs'), [
                '--id-prefix=web-',
                `--limit=${Math.min(acceptedIds.length, limit)}`,
            ]);
        }
    } else if (idsFile && existsSync(idsFile)) {
        acceptedIds = JSON.parse(readFileSync(idsFile, 'utf8')).accepted_ids || [];
        report.accepted_ids = acceptedIds;
        report.phases.scrape = { skipped: true, ids_from: idsFile };
    } else {
        report.phases.scrape = { skipped: true };
    }

    if (acceptedIds.length > 0) {
        console.log('\n=== Phase 3: Propose expectations ===');
        const t0 = Date.now();
        runNode(join(ROOT, 'scripts/form-corpus/propose-expectations.mjs'), ['--id-prefix=web-']);
        report.phases.propose = { ok: true, duration_ms: Date.now() - t0 };

        console.log('\n=== Phase 4: Vet pending web fixtures ===');
        const t1 = Date.now();
        runNode(join(ROOT, 'scripts/form-corpus/vet-corpus.mjs'), ['--id-prefix=web-', '--pending-only', '--slim-report']);
        report.phases.vet = { ok: true, duration_ms: Date.now() - t1 };
    } else {
        report.phases.propose = { skipped: true, reason: 'no new fixtures' };
        report.phases.vet = { skipped: true, reason: 'no new fixtures' };
    }

    const manifest = loadManifest();
    const vettedNewIds = acceptedIds.filter((id) => {
        const scenario = manifest.scenarios.find((row) => row.id === id);

        return scenario && (scenario.status === 'vetted' || scenario.status === 'pending');
    });

    if (!skipFillVerify && vettedNewIds.length > 0) {
        console.log(`\n=== Phase 5: Draft All fill-verify (${vettedNewIds.length} vetted fixtures, ${workers} workers) ===`);
        const t0 = Date.now();
        const fillReportPath = join(FIXTURE_ROOT, 'firecrawl-corpus-300-fill-verify-report.json');
        const verifyOptions = {
            validationCheck: true,
            a11yCheck: true,
            errorCheck: true,
        };
        const scenarios = vettedNewIds
            .map((id) => manifest.scenarios.find((row) => row.id === id))
            .filter(Boolean);
        const results = await runFillVerifyParallel(scenarios, {
            workerCount: Number(workers),
            verifyOptions,
        });
        const evaluated = results.filter((row) => !row.skipped);
        const passed = evaluated.filter((row) => row.passed);
        const fillReport = {
            generated_at: new Date().toISOString(),
            totals: {
                scenarios: results.length,
                evaluated: evaluated.length,
                passed: passed.length,
                failed: evaluated.length - passed.length,
                pass_rate: evaluated.length === 0 ? 0 : Number((passed.length / evaluated.length).toFixed(4)),
            },
            results,
        };

        writeFileSync(fillReportPath, `${JSON.stringify(fillReport, null, 2)}\n`);
        report.fill_verify = fillReport;
        report.phases.fill_verify = { ok: true, duration_ms: Date.now() - t0, vetted_new: vettedNewIds.length };
    } else if (skipFillVerify) {
        report.phases.fill_verify = { skipped: true };
    } else {
        report.phases.fill_verify = { skipped: true, reason: 'no vetted new fixtures' };
    }

    if (!skipExtensionE2e && vettedNewIds.length > 0) {
        console.log(`\n=== Phase 6: Extension Draft All E2E (sample ${extensionE2eLimit}) ===`);
        const t0 = Date.now();
        const sample = vettedNewIds.slice(0, extensionE2eLimit);

        runNode(join(ROOT, 'scripts/form-corpus/generate-e2e-mocks.mjs'), ['--manifest']);

        for (const id of sample) {
            try {
                runNode(join(ROOT, 'scripts/form-corpus/generate-e2e-mocks.mjs'), [`--id=${id}`]);
            } catch (error) {
                console.warn(`Mock generation failed for ${id}: ${error.message}`);
            }
        }

        const e2eReportPath = join(FIXTURE_ROOT, 'firecrawl-corpus-300-extension-e2e-report.json');
        process.env.EXTENSION_E2E = '1';

        for (const id of sample) {
            try {
                runNode(join(ROOT, 'scripts/form-corpus/run-extension-fill-e2e-batch.mjs'), [
                    `--id=${id}`,
                    '--force',
                    `--report=${e2eReportPath}`,
                ]);
            } catch (error) {
                console.warn(`Extension E2E failed for ${id}: ${error.message}`);
            }
        }

        if (existsSync(e2eReportPath)) {
            report.extension_e2e = JSON.parse(readFileSync(e2eReportPath, 'utf8'));
        }

        report.phases.extension_e2e = { ok: true, duration_ms: Date.now() - t0, sample_size: sample.length };
    } else {
        report.phases.extension_e2e = { skipped: skipExtensionE2e };
    }

    report.after = snapshotWebCounts();
    report.finished_at = new Date().toISOString();
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

    console.log('\n=== Firecrawl corpus batch complete ===');
    console.log(JSON.stringify({
        accepted: report.accepted_ids.length,
        before: report.before,
        after: report.after,
        report: REPORT_PATH,
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
