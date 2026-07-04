export function normalizeQuestion(text) {
    return (text || '')
        .replace(/\s+/g, ' ')
        .replace(/\*/g, '')
        .trim()
        .toLowerCase();
}

export function questionsMatch(left, right) {
    const a = normalizeQuestion(left);
    const b = normalizeQuestion(right);

    if (a === b) {
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

export function slugify(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}
