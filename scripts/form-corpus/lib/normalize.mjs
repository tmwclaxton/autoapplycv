export function normalizeQuestion(text) {
    return (text || '')
        .replace(/\s+/g, ' ')
        .replace(/[\u2731*]/g, '')
        .replace(/\(\s*required\s*\)/gi, '')
        .replace(/\byourmail@domain\.com\b/gi, '')
        .replace(/^\s*upload\s+/i, '')
        .trim()
        .toLowerCase();
}

/** Canonical aliases for common ATS label variants (oracle soft-match). */
const QUESTION_ALIASES = [
    ['resume', 'resume/cv', 'cv', 'curriculum vitae'],
    ['linkedin profile', 'linkedin url', 'linkedin', 'linkedin link'],
    ['name', 'full name', 'your name'],
    ['phone', 'phone number', 'mobile', 'mobile phone', 'telephone'],
    ['portfolio url', 'portfolio', 'portfolio link', 'website', 'personal website'],
];

function aliasKey(normalized) {
    for (const group of QUESTION_ALIASES) {
        if (group.includes(normalized)) {
            return group[0];
        }
    }

    return normalized;
}

export function questionsMatch(left, right) {
    const a = normalizeQuestion(left);
    const b = normalizeQuestion(right);

    if (a === b) {
        return true;
    }

    if (aliasKey(a) === aliasKey(b)) {
        return true;
    }

    if (a.length >= 12 && b.length >= 12 && (a.includes(b) || b.includes(a))) {
        return true;
    }

    const prefixLength = Math.min(48, a.length, b.length);

    return prefixLength >= 12 && a.slice(0, prefixLength) === b.slice(0, prefixLength);
}

export function normalizeOptions(options) {
    if (!Array.isArray(options)) {
        return null;
    }

    const normalized = options
        .map((option) => (typeof option === 'string' ? option.replace(/\s+/g, ' ').trim() : ''))
        .filter((option) => option.length > 0);

    return normalized.length > 0 ? normalized : null;
}

export function domReferenceKey(dom, fieldType = '') {
    if (!dom || !dom.tag) {
        return null;
    }

    const tag = String(dom.tag);
    const preferName = fieldType === 'radio' || fieldType === 'checkbox';

    if (dom.id && dom.name) {
        return `${tag}#${dom.id}[name=${dom.name}]`;
    }

    if (preferName && dom.name) {
        return `${tag}[name=${dom.name}]`;
    }

    if (dom.id) {
        return `${tag}#${dom.id}`;
    }

    if (dom.data_testid) {
        return `${tag}[data-testid=${dom.data_testid}]`;
    }

    if (dom.name) {
        return `${tag}[name=${dom.name}]`;
    }

    return null;
}

export function slugify(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}
