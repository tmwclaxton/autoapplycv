export const COVER_LETTER_SETTING_RANDOM = 'random';

export const COVER_LETTER_DESIGN_KEYS = [
    'teal-masthead',
    'ink-sidebar',
    'swiss-rules',
    'forest-rail',
    'coral-timeline',
    'asymmetric-split',
    'slate-bands',
    'mono-bold',
    'ocean-wash',
    'geometric-mark',
];

export const COVER_LETTER_FONT_KEYS = [
    'clash-display',
    'satoshi',
    'general-sans',
    'cabinet-grotesk',
    'switzer',
    'outfit',
    'source-serif',
    'literata',
    'ibm-plex-sans',
    'space-grotesk',
];

/** @type {Record<string, [number, number, number]>} */
export const COVER_LETTER_DESIGN_ACCENTS = {
    'teal-masthead': [0.059, 0.463, 0.435],
    'ink-sidebar': [0.110, 0.122, 0.149],
    'swiss-rules': [0.067, 0.067, 0.067],
    'forest-rail': [0.086, 0.239, 0.173],
    'coral-timeline': [0.878, 0.416, 0.306],
    'asymmetric-split': [0.145, 0.388, 0.922],
    'slate-bands': [0.059, 0.090, 0.165],
    'mono-bold': [0.039, 0.039, 0.039],
    'ocean-wash': [0.114, 0.306, 0.537],
    'geometric-mark': [0.769, 0.361, 0.149],
};

const SERIF_FONTS = new Set(['source-serif', 'literata']);

export function normalizeCoverLetterDesign(design) {
    const value = String(design ?? '').trim();

    if (value === COVER_LETTER_SETTING_RANDOM) {
        return COVER_LETTER_SETTING_RANDOM;
    }

    if (COVER_LETTER_DESIGN_KEYS.includes(value)) {
        return value;
    }

    return 'teal-masthead';
}

export function normalizeCoverLetterFont(font) {
    const value = String(font ?? '').trim();

    if (value === COVER_LETTER_SETTING_RANDOM) {
        return COVER_LETTER_SETTING_RANDOM;
    }

    if (COVER_LETTER_FONT_KEYS.includes(value)) {
        return value;
    }

    return 'clash-display';
}

export function pickRandomCoverLetterDesign() {
    return COVER_LETTER_DESIGN_KEYS[Math.floor(Math.random() * COVER_LETTER_DESIGN_KEYS.length)];
}

export function pickRandomCoverLetterFont() {
    return COVER_LETTER_FONT_KEYS[Math.floor(Math.random() * COVER_LETTER_FONT_KEYS.length)];
}

export function resolveCoverLetterDesignSettings(designPreference, fontPreference) {
    const designPref = normalizeCoverLetterDesign(designPreference);
    const fontPref = normalizeCoverLetterFont(fontPreference);

    return {
        design: designPref === COVER_LETTER_SETTING_RANDOM
            ? pickRandomCoverLetterDesign()
            : designPref,
        font: fontPref === COVER_LETTER_SETTING_RANDOM
            ? pickRandomCoverLetterFont()
            : fontPref,
        designPreference: designPref,
        fontPreference: fontPref,
    };
}

export function coverLetterFontIsSerif(fontKey) {
    return SERIF_FONTS.has(normalizeCoverLetterFont(fontKey));
}

export function coverLetterAccent(designKey) {
    return COVER_LETTER_DESIGN_ACCENTS[normalizeCoverLetterDesign(designKey)]
        ?? COVER_LETTER_DESIGN_ACCENTS['teal-masthead'];
}
