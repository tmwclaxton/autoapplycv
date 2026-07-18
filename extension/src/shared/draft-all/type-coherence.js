/**
 * Post-answer type-coherence gate for Draft All.
 *
 * Shared filter after memo / heuristic / NanoGPT: prefer leave-pending over wrong fills
 * such as Yes/No on locality free-text, or salary values on notice-period fields.
 *
 * Self-contained (no imports from pending-fields / draft-all-optimizations) to avoid cycles.
 */

const CHOICE_FIELD_TYPES = new Set(['radio', 'checkbox', 'select']);

function normalizeQuestionLabel(label) {
    return String(label || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/(\p{L})(required|optional)\b/giu, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Bare Yes/No tokens - never valid for free-text locality/contact/date/number fields. */
export function isBareYesNoAnswer(answer) {
    return /^(yes|no)$/i.test(String(answer || '').trim());
}

function fieldHasYesNoOptions(field) {
    const options = Array.isArray(field?.options) ? field.options : [];
    const hasYes = options.some((option) => /^yes$/i.test(String(option).trim()));
    const hasNo = options.some((option) => /^no$/i.test(String(option).trim()));

    return hasYes && hasNo;
}

function isChoiceYesNoField(field) {
    const fieldType = String(field?.field_type || '').toLowerCase();

    if (CHOICE_FIELD_TYPES.has(fieldType) && fieldHasYesNoOptions(field)) {
        return true;
    }

    return false;
}

function isFreeTextField(field) {
    const fieldType = String(field?.field_type || '').toLowerCase();

    if (!fieldType || fieldType === 'text' || fieldType === 'textarea'
        || fieldType === 'email' || fieldType === 'tel' || fieldType === 'url'
        || fieldType === 'number' || fieldType === 'date' || fieldType === 'search') {
        return !isChoiceYesNoField(field);
    }

    if (CHOICE_FIELD_TYPES.has(fieldType)) {
        return false;
    }

    return !fieldHasYesNoOptions(field);
}

function isLocalityField(field) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);
    const pathHint = String(field?.dom?.name || field?.dom?.id || field?.dom?.data_testid || '').toLowerCase();

    if (!normalized && !pathHint) {
        return false;
    }

    if (/\b(sponsorship|authorized|right to work|work permit)\b/.test(normalized)) {
        return false;
    }

    if (/\b(?:city|town)\b/.test(normalized) && /\bcounty\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:city|town)\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:postcode|postal code|zip code|\bzip\b)\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:street address|address line|home address|mailing address)\b/.test(normalized)
        || /^(?:address|street)$/.test(normalized)) {
        return true;
    }

    if (/\b(?:current )?location\b/.test(normalized) && !/\bcountry\b/.test(normalized)) {
        return true;
    }

    if (/\b(?:state|region|county)\b/.test(normalized) && !/\bcountry\b/.test(normalized)) {
        return true;
    }

    return /(?:^|[_-])(?:locality|city|town|postcode|postal[_-]?code|zip|address|street)(?:$|[_-])/i.test(pathHint);
}

function isPhoneField(field) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);
    const fieldType = String(field?.field_type || '').toLowerCase();
    const domId = String(field?.dom?.id || '');

    if (fieldType === 'tel' || domId === 'phone') {
        return true;
    }

    return /^(?:phone(?:\s*number)?|mobile(?:\s*phone)?|cell(?:\s*phone)?|telephone)\b/.test(normalized);
}

function isEmailField(field) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);
    const fieldType = String(field?.field_type || '').toLowerCase();

    if (fieldType === 'email') {
        return true;
    }

    return /^(?:e.?mail(?:\s*address)?|email address)$/.test(normalized)
        || /\bemail address\b/.test(normalized);
}

function isDateField(field) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);
    const fieldType = String(field?.field_type || '').toLowerCase();

    if (fieldType === 'date' || fieldType === 'datetime-local' || fieldType === 'month') {
        return true;
    }

    return /\b(?:date of birth|dob|birthdate|start date|end date|available (?:from|date)|earliest start)\b/.test(normalized)
        || /^(?:date|start date|end date)$/.test(normalized);
}

function isNumberField(field) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);
    const fieldType = String(field?.field_type || '').toLowerCase();
    const domId = String(field?.dom?.id || field?.dom?.input_id || '').toLowerCase();

    if (fieldType === 'number' || fieldType.includes('int')) {
        return true;
    }

    if (domId.includes('numeric') || domId.includes('number-input')) {
        return true;
    }

    return /\b(?:how many|number of|years of experience|total years)\b/.test(normalized);
}

function isSalaryField(field) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (/\b(?:time\s+)?commit(?:ment)?\b.*\bper\s+(?:week|wk)\b/.test(normalized)) {
        return false;
    }

    return /\b(?:expected salary|salary expectation|desired salary|salary requirement|compensation expectation|base salary|desired compensation|pay rate|annual compensation|yearly salary|monthly salary|weekly salary|oczekiwania finansowe|wynagrodzenie)\b/.test(normalized)
        || (/\bsalary\b/.test(normalized) && !/\bnotice\b/.test(normalized))
        || (/\bcompensation\b/.test(normalized) && !/\bnotice\b/.test(normalized));
}

function isNoticeField(field) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (/\bnotice period\b/.test(normalized)) {
        return true;
    }

    return /\bavailability\b/.test(normalized)
        && /\b(notice|start|available)\b/.test(normalized);
}

function looksLikeEmailAnswer(answer) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(answer || '').trim());
}

function looksLikePhoneAnswer(answer) {
    const compact = String(answer || '').trim().replace(/\s+/g, '');

    return /^\+?\d{10,15}$/.test(compact);
}

/**
 * Notice-style answers: "2 weeks", "1 month", "immediate", "asap".
 * Not bare integers alone (those may be numeric notice fields).
 */
export function looksLikeNoticePeriodAnswer(answer) {
    const text = String(answer || '').trim().toLowerCase();

    if (!text) {
        return false;
    }

    if (/^(immediate|immediately|asap|available now|now)$/i.test(text)) {
        return true;
    }

    return /^\d{1,3}\s*(?:weeks?|months?|days?|yrs?|years?)\b/i.test(text)
        || /^(?:one|two|three|four|five|six)\s+(?:weeks?|months?)\b/i.test(text);
}

/**
 * Salary-like amounts: 55000, £45,000, $50k, 45k GBP.
 * Excludes tiny integers that look like years/weeks of notice.
 */
export function looksLikeSalaryAmountAnswer(answer) {
    const text = String(answer || '').trim();

    if (!text || looksLikeNoticePeriodAnswer(text)) {
        return false;
    }

    if (/^[£$€]?\s*[\d,]+(?:\.\d{2})?\s*(?:k|thousand)?(?:\s*(?:gbp|usd|eur|per\s*year|\/\s*year|pa|annum))?$/i.test(text)) {
        const digits = text.replace(/[^\d.]/g, '');
        const amount = Number(digits);

        if (!Number.isFinite(amount)) {
            return false;
        }

        if (/k\b/i.test(text) && amount >= 20 && amount <= 500) {
            return true;
        }

        return amount >= 500;
    }

    return false;
}

/**
 * @typedef {'locality'|'phone'|'email'|'date'|'number'|'salary'|'notice'|'yes_no_choice'|'free_text'|'choice'|'unknown'} FieldExpectation
 */

/**
 * @param {{ label?: string, question?: string, field_type?: string, options?: unknown[], dom?: object|null }|null|undefined} field
 * @returns {FieldExpectation}
 */
export function classifyFieldExpectation(field) {
    if (!field) {
        return 'unknown';
    }

    if (isChoiceYesNoField(field)) {
        return 'yes_no_choice';
    }

    if (isSalaryField(field)) {
        return 'salary';
    }

    if (isNoticeField(field)) {
        return 'notice';
    }

    if (isEmailField(field)) {
        return 'email';
    }

    if (isPhoneField(field)) {
        return 'phone';
    }

    if (isDateField(field)) {
        return 'date';
    }

    if (isLocalityField(field)) {
        return 'locality';
    }

    if (isNumberField(field)) {
        return 'number';
    }

    const fieldType = String(field?.field_type || '').toLowerCase();

    if (CHOICE_FIELD_TYPES.has(fieldType)) {
        return 'choice';
    }

    if (isFreeTextField(field)) {
        return 'free_text';
    }

    return 'unknown';
}

/**
 * @param {{ label?: string, question?: string, field_type?: string, options?: unknown[], dom?: object|null }|null|undefined} field
 * @param {unknown} answer
 * @returns {{ coherent: boolean, reason: string|null, category: FieldExpectation, rejected: boolean }}
 */
export function evaluateAnswerTypeCoherence(field, answer) {
    const text = String(answer ?? '').trim();
    const category = classifyFieldExpectation(field);

    if (!text) {
        return { coherent: true, reason: null, category, rejected: false };
    }

    if (category === 'yes_no_choice') {
        return { coherent: true, reason: null, category, rejected: false };
    }

    // Bare Yes/No on free-text locality / contact / date / number / salary / notice.
    if (isBareYesNoAnswer(text) && isFreeTextField(field)) {
        if (
            category === 'locality'
            || category === 'phone'
            || category === 'email'
            || category === 'date'
            || category === 'number'
            || category === 'salary'
            || category === 'notice'
        ) {
            return {
                coherent: false,
                reason: `yes_no_on_${category}`,
                category,
                rejected: true,
            };
        }
    }

    // Salary <-> notice bleed.
    if (category === 'salary' && looksLikeNoticePeriodAnswer(text)) {
        return {
            coherent: false,
            reason: 'notice_on_salary',
            category,
            rejected: true,
        };
    }

    if (category === 'notice' && looksLikeSalaryAmountAnswer(text)) {
        return {
            coherent: false,
            reason: 'salary_on_notice',
            category,
            rejected: true,
        };
    }

    // Cross-type contact bleed on free-text fields.
    if (category === 'email' && isFreeTextField(field) && looksLikePhoneAnswer(text) && !looksLikeEmailAnswer(text)) {
        return {
            coherent: false,
            reason: 'phone_on_email',
            category,
            rejected: true,
        };
    }

    if (category === 'phone' && isFreeTextField(field) && looksLikeEmailAnswer(text)) {
        return {
            coherent: false,
            reason: 'email_on_phone',
            category,
            rejected: true,
        };
    }

    if (category === 'locality' && isFreeTextField(field)) {
        if (looksLikeEmailAnswer(text) || looksLikePhoneAnswer(text) || looksLikeSalaryAmountAnswer(text)) {
            return {
                coherent: false,
                reason: 'non_locality_on_locality',
                category,
                rejected: true,
            };
        }
    }

    if (category === 'date' && isFreeTextField(field) && isBareYesNoAnswer(text)) {
        return {
            coherent: false,
            reason: 'yes_no_on_date',
            category,
            rejected: true,
        };
    }

    if (
        category === 'number'
        && isFreeTextField(field)
        && (looksLikeNoticePeriodAnswer(text) || looksLikeEmailAnswer(text) || isBareYesNoAnswer(text))
    ) {
        return {
            coherent: false,
            reason: 'non_number_on_number',
            category,
            rejected: true,
        };
    }

    return { coherent: true, reason: null, category, rejected: false };
}

/**
 * @param {{ label?: string, question?: string, field_type?: string, options?: unknown[], dom?: object|null }|null|undefined} field
 * @param {unknown} answer
 * @returns {boolean}
 */
export function shouldRejectAnswerForTypeCoherence(field, answer) {
    return evaluateAnswerTypeCoherence(field, answer).rejected;
}

/**
 * Back-compat helper: Yes/No on free-text locality fields.
 *
 * @param {{ label?: string, question?: string, field_type?: string, options?: unknown[], dom?: object|null }|null|undefined} field
 * @param {unknown} answer
 * @returns {boolean}
 */
export function shouldRejectYesNoAnswerOnLocationField(field, answer) {
    if (!isBareYesNoAnswer(answer)) {
        return false;
    }

    const result = evaluateAnswerTypeCoherence(field, answer);

    return result.rejected && result.reason === 'yes_no_on_locality';
}

/**
 * Tag an answer object with its Draft All source stage for Assist/debug.
 *
 * @param {object} answer
 * @param {string} source
 * @returns {object}
 */
export function withAnswerSource(answer, source) {
    if (!answer || typeof answer !== 'object') {
        return answer;
    }

    return {
        ...answer,
        source: String(source || '').trim() || 'unknown',
    };
}

/**
 * @param {Array<object>} answers
 * @param {string} source
 * @returns {Array<object>}
 */
export function tagAnswersWithSource(answers, source) {
    return (answers || []).map((answer) => withAnswerSource(answer, source));
}
