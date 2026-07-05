/**
 * Mirror ProfileAnswerGrounding::questionNeedsGrounding for form fixture scoring selection.
 */

const COMPACT_LABEL_PATTERNS = [
    'linkedin',
    'website',
    'portfolio url',
    'github url',
    'gitlab url',
    'url',
    'email',
    'phone',
    'postcode',
    'zip code',
    'zip',
    'salary',
    'compensation',
    'currency',
    'start date',
    'when can you start',
    'available from',
    'first name',
    'last name',
    'full name',
    'country code',
    'location (city)',
    'current location',
    'where are you based',
    'working location',
];

const PROSE_LABEL_PATTERNS = [
    'cover letter',
    'covering letter',
    'motivation',
    'why do you want',
    'why this role',
    'why are you interested',
    'tell us about yourself',
    'describe your experience',
    'describe your',
    'additional information',
    'personal statement',
    'portfolio',
    'github',
    'gitlab',
    'bitbucket',
    'work sample',
    'code sample',
    'security',
    'secops',
    'devops',
    'experience with',
    'background in',
    'previous role',
    'past role',
    'work history',
    'project',
    'explain how',
    'tell us about',
    'share an example',
    'give an example',
    'how do you',
    'what is your experience',
];

const SKIP_DOM_IDS = new Set(['analytics', 'marketing', 'strictly_necessary']);

export function questionNeedsScoring(field) {
    const options = field.options ?? null;

    if (Array.isArray(options) && options.length > 0) {
        return false;
    }

    const fieldType = field.field_type ?? 'text';

    if (['radio', 'select', 'checkbox', 'file', 'hidden'].includes(fieldType)) {
        return false;
    }

    const domId = field.dom?.id ?? null;

    if (domId && SKIP_DOM_IDS.has(domId)) {
        return false;
    }

    if (fieldType === 'textarea') {
        return true;
    }

    const label = (field.question ?? '').toLowerCase().trim();

    for (const pattern of COMPACT_LABEL_PATTERNS) {
        if (label.includes(pattern)) {
            return false;
        }
    }

    for (const pattern of PROSE_LABEL_PATTERNS) {
        if (label.includes(pattern)) {
            return true;
        }
    }

    const maxChars = Number(field.max_chars ?? 0);

    return fieldType === 'text' && (maxChars === 0 || maxChars >= 80);
}

/**
 * @param {Array<{question?: string, field_type?: string, max_chars?: number|null, options?: string[]|null, dom?: object|null}>} fields
 * @param {number} maxQuestions
 */
export function selectScoringQuestions(fields, maxQuestions = 3) {
    const selected = [];

    for (const [index, field] of fields.entries()) {
        if (!questionNeedsScoring(field)) {
            continue;
        }

        selected.push({
            label: field.question ?? `field-${index}`,
            ref: `f${index}`,
            field_type: field.field_type ?? 'text',
            max_chars: field.max_chars ?? null,
            options: field.options ?? null,
            dom: field.dom ?? null,
        });

        if (selected.length >= maxQuestions) {
            break;
        }
    }

    return selected;
}
