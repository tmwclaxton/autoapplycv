import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    analyzeScenario,
    detectPlatform,
    loadCuratedManifest,
    loadExpected,
} from './curated-manifest.mjs';
import { loadManifest } from './manifest.mjs';
import { EXPECTED_DIR, FIXTURE_ROOT, HTML_DIR } from './paths.mjs';

export const E2E_MANIFEST_PATH = join(FIXTURE_ROOT, '../extension-e2e/e2e-scenarios.json');
export const E2E_REPORT_PATH = join(FIXTURE_ROOT, '../extension-e2e/extension-e2e-report.json');

const CI_SCENARIO_IDS = new Set([
    'web-ashby-notion-bdm-f603aedb',
    'web-boards-greenhouse-io-8614025002',
    'web-jobs-lever-co-apply-11',
    'web-jobs-smartrecruiters-com-99cf550a-4a3b-47f8-b682-449cc524d98f',
    'web-dupont-wd5-myworkdayjobs-com-applymanually',
    'web-vekst-teamtailor-com-new',
    'web-wpforms-com-employment-agency-application-form-template',
    'syn-fw-ashby-001',
    'syn-fw-wd-001',
    'syn-fw-lever-001',
]);

const FORCED_CI_EXTRA_IDS = [
    'web-dupont-wd5-myworkdayjobs-com-applymanually',
];

const TARGET_SCENARIO_COUNT = 100;

const E2E_EXCLUDED_ID_PATTERNS = [
    /reed\.co\.uk/,
    /-icims-com-/,
];

function shouldExcludeFromE2e(scenario) {
    const hay = `${scenario.id} ${scenario.page_url || ''}`.toLowerCase();

    return E2E_EXCLUDED_ID_PATTERNS.some((pattern) => pattern.test(hay));
}

export function loadE2eManifest() {
    if (!existsSync(E2E_MANIFEST_PATH)) {
        throw new Error(`E2E manifest not found: ${E2E_MANIFEST_PATH}. Run: node scripts/form-corpus/build-e2e-scenarios.mjs`);
    }

    return JSON.parse(readFileSync(E2E_MANIFEST_PATH, 'utf8'));
}

export function isScenarioEligible(scenario, { requireHtml = true } = {}) {
    if (!scenario?.id) {
        return { eligible: false, skip_reason: 'missing_id' };
    }

    const expected = loadExpected(scenario.id);

    if (!expected?.fields || expected.fields.length < 2) {
        return { eligible: false, skip_reason: 'missing_or_tiny_expected' };
    }

    if (requireHtml) {
        const htmlPath = join(HTML_DIR, scenario.html_file);

        if (!existsSync(htmlPath)) {
            return { eligible: false, skip_reason: 'missing_html' };
        }
    }

    return { eligible: true, field_count: expected.fields.length };
}

function buildEntry(scenario, curatedEntry, { ci = false } = {}) {
    const analysis = analyzeScenario(scenario) || {};
    const platform = curatedEntry?.platform || analysis.platform || detectPlatform(scenario);

    return {
        id: scenario.id,
        platform,
        priority: curatedEntry?.priority || (CI_SCENARIO_IDS.has(scenario.id) ? 'critical' : 'standard'),
        field_count: analysis.fieldCount || curatedEntry?.field_count || null,
        field_types: curatedEntry?.field_types || analysis.fieldTypes || [],
        ci: ci || CI_SCENARIO_IDS.has(scenario.id),
        reason: curatedEntry?.reason || null,
    };
}

function pickExtraScenarios(manifest, usedIds, count) {
    const candidates = [];

    for (const scenario of manifest.scenarios) {
        if (usedIds.has(scenario.id)) {
            continue;
        }

        if (scenario.status !== 'vetted') {
            continue;
        }

        if (!scenario.id.startsWith('web-')) {
            continue;
        }

        if (shouldExcludeFromE2e(scenario)) {
            continue;
        }

        const eligibility = isScenarioEligible(scenario);

        if (!eligibility.eligible) {
            continue;
        }

        const analysis = analyzeScenario(scenario);

        if (!analysis) {
            continue;
        }

        candidates.push({
            scenario,
            analysis,
            diversityScore: analysis.diversityScore,
        });
    }

    const picked = [];
    const platformCounts = {};

    for (const candidate of candidates.sort((left, right) => right.diversityScore - left.diversityScore)) {
        if (picked.length >= count) {
            break;
        }

        const platform = candidate.analysis.platform;
        const current = platformCounts[platform] || 0;

        if (current >= 3 && picked.length >= count - 5) {
            continue;
        }

        picked.push(candidate);
        platformCounts[platform] = current + 1;
        usedIds.add(candidate.scenario.id);
    }

    if (picked.length < count) {
        for (const candidate of candidates) {
            if (picked.length >= count) {
                break;
            }

            if (usedIds.has(candidate.scenario.id)) {
                continue;
            }

            picked.push(candidate);
            usedIds.add(candidate.scenario.id);
        }
    }

    return picked.map(({ scenario, analysis }) => buildEntry(scenario, {
        platform: analysis.platform,
        field_count: analysis.fieldCount,
        field_types: analysis.fieldTypes,
        reason: `Extra web fixture (${analysis.fieldCount} fields, ${analysis.fieldTypes.join('+')})`,
    }));
}

export function buildE2eManifest() {
    const manifest = loadManifest();
    const curatedManifest = loadCuratedManifest();
    const byId = new Map(manifest.scenarios.map((scenario) => [scenario.id, scenario]));
    const usedIds = new Set();
    const scenarios = [];

    for (const entry of curatedManifest.scenarios) {
        const scenario = byId.get(entry.id);

        if (!scenario) {
            continue;
        }

        if (shouldExcludeFromE2e(scenario)) {
            scenarios.push({
                id: entry.id,
                platform: entry.platform,
                priority: entry.priority || 'standard',
                skip_reason: 'excluded_from_e2e',
                ci: CI_SCENARIO_IDS.has(entry.id),
            });
            usedIds.add(entry.id);

            continue;
        }

        const eligibility = isScenarioEligible(scenario);

        if (!eligibility.eligible) {
            scenarios.push({
                id: entry.id,
                platform: entry.platform,
                priority: entry.priority || 'standard',
                skip_reason: eligibility.skip_reason,
                ci: CI_SCENARIO_IDS.has(entry.id),
            });
            usedIds.add(entry.id);

            continue;
        }

        scenarios.push(buildEntry(scenario, entry, { ci: CI_SCENARIO_IDS.has(entry.id) }));
        usedIds.add(entry.id);
    }

    const activeCount = scenarios.filter((entry) => !entry.skip_reason).length;
    const needed = Math.max(0, TARGET_SCENARIO_COUNT - activeCount);

    if (needed > 0) {
        scenarios.push(...pickExtraScenarios(manifest, usedIds, needed));
    }

    for (const forcedId of FORCED_CI_EXTRA_IDS) {
        if (usedIds.has(forcedId)) {
            const existing = scenarios.find((entry) => entry.id === forcedId);

            if (existing) {
                existing.ci = true;
                existing.priority = 'critical';
            }

            continue;
        }

        const scenario = byId.get(forcedId);

        if (!scenario) {
            continue;
        }

        const eligibility = isScenarioEligible(scenario);

        if (!eligibility.eligible) {
            continue;
        }

        scenarios.push(buildEntry(scenario, {
            platform: detectPlatform(scenario),
            field_count: eligibility.field_count,
            reason: 'CI workday smoke scenario',
            priority: 'critical',
        }, { ci: true }));
        usedIds.add(forcedId);
    }

    const active = scenarios.filter((entry) => !entry.skip_reason);

    return {
        version: 1,
        generated_at: new Date().toISOString(),
        description: 'Extension E2E scenario manifest - Playwright with real extension and mocked assist API.',
        target_count: TARGET_SCENARIO_COUNT,
        thresholds: {
            critical_pass_rate: 1,
            overall_pass_rate: 1,
            ci_critical_pass_rate: 1,
        },
        scenarios,
        totals: {
            listed: scenarios.length,
            active: active.length,
            skipped: scenarios.filter((entry) => entry.skip_reason).length,
            ci: scenarios.filter((entry) => entry.ci && !entry.skip_reason).length,
            critical: active.filter((entry) => entry.priority === 'critical').length,
        },
    };
}

export function listE2eScenarios(e2eManifest, { ciOnly = false, limit = null, id = null } = {}) {
    let entries = e2eManifest.scenarios.filter((entry) => !entry.skip_reason);

    if (id) {
        entries = entries.filter((entry) => entry.id === id);
    }

    if (ciOnly) {
        entries = entries.filter((entry) => entry.ci);
    }

    if (typeof limit === 'number' && limit > 0) {
        entries = entries.slice(0, limit);
    }

    return entries;
}

export function resolveE2eScenarios(e2eManifest) {
    const manifest = loadManifest();
    const byId = new Map(manifest.scenarios.map((scenario) => [scenario.id, scenario]));

    return listE2eScenarios(e2eManifest).map((entry) => {
        const scenario = byId.get(entry.id);

        if (!scenario) {
            return { entry, scenario: null };
        }

        return { entry, scenario };
    });
}
