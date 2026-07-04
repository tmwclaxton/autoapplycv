#!/usr/bin/env node
/**
 * Full extension E2E: load unpacked extension, mock assist API, run Draft All.
 */
import {
    E2E_REPORT_PATH,
    listE2eScenarios,
    loadE2eManifest,
    resolveE2eScenarios,
} from './lib/e2e-scenarios.mjs';
import {
    runExtensionE2eBatch,
    summarizeE2eReport,
} from './lib/extension-fill-e2e.mjs';
import { loadManifest } from './lib/manifest.mjs';

const DEFAULT_SCENARIOS = [
    'web-ashby-notion-bdm-f603aedb',
    'web-boards-greenhouse-io-8614025002',
    'web-jobs-lever-co-apply-11',
];

async function main() {
    if (!process.env.EXTENSION_E2E && !process.argv.includes('--force')) {
        console.log('Skipped extension E2E (set EXTENSION_E2E=1 or pass --force).');
        process.exit(0);
    }

    const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
    const useManifest = process.argv.includes('--manifest') || process.argv.includes('--ci');
    let scenarios;
    let e2eManifest = null;

    if (useManifest) {
        e2eManifest = loadE2eManifest();
        const ciOnly = process.argv.includes('--ci');
        const entries = listE2eScenarios(e2eManifest, { ciOnly, id: idArg });
        scenarios = resolveE2eScenarios({ ...e2eManifest, scenarios: entries })
            .filter(({ scenario }) => scenario !== null)
            .map(({ scenario }) => scenario);
    } else {
        const manifest = loadManifest();
        const scenarioIds = idArg ? [idArg] : DEFAULT_SCENARIOS;
        scenarios = scenarioIds.map((scenarioId) => {
            const scenario = manifest.scenarios.find((entry) => entry.id === scenarioId);

            if (!scenario) {
                throw new Error(`Scenario not found: ${scenarioId}`);
            }

            return scenario;
        });
    }

    const report = await runExtensionE2eBatch({
        scenarios,
        reportPath: E2E_REPORT_PATH,
    });

    const enriched = {
        ...report,
        summary: e2eManifest ? summarizeE2eReport(report, e2eManifest) : null,
    };

    console.log(JSON.stringify(enriched, null, 2));

    if (report.totals.failed > 0) {
        process.exit(1);
    }
}

await main();
