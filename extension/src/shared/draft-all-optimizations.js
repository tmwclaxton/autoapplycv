const CHOICE_FIELD_TYPES = new Set(['radio', 'checkbox', 'select']);
const TEXT_LIKE_FIELD_TYPES = new Set([
    'text',
    'email',
    'tel',
    'url',
    'number',
    'textarea',
]);

import {
    extractYearsExperienceThreshold,
    normalizeFieldAnswerForQuestion,
} from './answer-normalization.js';
import { isMeaningfulAnswer } from './draft-all/answer-utils.js';
import {
    isMarketingOrFutureConsentField,
    isAgreementCheckboxField,
} from './draft-all/consent-fields.js';
import { shouldRejectAnswerForTypeCoherence } from './draft-all/type-coherence.js';
import { isPositionApplyingForQuestionLabel } from './auto-apply-screener-answer.js';
import {
    isEmployerScreeningTrapLabel,
    isEmployerSpecificTravelComfortLabel,
    isInterviewAccommodationQuestionLabel,
    isOnSiteCommuteQuestionLabel,
    isOptionalSocialNetworkUrlLabel,
    isSecurityClearanceQuestionLabel,
    isServingNoticeFollowUpQuestionLabel,
    isSkillSpecificYearsExperienceQuestionLabel,
    isSourceOfHireOtherFollowUpLabel,
    isSourceOfHireQuestionLabel,
    isUsLocationConfirmationQuestion,
    resolvePreferenceProfileAnswer,
    shouldRejectPhoneAnswerOnField,
} from './pending-fields.js';
import { shouldRejectSpeakLanguageMemoAnswer } from './speak-language-answer.js';

const ATS_URL_PATTERNS = [
    { pattern: /jobs\.ashbyhq\.com\/([^/?#]+)/i, source: 'ashby' },
    { pattern: /(?:^|\.)ashbyhq\.com\/([^/?#]+)/i, source: 'ashby' },
    { pattern: /boards\.greenhouse\.io\/([^/?#]+)/i, source: 'greenhouse' },
    { pattern: /job-boards\.greenhouse\.io\/([^/?#]+)/i, source: 'greenhouse' },
    { pattern: /jobs\.lever\.co\/([^/?#]+)/i, source: 'lever' },
    // aignostics.teamtailor.com/jobs/...
    { pattern: /([a-z0-9-]+)\.teamtailor\.com\b/i, source: 'teamtailor' },
    { pattern: /jobs\.smartrecruiters\.com/i, source: 'smartrecruiters' },
    // apply.workable.com/booksy-1/j/... - strip trailing -1 account suffixes later.
    { pattern: /(?:^|\.)workable\.com\/([^/?#]+)/i, source: 'workable' },
    // fairfood-freiburg.jobs.personio.de/job/...
    {
        pattern: /([a-z0-9-]+)\.jobs\.personio\.(?:de|com)\b/i,
        source: 'personio',
    },
    // aikidosecurity.recruitee.com/o/...
    { pattern: /([a-z0-9-]+)\.recruitee\.com\b/i, source: 'recruitee' },
];

const MIN_SINGLE_PAGE_FIELD_COUNT = 5;
const MIN_INFERRED_JOB_TEXT_LENGTH = 200;
/** Matches DraftAllApplicationRequest / InventoryApplicationRequest max:64. */
const MAX_API_FIELD_OPTIONS = 64;
/** Matches DraftAllApplicationRequest fields.*.max_chars max:5000. */
const MAX_API_FIELD_MAX_CHARS = 5000;
const MIN_API_FIELD_MAX_CHARS = 20;
const PREFERRED_OPTION_PATTERN =
    /^(reed|indeed|linkedin|totaljobs|glassdoor|cv.?library|other|yes|no)$/i;

/**
 * Cap choice options for API validation while keeping common board/yes-no answers.
 *
 * @param {unknown} options
 * @returns {unknown}
 */
export function truncateOptionsForApi(options) {
    if (!Array.isArray(options) || options.length <= MAX_API_FIELD_OPTIONS) {
        return options;
    }

    const preferred = [];
    const rest = [];

    for (const option of options) {
        const label =
            typeof option === 'string'
                ? option
                : String(option?.label ?? option?.value ?? option ?? '').trim();

        if (PREFERRED_OPTION_PATTERN.test(label)) {
            preferred.push(option);
        } else {
            rest.push(option);
        }
    }

    return [...preferred, ...rest].slice(0, MAX_API_FIELD_OPTIONS);
}

function formatCompanySlug(slug) {
    if (!slug || typeof slug !== 'string') {
        return null;
    }

    // Workable account slugs are often "booksy-1", "fuseenergy".
    const cleaned = slug
        .replace(/\/.*$/, '')
        .replace(/-\d+$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();

    if (!cleaned || /^(j|jobs|apply|o)$/i.test(cleaned)) {
        return null;
    }

    return cleaned.replace(/\b\w/g, (char) => char.toUpperCase()).trim();
}

function inferCompanyFromPageTitle(pageTitle) {
    const title = String(pageTitle || '').trim();

    if (!title) {
        return null;
    }

    // "Role - Booksy - Application" / "Role | Acme | Careers"
    const workableTail = title.match(
        /\s[-|]\s+(.+?)\s[-|]\s+(?:Application|Apply|Careers|Jobs)\s*$/i,
    );

    if (workableTail?.[1]) {
        const company = workableTail[1].trim();

        if (company.length >= 2 && !/^unknown\b/i.test(company)) {
            return company;
        }
    }

    return null;
}

function parseJobTitleFromPageTitle(pageTitle, company) {
    const title = String(pageTitle || '').trim();

    if (title === '') {
        return null;
    }

    const separators = [' | ', ' - ', ' \u2014 ', ' \u2013 ', ' at '];

    for (const separator of separators) {
        const parts = title
            .split(separator)
            .map((part) => part.trim())
            .filter(Boolean);

        if (parts.length < 2) {
            continue;
        }

        const companyLower = company?.toLowerCase();

        for (const part of parts) {
            if (companyLower && part.toLowerCase() === companyLower) {
                continue;
            }

            if (/^(careers|jobs|apply|application)$/i.test(part)) {
                continue;
            }

            if (part.length >= 3) {
                return part.slice(0, 255);
            }
        }
    }

    if (/apply|application|careers|jobs/i.test(title) && title.length < 40) {
        return null;
    }

    return title.slice(0, 255);
}

export function normalizeQuestionLabel(label) {
    return String(label || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/(\p{L})(required|optional)\b/giu, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
}

export function isJobSpecificMemoField(field) {
    const label = normalizeQuestionLabel(field?.label || field?.question || '');

    if (!label) {
        return false;
    }

    // Cover letters and "additional information" free-text are per-job; reusing a
    // prior Optro/etc. essay on Figma (or any next board) is wrong.
    if (
        /\bcover letter\b/.test(label) ||
        /\badditional information\b/.test(label) ||
        /\banything else (?:you.d|you would) like to share\b/.test(label)
    ) {
        return true;
    }

    // Motivation / "why us" essays must be rewritten for the current employer.
    if (
        /\bwhy (?:do you want|are you interested|should we)\b/.test(label) ||
        /\bwhy (?:this|our) (?:company|role|position|job|team)\b/.test(label) ||
        /\bwhat interests you (?:about|in)\b/.test(label) ||
        /\btell us why\b/.test(label)
    ) {
        return true;
    }

    // Behavioral / culture STAR essays are per-application; stale memos from
    // another board must not refill (Ashby UK staff: 4 long-form prompts).
    if (
        /\bdescribe (?:a|an|the|one)\b/.test(label) ||
        /\btell (?:us|me) about a (?:time|situation|project|role)\b/.test(
            label,
        ) ||
        /\bwhat.?s something\b/.test(label) ||
        /\bculture (?:and )?values\b/.test(label) ||
        /\bour values\b/.test(label)
    ) {
        return true;
    }

    // Employer-country work-auth / nationality status selects (Booksy Poland vs
    // Smarkets UK RTW free-text must not share a memo).
    if (
        /\blegal work authorization status\b/.test(label) ||
        /\bwork authorization status\b/.test(label) ||
        /\bcurrent (?:legal )?work authori[sz]ation\b/.test(label) ||
        /\b(?:polish|uk|british|irish|us|american|eu) national\b/.test(label) ||
        (/\bnationalit/.test(label) && /\b(status|specify|current)\b/.test(label))
    ) {
        return true;
    }

    return false;
}

/**
 * Wipe stale per-job essay DOM values before NanoGPT drafts replacements.
 * Fields remain in the LLM batch; clear only removes prior Optro/etc. text.
 *
 * @param {Array<object>|null|undefined} fields
 * @returns {{ remainingFields: Array<object>, clearAnswers: Array<object> }}
 */
export function partitionJobSpecificEssayClearFields(fields) {
    const remainingFields = [];
    const clearAnswers = [];

    for (const field of fields || []) {
        remainingFields.push(field);

        if (!isJobSpecificMemoField(field)) {
            continue;
        }

        const fieldType = String(field?.field_type || '').toLowerCase();

        if (fieldType !== 'textarea' && fieldType !== 'text') {
            continue;
        }

        clearAnswers.push({
            ...field,
            answer: '__CLEAR__',
        });
    }

    return { remainingFields, clearAnswers };
}

export function applicationAnswersToMemo(applicationAnswers) {
    const memo = {};

    if (!Array.isArray(applicationAnswers)) {
        return memo;
    }

    for (const entry of applicationAnswers) {
        const question = String(entry?.question || '').trim();
        const answer = String(entry?.answer || '').trim();

        if (!question || !answer) {
            continue;
        }

        if (isJobSpecificMemoField({ label: question })) {
            continue;
        }

        memo[question] = answer;
    }

    return memo;
}

export function mergeQuestionMemos(...memos) {
    return Object.assign(
        {},
        ...memos.filter((memo) => memo && typeof memo === 'object'),
    );
}

/**
 * @param {{ label?: string, question?: string }|null|undefined} field
 * @param {object|null|undefined} profileData
 * @param {Record<string, string>|null|undefined} questionMemo
 * @returns {string|null}
 */
export function resolveSavedApplicationAnswer(
    field,
    profileData = null,
    questionMemo = null,
) {
    const label = field?.label || field?.question || '';

    if (!label || isJobSpecificMemoField(field)) {
        return null;
    }

    const mergedMemo = mergeQuestionMemos(
        questionMemo,
        applicationAnswersToMemo(profileData?.application_answers),
    );
    const answer = matchMemoAnswer(mergedMemo, label);

    if (
        !answer ||
        shouldRejectPhoneAnswerOnField(field, answer) ||
        shouldRejectAnswerForTypeCoherence(field, answer) ||
        isInterviewAccommodationQuestionLabel(label) ||
        isOnSiteCommuteQuestionLabel(label) ||
        extractYearsExperienceThreshold(label) !== null
    ) {
        return null;
    }

    return answer;
}

export function matchMemoAnswer(questionMemo, fieldLabel) {
    if (!questionMemo || typeof questionMemo !== 'object') {
        return null;
    }

    const answer = questionMemo[fieldLabel];

    if (typeof answer === 'string' && answer.trim() !== '') {
        return answer;
    }

    const normalizedLabel = normalizeQuestionLabel(fieldLabel);

    if (!normalizedLabel) {
        return null;
    }

    for (const [memoLabel, memoAnswer] of Object.entries(questionMemo)) {
        if (typeof memoAnswer !== 'string' || memoAnswer.trim() === '') {
            continue;
        }

        if (normalizeQuestionLabel(memoLabel) === normalizedLabel) {
            return memoAnswer;
        }
    }

    return null;
}

export function partitionFieldsByQuestionMemo(
    fields,
    questionMemo,
    profileData = null,
) {
    const memoAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const label = field.label || field.question || '';

        if (isEmployerScreeningTrapLabel(label)) {
            remainingFields.push(field);
            continue;
        }

        if (
            isMeaningfulAnswer(
                resolvePreferenceProfileAnswer(field, profileData),
            )
        ) {
            remainingFields.push(field);
            continue;
        }

        if (isMarketingOrFutureConsentField(field)) {
            remainingFields.push(field);
            continue;
        }

        if (isAgreementCheckboxField(field)) {
            remainingFields.push(field);
            continue;
        }

        if (isJobSpecificMemoField(field)) {
            remainingFields.push(field);
            continue;
        }

        // Source-of-hire must use board heuristics (LinkedIn/etc.), not a stale
        // memo value like "Other" from a prior NanoGPT draft.
        if (isSourceOfHireQuestionLabel(label)) {
            remainingFields.push(field);
            continue;
        }

        // "If Other, please explain" essays belong with source-of-hire, not memo.
        if (isSourceOfHireOtherFollowUpLabel(label)) {
            remainingFields.push(field);
            continue;
        }

        // Stale Facebook/Twitter essay memos must not refill optional URL fields.
        if (isOptionalSocialNetworkUrlLabel(label)) {
            remainingFields.push(field);
            continue;
        }

        // Interview accommodation free-text must stay blank (no career essays).
        if (isInterviewAccommodationQuestionLabel(label)) {
            remainingFields.push(field);
            continue;
        }

        // Skill/tool years must not reuse a stale total-YOE memo value.
        if (isSkillSpecificYearsExperienceQuestionLabel(label)) {
            remainingFields.push(field);
            continue;
        }

        // Serving-notice follow-ups use heuristics, not career-essay memos.
        if (isServingNoticeFollowUpQuestionLabel(label)) {
            remainingFields.push(field);
            continue;
        }

        // USA-based confirmation must use country heuristics, not stale relocate memo.
        if (isUsLocationConfirmationQuestion(label)) {
            remainingFields.push(field);
            continue;
        }

        // Office-days / onsite commute must use live location heuristics, not a
        // stale Yes/No memo from an earlier city or outdated decline path.
        if (isOnSiteCommuteQuestionLabel(label)) {
            remainingFields.push(field);
            continue;
        }

        // Security clearance / defence travel comfort must stay screening_clarify
        // (live Faculty: stale Yes memo filled weekly UK defence travel).
        if (
            isSecurityClearanceQuestionLabel(label) ||
            isEmployerSpecificTravelComfortLabel(label)
        ) {
            remainingFields.push(field);
            continue;
        }

        // "4+ years of experience?" filter gates must use profile YOE coercion,
        // not a stale No that would self-reject the application.
        if (
            extractYearsExperienceThreshold(label) !== null &&
            Array.isArray(field?.options) &&
            field.options.some((option) =>
                /^yes$/i.test(String(option).trim()),
            ) &&
            field.options.some((option) => /^no$/i.test(String(option).trim()))
        ) {
            remainingFields.push(field);
            continue;
        }

        // Personio Stelle/Bereich must use the current job title, not a stale essay.
        if (isPositionApplyingForQuestionLabel(label)) {
            remainingFields.push(field);
            continue;
        }

        const answer = matchMemoAnswer(questionMemo, label);

        if (
            answer &&
            !shouldRejectPhoneAnswerOnField(field, answer) &&
            !shouldRejectAnswerForTypeCoherence(field, answer) &&
            !shouldRejectSpeakLanguageMemoAnswer(field, answer, profileData)
        ) {
            memoAnswers.push({
                id: field.id,
                ref: field.ref,
                label,
                field_type: field.field_type,
                dom: field.dom || null,
                answer,
            });
        } else {
            remainingFields.push(field);
        }
    }

    return { memoAnswers, remainingFields };
}

export function compactSnapshotForInventory(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return snapshot;
    }

    const compact = {
        page_url: snapshot.page_url,
        page_title: snapshot.page_title,
        elements: (snapshot.elements || []).map((element) => ({
            ref: element.ref,
            question: element.question,
            field_type: element.field_type,
            max_chars: element.max_chars,
            options: truncateOptionsForApi(element.options),
            required: element.required,
            context: element.context,
        })),
    };

    const controls = snapshot.controls || [];

    if (controls.length > 0) {
        compact.controls = controls;
    }

    return compact;
}

export function enrichFieldsWithSnapshotDom(fields, snapshot) {
    const domByRef = new Map(
        (snapshot?.elements || [])
            .filter((element) => element?.ref)
            .map((element) => [element.ref, element.dom ?? null]),
    );

    return (fields || []).map((field) => ({
        ...field,
        dom: field.dom || domByRef.get(field.ref) || null,
    }));
}

/**
 * When a draft batch has city + postcode/street siblings, enrich each locality
 * field's context so NanoGPT does not invent mismatched locality parts.
 */
function siblingLocalityBatchContext(fields) {
    const localityHints = [];

    for (const field of fields || []) {
        const label = String(
            field?.label || field?.question || '',
        ).toLowerCase();

        if (
            /\b(?:city|town|postcode|postal code|zip|street|address)\b/.test(
                label,
            )
        ) {
            localityHints.push(
                String(field.label || field.question || '').trim(),
            );
        }
    }

    if (localityHints.length < 2) {
        return '';
    }

    return `Sibling locality fields in this batch: ${localityHints.join(' | ')}. Keep city/postcode/street consistent with the profile; use null if a part is missing.`;
}

function siblingEducationGradeBatchContext(fields) {
    let hasPercentage = false;
    let hasClassification = false;

    for (const field of fields || []) {
        const label = String(field?.label || field?.question || '')
            .toLowerCase()
            .replace(/\s+/g, ' ');

        if (
            /\b(?:numeric\s+)?percentage\s+average\b/.test(label) ||
            /\baverage\s+(?:mark|grade|percentage|percent)\b/.test(label)
        ) {
            hasPercentage = true;
        }

        if (
            /\bdegree\s+classification\b/.test(label) ||
            (/\bclassification\b/.test(label) &&
                /\b(?:degree|honours|honors|class)\b/.test(label))
        ) {
            hasClassification = true;
        }
    }

    if (!hasPercentage || !hasClassification) {
        return '';
    }

    return 'Sibling education grade fields in this batch include percentage average and degree classification. If classification options include a % band (e.g. 70% and above), answer percentage average with that lower-bound number rather than null.';
}

export function compactFieldsForDraft(fields) {
    const siblingLocalityHint = siblingLocalityBatchContext(fields);
    const siblingEducationHint = siblingEducationGradeBatchContext(fields);

    return (fields || []).map((field, index) => {
        const fieldType = field.field_type || 'text';
        const compact = {
            id: field.id ?? index,
            ref: field.ref,
            label: field.label,
            field_type: fieldType,
        };

        const maxChars = Number(field.max_chars);

        if (Number.isFinite(maxChars) && maxChars >= MIN_API_FIELD_MAX_CHARS) {
            // Workable cover-letter fields expose max_chars=200000; sending that
            // fails DraftAllApplicationRequest and the browser follows a 302 HTML
            // redirect, which looks like an empty successful NDJSON stream.
            compact.max_chars = Math.min(
                MAX_API_FIELD_MAX_CHARS,
                Math.floor(maxChars),
            );
        }

        if (
            CHOICE_FIELD_TYPES.has(fieldType) &&
            Array.isArray(field.options) &&
            field.options.length > 0
        ) {
            compact.options = truncateOptionsForApi(field.options);
        }

        if (field.dom && typeof field.dom === 'object') {
            const dom = {};

            for (const key of ['id', 'name']) {
                if (
                    typeof field.dom[key] === 'string' &&
                    field.dom[key].trim() !== ''
                ) {
                    dom[key] = field.dom[key].trim();
                }
            }

            if (Object.keys(dom).length > 0) {
                compact.dom = dom;
            }
        }

        const contextParts = [];

        if (typeof field.context === 'string' && field.context.trim() !== '') {
            contextParts.push(field.context.trim());
        }

        if (siblingLocalityHint) {
            const label = String(field?.label || '').toLowerCase();

            if (
                /\b(?:city|town|postcode|postal code|zip|street|address)\b/.test(
                    label,
                )
            ) {
                contextParts.push(siblingLocalityHint);
            }
        }

        if (siblingEducationHint) {
            const label = String(field?.label || '').toLowerCase();

            if (
                /\b(?:percentage|percent|classification|honours|honors|gpa|average)\b/.test(
                    label,
                )
            ) {
                contextParts.push(siblingEducationHint);
            }
        }

        if (contextParts.length > 0) {
            compact.context = contextParts.join(' ').slice(0, 240);
        }

        return compact;
    });
}

export function snapshotFingerprint(snapshot) {
    const elements = snapshot?.elements || [];
    const controls = snapshot?.controls || [];

    return [
        elements.length,
        controls.length,
        elements
            .map((element) => `${element.ref}:${element.question}`)
            .join('|'),
        controls.map((control) => control.ref).join('|'),
    ].join('::');
}

/**
 * Lightweight DOM signature for SPA step changes where the URL stays the same.
 * Used by the content mutation observer and to invalidate draft-all snapshot cache.
 */
export function computeFormContentSignature(rootDocument) {
    const doc =
        rootDocument || (typeof document !== 'undefined' ? document : null);

    if (!doc) {
        return '';
    }

    const heading =
        doc
            .querySelector('h1')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80) || '';
    const form = doc.querySelector('form');

    return `${heading}|${form?.querySelectorAll('input, textarea, select').length || 0}|${form?.textContent?.length || 0}`;
}

export function shouldReuseCachedDraftAllSnapshot(
    cachedFingerprint,
    freshFingerprint,
) {
    return (
        Boolean(cachedFingerprint) &&
        Boolean(freshFingerprint) &&
        cachedFingerprint === freshFingerprint
    );
}

export function shouldForceInventoryComplete(snapshot, inventory) {
    const controls = snapshot?.controls || [];
    const elementCount = snapshot?.elements?.length || 0;
    const fieldCount = inventory?.fields?.length || 0;

    if (
        controls.length > 0 ||
        elementCount < MIN_SINGLE_PAGE_FIELD_COUNT ||
        fieldCount === 0
    ) {
        return false;
    }

    return true;
}

const GENERIC_QUESTION_PATTERNS = [
    /^field\b/u,
    /^input\b/u,
    /^select\b/u,
    /^choose one\b/u,
    /^click here\b/u,
];

function isGenericQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized || normalized.length < 2) {
        return true;
    }

    return GENERIC_QUESTION_PATTERNS.some((pattern) =>
        pattern.test(normalized),
    );
}

export function buildMechanicalInventoryFields(snapshot) {
    const elements = snapshot?.elements || [];

    return elements
        .filter(
            (element) =>
                element?.ref &&
                element?.question &&
                element.field_type !== 'file',
        )
        .map((element) => ({
            ref: element.ref,
            question: element.question,
            field_type: element.field_type || 'text',
            max_chars: element.max_chars ?? null,
            options: element.options ?? null,
            dom: element.dom ?? null,
            context: element.context ?? null,
            job_posting_location: element.job_posting_location ?? null,
        }));
}

function isNavigationOnlyControl(control) {
    const name = String(control?.name || control?.label || control?.text || '')
        .replace(/\s+/g, ' ')
        .trim();

    return /^(continue|next|submit|back|review|save and continue|apply|apply now)$/i.test(
        name,
    );
}

export function canUseMechanicalInventory(snapshot) {
    const elements = snapshot?.elements || [];
    const controls = snapshot?.controls || [];
    const fields = buildMechanicalInventoryFields(snapshot);

    if (fields.length === 0) {
        return false;
    }

    const refs = new Set();

    for (const field of fields) {
        if (refs.has(field.ref)) {
            return false;
        }

        refs.add(field.ref);

        if (isGenericQuestionLabel(field.question)) {
            return false;
        }
    }

    // Reed Easy Apply (and similar) is one concrete question per step plus Continue.
    // Navigation controls must not force a flaky LLM inventory round-trip.
    const navigationOnlyControls =
        controls.length === 0 ||
        controls.every((control) => isNavigationOnlyControl(control));

    if (navigationOnlyControls) {
        return true;
    }

    if (controls.length > 0) {
        return false;
    }

    return elements.length >= 3;
}

export function isTextLikeFieldType(fieldType) {
    if (!fieldType || fieldType === 'text') {
        return true;
    }

    return TEXT_LIKE_FIELD_TYPES.has(fieldType);
}

export function partitionBatchAnswersForApply(answers) {
    const sequential = [];
    const parallel = [];

    for (const answer of answers || []) {
        if (isTextLikeFieldType(answer.field_type)) {
            parallel.push(answer);
        } else {
            sequential.push(answer);
        }
    }

    return { parallel, sequential };
}

export function enrichApplyAnswers(answers, fieldsByRef, options = {}) {
    const profileYears = options.profileYears ?? null;

    return (answers || []).map((answer) => {
        const field = fieldsByRef?.get?.(answer.ref);
        const label = answer.label || field?.label || field?.question || '';
        const fieldType = answer.field_type || field?.field_type || null;
        const fieldOptions = answer.options || field?.options || null;
        const normalizedAnswer = normalizeFieldAnswerForQuestion(
            label,
            answer.answer,
            {
                profileYears,
                fieldType,
                domId:
                    field?.dom?.id ||
                    field?.dom?.input_id ||
                    answer.dom?.id ||
                    null,
                options: fieldOptions,
                fallbackNoticePeriod: '2 weeks',
            },
        );

        if (!field) {
            return {
                ...answer,
                answer: normalizedAnswer,
            };
        }

        return {
            ...answer,
            answer: normalizedAnswer,
            field_type: fieldType || 'text',
            options: fieldOptions,
            dom: answer.dom || field.dom || null,
            data_field_path:
                answer.data_field_path || field.dom?.data_field_path || null,
        };
    });
}

export function parseGreenhouseBoardJobFromUrl(url) {
    try {
        const parsed = new URL(String(url || ''));
        const host = parsed.hostname.toLowerCase();

        if (!host.includes('greenhouse.io')) {
            return null;
        }

        const embedBoard = parsed.searchParams.get('for');
        const embedToken = parsed.searchParams.get('token');

        if (embedBoard && embedToken) {
            return { board: embedBoard, jobId: embedToken };
        }

        const pathMatch = parsed.pathname.match(/\/([^/]+)\/jobs\/(\d+)/i);

        if (pathMatch?.[1] && pathMatch?.[2] && pathMatch[1] !== 'embed') {
            return { board: pathMatch[1], jobId: pathMatch[2] };
        }

        return null;
    } catch {
        return null;
    }
}

export async function fetchGreenhouseJobPostingLocation(url) {
    const parsed = parseGreenhouseBoardJobFromUrl(url);

    if (!parsed) {
        return '';
    }

    try {
        const response = await fetch(
            `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parsed.board)}/jobs/${encodeURIComponent(parsed.jobId)}`,
        );

        if (!response.ok) {
            return '';
        }

        const data = await response.json();
        const locationName = data?.location?.name;

        return typeof locationName === 'string'
            ? locationName.trim().slice(0, 200)
            : '';
    } catch {
        return '';
    }
}

export function tryInferJobContextFromPage(pagePayload, tabTitle = '') {
    const pageUrl = pagePayload?.page_url || '';
    const pageTitle = pagePayload?.page_title || tabTitle || '';
    const pageText = pagePayload?.page_text || '';

    if (!pageUrl && !pageTitle) {
        return null;
    }

    let company = null;
    let source = null;

    for (const entry of ATS_URL_PATTERNS) {
        const match = pageUrl.match(entry.pattern);

        if (match) {
            company = formatCompanySlug(match[1]) || company;
            source = entry.source;
            break;
        }
    }

    if (!company || /^unknown\b/i.test(company)) {
        company = inferCompanyFromPageTitle(pageTitle) || company;
    }

    const title = parseJobTitleFromPageTitle(pageTitle, company);
    const jobDescription =
        pageText.length >= MIN_INFERRED_JOB_TEXT_LENGTH
            ? pageText.slice(0, 20000)
            : null;

    if (!title && !company && !jobDescription) {
        return null;
    }

    return {
        title: title || pageTitle || 'Job application',
        company: company || 'Unknown company',
        link: pageUrl,
        job_description: jobDescription,
        source: source || 'page_metadata',
    };
}

export function estimatePayloadBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value)).length;
}
