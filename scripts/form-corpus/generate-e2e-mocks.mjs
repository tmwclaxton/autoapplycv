#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    listE2eScenarios,
    loadE2eManifest,
    resolveE2eScenarios,
} from './lib/e2e-scenarios.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { buildFillPlan } from './lib/mock-answers.mjs';
import { EXPECTED_DIR, HTML_DIR } from './lib/paths.mjs';
import { buildFormDomContext } from './lib/snapshot-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_DIR = join(ROOT, 'tests/fixtures/extension-e2e/responses');

const LEGACY_SCENARIOS = [
    'web-ashby-notion-bdm-f603aedb',
    'web-boards-greenhouse-io-8614025002',
    'web-jobs-lever-co-apply-11',
];

const MOCK_SUBSCRIPTION = {
    tier: 'pro',
    autofills_remaining: 999,
    autofills_limit: 1000,
};

function parseArgs() {
    const useManifest = process.argv.includes('--manifest')
        || process.argv.includes('--all-e2e')
        || process.argv.some((arg) => arg.startsWith('--manifest='));
    const idArg = process.argv.find((arg) => arg.startsWith('--id='))?.split('=')[1];
    const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1];

    return {
        useManifest,
        id: idArg || null,
        limit: limitArg ? Number.parseInt(limitArg, 10) : null,
    };
}

function loadExpected(id) {
    return JSON.parse(readFileSync(join(EXPECTED_DIR, `${id}.json`), 'utf8'));
}

function inventoryFieldsFromSnapshot(snapshot) {
    return (snapshot.elements || []).map((element, index) => ({
        ref: element.ref ?? `f${index}`,
        question: element.question,
        field_type: element.field_type || 'text',
        max_chars: element.max_chars ?? null,
        options: element.options ?? null,
    }));
}

function buildDraftAllNdjson(plan) {
    const answers = plan.map((item) => ({
        ref: item.ref,
        label: item.field?.question || item.ref,
        field_type: item.field?.field_type || 'text',
        answer: item.answer,
    }));

    const lines = [
        { type: 'batch', batch_index: 0, answers },
        {
            type: 'complete',
            batches_ok: 1,
            batches_failed: 0,
            subscription: MOCK_SUBSCRIPTION,
        },
    ];

    return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}

function buildFieldAssertions(scenarioId, plan) {
    const assertions = [];

    for (const item of plan.slice(0, 6)) {
        const dom = item.dom || item.field?.dom || {};
        const label = (item.field?.question || item.ref).toLowerCase();

        if (dom.id) {
            assertions.push({ kind: 'id', selector: dom.id, ref: item.ref, answer: item.answer });
        } else if (dom.name) {
            assertions.push({ kind: 'name', selector: dom.name, ref: item.ref, answer: item.answer });
        } else if (label.includes('full name') || label.includes('first name')) {
            assertions.push({ kind: 'label_contains', selector: label.split(' ')[0], ref: item.ref, answer: item.answer });
        }
    }

    if (scenarioId.includes('ashby-notion')) {
        assertions.push(
            { kind: 'id', selector: '_systemfield_name', answer: plan.find((item) => item.ref === 'f2')?.answer },
            { kind: 'id', selector: '_systemfield_email', answer: plan.find((item) => item.ref === 'f3')?.answer },
        );
    }

    return assertions.filter((assertion) => assertion.answer);
}

function generateMocksForScenario(scenario) {
    const expected = loadExpected(scenario.id);
    const htmlPath = join(HTML_DIR, scenario.html_file);
    const pageUrl = scenario.page_url || `https://example.test/forms/${scenario.id}`;
    const pageTitle = scenario.page_title || 'Job Application';
    const html = readFileSync(htmlPath, 'utf8');
    const { snapshot } = buildFormDomContext({ html, pageUrl, pageTitle });
    const plan = buildFillPlan(expected, snapshot);
    const job = {
        title: pageTitle,
        company: scenario.id.split('-').slice(1, 3).join(' ') || 'Test Company',
        location: 'Remote',
        url: pageUrl,
    };

    const inventory = {
        success: true,
        fields: inventoryFieldsFromSnapshot(snapshot),
        complete: true,
        next_actions: [],
        autofill_cost: 1,
        subscription: MOCK_SUBSCRIPTION,
    };

    const profile = {
        user: {
            name: 'E2E Test User',
            email: 'e2e.test@example.com',
            avatar: null,
        },
        profile: {
            full_name: 'E2E Test User',
            headline: 'Software Engineer',
            email: 'e2e.test@example.com',
            phone: '+1 555 0100',
            location: 'San Francisco, CA',
            city: 'San Francisco',
            postcode: '94105',
            country: 'United States',
            linkedin_url: 'https://linkedin.com/in/e2e-test',
            website_url: null,
            summary: 'E2E test profile for extension fill automation.',
            skills: ['Testing', 'Automation'],
            experience: [],
            education: [],
            structured_data: {},
            formatted_cv_text: 'E2E Test User — Software Engineer',
            extra_context: null,
        },
        documents: [],
        document_categories: [],
        application_settings: {
            tone: 'professional',
            cover_letter_length: 'short',
        },
        subscription: MOCK_SUBSCRIPTION,
    };

    return {
        'job-context': {
            success: true,
            job,
            autofill_cost: 1,
            subscription: MOCK_SUBSCRIPTION,
        },
        inventory,
        'draft-all': buildDraftAllNdjson(plan),
        profile,
        meta: {
            scenario_id: scenario.id,
            plan_count: plan.length,
            field_assertions: buildFieldAssertions(scenario.id, plan),
        },
    };
}

function writeMocksForScenario(id, mocks) {
    writeFileSync(join(OUTPUT_DIR, `${id}.job-context.json`), `${JSON.stringify(mocks['job-context'], null, 2)}\n`);
    writeFileSync(join(OUTPUT_DIR, `${id}.inventory.json`), `${JSON.stringify(mocks.inventory, null, 2)}\n`);
    writeFileSync(join(OUTPUT_DIR, `${id}.draft-all.ndjson`), mocks['draft-all']);
    writeFileSync(join(OUTPUT_DIR, `${id}.profile.json`), `${JSON.stringify(mocks.profile, null, 2)}\n`);
    writeFileSync(join(OUTPUT_DIR, `${id}.meta.json`), `${JSON.stringify(mocks.meta, null, 2)}\n`);
}

function resolveScenarioIds({ useManifest, id, limit }) {
    if (id) {
        return [id];
    }

    if (useManifest) {
        const e2eManifest = loadE2eManifest();
        const entries = listE2eScenarios(e2eManifest, { limit });

        return entries.map((entry) => entry.id);
    }

    return LEGACY_SCENARIOS;
}

const { useManifest, id, limit } = parseArgs();
const manifest = loadManifest();
const scenarioIds = resolveScenarioIds({ useManifest, id, limit });

mkdirSync(OUTPUT_DIR, { recursive: true });

let generated = 0;
let failed = 0;

for (const scenarioId of scenarioIds) {
    let scenario;

    if (useManifest) {
        const resolved = resolveE2eScenarios({
            scenarios: [{ id: scenarioId }],
        }).find(({ entry }) => entry.id === scenarioId);
        scenario = resolved?.scenario;
    } else {
        scenario = manifest.scenarios.find((entry) => entry.id === scenarioId);
    }

    if (!scenario) {
        console.error(`Scenario not found: ${scenarioId}`);
        failed += 1;
        continue;
    }

    try {
        const mocks = generateMocksForScenario(scenario);
        writeMocksForScenario(scenarioId, mocks);
        generated += 1;
        console.log(`Generated E2E mocks for ${scenarioId} (${mocks.meta.plan_count} fields)`);
    } catch (error) {
        failed += 1;
        console.error(`Failed to generate mocks for ${scenarioId}: ${error.message}`);
    }
}

console.log(`\nWrote ${generated} mock sets → ${OUTPUT_DIR}${failed > 0 ? ` (${failed} failed)` : ''}`);

if (generated === 0) {
    console.error(`No mocks generated. Build manifest first: node scripts/form-corpus/build-e2e-scenarios.mjs`);
    process.exit(1);
}

if (failed > 0) {
    process.exit(1);
}
