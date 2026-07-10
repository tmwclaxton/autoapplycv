/**
 * Score HTML for production-style complexity (non-semantic controls, ARIA shells, custom widgets).
 */

/** @type {Array<{ id: string, notes: string, must_include?: string[], validate?: (html: string) => boolean }>} */
export const COMPLEXITY_PATTERN_CATALOG = [
    {
        id: 'div-role-textbox',
        notes: 'Custom text field: div with role=textbox and contenteditable, no native input',
        validate: (html) => /role=["']textbox["']/i.test(html) && /contenteditable/i.test(html),
    },
    {
        id: 'aria-label-only',
        notes: 'At least two fields with aria-label only and no visible label element',
        validate: (html) => (html.match(/aria-label=/gi) || []).length >= 2,
    },
    {
        id: 'aria-labelledby-hidden',
        notes: 'Field labeled via aria-labelledby pointing at hidden or distant span',
        validate: (html) => /aria-labelledby=/i.test(html),
    },
    {
        id: 'label-wraps-deep',
        notes: 'Label wraps input through nested divs without for attribute',
        validate: (html) => /<label(?![^>]*\bfor=)[^>]*>[\s\S]*<div/i.test(html),
    },
    {
        id: 'pill-yes-no',
        notes: 'Yes/no question as paired button elements, not native radio inputs',
        validate: (html) => (html.match(/<button[^>]+type=["']button["']/gi) || []).length >= 2,
    },
    {
        id: 'custom-combobox',
        notes: 'Combobox: button or input with aria-haspopup=listbox plus listbox/options',
        validate: (html) => /listbox/i.test(html) && /aria-haspopup/i.test(html),
    },
    {
        id: 'split-phone',
        notes: 'Phone split into country code select and local number input in separate wrappers',
        validate: (html) => /type=["']tel["']/i.test(html) && /<select/i.test(html),
    },
    {
        id: 'readonly-prefill',
        notes: 'At least one readonly or disabled input with prefilled profile value',
        validate: (html) => /\b(readonly|disabled)\b/i.test(html) && /value=/i.test(html),
    },
    {
        id: 'decoy-form',
        notes: 'Newsletter or login decoy form separate from job application form',
        validate: (html) => (html.match(/<form\b/gi) || []).length >= 2,
    },
    {
        id: 'details-accordion',
        notes: 'Fields inside details/summary or hidden until click',
        validate: (html) => /<details/i.test(html) || /\bhidden\b/i.test(html),
    },
    {
        id: 'glued-label-text',
        notes: 'Label text split across multiple spans with no space between words',
        validate: (html) => (html.match(/<span/gi) || []).length >= 4,
    },
    {
        id: 'duplicate-name-attrs',
        notes: 'Multiple controls sharing name attribute groups (checkbox/radio clusters)',
        validate: (html) => {
            const names = [...html.matchAll(/\bname=["']([^"']+)["']/gi)].map((match) => match[1]);
            const counts = new Map();

            for (const name of names) {
                counts.set(name, (counts.get(name) || 0) + 1);
            }

            return [...counts.values()].some((count) => count >= 2);
        },
    },
    {
        id: 'shadow-host',
        notes: 'Fields inside a shadow DOM host or declarative shadow root',
        validate: (html) => /shadowrootmode|attachShadow|data-shadow-root|#shadow-root/i.test(html),
    },
    {
        id: 'iframe-apply',
        notes: 'Apply form hosted inside iframe or srcdoc iframe shell',
        validate: (html) => /<iframe\b/i.test(html),
    },
    {
        id: 'table-layout',
        notes: 'Inputs laid out in table cells, not flex card stacks only',
        validate: (html) => /<table\b/i.test(html) && /<(input|select|textarea|div[^>]+role=["']textbox["'])/i.test(html),
    },
    {
        id: 'native-select-not-combobox',
        notes: 'When combobox widget requested, use custom listbox - native select alone is insufficient',
        validate: () => true,
    },
];

/** @type {Record<string, { min_non_semantic_signals: number, min_complexity_score: number, pattern_count: number, min_fields_boost: number }>} */
export const COMPLEXITY_TIERS = {
    standard: {
        min_non_semantic_signals: 3,
        min_complexity_score: 4,
        pattern_count: 3,
        min_fields_boost: 0,
    },
    high: {
        min_non_semantic_signals: 5,
        min_complexity_score: 6,
        pattern_count: 5,
        min_fields_boost: 4,
    },
};

export const LAYOUT_DIVERSITY = [
    'table rows with inputs in td cells',
    'fieldset stacks with legend-only section titles',
    'definition list dl/dt/dd label pairs',
    'unstyled div soup with inline styles only',
    'two-column grid without card wrapper',
    'nested sections with h3 headings instead of labels',
    'sidebar + main split apply layout',
];

/**
 * @param {string} html
 */
export function scoreHtmlComplexity(html) {
    const lower = html.toLowerCase();
    const nativeInputs = (html.match(/<(input|select|textarea)\b/gi) || []).length;
    const labelFor = (html.match(/<label[^>]+for=/gi) || []).length;
    const roleTextbox = (html.match(/role=["']textbox["']/gi) || []).length;
    const contenteditable = (html.match(/contenteditable/gi) || []).length;
    const ariaLabel = (html.match(/aria-label=/gi) || []).length;
    const ariaLabelledby = (html.match(/aria-labelledby=/gi) || []).length;
    const listbox = (html.match(/role=["']listbox["']/gi) || []).length;
    const combobox = (html.match(/role=["']combobox["']|aria-haspopup=["']listbox["']/gi) || []).length;
    const pillButtons = (html.match(/<button[^>]+type=["']button["']/gi) || []).length;
    const forms = (html.match(/<form\b/gi) || []).length;
    const details = (html.match(/<details\b/gi) || []).length;
    const readonly = (html.match(/\breadonly\b|\bdisabled\b/gi) || []).length;

    const nonSemanticSignals = roleTextbox + contenteditable + listbox + combobox
        + Math.max(0, ariaLabel - labelFor) + (ariaLabelledby > 0 ? 2 : 0)
        + (pillButtons >= 2 ? 2 : 0) + (forms > 1 ? 2 : 0) + (details > 0 ? 1 : 0);

    const semanticRatio = nativeInputs === 0 ? 1 : labelFor / nativeInputs;

    return {
        native_inputs: nativeInputs,
        label_for_pairs: labelFor,
        semantic_ratio: Number(semanticRatio.toFixed(3)),
        non_semantic_signals: nonSemanticSignals,
        complexity_score: nonSemanticSignals + (semanticRatio < 0.55 ? 2 : 0),
        signals: {
            role_textbox: roleTextbox,
            contenteditable,
            aria_label: ariaLabel,
            aria_labelledby: ariaLabelledby,
            listbox,
            combobox,
            pill_buttons: pillButtons,
            forms,
            details,
            readonly_or_disabled: readonly,
        },
    };
}

/**
 * @param {string} html
 * @param {Array<{ id: string, notes: string, validate?: (html: string) => boolean }>} requiredPatterns
 * @param {{ min_non_semantic_signals?: number, min_complexity_score?: number, complexity_tier?: string, widgets?: string[] }} [options]
 */
export function reviewComplexity(html, requiredPatterns = [], options = {}) {
    const tier = COMPLEXITY_TIERS[options.complexity_tier || 'standard'] || COMPLEXITY_TIERS.standard;
    const minNonSemantic = options.min_non_semantic_signals ?? tier.min_non_semantic_signals;
    const minScore = options.min_complexity_score ?? tier.min_complexity_score;
    const score = scoreHtmlComplexity(html);
    const issues = [];

    if (score.non_semantic_signals < minNonSemantic) {
        issues.push({
            code: 'insufficient_complexity',
            message: `Only ${score.non_semantic_signals} non-semantic signals (min ${minNonSemantic}). Add custom widgets, ARIA-only labels, div role=textbox, pill buttons, shadow DOM, iframe shell, or decoy forms.`,
        });
    }

    if (score.complexity_score < minScore) {
        issues.push({
            code: 'low_complexity_score',
            message: `Complexity score ${score.complexity_score} below min ${minScore}.`,
        });
    }

    if (score.native_inputs >= 6 && score.semantic_ratio > 0.75 && score.non_semantic_signals < minNonSemantic + 1) {
        issues.push({
            code: 'too_semantic',
            message: `Form is too semantic/clean (${Math.round(score.semantic_ratio * 100)}% label-for coverage). Real ATS pages use messy DOM.`,
        });
    }

    const widgets = options.widgets || [];

    if (widgets.includes('combobox') || widgets.includes('react-select')) {
        const hasCustomCombobox = /listbox/i.test(html) && /aria-haspopup/i.test(html);

        if (!hasCustomCombobox && /<select/i.test(html)) {
            issues.push({
                code: 'fake_combobox',
                message: 'Widget brief includes combobox but only native select found. Build custom listbox/combobox DOM.',
            });
        }
    }

    if ((options.complexity_tier || '') === 'high' && /display:\s*flex[\s\S]{0,120}justify-content:\s*center/i.test(html) && !/<table/i.test(html) && !/<iframe/i.test(html)) {
        issues.push({
            code: 'layout_convergence',
            message: 'High-tier fixture uses generic centered card layout only. Use table, iframe, fieldset stack, or split layout from brief.',
        });
    }

    for (const pattern of requiredPatterns) {
        const valid = pattern.validate ? pattern.validate(html) : (
            (pattern.must_include || []).every((needle) => html.toLowerCase().includes(needle.toLowerCase()))
        );

        if (!valid) {
            issues.push({
                code: 'missing_complexity_pattern',
                message: `Missing required pattern "${pattern.id}": ${pattern.notes}`,
                pattern_id: pattern.id,
            });
        }
    }

    return { score, issues };
}

/**
 * @param {import('node:crypto').Hash} _
 * @param {() => number} rng
 * @param {number} count
 */
export function pickComplexityPatterns(rng, count = 3) {
    const copy = [...COMPLEXITY_PATTERN_CATALOG];
    const out = [];

    for (let i = 0; i < count && copy.length > 0; i += 1) {
        const idx = Math.floor(rng() * copy.length);
        out.push(copy.splice(idx, 1)[0]);
    }

    return out;
}

/**
 * @param {string} html
 * @param {number} [maxLen=500]
 */
export function excerptDom(html, maxLen = 500) {
    const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html;

    return body.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
