#!/usr/bin/env node
/**
 * Mocked Draft All flow benchmark — isolates client orchestration overhead from LLM latency.
 *
 * Usage:
 *   node scripts/extension-benchmark/mock-draft-all-flow.mjs
 *   node scripts/extension-benchmark/mock-draft-all-flow.mjs --iterations=10 --mode=optimized
 *   node scripts/extension-benchmark/mock-draft-all-flow.mjs --mode=baseline
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    compactFieldsForDraft,
    compactSnapshotForInventory,
    shouldForceInventoryComplete,
    tryInferJobContextFromPage,
} from '../../extension/src/shared/draft-all-optimizations.js';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';
import { formatMs, printSummaryTable, summarizeRuns } from './lib/stats.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const FIXTURE_ROOT = join(ROOT, 'tests/fixtures/form-extraction');

const args = Object.fromEntries(
    process.argv.slice(2)
        .filter((arg) => arg.startsWith('--'))
        .map((arg) => {
            const [key, value] = arg.slice(2).split('=');

            return [key, value ?? true];
        }),
);

const iterations = Number.parseInt(String(args.iterations || 8), 10);
const mode = String(args.mode || 'optimized');
const fixtureId = String(args.fixture || 'web-ashby-notion-bdm-f603aedb');
const isOptimized = mode !== 'baseline';

const MOCK_LATENCY_MS = {
    frameDiscovery: 12,
    jobContextApi: 850,
    jobContextInferred: 4,
    jobContextCached: 1,
    inventoryRound: 1200,
    draftBatch: 780,
    applyBatch: 95,
    resumeFill: 40,
    inventoryStepDelay: 600,
};

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function loadFixture(id) {
    const htmlPath = join(FIXTURE_ROOT, 'html', `${id}.html`);
    const pageUrl = `https://jobs.ashbyhq.com/notion/${id}`;
    const pageTitle = 'Business Development Manager - Notion';

    return { htmlPath, pageUrl, pageTitle };
}

function fieldsFromSnapshot(snapshot) {
    return (snapshot.elements || []).map((element, index) => ({
        id: index,
        ref: element.ref,
        label: element.question,
        field_type: element.field_type || 'text',
        max_chars: element.max_chars,
        options: element.options,
    }));
}

async function mockInventoryRound(snapshot, round, optimized) {
    await sleep(MOCK_LATENCY_MS.inventoryRound);

    const fields = fieldsFromSnapshot(snapshot);
    const compactSnapshot = optimized
        ? compactSnapshotForInventory(snapshot)
        : {
            ...snapshot,
            elements: (snapshot.elements || []).map((element) => ({ ...element, dom: element.dom })),
            controls: snapshot.controls || [],
        };

    void compactSnapshot;

    const inventory = {
        ok: true,
        fields,
        complete: false,
        next_actions: round === 0 && !optimized
            ? [{ ref: 'c0', reason: 'Mock continue' }]
            : [],
    };

    if (optimized && shouldForceInventoryComplete(snapshot, inventory)) {
        inventory.complete = true;
        inventory.next_actions = [];
    }

    return inventory;
}

async function mockDraftBatches(fieldCount, optimized, onBatch) {
    const batchSize = 10;
    const batchCount = Math.max(1, Math.ceil(fieldCount / batchSize));
    const fields = Array.from({ length: fieldCount }, (_, index) => ({
        id: index,
        ref: `f${index}`,
        label: `Question ${index}`,
        field_type: index % 3 === 0 ? 'radio' : 'text',
        options: index % 3 === 0 ? ['Yes', 'No'] : undefined,
    }));
    const draftFields = optimized ? compactFieldsForDraft(fields) : fields;

    void draftFields;

    const applyPromises = [];

    for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
        await sleep(MOCK_LATENCY_MS.draftBatch);

        const applyPromise = (async () => {
            await sleep(MOCK_LATENCY_MS.applyBatch);
        })();

        if (optimized) {
            applyPromises.push(applyPromise);
        } else {
            await applyPromise;
        }

        onBatch(batchIndex);
    }

    if (optimized) {
        await Promise.all(applyPromises);
    }
}

function buildRawSnapshot(fixture) {
    const html = readFileSync(fixture.htmlPath, 'utf8');
    const { snapshot } = buildFormDomContext({
        html,
        pageUrl: fixture.pageUrl,
        pageTitle: fixture.pageTitle,
    });

    return snapshot;
}

async function runMockFlow(fixture, optimized) {
    const phases = {
        'frame.discovery': [],
        'snapshot.collect': [],
        'job-context': [],
        'inventory.total': [],
        'draft.total': [],
        'apply.total': [],
        'resume.fill': [],
        'draft-all.total': [],
    };

    const totalStartedAt = performance.now();

    const frameStartedAt = performance.now();
    await sleep(MOCK_LATENCY_MS.frameDiscovery);
    phases['frame.discovery'].push(Math.round(performance.now() - frameStartedAt));

    const snapshotStartedAt = performance.now();
    const snapshot = buildRawSnapshot(fixture);
    phases['snapshot.collect'].push(Math.round(performance.now() - snapshotStartedAt));

    const jobContextStartedAt = performance.now();

    if (optimized) {
        const inferred = tryInferJobContextFromPage({
            page_url: fixture.pageUrl,
            page_title: fixture.pageTitle,
            page_text: 'Job description '.repeat(40),
        }, fixture.pageTitle);

        await sleep(inferred ? MOCK_LATENCY_MS.jobContextInferred : MOCK_LATENCY_MS.jobContextCached);
    } else {
        await sleep(MOCK_LATENCY_MS.jobContextApi);
    }

    phases['job-context'].push(Math.round(performance.now() - jobContextStartedAt));

    const inventoryStartedAt = performance.now();
    let inventoryRoundCount = 0;

    for (let round = 0; round < 3; round += 1) {
        const inventory = await mockInventoryRound(snapshot, round, optimized);
        inventoryRoundCount += 1;

        if (inventory.complete || inventory.next_actions.length === 0) {
            break;
        }

        if (!optimized) {
            await sleep(MOCK_LATENCY_MS.inventoryStepDelay);
        }
    }

    phases['inventory.total'].push(Math.round(performance.now() - inventoryStartedAt));

    const draftStartedAt = performance.now();
    let batchCount = 0;

    await mockDraftBatches(snapshot.elements.length, optimized, () => {
        batchCount += 1;
    });

    phases['draft.total'].push(Math.round(performance.now() - draftStartedAt));
    phases['apply.total'].push(batchCount * MOCK_LATENCY_MS.applyBatch);

    const resumeStartedAt = performance.now();
    await sleep(MOCK_LATENCY_MS.resumeFill);
    phases['resume.fill'].push(Math.round(performance.now() - resumeStartedAt));

    phases['draft-all.total'].push(Math.round(performance.now() - totalStartedAt));

    return {
        inventoryRoundCount,
        batchCount,
        phases,
    };
}

async function main() {
    console.log(`Mock Draft All flow benchmark (${iterations} iterations, mode=${mode})`);
    console.log(`Fixture: ${fixtureId}`);

    const fixture = loadFixture(fixtureId);
    const phaseRuns = {};
    let lastMeta = null;

    for (let index = 0; index < iterations; index += 1) {
        const result = await runMockFlow(fixture, isOptimized);
        lastMeta = result;

        for (const [phase, durations] of Object.entries(result.phases)) {
            if (!phaseRuns[phase]) {
                phaseRuns[phase] = [];
            }

            phaseRuns[phase].push(durations[0]);
        }
    }

    const rows = Object.entries(phaseRuns).map(([phase, values]) => ({
        phase,
        ...summarizeRuns(values),
    }));

    printSummaryTable(`Mock flow timings (${mode})`, rows);

    console.log('\nFlow metadata (last run)');
    console.log(`  Inventory rounds: ${lastMeta?.inventoryRoundCount}`);
    console.log(`  Draft batches: ${lastMeta?.batchCount}`);
    console.log(`  Optimizations enabled: ${isOptimized}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
