import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './manifest.mjs';
import { FIXTURE_ROOT } from './paths.mjs';
import {
    ATS_STYLES,
    FIELD_COUNT_BANDS,
    STRUCTURES,
    WIDGET_BUCKETS,
    varietyCellKey,
} from './variety-matrix.mjs';

const REPORT_PATH = join(FIXTURE_ROOT, 'variety-matrix-report.json');

/**
 * @param {number} batchIndex 0-based batch number for rotation
 * @returns {string|null} target_cell e.g. ashby,combobox,wizard,medium
 */
export function pickMatrixTargetCell(batchIndex = 0) {
    if (existsSync(REPORT_PATH)) {
        const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
        const targets = report.recommended_next_batch_targets || report.empty_cells || [];

        if (targets.length > 0) {
            const pick = targets[batchIndex % targets.length];

            return pick.target_cell || pick.cell || null;
        }
    }

    const manifest = loadManifest();
    const filled = new Set(
        manifest.scenarios
            .filter((row) => row.status === 'vetted' && (row.variety || row.pattern_signature))
            .map((row) => row.pattern_signature || varietyCellKey(row)),
    );

    const candidates = [];

    for (const ats_style of ATS_STYLES) {
        for (const structure of STRUCTURES) {
            for (const field_count_band of FIELD_COUNT_BANDS) {
                const widgets = structure === 'wizard'
                    ? ['combobox', 'pill-radio']
                    : [WIDGET_BUCKETS[(batchIndex + candidates.length) % WIDGET_BUCKETS.length]];

                const key = varietyCellKey({
                    variety: { ats_style, widgets, structure, field_count_band },
                });

                if (!filled.has(key)) {
                    candidates.push(`${ats_style},${widgets.join('+')},${structure},${field_count_band}`);
                }
            }
        }
    }

    if (candidates.length === 0) {
        const ats = ATS_STYLES[batchIndex % ATS_STYLES.length];
        const widget = WIDGET_BUCKETS[batchIndex % WIDGET_BUCKETS.length];
        const structure = STRUCTURES[batchIndex % STRUCTURES.length];
        const band = FIELD_COUNT_BANDS[batchIndex % FIELD_COUNT_BANDS.length];

        return `${ats},${widget},${structure},${band}`;
    }

    return candidates[batchIndex % candidates.length];
}
