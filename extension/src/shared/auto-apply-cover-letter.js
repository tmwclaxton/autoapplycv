/**
 * Auto Apply cover-letter setting gates and field detection.
 *
 * Defaults match current behavior so existing users are unchanged:
 * - stop for cover letter input: off
 * - auto-generate cover letter: on
 */

export const DEFAULT_STOP_FOR_COVER_LETTER = false;
export const DEFAULT_AUTO_GENERATE_COVER_LETTER = true;

/**
 * @param {unknown} label
 * @returns {boolean}
 */
export function isCoverLetterFieldLabel(label) {
    return /\bcover letter\b/i.test(String(label || ''));
}

/**
 * @param {object|null|undefined} field
 * @returns {boolean}
 */
export function isCoverLetterField(field) {
    if (!field || typeof field !== 'object') {
        return false;
    }

    const label = field.label || field.question || field.name || '';
    const fieldType = String(
        field.field_type || field.type || '',
    ).toLowerCase();
    const identity =
        `${field.name || ''} ${field.id || ''} ${field.ref || ''}`.toLowerCase();

    if (isCoverLetterFieldLabel(label)) {
        return true;
    }

    if (fieldType === 'file' && /cover/.test(identity)) {
        return true;
    }

    return false;
}

/**
 * @param {unknown} fields
 * @returns {boolean}
 */
export function fieldsIncludeCoverLetterInput(fields) {
    if (!Array.isArray(fields)) {
        return false;
    }

    return fields.some((field) => isCoverLetterField(field));
}

/**
 * @param {object|null|undefined} draftResult
 * @param {unknown} [inventoryFields]
 * @returns {boolean}
 */
export function stepHasCoverLetterInput(
    draftResult = null,
    inventoryFields = [],
) {
    const fromDraft = [
        ...(Array.isArray(draftResult?.pendingFields)
            ? draftResult.pendingFields
            : []),
        ...(Array.isArray(draftResult?.filledFields)
            ? draftResult.filledFields
            : []),
        ...(Array.isArray(draftResult?.fields) ? draftResult.fields : []),
        ...(Array.isArray(draftResult?.unfilledRequiredFields)
            ? draftResult.unfilledRequiredFields
            : []),
    ];

    return (
        fieldsIncludeCoverLetterInput(fromDraft) ||
        fieldsIncludeCoverLetterInput(inventoryFields)
    );
}

/**
 * @param {object|null|undefined} session
 * @returns {boolean}
 */
export function shouldStopForCoverLetterInput(session) {
    return session?.stopForCoverLetterInput === true;
}

/**
 * Default on: only skip when explicitly false.
 *
 * @param {object|null|undefined} session
 * @returns {boolean}
 */
export function shouldAutoGenerateCoverLetter(session) {
    return session?.autoGenerateCoverLetter !== false;
}

/**
 * When Auto Apply is active and auto-generate is off, document attach / recovery
 * should skip cover letters. Manual Draft All (no active session) keeps generating.
 *
 * @param {object|null|undefined} session
 * @param {(status: string) => boolean} isActiveStatus
 * @returns {boolean}
 */
export function shouldSkipCoverLetterGenerationForSession(
    session,
    isActiveStatus,
) {
    if (!session || typeof isActiveStatus !== 'function') {
        return false;
    }

    if (!isActiveStatus(session.status)) {
        return false;
    }

    return !shouldAutoGenerateCoverLetter(session);
}

function normalizeForCoverLetterMatch(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function normalizedTextIncludes(text, value) {
    const needle = normalizeForCoverLetterMatch(value);

    return needle !== '' && normalizeForCoverLetterMatch(text).includes(needle);
}

function normalizedTextIncludesJobTitle(text, title) {
    const textTokens = new Set(normalizeForCoverLetterMatch(text).split(' '));
    const titleTokens = normalizeForCoverLetterMatch(title)
        .split(' ')
        .filter(
            (token) =>
                token.length > 1 &&
                !['and', 'or', 'the', 'at', 'for'].includes(token),
        );

    return (
        titleTokens.length > 0 &&
        titleTokens.every((token) => textTokens.has(token))
    );
}

/**
 * Validate text returned by the shared NanoGPT cover-letter endpoint before an
 * on-demand form accepts it as generated content.
 *
 * @param {{
 *   text?: string|null,
 *   job?: object|null,
 *   profileData?: object|null,
 * }} options
 * @returns {{ valid: boolean, text: string, reasons: string[] }}
 */
export function validateGeneratedCoverLetterText({
    text = null,
    job = null,
    profileData = null,
} = {}) {
    const letter = String(text || '').trim();
    const reasons = [];
    const words = letter.split(/\s+/).filter(Boolean);
    const title = String(job?.title || '').trim();
    const company = String(job?.company || '').trim();
    const profile = profileData?.profile || profileData || {};

    if (words.length < 100) {
        reasons.push('too_short');
    }

    if (words.length > 500) {
        reasons.push('too_long');
    }

    if (title && !normalizedTextIncludesJobTitle(letter, title)) {
        reasons.push('missing_role');
    }

    if (company && !normalizedTextIncludes(letter, company)) {
        reasons.push('missing_company');
    }

    if (
        /\b(job vacancy|position|role)\b(?:\W+\w+){0,4}\W+\1\b/iu.test(letter)
    ) {
        reasons.push('repetitive_generic_phrase');
    }

    const experience = Array.isArray(profile.experience)
        ? profile.experience
        : [];
    const hasGroundedExperience =
        experience.length === 0 ||
        experience.some(
            (role) =>
                normalizedTextIncludes(letter, role?.company) &&
                normalizedTextIncludes(letter, role?.title),
        );

    if (!hasGroundedExperience) {
        reasons.push('missing_profile_evidence');
    }

    const email = String(profile.email || '')
        .trim()
        .toLowerCase();

    if (email && letter.toLowerCase().includes(email)) {
        reasons.push('duplicate_contact_details');
    }

    const phoneDigits = String(profile.phone || '').replace(/\D+/g, '');
    const letterDigits = letter.replace(/\D+/g, '');

    if (phoneDigits.length >= 7 && letterDigits.includes(phoneDigits)) {
        reasons.push('duplicate_contact_details');
    }

    const fullName = normalizeForCoverLetterMatch(profile.full_name);

    if (fullName) {
        const normalizedLetter = normalizeForCoverLetterMatch(letter);
        let occurrences = 0;
        let index = normalizedLetter.indexOf(fullName);

        while (index !== -1) {
            occurrences += 1;
            index = normalizedLetter.indexOf(fullName, index + fullName.length);
        }

        if (occurrences > 1) {
            reasons.push('duplicate_candidate_name');
        }
    }

    return {
        valid: reasons.length === 0,
        text: letter,
        reasons: [...new Set(reasons)],
    };
}
