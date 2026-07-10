#!/usr/bin/env node
/**
 * Tag web-* fixtures with variety + pattern_signature from URL and mechanical snapshot.
 *
 * Usage:
 *   node scripts/form-corpus/tag-fixture-variety.mjs --id-prefix=web- --limit=50
 *   node scripts/form-corpus/tag-fixture-variety.mjs --id=web-jobs-ashbyhq-com-application-140
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertBatchLimit, parseLimitArg } from './lib/batch-cap.mjs';
import { loadManifest, saveManifest } from './lib/manifest.mjs';
import { HTML_DIR } from './lib/paths.mjs';
import { buildPatternSignature, inferAtsStyleFromUrl } from './lib/pattern-signature.mjs';
import { buildSnapshotFromFile } from './lib/snapshot-runner.mjs';
import { fieldCountBand } from './lib/variety-matrix.mjs';

function parseArg(name) {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

    return hit ? hit.split('=').slice(1).join('=') : null;
}

function main() {
    const id = parseArg('id');
    const idPrefix = parseArg('id-prefix') || 'web-';
    const limit = assertBatchLimit(parseLimitArg() ?? parseArg('limit', '50'));
    const manifest = loadManifest();
    let updated = 0;

    let scenarios = manifest.scenarios.filter((row) => row.id.startsWith(idPrefix));

    if (id) {
        scenarios = scenarios.filter((row) => row.id === id);
    }

    scenarios = scenarios.slice(0, limit);

    for (const scenario of scenarios) {
        const htmlPath = join(HTML_DIR, scenario.html_file);

        if (!existsSync(htmlPath)) {
            continue;
        }

        let snapshot;

        try {
            snapshot = buildSnapshotFromFile(
                htmlPath,
                scenario.page_url || `https://example.test/forms/${scenario.id}`,
                scenario.page_title || 'Job Application',
                scenario.interaction_steps || [],
            );
        } catch {
            continue;
        }

        const ats_style = scenario.variety?.ats_style || inferAtsStyleFromUrl(scenario.page_url || '');
        const variety = {
            ats_style,
            widgets: scenario.variety?.widgets || [],
            structure: scenario.variety?.structure || 'single-page',
            field_count_band: fieldCountBand((snapshot.elements || []).length),
        };

        scenario.variety = variety;
        scenario.pattern_signature = buildPatternSignature({
            elements: snapshot.elements || [],
            variety,
            requires_interaction: scenario.requires_interaction ?? false,
        });
        updated += 1;
    }

    saveManifest(manifest);
    console.log(JSON.stringify({ updated, id_prefix: idPrefix, limit }, null, 2));
}

main();
