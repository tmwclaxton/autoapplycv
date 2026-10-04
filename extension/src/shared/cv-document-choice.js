/**
 * Which profile document is the user's CV for uploads and LinkedIn's resume
 * picker: an explicitly flagged default CV, else the most recently uploaded
 * CV, else (no CV category at all) the newest non cover letter document.
 */

const DEFAULT_FLAG_KEYS = ['is_default', 'default', 'is_primary', 'primary'];

function isFlaggedDefault(document) {
    return DEFAULT_FLAG_KEYS.some((key) => {
        const value = document?.[key];

        return value === true || value === 1 || value === '1' || value === 'true';
    });
}

function uploadedAtMs(document) {
    const time = Date.parse(String(document?.created_at || document?.uploaded_at || ''));

    return Number.isFinite(time) ? time : null;
}

function newestFirst(documents) {
    return documents
        .map((document, index) => ({ document, index, time: uploadedAtMs(document) }))
        .sort((a, b) => {
            if (a.time !== null && b.time !== null && a.time !== b.time) {
                return b.time - a.time;
            }

            if ((a.time === null) !== (b.time === null)) {
                return a.time === null ? 1 : -1;
            }

            // The API already returns newest first; keep its order on ties.
            return a.index - b.index;
        })
        .map((entry) => entry.document);
}

/**
 * @param {Array<object>} documents profile documents from /api/profile
 * @returns {object | null}
 */
export function pickDefaultCvDocument(documents) {
    const list = (Array.isArray(documents) ? documents : []).filter(
        (document) => document && document.id !== undefined && document.id !== null,
    );

    if (list.length === 0) {
        return null;
    }

    const cvs = list.filter((document) => document.category === 'cv');
    const pool = cvs.length > 0
        ? cvs
        : list.filter((document) => document.category !== 'cover_letter');

    if (pool.length === 0) {
        return null;
    }

    const flagged = newestFirst(pool.filter(isFlaggedDefault));

    if (flagged.length > 0) {
        return flagged[0];
    }

    return newestFirst(pool)[0] || null;
}
