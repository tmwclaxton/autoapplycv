#!/usr/bin/env node
/**
 * Generate LinkedIn Easy Apply HTML corpus fixtures and manifest.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildEdgeFixture,
    buildFlowStepHtml,
    buildScenarioManifest,
    buildValidationFixture,
    EDGE_FIXTURES,
    FLOW_DEFINITIONS,
    VALIDATION_FIXTURES,
} from './lib/linkedin-easy-apply-fixture-builder.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_DIR = join(ROOT, 'tests/fixtures/auto-apply/linkedin');

mkdirSync(OUTPUT_DIR, { recursive: true });

let written = 0;

for (const flow of FLOW_DEFINITIONS) {
    for (const stepDef of flow.steps) {
        const filename = `linkedin-easy-apply-${flow.flowId}-step${stepDef.step}-${stepDef.builder}.html`;
        const html = buildFlowStepHtml(flow, stepDef);
        writeFileSync(join(OUTPUT_DIR, filename), html);
        written += 1;
    }
}

for (const fixture of VALIDATION_FIXTURES) {
    writeFileSync(join(OUTPUT_DIR, `${fixture.id}.html`), buildValidationFixture(fixture.kind));
    written += 1;
}

for (const fixture of EDGE_FIXTURES) {
    writeFileSync(join(OUTPUT_DIR, `${fixture.id}.html`), buildEdgeFixture(fixture.kind));
    written += 1;
}

const manifest = buildScenarioManifest();
writeFileSync(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${written} LinkedIn Easy Apply fixtures to ${OUTPUT_DIR}`);
console.log(`Manifest scenarios: ${manifest.scenarios.length}`);
