#!/usr/bin/env node
/**
 * Report variety matrix coverage and recommend next batch targets.
 *
 * Usage:
 *   node scripts/form-corpus/report-variety-matrix.mjs
 *   node scripts/form-corpus/report-variety-matrix.mjs --json-only
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './lib/manifest.mjs';
import { FIXTURE_ROOT } from './lib/paths.mjs';
import { ATS_DISCOVER_QUERIES, ATS_STYLES, varietyCellKey } from './lib/variety-matrix.mjs';

const jsonOnly = process.argv.includes('--json-only');
const REPORT_PATH = join(FIXTURE_ROOT, 'variety-matrix-report.json');

function main() {
    const manifest = loadManifest();
    const filled = new Map();
    const byPrefix = {};

    for (const scenario of manifest.scenarios) {
        const prefix = scenario.id.split('-').slice(0, 2).join('-');
        byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;

        if (!scenario.variety && !scenario.pattern_signature) {
            continue;
        }

        const key = scenario.pattern_signature || varietyCellKey(scenario);
        filled.set(key, (filled.get(key) || 0) + 1);
    }

    const hqScenarios = manifest.scenarios.filter((row) =>
        row.status === 'vetted'
        && (row.id.startsWith('syn-ai-') || row.id.startsWith('web-') || row.source === 'bridge'),
    );

    const recommendedTargets = [];
    const seenAts = new Set(hqScenarios.map((row) => row.variety?.ats_style).filter(Boolean));
    const emptyCells = [];

    for (const ats of ATS_STYLES.slice(0, 8)) {
        for (const structure of ['single-page', 'wizard', 'conditional-reveal']) {
            for (const band of ['small', 'medium', 'large']) {
                const cell = `${ats},combobox,${structure},${band}`;
                const key = `${ats}|combobox|${structure}|${band}`;

                if (!filled.has(key) && !filled.has(cell)) {
                    emptyCells.push({
                        target_cell: cell,
                        discover_query: ATS_DISCOVER_QUERIES[ats] || null,
                        reason: `empty matrix cell ${cell}`,
                    });
                }
            }
        }
    }

    for (const ats of ['ashby', 'greenhouse', 'lever', 'workday', 'wordpress', 'government', 'custom']) {
        if (!seenAts.has(ats)) {
            recommendedTargets.push({
                target_cell: `${ats},combobox,single-page,medium`,
                discover_query: ATS_DISCOVER_QUERIES[ats] || null,
                reason: `missing ATS style ${ats}`,
            });
        }
    }

    const report = {
        generated_at: new Date().toISOString(),
        totals: {
            scenarios: manifest.scenarios.length,
            hq_vetted: hqScenarios.length,
            distinct_pattern_signatures: filled.size,
        },
        by_prefix: byPrefix,
        filled_cells: [...filled.entries()].map(([key, count]) => ({ key, count })),
        empty_cells: emptyCells.slice(0, 50),
        recommended_next_batch_targets: [...emptyCells.slice(0, 8), ...recommendedTargets].slice(0, 10),
    };

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

    if (jsonOnly) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.error(`Variety matrix report written to ${REPORT_PATH}`);
        console.log(JSON.stringify({
            report: REPORT_PATH,
            distinct_cells: filled.size,
            recommended: report.recommended_next_batch_targets,
        }, null, 2));
    }
}

main();
