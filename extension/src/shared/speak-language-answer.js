import { readProfileValue } from './pending-fields.js';

function normalizeLanguageToken(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * "Do you speak French?" / "Do you speak English" Yes/No screeners.
 */
export function extractSpeakLanguageFromLabel(label) {
    const normalized = normalizeLanguageToken(label);

    if (!normalized) {
        return null;
    }

    const match = normalized.match(
        /\b(?:do you )?(?:speak|fluent in|proficient in)\s+([a-z]{2,}(?:\s+[a-z]{2,})?)\b/,
    );

    if (!match) {
        return null;
    }

    const language = match[1].replace(/\s+/g, ' ').trim();

    if (
        !language ||
        /(?:language|languages|english and|fluently)$/.test(language)
    ) {
        return null;
    }

    return language;
}

export function isSpeakLanguageYesNoQuestion(field) {
    const label = field?.label || field?.question || '';
    const language = extractSpeakLanguageFromLabel(label);

    if (!language) {
        return false;
    }

    const options = Array.isArray(field?.options) ? field.options : [];
    const hasYes = options.some((option) =>
        /^yes$/i.test(String(option).trim()),
    );
    const hasNo = options.some((option) => /^no$/i.test(String(option).trim()));

    return hasYes && hasNo;
}

export function profileLanguageNames(profileData) {
    const raw = readProfileValue(profileData, 'structured_data.languages');
    const list = Array.isArray(raw) ? raw : [];
    const names = [];

    for (const entry of list) {
        if (typeof entry === 'string') {
            const token = normalizeLanguageToken(entry);

            if (token) {
                names.push(token);
            }

            continue;
        }

        if (entry && typeof entry === 'object') {
            const token = normalizeLanguageToken(
                entry.language || entry.name || entry.label,
            );

            if (token) {
                names.push(token);
            }
        }
    }

    return names;
}

/**
 * Answer speak-language Yes/No only when profile languages are populated.
 * Prefer leave-pending when the languages list is empty (do not invent No).
 */
export function resolveSpeakLanguageFromProfile(field, profileData) {
    if (!isSpeakLanguageYesNoQuestion(field)) {
        return null;
    }

    const asked = extractSpeakLanguageFromLabel(
        field?.label || field?.question || '',
    );
    const names = profileLanguageNames(profileData);

    if (!asked || names.length === 0) {
        return null;
    }

    const hasLanguage = names.some(
        (name) =>
            name === asked ||
            name.startsWith(`${asked} `) ||
            asked.startsWith(name),
    );

    return hasLanguage ? 'Yes' : 'No';
}

/**
 * Stale question-memo Yes/No must not answer speak-language screeners when the
 * profile languages list is empty, or when the memo contradicts profile facts.
 */
export function shouldRejectSpeakLanguageMemoAnswer(
    field,
    answer,
    profileData,
) {
    if (!isSpeakLanguageYesNoQuestion(field)) {
        return false;
    }

    const resolved = resolveSpeakLanguageFromProfile(field, profileData);

    if (!resolved) {
        return true;
    }

    const normalized = String(answer || '')
        .trim()
        .toLowerCase();

    if (normalized !== 'yes' && normalized !== 'no') {
        return true;
    }

    return normalized !== resolved.toLowerCase();
}
