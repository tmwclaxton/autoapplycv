#!/usr/bin/env node
/**
 * Node-side Draft All benchmarks: snapshot build + payload compaction on HTML fixtures.
 *
 * Usage:
 *   node scripts/extension-benchmark/draft-all-benchmark.mjs
 *   node scripts/extension-benchmark/draft-all-benchmark.mjs --fixture=web-ashby-notion-bdm-f603aedb --iterations=10
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';
import {
    compactFieldsForDraft,
    compactSnapshotForInventory,
    estimatePayloadBytes,
    shouldForceInventoryComplete,
    tryInferJobContextFromPage,
} from '../../extension/src/shared/draft-all-optimizations.js';
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
const fixtureId = String(args.fixture || 'web-ashby-notion-bdm-f603aedb');

function loadFixture(id) {
    const htmlPath = join(FIXTURE_ROOT, 'html', `${id}.html`);
    const html = readFileSync(htmlPath, 'utf8');
    const pageUrl = `https://jobs.ashbyhq.com/notion/${id}`;
    const pageTitle = 'Business Development Manager - Notion';

    return { htmlPath, html, pageUrl, pageTitle };
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

function buildRawSnapshot(fixture) {
    const html = readFileSync(fixture.htmlPath, 'utf8');
    const { snapshot } = buildFormDomContext({
        html,
        pageUrl: fixture.pageUrl,
        pageTitle: fixture.pageTitle,
    });

    return snapshot;
}

function runSnapshotBenchmark(fixture) {
    const snapshotDurations = [];
    let lastSnapshot = null;

    for (let index = 0; index < iterations; index += 1) {
        const startedAt = performance.now();
        lastSnapshot = buildRawSnapshot(fixture);
        snapshotDurations.push(Math.round(performance.now() - startedAt));
    }

    const rawFields = fieldsFromSnapshot(lastSnapshot);
    const compactSnapshot = compactSnapshotForInventory(lastSnapshot);
    const compactFields = compactFieldsForDraft(rawFields);
    const inferredJob = tryInferJobContextFromPage({
        page_url: fixture.pageUrl,
        page_title: fixture.pageTitle,
        page_text: 'A'.repeat(500),
    }, fixture.pageTitle);

    return {
        snapshot: summarizeRuns(snapshotDurations),
        payload: {
            rawSnapshotBytes: estimatePayloadBytes(lastSnapshot),
            compactSnapshotBytes: estimatePayloadBytes(compactSnapshot),
            rawDraftFieldsBytes: estimatePayloadBytes(rawFields),
            compactDraftFieldsBytes: estimatePayloadBytes(compactFields),
            elementCount: lastSnapshot.elements?.length || 0,
            controlCount: lastSnapshot.controls?.length || 0,
            forceInventoryComplete: shouldForceInventoryComplete(lastSnapshot, {
                fields: rawFields,
                complete: false,
                next_actions: [{ ref: 'c0', reason: 'continue' }],
            }),
            inferredJob,
        },
    };
}

console.log(`Draft All node benchmark (${iterations} iterations)`);
console.log(`Fixture: ${fixtureId}`);

const fixture = loadFixture(fixtureId);
const result = runSnapshotBenchmark(fixture);

printSummaryTable('Snapshot build (JSDOM + extension scripts)', [
    {
        phase: 'snapshot.collect',
        ...result.snapshot,
    },
]);

console.log('\nPayload sizes');
console.log('─'.repeat(13));
console.log(`Elements: ${result.payload.elementCount}, controls: ${result.payload.controlCount}`);
console.log(`Snapshot raw:    ${result.payload.rawSnapshotBytes.toLocaleString()} bytes`);
console.log(`Snapshot compact: ${result.payload.compactSnapshotBytes.toLocaleString()} bytes (${Math.round((1 - result.payload.compactSnapshotBytes / result.payload.rawSnapshotBytes) * 100)}% smaller)`);
console.log(`Draft fields raw:    ${result.payload.rawDraftFieldsBytes.toLocaleString()} bytes`);
console.log(`Draft fields compact: ${result.payload.compactDraftFieldsBytes.toLocaleString()} bytes (${Math.round((1 - result.payload.compactDraftFieldsBytes / result.payload.rawDraftFieldsBytes) * 100)}% smaller)`);
console.log(`Force inventory complete heuristic: ${result.payload.forceInventoryComplete}`);
console.log(`Inferred job context: ${result.payload.inferredJob?.title} @ ${result.payload.inferredJob?.company}`);

console.log('\nSnapshot timing detail');
console.log(`  min=${formatMs(result.snapshot.min)} p50=${formatMs(result.snapshot.p50)} p95=${formatMs(result.snapshot.p95)} max=${formatMs(result.snapshot.max)}`);
