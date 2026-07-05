import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './manifest.mjs';
import { EXPECTED_DIR, FIXTURE_ROOT } from './paths.mjs';

export const CURATED_MANIFEST_PATH = join(FIXTURE_ROOT, 'fill-verify-curated.json');

const INTERACTIVE_FIELD_TYPES = ['radio', 'checkbox', 'select', 'combobox', 'file', 'textarea'];

export function detectPlatform(scenario) {
    const id = scenario.id || '';
    const url = scenario.page_url || scenario.source_url || '';
    const hay = `${id} ${url}`.toLowerCase();

    if (hay.includes('greenhouse')) {
        return 'greenhouse';
    }

    if (hay.includes('ashby')) {
        return 'ashby';
    }

    if (hay.includes('lever.co') || hay.includes('jobs-lever') || id.includes('-lever-')) {
        return 'lever';
    }

    if (hay.includes('smartrecruiters')) {
        return 'smartrecruiters';
    }

    if (hay.includes('workday') || hay.includes('myworkdayjobs')) {
        return 'workday';
    }

    if (hay.includes('teamtailor')) {
        return 'teamtailor';
    }

    if (hay.includes('bamboohr')) {
        return 'bamboohr';
    }

    if (hay.includes('wpforms') || hay.includes('wordpress') || hay.includes('wp-')) {
        return 'wordpress';
    }

    if (hay.includes('trakstar')) {
        return 'trakstar';
    }

    if (id.startsWith('syn-fw-')) {
        return 'syn-fw';
    }

    if (id.startsWith('syn-ix-')) {
        return 'syn-ix';
    }

    if (id.startsWith('syn-mega-')) {
        return 'syn-mega';
    }

    if (id.startsWith('syn-corpus2-')) {
        if (hay.includes('teamtailor')) {
            return 'teamtailor';
        }

        if (hay.includes('bamboohr')) {
            return 'bamboohr';
        }

        if (hay.includes('workable')) {
            return 'workable';
        }

        if (hay.includes('icims')) {
            return 'icims';
        }

        if (hay.includes('jotform')) {
            return 'jotform';
        }

        return 'syn-corpus2';
    }

    if (id.startsWith('syn-basic-')) {
        return 'syn-basic';
    }

    if (id.startsWith('web-')) {
        return 'generic-web';
    }

    return scenario.category || 'other';
}

export function loadExpected(id) {
    const path = join(EXPECTED_DIR, `${id}.json`);

    if (!existsSync(path)) {
        return null;
    }

    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
}

export function analyzeScenario(scenario) {
    const expected = loadExpected(scenario.id);

    if (!expected?.fields) {
        return null;
    }

    const fieldCount = expected.fields.length;

    if (fieldCount < 2) {
        return null;
    }

    const fieldTypes = [...new Set(expected.fields.map((field) => field.field_type))];
    const domRoles = [...new Set(expected.fields.map((field) => field.dom?.role).filter(Boolean))];
    const interesting = {
        radio: fieldTypes.includes('radio'),
        checkbox: fieldTypes.includes('checkbox'),
        select: fieldTypes.includes('select'),
        combobox: fieldTypes.includes('combobox') || domRoles.includes('combobox'),
        file: fieldTypes.includes('file'),
        textarea: fieldTypes.includes('textarea'),
        multiStep: (expected.controls?.length ?? 0) > 0,
        roleRadio: domRoles.includes('radio') || expected.fields.some((field) => field.dom?.role === 'radio'),
    };

    const diversityScore = fieldCount + Object.values(interesting).filter(Boolean).length * 3;

    return {
        id: scenario.id,
        platform: detectPlatform(scenario),
        fieldCount,
        fieldTypes,
        interesting,
        diversityScore,
        category: scenario.category,
        status: scenario.status,
        page_url: scenario.page_url,
    };
}

export function loadCuratedManifest() {
    if (!existsSync(CURATED_MANIFEST_PATH)) {
        throw new Error(`Curated manifest not found: ${CURATED_MANIFEST_PATH}`);
    }

    return JSON.parse(readFileSync(CURATED_MANIFEST_PATH, 'utf8'));
}

export function resolveCuratedScenarios(curatedManifest) {
    const manifest = loadManifest();
    const byId = new Map(manifest.scenarios.map((scenario) => [scenario.id, scenario]));

    return curatedManifest.scenarios.map((entry) => {
        const scenario = byId.get(entry.id);

        if (!scenario) {
            return { entry, scenario: null };
        }

        return { entry, scenario };
    });
}

export function needsPlaywright(entry, analysis) {
    if (entry.playwright) {
        return true;
    }

    if (!analysis) {
        return false;
    }

    const { interesting, fieldTypes } = analysis;

    return interesting.radio
        || interesting.checkbox
        || interesting.combobox
        || interesting.roleRadio
        || fieldTypes.includes('combobox');
}

export function summarizeByPlatform(results) {
    const platforms = {};

    for (const result of results) {
        if (result.skipped) {
            continue;
        }

        const platform = result.platform || 'other';

        if (!platforms[platform]) {
            platforms[platform] = { total: 0, passed: 0, failed: 0, critical_total: 0, critical_passed: 0 };
        }

        platforms[platform].total += 1;

        if (result.passed) {
            platforms[platform].passed += 1;
        } else {
            platforms[platform].failed += 1;
        }

        if (result.priority === 'critical') {
            platforms[platform].critical_total += 1;

            if (result.passed) {
                platforms[platform].critical_passed += 1;
            }
        }
    }

    for (const stats of Object.values(platforms)) {
        stats.pass_rate = stats.total === 0 ? 0 : Number((stats.passed / stats.total).toFixed(4));
        stats.critical_pass_rate = stats.critical_total === 0
            ? 0
            : Number((stats.critical_passed / stats.critical_total).toFixed(4));
    }

    return platforms;
}

function pickBest(candidates, count, usedIds) {
    return candidates
        .filter((candidate) => !usedIds.has(candidate.id))
        .sort((left, right) => right.diversityScore - left.diversityScore)
        .slice(0, count);
}

function buildEntry(analysis, { priority = 'standard', reason, playwright = false, verifyEngine = null } = {}) {
    const flags = Object.entries(analysis.interesting)
        .filter(([, value]) => value)
        .map(([key]) => key);

    const engine = verifyEngine || (analysis.id.startsWith('web-') ? 'playwright' : 'jsdom');

    return {
        id: analysis.id,
        platform: analysis.platform,
        reason: reason || `Representative ${analysis.platform} form (${analysis.fieldCount} fields, ${flags.join('+') || 'text'})`,
        field_types: analysis.fieldTypes,
        field_count: analysis.fieldCount,
        priority,
        verify_engine: engine,
        playwright: engine === 'playwright',
        playwright_priority: PLAYWRIGHT_IDS.has(analysis.id),
    };
}

const SYN_FW_PICKS = [
    { id: 'syn-fw-angular-001', reason: 'Angular reactive form with select + textarea' },
    { id: 'syn-fw-react-001', reason: 'React controlled inputs baseline' },
    { id: 'syn-fw-vue-001', reason: 'Vue v-model binding' },
    { id: 'syn-fw-svelte-001', reason: 'Svelte two-way bind' },
    { id: 'syn-fw-dom-001', reason: 'Vanilla DOM form' },
    { id: 'syn-fw-ashby-001', reason: 'Ashby-style synthetic widget shell' },
    { id: 'syn-fw-wd-001', reason: 'Workday-style synthetic apply flow' },
    { id: 'syn-fw-lever-001', reason: 'Lever-style synthetic apply flow' },
    { id: 'syn-fw-shadow-002', reason: 'Shadow DOM encapsulation' },
    { id: 'syn-fw-wizard-001', reason: 'Multi-step wizard navigation' },
];

const SYN_IX_PICKS = [
    'syn-ix-fw-001',
    'syn-ix-fw-002',
    'syn-ix-dropdown-004',
    'syn-ix-combobox-001',
    'syn-ix-combobox-002',
    'syn-ix-modal-001',
    'syn-ix-reveal-001',
    'syn-ix-date-001',
    'syn-ix-date-002',
    'syn-ix-reveal-002',
];

const SYN_MEGA_CATEGORIES = [
    'mega-greenhouse',
    'mega-ashby',
    'mega-lever',
    'mega-workday',
    'mega-combobox',
    'mega-conditional',
    'mega-wizard',
    'mega-shadow',
    'mega-vue',
    'mega-angular',
    'mega-date',
    'mega-dropdown',
    'mega-next',
    'mega-grid',
    'mega-svelte',
];

const CRITICAL_IDS = new Set([
    'web-ashby-notion-bdm-f603aedb',
    'web-boards-greenhouse-io-8614025002',
    'web-jobs-lever-co-apply-11',
    'web-jobs-smartrecruiters-com-99cf550a-4a3b-47f8-b682-449cc524d98f',
    'web-jobs-ashbyhq-com-application-9',
    'syn-fw-ashby-001',
    'syn-fw-wd-001',
    'syn-fw-lever-001',
]);

const PLAYWRIGHT_IDS = new Set([
    'web-ashby-notion-bdm-f603aedb',
    'web-jobs-ashbyhq-com-application-9',
    'web-jobs-ashbyhq-com-application-16',
    'web-boards-greenhouse-io-8614025002',
    'web-jobs-lever-co-apply-11',
    'web-jobs-smartrecruiters-com-99cf550a-4a3b-47f8-b682-449cc524d98f',
    'web-vekst-teamtailor-com-new',
    'web-jobs-ashbyhq-com-application-3',
    'web-job-boards-greenhouse-io-5025215008',
    'web-jobs-lever-co-apply-5',
    'web-wpforms-com-employment-agency-application-form-template',
    'web-apply-workable-com-apply-7',
    'web-dupont-wd5-myworkdayjobs-com-applymanually',
]);

export function buildCuratedManifest() {
    const manifest = loadManifest();
    const vetted = manifest.scenarios.filter((scenario) => scenario.status === 'vetted');
    const analyzed = vetted.map(analyzeScenario).filter(Boolean);
    const byPlatform = {};

    for (const item of analyzed) {
        if (!byPlatform[item.platform]) {
            byPlatform[item.platform] = [];
        }

        byPlatform[item.platform].push(item);
    }

    const usedIds = new Set();
    const scenarios = [];

    function addAnalysis(analysis, options = {}) {
        if (!analysis || usedIds.has(analysis.id)) {
            return;
        }

        usedIds.add(analysis.id);

        scenarios.push(buildEntry(analysis, {
            priority: CRITICAL_IDS.has(analysis.id) ? 'critical' : options.priority || 'standard',
            reason: options.reason,
            playwright: PLAYWRIGHT_IDS.has(analysis.id) || options.playwright || false,
        }));
    }

    function addById(id, options = {}) {
        const analysis = analyzed.find((item) => item.id === id);

        addAnalysis(analysis, options);
    }

    for (const id of CRITICAL_IDS) {
        addById(id, { priority: 'critical' });
    }

    for (const pick of pickBest(byPlatform.greenhouse || [], 9, usedIds)) {
        addAnalysis(pick, { priority: pick.id.includes('8614025002') ? 'critical' : 'standard' });
    }

    for (const pick of pickBest(byPlatform.ashby || [], 8, usedIds)) {
        addAnalysis(pick, { playwright: pick.interesting.radio || pick.interesting.checkbox });
    }

    for (const pick of pickBest(byPlatform.lever || [], 7, usedIds)) {
        addAnalysis(pick);
    }

    for (const pick of pickBest(byPlatform.smartrecruiters || [], 5, usedIds)) {
        addAnalysis(pick);
    }

    const workdayPool = [
        ...(byPlatform.workday || []),
    ].sort((left, right) => right.diversityScore - left.diversityScore);

    for (const pick of pickBest(workdayPool, 5, usedIds)) {
        addAnalysis(pick);
    }

    for (const pick of pickBest(byPlatform.teamtailor || [], 5, usedIds)) {
        addAnalysis(pick);
    }

    for (const pick of pickBest(byPlatform.wordpress || [], 4, usedIds)) {
        addAnalysis(pick);
    }

    for (const pick of pickBest(byPlatform['generic-web'] || [], 3, usedIds)) {
        addAnalysis(pick, { reason: `Generic web form with ${pick.fieldCount} fields` });
    }

    for (const pick of pickBest(byPlatform.bamboohr || [], 2, usedIds)) {
        addAnalysis(pick);
    }

    for (const pick of pickBest(byPlatform.workable || [], 2, usedIds)) {
        addAnalysis(pick);
    }

    for (const pick of pickBest(byPlatform.icims || [], 2, usedIds)) {
        addAnalysis(pick);
    }

    for (const pick of pickBest(byPlatform['syn-corpus2'] || [], 4, usedIds)) {
        addAnalysis(pick, { reason: 'syn-corpus2 diverse layout representative' });
    }

    for (const pick of pickBest(byPlatform.trakstar || [], 2, usedIds)) {
        addAnalysis(pick);
    }

    for (const fwPick of SYN_FW_PICKS) {
        addById(fwPick.id, { reason: fwPick.reason, priority: fwPick.id === 'syn-fw-ashby-001' ? 'critical' : 'standard' });
    }

    for (const ixId of SYN_IX_PICKS) {
        addById(ixId, { playwright: false });
    }

    for (const megaCategory of SYN_MEGA_CATEGORIES) {
        const candidate = (byPlatform['syn-mega'] || [])
            .filter((item) => item.category === megaCategory && !usedIds.has(item.id))
            .sort((left, right) => right.diversityScore - left.diversityScore)[0];

        if (candidate) {
            addAnalysis(candidate, { reason: `syn-mega ${megaCategory} representative` });
        }
    }

    const underrepresented = ['icims', 'workable', 'jotform'];

    for (const keyword of underrepresented) {
        const candidate = analyzed
            .filter((item) => item.id.includes(keyword) && !usedIds.has(item.id))
            .sort((left, right) => right.diversityScore - left.diversityScore)[0];

        if (candidate) {
            addAnalysis(candidate, { reason: `Underrepresented ATS/pattern: ${keyword}` });
        }
    }

    return {
        version: 1,
        generated_at: new Date().toISOString(),
        description: 'Curated fill verification tier prioritizing platform diversity and verification depth over corpus quantity.',
        thresholds: {
            jsdom: {
                critical_pass_rate: 1,
                overall_pass_rate: 1,
            },
            playwright: {
                critical_pass_rate: 1,
                overall_pass_rate: 1,
            },
            min_platforms: 12,
        },
        scenarios,
    };
}

export function listPlaywrightScenarios(curatedManifest, { priorityOnly = false } = {}) {
    const scenarios = curatedManifest.scenarios.filter((entry) => entry.verify_engine === 'playwright');

    if (priorityOnly) {
        return scenarios.filter((entry) => entry.playwright_priority || entry.priority === 'critical');
    }

    return scenarios;
}

export function listJsdomScenarios(curatedManifest) {
    return curatedManifest.scenarios.filter((entry) => entry.verify_engine !== 'playwright');
}

/** One representative scenario per platform for fast Playwright smoke tier. */
const SMOKE_PLATFORM_PICKS = [
    { platform: 'ashby', id: 'web-ashby-notion-bdm-f603aedb' },
    { platform: 'greenhouse', id: 'web-boards-greenhouse-io-8614025002' },
    { platform: 'lever', id: 'web-jobs-lever-co-apply-11' },
    { platform: 'smartrecruiters', id: 'web-jobs-smartrecruiters-com-99cf550a-4a3b-47f8-b682-449cc524d98f' },
    { platform: 'workday', id: 'web-dupont-wd5-myworkdayjobs-com-applymanually' },
    { platform: 'teamtailor', id: 'web-vekst-teamtailor-com-new-3' },
    { platform: 'wordpress', id: 'web-wpforms-com-employment-agency-application-form-template' },
    { platform: 'syn-fw', id: 'syn-fw-ashby-001' },
    { platform: 'syn-ix', id: 'syn-ix-fw-001' },
    { platform: 'syn-mega', id: 'syn-mega-combobox-001' },
];

export function listSmokeScenarios(curatedManifest) {
    const byId = new Map(curatedManifest.scenarios.map((entry) => [entry.id, entry]));
    const usedPlatforms = new Set();
    const smoke = [];

    for (const pick of SMOKE_PLATFORM_PICKS) {
        const entry = byId.get(pick.id);

        if (entry && !usedPlatforms.has(pick.platform)) {
            usedPlatforms.add(pick.platform);
            smoke.push(entry);
        }
    }

    for (const entry of curatedManifest.scenarios) {
        if (usedPlatforms.has(entry.platform)) {
            continue;
        }

        if (entry.priority === 'critical' || entry.playwright_priority) {
            usedPlatforms.add(entry.platform);
            smoke.push(entry);
        }
    }

    return smoke;
}

export function buildSmokeManifest(curatedManifest) {
    const scenarios = listSmokeScenarios(curatedManifest);

    return {
        version: 1,
        generated_at: new Date().toISOString(),
        description: 'Per-platform Playwright smoke tier - one critical scenario per ATS/platform.',
        thresholds: {
            critical_pass_rate: 1,
            overall_pass_rate: 1,
        },
        scenarios,
    };
}
