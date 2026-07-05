const CHOICE_FIELD_TYPES = new Set(['radio', 'checkbox', 'select']);
const TEXT_LIKE_FIELD_TYPES = new Set(['text', 'email', 'tel', 'url', 'number', 'textarea']);

const ATS_URL_PATTERNS = [
    { pattern: /jobs\.ashbyhq\.com\/([^/?#]+)/i, source: 'ashby' },
    { pattern: /(?:^|\.)ashbyhq\.com\/([^/?#]+)/i, source: 'ashby' },
    { pattern: /boards\.greenhouse\.io\/([^/?#]+)/i, source: 'greenhouse' },
    { pattern: /job-boards\.greenhouse\.io\/([^/?#]+)/i, source: 'greenhouse' },
    { pattern: /jobs\.lever\.co\/([^/?#]+)/i, source: 'lever' },
    { pattern: /(?:^|\.)teamtailor\.com\/jobs/i, source: 'teamtailor' },
    { pattern: /jobs\.smartrecruiters\.com/i, source: 'smartrecruiters' },
];

const MIN_SINGLE_PAGE_FIELD_COUNT = 5;
const MIN_INFERRED_JOB_TEXT_LENGTH = 200;

function formatCompanySlug(slug) {
    if (!slug || typeof slug !== 'string') {
        return null;
    }

    return slug
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim();
}

function parseJobTitleFromPageTitle(pageTitle, company) {
    const title = String(pageTitle || '').trim();

    if (title === '') {
        return null;
    }

    const separators = [' | ', ' - ', ' \u2014 ', ' \u2013 ', ' at '];

    for (const separator of separators) {
        const parts = title.split(separator).map((part) => part.trim()).filter(Boolean);

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
        .replace(/\s+/g, ' ')
        .trim();
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

export function partitionFieldsByQuestionMemo(fields, questionMemo) {
    const memoAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const answer = matchMemoAnswer(questionMemo, field.label);

        if (answer) {
            memoAnswers.push({
                id: field.id,
                ref: field.ref,
                label: field.label,
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
            options: element.options,
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

export function compactFieldsForDraft(fields) {
    return (fields || []).map((field, index) => {
        const fieldType = field.field_type || 'text';
        const compact = {
            id: field.id ?? index,
            ref: field.ref,
            label: field.label,
            field_type: fieldType,
        };

        if (field.max_chars) {
            compact.max_chars = field.max_chars;
        }

        if (CHOICE_FIELD_TYPES.has(fieldType) && Array.isArray(field.options) && field.options.length > 0) {
            compact.options = field.options;
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
        elements.map((element) => `${element.ref}:${element.question}`).join('|'),
        controls.map((control) => control.ref).join('|'),
    ].join('::');
}

export function shouldForceInventoryComplete(snapshot, inventory) {
    const controls = snapshot?.controls || [];
    const elementCount = snapshot?.elements?.length || 0;
    const fieldCount = inventory?.fields?.length || 0;

    if (controls.length > 0 || elementCount < MIN_SINGLE_PAGE_FIELD_COUNT || fieldCount === 0) {
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

    return GENERIC_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildMechanicalInventoryFields(snapshot) {
    const elements = snapshot?.elements || [];

    return elements
        .filter((element) => element?.ref && element?.question && element.field_type !== 'file')
        .map((element) => ({
            ref: element.ref,
            question: element.question,
            field_type: element.field_type || 'text',
            max_chars: element.max_chars ?? null,
            options: element.options ?? null,
            dom: element.dom ?? null,
        }));
}

export function canUseMechanicalInventory(snapshot) {
    const elements = snapshot?.elements || [];
    const controls = snapshot?.controls || [];
    const fields = buildMechanicalInventoryFields(snapshot);

    if (fields.length === 0) {
        return false;
    }

    if (controls.length > 0) {
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

export function enrichApplyAnswers(answers, fieldsByRef) {
    return (answers || []).map((answer) => {
        const field = fieldsByRef?.get?.(answer.ref);

        if (!field) {
            return answer;
        }

        return {
            ...answer,
            field_type: answer.field_type || field.field_type || 'text',
            dom: answer.dom || field.dom || null,
            data_field_path: answer.data_field_path || field.dom?.data_field_path || null,
        };
    });
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

    const title = parseJobTitleFromPageTitle(pageTitle, company);
    const jobDescription = pageText.length >= MIN_INFERRED_JOB_TEXT_LENGTH
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
