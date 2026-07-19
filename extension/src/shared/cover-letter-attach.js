/**
 * Shared Draft All / Cover tab cover-letter attach helpers.
 *
 * Greenhouse (and similar ATS) remount the form after resume upload. Attach
 * cover letter only after that remount window, using the same generation path
 * as the Cover tab (assist API + designed PDF) whenever possible.
 */

export const RESUME_REMOUNT_WAIT_MS = 1500;

/**
 * Draft All job context uses `job_description`; Cover tab / assist API use
 * `description`. Normalize so Draft All hits the same endpoint contract.
 *
 * @param {object|null|undefined} job
 * @returns {object}
 */
export function normalizeCoverLetterJobPayload(job = null) {
    const source = job && typeof job === 'object' ? job : {};
    const description = String(
        source.description || source.job_description || '',
    ).trim();

    return {
        ...source,
        title: source.title ?? null,
        company: source.company ?? null,
        link: source.link ?? source.url ?? null,
        description,
        job_description: description || source.job_description || null,
    };
}

/**
 * Draft All owns document attach for Auto Apply too - never skip because a
 * navigator session is running.
 *
 * @returns {true}
 */
export function shouldFillApplicationDocumentsDuringDraftAll() {
    return true;
}

/**
 * @param {{
 *   fillResume: () => Promise<unknown>,
 *   fillCoverLetter: () => Promise<unknown>,
 *   waitMs?: number,
 *   sleep?: (ms:number) => Promise<void>,
 * }} options
 */
export async function fillApplicationDocumentsSequence({
    fillResume,
    fillCoverLetter,
    waitMs = RESUME_REMOUNT_WAIT_MS,
    sleep = (ms) =>
        new Promise((resolve) => {
            setTimeout(resolve, ms);
        }),
}) {
    await fillResume();
    await sleep(waitMs);
    await fillCoverLetter();
}

/**
 * Resolve the PDF payload used for Cover Letter file attach.
 *
 * Prefer Cover-tab path: assist API (server designs PDF with profile design/font,
 * including Random). Fall back to client styled PDF from assist text, then the
 * offline draft template.
 *
 * @param {{
 *   job?: object|null,
 *   text?: string|null,
 *   generate?: boolean,
 *   assistCoverLetter?: (message: object) => Promise<object>,
 *   downloadProfileDocument?: (id: number|string) => Promise<{base64: string, fileName?: string, mimeType?: string}>,
 *   getProfile?: () => Promise<object>,
 *   buildDraftCoverLetterText?: (profileData: object, job?: object) => string,
 *   buildCoverLetterPdfBytes?: (text: string, options?: object) => Uint8Array|ArrayBuffer,
 *   buildCoverLetterPdfFileName?: (options?: object) => string,
 *   arrayBufferToBase64?: (bytes: Uint8Array|ArrayBuffer) => string,
 * }} deps
 */
export async function resolveCoverLetterAttachPayload({
    job = null,
    text = null,
    generate = true,
    assistCoverLetter = null,
    downloadProfileDocument = null,
    getProfile = null,
    buildDraftCoverLetterText = null,
    buildCoverLetterPdfBytes = null,
    buildCoverLetterPdfFileName = null,
    arrayBufferToBase64 = null,
} = {}) {
    const normalizedJob = normalizeCoverLetterJobPayload(job);
    let letterText =
        typeof text === 'string' && text.trim() !== '' ? text.trim() : null;
    let savedDocumentId = null;
    let source = letterText ? 'provided_text' : null;

    const jobDescription = String(normalizedJob.description || '').trim();
    const canAssist =
        generate &&
        typeof assistCoverLetter === 'function' &&
        jobDescription.length >= 40;

    if (!letterText && canAssist) {
        try {
            const assist = await assistCoverLetter({
                job: normalizedJob,
                tone: 'professional',
            });

            if (assist?.success === false && assist?.error) {
                throw new Error(String(assist.error));
            }

            const assistText = String(assist?.cover_letter || '').trim();

            if (assistText) {
                letterText = assistText;
                source = 'assist_cover_letter';
                savedDocumentId = assist?.saved_document?.id ?? null;
            }
        } catch (error) {
            // Fall through to offline template / client PDF.
            source = `assist_failed:${
                error instanceof Error ? error.message : String(error)
            }`;
        }
    } else if (!letterText && generate && jobDescription.length < 40) {
        source = 'assist_skipped_short_job_description';
    }

    if (
        savedDocumentId != null &&
        typeof downloadProfileDocument === 'function'
    ) {
        try {
            const payload = await downloadProfileDocument(savedDocumentId);
            const rawBase64 = String(payload?.base64 || '');

            if (rawBase64) {
                const base64 = rawBase64.includes(',')
                    ? rawBase64
                    : `data:${payload.mimeType || 'application/pdf'};base64,${rawBase64}`;

                return {
                    base64,
                    fileName: payload.fileName || 'cover-letter.pdf',
                    mimeType: payload.mimeType || 'application/pdf',
                    source: 'assist_saved_document',
                    text: letterText,
                    design: null,
                    font: null,
                };
            }
        } catch {
            // Fall through to client PDF builder with assist text.
        }
    }

    if (
        typeof getProfile !== 'function' ||
        typeof buildCoverLetterPdfBytes !== 'function' ||
        typeof arrayBufferToBase64 !== 'function'
    ) {
        throw new Error('Cover letter PDF builder dependencies missing.');
    }

    const profileData = await getProfile();
    const profile = profileData?.profile || profileData || {};

    if (!letterText) {
        if (typeof buildDraftCoverLetterText !== 'function') {
            throw new Error('Cover letter text unavailable.');
        }

        letterText = buildDraftCoverLetterText(profileData, normalizedJob);
        source = source?.startsWith('assist_')
            ? `${source}+draft_template`
            : 'draft_template';
    }

    const design =
        profile.cover_letter_design ?? profileData?.cover_letter_design;
    const font = profile.cover_letter_font ?? profileData?.cover_letter_font;
    const bytes = buildCoverLetterPdfBytes(letterText, {
        profile,
        job: normalizedJob,
        design,
        font,
    });
    const fileName =
        typeof buildCoverLetterPdfFileName === 'function'
            ? buildCoverLetterPdfFileName({
                  jobTitle: normalizedJob.title || null,
                  company: normalizedJob.company || null,
              })
            : 'cover-letter.pdf';

    return {
        base64: `data:application/pdf;base64,${arrayBufferToBase64(bytes)}`,
        fileName,
        mimeType: 'application/pdf',
        source,
        text: letterText,
        design,
        font,
        bytes,
        job: normalizedJob,
    };
}
