#!/usr/bin/env node
/**
 * Batch extension E2E: run scenarios from e2e-scenarios.json manifest.
 */
import { writeFileSync } from 'node:fs';
import {
    E2E_MANIFEST_PATH,
    E2E_REPORT_PATH,
    listE2eScenarios,
    loadE2eManifest,
    resolveE2eScenarios,
} from './lib/e2e-scenarios.mjs';
import {
    runExtensionE2eBatch,
    summarizeE2eReport,
} from './lib/extension-fill-e2e.mjs';

function parseArgs() {
    const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
    const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1];
    const ciOnly = process.argv.includes('--ci') || (!process.env.EXTENSION_E2E_FULL && !process.argv.includes('--all'));
    const force = process.argv.includes('--force');

    return {
        id: idArg || null,
        limit: limitArg ? Number.parseInt(limitArg, 10) : null,
        ciOnly: ciOnly && !process.argv.includes('--all') && !idArg,
        force,
        reportPath: process.argv.find((arg) => arg.startsWith('--report='))?.split('=')[1] || E2E_REPORT_PATH,
    };
}

async function main() {
    const { id, limit, ciOnly, force, reportPath } = parseArgs();

    if (!process.env.EXTENSION_E2E && !force) {
        console.log('Skipped extension E2E batch (set EXTENSION_E2E=1 or pass --force).');
        process.exit(0);
    }

    const e2eManifest = loadE2eManifest();
    const entries = listE2eScenarios(e2eManifest, { ciOnly, limit, id });
    const resolved = resolveE2eScenarios({
        ...e2eManifest,
        scenarios: entries,
    }).filter(({ scenario }) => scenario !== null);

    if (resolved.length === 0) {
        console.error('No runnable E2E scenarios found in manifest.');
        process.exit(1);
    }

    const scenarios = resolved.map(({ scenario }) => scenario);
    const mode = ciOnly ? 'ci' : 'full';

    console.error(`Running ${scenarios.length} extension E2E scenarios (${mode}) from ${E2E_MANIFEST_PATH}`);

    let completed = 0;
    const report = await runExtensionE2eBatch({
        scenarios,
        reportPath,
        onProgress(result) {
            completed += 1;
            const status = result.passed ? 'PASS' : 'FAIL';
            console.error(`[${completed}/${scenarios.length}] ${status} ${result.id}${result.error ? `: ${result.error}` : ''}`);
        },
    });

    const summary = summarizeE2eReport(report, e2eManifest);
    const enriched = {
        ...report,
        mode,
        manifest: E2E_MANIFEST_PATH,
        thresholds: e2eManifest.thresholds,
        summary,
    };

    writeFileSync(reportPath, `${JSON.stringify(enriched, null, 2)}\n`);
    console.log(JSON.stringify(enriched, null, 2));

    const thresholds = e2eManifest.thresholds || {};
    const overallOk = report.totals.pass_rate >= (thresholds.overall_pass_rate ?? 1);
    const criticalOk = summary.critical_pass_rate >= (thresholds.critical_pass_rate ?? 1);
    const ciOk = !ciOnly || summary.ci_pass_rate >= (thresholds.ci_critical_pass_rate ?? 1);

    if (!overallOk || !criticalOk || !ciOk) {
        process.exit(1);
    }
}

await main();
