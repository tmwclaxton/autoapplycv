#!/usr/bin/env node
/**
 * Run extension E2E + answer-quality audit on a fixed scenario set.
 *
 * Usage:
 *   npm run build:extension
 *   EXTENSION_E2E=1 node scripts/form-corpus/run-answer-quality-audit.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    runExtensionE2eBatch,
    summarizeE2eReport,
} from './lib/extension-fill-e2e.mjs';
import { loadManifest } from './lib/manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const AUDIT_MANIFEST_PATH = join(ROOT, 'tests/fixtures/extension-e2e/audit-scenarios.json');
const REPORT_PATH = join(ROOT, 'tests/fixtures/extension-e2e/answer-quality-audit-report.json');

function loadAuditManifest() {
    return JSON.parse(readFileSync(AUDIT_MANIFEST_PATH, 'utf8'));
}

function scoreResult(result) {
    const dom = result.domVerify || {};
    const criteria = {
        dom_apply: Boolean(result.passed),
        completeness: (dom.filled ?? 0) >= (dom.checked ?? 0) && (result.requiredVerify?.failures?.length ?? 0) === 0,
        no_error_banner: result.errorBanner?.passed !== false,
        draft_started: Boolean(result.startResult?.success),
    };

    return {
        id: result.id,
        passed: Object.values(criteria).every(Boolean),
        criteria,
        dom_filled: dom.filled ?? 0,
        dom_checked: dom.checked ?? 0,
        required_failures: result.requiredVerify?.failures?.length ?? 0,
        dom_failures: (dom.failures || result.domVerify?.failures || []).slice(0, 8),
        legacy_dom_failures: result.domFailures || [],
        error: result.error || null,
    };
}

async function main() {
    if (!process.env.EXTENSION_E2E && !process.argv.includes('--force')) {
        console.error('Set EXTENSION_E2E=1 or pass --force');
        process.exit(1);
    }

    const auditManifest = loadAuditManifest();
    const manifest = loadManifest();
    const byId = new Map(manifest.scenarios.map((scenario) => [scenario.id, scenario]));
    const scenarios = auditManifest.scenarios
        .map((entry) => byId.get(entry.id))
        .filter(Boolean);

    if (scenarios.length === 0) {
        console.error('No audit scenarios resolved from manifest.');
        process.exit(1);
    }

    console.error(`Running answer-quality audit E2E on ${scenarios.length} scenarios`);

    let completed = 0;
    const e2eReport = await runExtensionE2eBatch({
        scenarios,
        reportPath: null,
        onProgress(result) {
            completed += 1;
            const status = result.passed ? 'PASS' : 'FAIL';
            console.error(`[${completed}/${scenarios.length}] ${status} ${result.id}`);
        },
    });

    const scored = e2eReport.results.map(scoreResult);
    const passed = scored.filter((row) => row.passed);

    const report = {
        generated_at: new Date().toISOString(),
        scenario_count: scenarios.length,
        e2e_pass_rate: e2eReport.totals.pass_rate,
        audit_pass_rate: scenarios.length === 0 ? 0 : Number((passed.length / scenarios.length).toFixed(4)),
        totals: {
            scenarios: scenarios.length,
            e2e_passed: e2eReport.totals.passed,
            audit_passed: passed.length,
        },
        scenarios: scored,
        raw_results: e2eReport.results,
    };

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
        report: REPORT_PATH,
        totals: report.totals,
        audit_pass_rate: report.audit_pass_rate,
        failed: scored.filter((row) => !row.passed).map((row) => row.id),
    }, null, 2));

    if (passed.length < scenarios.length) {
        process.exit(1);
    }
}

await main();
