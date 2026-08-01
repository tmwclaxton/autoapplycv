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
    const fieldType = String(field.field_type || field.type || '').toLowerCase();
    const identity = `${field.name || ''} ${field.id || ''} ${field.ref || ''}`.toLowerCase();

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
export function stepHasCoverLetterInput(draftResult = null, inventoryFields = []) {
    const fromDraft = [
        ...(Array.isArray(draftResult?.pendingFields) ? draftResult.pendingFields : []),
        ...(Array.isArray(draftResult?.filledFields) ? draftResult.filledFields : []),
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
export function shouldSkipCoverLetterGenerationForSession(session, isActiveStatus) {
    if (!session || typeof isActiveStatus !== 'function') {
        return false;
    }

    if (!isActiveStatus(session.status)) {
        return false;
    }

    return !shouldAutoGenerateCoverLetter(session);
}
