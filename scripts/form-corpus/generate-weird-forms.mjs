#!/usr/bin/env node
/**
 * Generate hand-crafted edge-case form fixtures (syn-weird-001 .. syn-weird-060).
 * Each template is structurally distinct - not parametric clones of one shell.
 *
 * Usage:
 *   node scripts/form-corpus/generate-weird-forms.mjs
 *   node scripts/form-corpus/generate-weird-forms.mjs --from=30 --to=45
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest, saveManifest, upsertScenario } from './lib/manifest.mjs';
import { HTML_DIR, MANIFEST_PATH } from './lib/paths.mjs';
import { WEIRD_FORM_COUNT, WEIRD_FORM_TEMPLATES } from './lib/weird-form-templates.mjs';

mkdirSync(HTML_DIR, { recursive: true });

const manifest = loadManifest();
const fromArg = Number(process.argv.find((arg) => arg.startsWith('--from='))?.split('=')[1] || 1);
const toArg = Number(process.argv.find((arg) => arg.startsWith('--to='))?.split('=')[1] || WEIRD_FORM_COUNT);

const selected = WEIRD_FORM_TEMPLATES.filter((template) => template.num >= fromArg && template.num <= toArg);
let written = 0;

for (const template of selected) {
    const id = `syn-weird-${String(template.num).padStart(3, '0')}`;
    const filename = `${id}.html`;

    writeFileSync(join(HTML_DIR, filename), template.html);
    upsertScenario(manifest, {
        id,
        category: template.category,
        source: 'synthetic',
        status: 'pending',
        html_file: filename,
        page_url: `https://example.test/forms/${id}`,
        page_title: template.title,
        notes: template.notes,
        requires_interaction: template.requiresInteraction ?? false,
        interaction_steps: template.interactionSteps ?? [],
    });
    written += 1;
}

saveManifest(manifest);

console.log(`Wrote ${written} syn-weird fixtures (${fromArg}-${toArg}) to ${HTML_DIR}`);
console.log(`Manifest updated: ${MANIFEST_PATH}`);
