import { inferForeignAtsStyleFromUrl } from './foreign-job-boards.mjs';
import { fieldCountBand } from './variety-matrix.mjs';

/**
 * Infer widget hints from snapshot elements.
 *
 * @param {Array<{ field_type?: string, dom?: Record<string, unknown>|null }>} elements
 * @returns {string[]}
 */
export function inferWidgetHints(elements) {
    const hints = new Set();

    for (const element of elements) {
        const type = element.field_type || 'text';
        const dom = element.dom || {};
        const role = String(dom.role || dom.input_role || '').toLowerCase();
        const tag = String(dom.tag || dom.tag_name || '').toLowerCase();

        if (type === 'select' || role.includes('listbox') || role.includes('combobox')) {
            hints.add('combobox');
        }

        if (type === 'radio' || role.includes('radio')) {
            hints.add('pill-radio');
        }

        if (type === 'checkbox') {
            hints.add('checkbox-group');
        }

        if (type === 'textarea') {
            hints.add('native-inputs');
        }

        if (type === 'file') {
            hints.add('file-adjacent');
        }

        if (tag === 'input' && (type === 'text' || type === 'email' || type === 'tel')) {
            hints.add('native-inputs');
        }
    }

    if (hints.size === 0) {
        hints.add('native-inputs');
    }

    return [...hints].sort();
}

/**
 * @param {{
 *   elements?: Array<{ field_type?: string, dom?: Record<string, unknown>|null }>,
 *   variety?: { ats_style?: string, structure?: string, field_count_band?: string, widgets?: string[] },
 *   requires_interaction?: boolean,
 * }} input
 * @returns {string}
 */
export function buildPatternSignature(input) {
    const elements = input.elements || [];
    const fieldTypes = [...new Set(elements.map((row) => row.field_type || 'text'))].sort();
    const widgets = (input.variety?.widgets?.length ? input.variety.widgets : inferWidgetHints(elements))
        .slice()
        .sort();
    const ats = input.variety?.ats_style || 'unknown';
    const structure = input.variety?.structure || (input.requires_interaction ? 'conditional-reveal' : 'single-page');
    const band = input.variety?.field_count_band || fieldCountBand(elements.length);

    return `${ats}|${widgets.join(',')}|${structure}|${band}|${fieldTypes.join(',')}`;
}

/**
 * @param {import('./manifest.mjs').Manifest} manifest
 * @param {string} signature
 * @param {string} [excludeId]
 * @returns {{ duplicate: boolean, existing_id?: string }}
 */
export function findVettedDuplicate(manifest, signature, excludeId = '') {
    for (const scenario of manifest.scenarios) {
        if (scenario.id === excludeId) {
            continue;
        }

        if (scenario.status !== 'vetted') {
            continue;
        }

        if (scenario.pattern_signature === signature) {
            return { duplicate: true, existing_id: scenario.id };
        }
    }

    return { duplicate: false };
}

/**
 * @param {string} pageUrl
 * @returns {string}
 */
export function inferAtsStyleFromUrl(pageUrl) {
    const foreign = inferForeignAtsStyleFromUrl(pageUrl);

    if (foreign) {
        return foreign;
    }

    const url = (pageUrl || '').toLowerCase();

    if (url.includes('ashby')) {
        return 'ashby';
    }

    if (url.includes('greenhouse')) {
        return 'greenhouse';
    }

    if (url.includes('lever.co') || url.includes('jobs.lever')) {
        return 'lever';
    }

    if (url.includes('workday') || url.includes('myworkdayjobs')) {
        return 'workday';
    }

    if (url.includes('teamtailor')) {
        return 'teamtailor';
    }

    if (url.includes('smartrecruiters')) {
        return 'smartrecruiters';
    }

    if (url.includes('workable')) {
        return 'workable';
    }

    if (url.includes('icims')) {
        return 'icims';
    }

    if (url.includes('oracle') || url.includes('taleo')) {
        return 'oracle';
    }

    if (url.includes('personio')) {
        return 'personio';
    }

    if (url.includes('wpforms') || url.includes('wordpress')) {
        return 'wordpress';
    }

    if (url.includes('.gov')) {
        return 'government';
    }

    return 'custom';
}
