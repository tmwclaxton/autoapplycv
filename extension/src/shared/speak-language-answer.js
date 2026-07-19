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

function isEnglishSpeakingProfileCountry(profileData) {
    const country = normalizeLanguageToken(
        readProfileValue(profileData, 'country'),
    );

    if (!country) {
        return false;
    }

    return /^(united kingdom|uk|great britain|england|scotland|wales|united states|usa|u s a|u s|canada|australia|new zealand|ireland|republic of ireland)$/.test(
        country,
    );
}

/**
 * Free-text "other than English, which languages do you speak?" style prompts.
 * Distinct from Yes/No "Do you speak French?" screeners.
 */
export function isAdditionalLanguagesFreeTextQuestion(field) {
    const label = normalizeLanguageToken(field?.label || field?.question || '');
    const fieldType = String(field?.field_type || field?.type || '').toLowerCase();

    if (!label) {
        return false;
    }

    if (
        fieldType &&
        fieldType !== 'text' &&
        fieldType !== 'textarea' &&
        fieldType !== 'input'
    ) {
        return false;
    }

    if (isSpeakLanguageYesNoQuestion(field)) {
        return false;
    }

    return (
        (/\bother than english\b/.test(label) &&
            /\b(?:language|languages|speak|fluent)\b/.test(label)) ||
        (/\b(?:which|what)\s+languages?\b/.test(label) &&
            /\b(?:speak|fluent|proficient)\b/.test(label)) ||
        /\blanguages?\s+do\s+you\s+speak\b/.test(label)
    );
}

/**
 * List non-English profile languages, or answer No when the list is empty for
 * English-speaking countries (Hively free-text fluency prompt).
 */
export function resolveAdditionalLanguagesFreeTextAnswer(field, profileData) {
    if (!isAdditionalLanguagesFreeTextQuestion(field)) {
        return null;
    }

    const names = profileLanguageNames(profileData).filter(
        (name) => name !== 'english',
    );

    if (names.length > 0) {
        return names.map((name) => titleCaseLanguage(name)).join(', ');
    }

    if (isEnglishSpeakingProfileCountry(profileData)) {
        return 'No';
    }

    return null;
}

/**
 * Answer speak-language Yes/No when profile languages are populated.
 * English defaults to Yes for English-speaking profile countries even when the
 * languages list is empty. Other languages stay pending (do not invent No).
 */
export function resolveSpeakLanguageFromProfile(field, profileData) {
    if (!isSpeakLanguageYesNoQuestion(field)) {
        return null;
    }

    const asked = extractSpeakLanguageFromLabel(
        field?.label || field?.question || '',
    );
    const names = profileLanguageNames(profileData);

    if (!asked) {
        return null;
    }

    if (names.length === 0) {
        if (asked === 'english' && isEnglishSpeakingProfileCountry(profileData)) {
            return 'Yes';
        }

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

function titleCaseLanguage(language) {
    return String(language || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

/**
 * How to persist a sidebar Yes/No for a speak-language screener.
 * Yes merges the language into structured_data.languages; No stays on application Q&A.
 *
 * @returns {{ mode: 'profile_languages', languages: Array<object> }|{ mode: 'application_answers' }|null}
 */
export function resolveSpeakLanguagePendingSave(field, answer, profileData) {
    if (!isSpeakLanguageYesNoQuestion(field)) {
        return null;
    }

    const normalized = String(answer || '')
        .trim()
        .toLowerCase();
    const asked = extractSpeakLanguageFromLabel(
        field?.label || field?.question || '',
    );

    if (!asked || (normalized !== 'yes' && normalized !== 'no')) {
        return { mode: 'application_answers' };
    }

    if (normalized === 'no') {
        return { mode: 'application_answers' };
    }

    const existing = readProfileValue(profileData, 'structured_data.languages');
    const list = Array.isArray(existing)
        ? existing.map((entry) =>
              entry && typeof entry === 'object' ? { ...entry } : entry,
          )
        : [];
    const names = profileLanguageNames(profileData);
    const alreadyListed = names.some(
        (name) =>
            name === asked ||
            name.startsWith(`${asked} `) ||
            asked.startsWith(name),
    );

    if (!alreadyListed) {
        list.push({
            language: titleCaseLanguage(asked),
            proficiency: null,
        });
    }

    return { mode: 'profile_languages', languages: list };
}
