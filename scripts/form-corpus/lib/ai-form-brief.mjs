import { createHash } from 'node:crypto';
import {
    COMPLEXITY_PATTERN_CATALOG,
    COMPLEXITY_TIERS,
    LAYOUT_DIVERSITY,
    excerptDom,
    pickComplexityPatterns,
} from './form-complexity-score.mjs';
import {
    ATS_STYLES,
    FIELD_COUNT_BANDS,
    STRUCTURES,
    WIDGET_BUCKETS,
} from './variety-matrix.mjs';
import { WEIRD_FORM_TEMPLATES } from './weird-form-templates.mjs';

/**
 * @param {number} seed
 */
export function createRng(seed) {
    let s = seed >>> 0;

    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
}

function pickN(rng, list, count) {
    const copy = [...list];
    const out = [];

    for (let i = 0; i < count && copy.length > 0; i += 1) {
        const idx = Math.floor(rng() * copy.length);
        out.push(copy.splice(idx, 1)[0]);
    }

    return out;
}

/**
 * @param {string} [targetCell] e.g. ashby,combobox,wizard,medium
 */
export function parseTargetCell(targetCell) {
    if (!targetCell) {
        return null;
    }

    const [ats_style, widgetsRaw, structure, field_count_band] = targetCell.split(',').map((part) => part.trim());
    const widgets = widgetsRaw ? widgetsRaw.split('+').filter(Boolean) : [];

    return {
        ats_style: ats_style || undefined,
        widgets: widgets.length ? widgets : undefined,
        structure: structure || undefined,
        field_count_band: field_count_band || undefined,
    };
}

/**
 * @param {{ id: string, seed?: number, targetCell?: string|null, complexityTier?: string }} options
 */
export function composeAiFormBrief(options) {
    const seed = options.seed ?? Number(createHash('sha256').update(options.id).digest().readUInt32BE(0));
    const varietyRng = createRng(seed);
    const complexityRng = createRng(seed ^ 0x9E3779B9);
    const target = parseTargetCell(options.targetCell || '');
    const complexityTier = options.complexityTier === 'high' ? 'high' : 'standard';
    const tier = COMPLEXITY_TIERS[complexityTier];

    const ats_style = target?.ats_style || pick(varietyRng, ATS_STYLES);
    const structure = target?.structure || pick(
        varietyRng,
        complexityTier === 'high'
            ? ['wizard', 'conditional-reveal', 'iframe-hosted', 'shadow-dom', 'single-page']
            : STRUCTURES,
    );
    const field_count_band = target?.field_count_band || pick(varietyRng, FIELD_COUNT_BANDS);
    const widgetCount = complexityTier === 'high' ? 3 : (structure === 'single-page' ? 2 : 3);
    const widgets = target?.widgets || pickN(varietyRng, WIDGET_BUCKETS, widgetCount);
    const complexityPatterns = pickComplexityPatterns(complexityRng, tier.pattern_count);
    const referenceTemplates = pickN(complexityRng, WEIRD_FORM_TEMPLATES, complexityTier === 'high' ? 3 : 2).map((row) => ({
        title: row.title,
        notes: row.notes,
        category: row.category,
        dom_excerpt: excerptDom(row.html, 320),
        requires_interaction: row.requiresInteraction ?? false,
    }));
    const layoutStyle = pick(complexityRng, LAYOUT_DIVERSITY);

    const minFields = (field_count_band === 'small' ? 10
        : field_count_band === 'medium' ? 14
            : field_count_band === 'large' ? 22
                : 32) + tier.min_fields_boost;

    const complexityInstructions = [
        'Do NOT produce a tutorial-style form where every field is label[for]+native input.',
        'Mix native controls with non-semantic production DOM from the patterns below.',
        `Implement ALL required complexity patterns: ${complexityPatterns.map((row) => row.id).join(', ')}.`,
        'Include at least one custom widget (div role=textbox, pill buttons, or listbox combobox).',
        'Include at least one labeling strategy besides label-for (aria-label, aria-labelledby, glued spans, placeholder-only).',
        complexityTier === 'high'
            ? `Layout: ${layoutStyle}. Avoid generic centered SaaS card as the only structure.`
            : '',
        complexityTier === 'high'
            ? 'High tier: include shadow DOM host OR iframe apply shell OR wizard/conditional reveal with hidden fields.'
            : '',
        referenceTemplates.length > 0
            ? `Mirror structural messiness like these references: ${referenceTemplates.map((row) => row.title).join('; ')}.`
            : '',
    ].filter(Boolean);

    return {
        id: options.id,
        seed,
        variety: {
            ats_style,
            widgets,
            structure,
            field_count_band,
        },
        constraints: {
            complexity_tier: complexityTier,
            min_fields: minFields,
            min_field_types: complexityTier === 'high' ? 6 : 5,
            min_non_semantic_signals: tier.min_non_semantic_signals,
            min_complexity_score: tier.min_complexity_score,
            layout_style: layoutStyle,
            standalone_html: true,
            no_external_scripts: true,
            forbid_semantic_only: true,
            required_complexity_patterns: complexityPatterns,
            reference_templates: referenceTemplates,
        },
        prompt_summary: [
            `Create a messy, production-real ${ats_style}-style job application (${structure}, ${field_count_band}, tier=${complexityTier}).`,
            `Widgets: ${widgets.join(', ')}.`,
            ...complexityPatterns.map((row) => `Required: ${row.notes}`),
            ...referenceTemplates.map((row) => `Reference DOM (${row.title}): ${row.notes}`),
            ...complexityInstructions,
        ].join(' '),
    };
}

export function weirdnessCatalog() {
    return [
        ...WEIRD_FORM_TEMPLATES.map((row) => row.notes),
        ...COMPLEXITY_PATTERN_CATALOG.map((row) => row.notes),
    ];
}
