#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest } from './lib/manifest.mjs';
import { normalizeQuestion, normalizeOptions } from './lib/normalize.mjs';
import { buildSnapshotFromFile } from './lib/snapshot-runner.mjs';
import { EXPECTED_DIR, HTML_DIR } from './lib/paths.mjs';

const force = process.argv.includes('--force');
mkdirSync(EXPECTED_DIR, { recursive: true });

const manifest = loadManifest();
let written = 0;

for (const scenario of manifest.scenarios) {
    const expectedPath = join(EXPECTED_DIR, `${scenario.id}.json`);

    if (!force && existsSync(expectedPath)) {
        continue;
    }

    const htmlPath = join(HTML_DIR, scenario.html_file);

    if (!existsSync(htmlPath)) {
        console.warn(`Missing HTML for ${scenario.id}`);
        continue;
    }

    const snapshot = buildSnapshotFromFile(
        htmlPath,
        scenario.page_url || `https://example.test/forms/${scenario.id}`,
        scenario.page_title || 'Job Application',
    );

    const expected = {
        id: scenario.id,
        min_fields: snapshot.elements.length,
        exact_field_count: snapshot.elements.length,
        fields: snapshot.elements.map((element) => ({
            question: normalizeQuestion(element.question),
            field_type: element.field_type,
            max_chars: element.max_chars,
            options: normalizeOptions(element.options),
            required: element.required ?? false,
        })),
        controls: snapshot.controls.map((control) => ({
            name: control.name,
        })),
        vet_notes: [],
    };

    writeFileSync(expectedPath, `${JSON.stringify(expected, null, 2)}\n`);
    written += 1;
}

saveManifest(manifest);
console.log(`Proposed expectations for ${written} scenarios in ${EXPECTED_DIR}`);
