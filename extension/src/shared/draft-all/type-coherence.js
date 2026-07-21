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
    // Exact Yes/No or prefixed ("No, I do not require a visa") - live Mytos Lever.
    const hasYes = options.some((option) =>
        /^(yes)\b/i.test(String(option).trim()),
    );
    const hasNo = options.some((option) =>
        /^(no)\b/i.test(String(option).trim()),
    );

    return hasYes && hasNo;
}

/**
 * Greenhouse embeds often inventory Yes/No comboboxes before option harvest
 * (options null). Still treat clear binary screener labels as Yes/No so profile
 * No is not rejected as yes_no_on_choice (live Ripple Canada auth).
 */
function looksLikeBinaryYesNoQuestionLabel(label) {
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    if (
        /\b(?:status|which of the following|select all|prefer to self|how did you hear)\b/.test(
            normalized,
        )
    ) {
        return false;
    }

    return (
        /^(?:are|do|does|have|has|is|were|was|will|can|could|did) (?:you|we|they)\b/.test(
            normalized,
        )
        || /\b(?:previously been employed|legally authorized|authorized to work|right to work|require sponsorship|need sponsorship|willing to relocate)\b/.test(
            normalized,
        )
    );
}

function isChoiceYesNoField(field) {
    const fieldType = String(field?.field_type || '').toLowerCase();

    if (!CHOICE_FIELD_TYPES.has(fieldType)) {
        return false;
    }

    if (fieldHasYesNoOptions(field)) {
        return true;
    }

    const options = Array.isArray(field?.options) ? field.options : [];

    return options.length === 0 && looksLikeBinaryYesNoQuestionLabel(
        field?.label || field?.question || '',
    );
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

    // Greenhouse "From where do you intend to work?" (not country-only asks).
    if (
        !(/\bcountry\b/.test(normalized) && !/\b(?:city|town)\b/.test(normalized))
        && (
            /\bintend to work\b/.test(normalized)
            || /\bwhere (?:will|do) you (?:intend to )?work\b/.test(normalized)
        )
    ) {
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

    return /^(?:phone(?:\s*number)?|mobile(?:\s*phone)?|cell(?:\s*phone)?|telephone|telefon|téléphone)\b/.test(
        normalized,
    );
}

function isEmailField(field) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);
    const fieldType = String(field?.field_type || '').toLowerCase();

    if (fieldType === 'email') {
        return true;
    }

    // Greenhouse and similar ATS sometimes repeat the label ("email email email").
    const collapsed = normalized.replace(/\b(e.?mail(?:\s*address)?)\b(?:\s+\1)+\b/g, '$1');

    return /^(?:e.?mail(?:\s*address)?|email address|email)$/.test(collapsed)
        || /^(?:e.?mail(?:\s*address)?|email address|email)$/.test(normalized)
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

    return /\b(?:expected salary|salary expectation|desired salary|salary requirement|compensation expectation|base salary|desired compensation|pay rate|annual compensation|yearly salary|monthly salary|weekly salary|oczekiwania finansowe|wynagrodzenie|gehaltsvorstellungen|gehaltsvorstellung|jahreslohn|jahresgehalt|monatsgehalt)\b/.test(
        normalized,
    )
        || (/\b(?:gehalt|salary)\b/.test(normalized) && !/\bnotice\b/.test(normalized))
        || (/\bcompensation\b/.test(normalized) && !/\bnotice\b/.test(normalized))
        || (/\bbrutto\b/.test(normalized) && /\b(?:lohn|gehalt|jahres)\b/.test(normalized));
}

function isNoticeField(field) {
    const label = field?.label || field?.question || '';
    const normalized = normalizeQuestionLabel(label);

    if (!normalized) {
        return false;
    }

    // English + Polish (Recruitee "okres wypowiedzenia", "dostępność").
    if (/\bnotice period\b/.test(normalized) || /okres wypowiedzenia/.test(normalized)) {
        return true;
    }

    // Teamtailor / Lever / Personio "Available from" / "Verfügbar ab" - notice-style, not DOB.
    if (
        /^(?:available from|earliest start|earliest availability|verf[uü]gbar ab)$/.test(
            normalized,
        )
        || /\b(?:available from|earliest start|verf[uü]gbar ab)\b/.test(normalized)
    ) {
        return true;
    }

    if (
        /\bdost[eę]pno[sś][cć]\b/.test(normalized)
        && /\b(wypowiedzenia|do[lł][aą]czy[cć]|start|notice)\b/.test(normalized)
    ) {
        return true;
    }

    return /\bavailability\b/.test(normalized)
        && /\b(notice|start|available)\b/.test(normalized);
}

/**
 * True when choice options are unknown/unharvested, or the answer matches a listed
 * option (exact normalized, containment, or shared distinctive tokens).
 *
 * @param {unknown} answer
 * @param {unknown} options
 * @returns {boolean}
 */
function answerMatchesListedChoiceOption(answer, options) {
    const listed = (Array.isArray(options) ? options : [])
        .map((option) =>
            String(option || '')
                .toLowerCase()
                .replace(/[^\p{L}\p{N}\s]/gu, ' ')
                .replace(/\s+/g, ' ')
                .trim(),
        )
        .filter((option) => option.length >= 2);

    // Empty / unharvested options: do not reject (Greenhouse react-select lag).
    if (listed.length < 2) {
        return true;
    }

    const normalizedAnswer = String(answer || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalizedAnswer) {
        return true;
    }

    if (listed.some((option) => option === normalizedAnswer)) {
        return true;
    }

    // Containment either way ("LinkedIn" vs "LinkedIn / Social media").
    if (
        listed.some(
            (option) =>
                (option.length >= 4 && normalizedAnswer.includes(option)) ||
                (normalizedAnswer.length >= 4 && option.includes(normalizedAnswer)),
        )
    ) {
        return true;
    }

    // Short codes like "B2B" already need exact/containment above; leftover path
    // is for multi-word answers (UK RTW sentence vs Polish nationality options).
    const answerTokens = new Set(
        normalizedAnswer.split(' ').filter((token) => token.length >= 4),
    );

    if (answerTokens.size === 0) {
        return false;
    }

    const stopwords =
        /^(with|have|hold|from|this|that|your|their|about|into|will|been|were|does|than|then|also|only|just|more|most|such|other|please|select|option|status|legal|work|right)$/;

    return listed.some((option) => {
        const optionTokens = option
            .split(' ')
            .filter((token) => token.length >= 4 && !stopwords.test(token));
        const overlap = optionTokens.filter((token) => answerTokens.has(token));

        // Distinctive shared token required so "I am a … citizen" does not match
        // every nationality option via boilerplate alone.
        return overlap.length > 0;
    });
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

export function looksLikeUrlAnswer(answer) {
    const text = String(answer || '').trim();

    if (!text) {
        return false;
    }

    return /^(https?:\/\/|www\.)/i.test(text)
        || /(?:linkedin\.com\/in\/|github\.com\/)/i.test(text);
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
        // Digits / essays must not land on Yes/No radios (live Ashby 4+ years
        // applied profile YOE "2" and failed to click).
        if (!isBareYesNoAnswer(text)) {
            return {
                coherent: false,
                reason: 'non_yes_no_on_yes_no_choice',
                category,
                rejected: true,
            };
        }

        return { coherent: true, reason: null, category, rejected: false };
    }

    // Bare Yes/No on multi-option status / source selects (not Yes/No radios).
    if (isBareYesNoAnswer(text) && category === 'choice' && !isChoiceYesNoField(field)) {
        return {
            coherent: false,
            reason: 'yes_no_on_choice',
            category,
            rejected: true,
        };
    }

    // Choice selects with harvested options: reject answers that match none of them
    // (live Booksy: stale UK RTW memo + first-option fallback invented "Polish national").
    if (
        category === 'choice' &&
        !isChoiceYesNoField(field) &&
        !answerMatchesListedChoiceOption(text, field?.options)
    ) {
        return {
            coherent: false,
            reason: 'unmatched_choice',
            category,
            rejected: true,
        };
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

    // Free-text notice/availability must include a unit ("2 weeks"), not a bare integer.
    if (
        category === 'notice'
        && isFreeTextField(field)
        && /^\d{1,3}$/.test(text)
        && String(field?.field_type || '').toLowerCase() !== 'number'
    ) {
        return {
            coherent: false,
            reason: 'bare_number_on_notice',
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

    // Phone / email / URL must never land in essays (MDM example, motivation, etc.).
    if (
        category === 'free_text'
        && isFreeTextField(field)
        && looksLikePhoneAnswer(text)
        && !looksLikeEmailAnswer(text)
    ) {
        return {
            coherent: false,
            reason: 'phone_on_free_text',
            category,
            rejected: true,
        };
    }

    if (
        category === 'free_text'
        && isFreeTextField(field)
        && looksLikeEmailAnswer(text)
    ) {
        return {
            coherent: false,
            reason: 'email_on_free_text',
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

    if (
        (category === 'phone' || category === 'email')
        && isFreeTextField(field)
        && looksLikeUrlAnswer(text)
        && !looksLikeEmailAnswer(text)
    ) {
        return {
            coherent: false,
            reason: `url_on_${category}`,
            category,
            rejected: true,
        };
    }

    if (category === 'locality' && isFreeTextField(field)) {
        if (
            looksLikeEmailAnswer(text)
            || looksLikePhoneAnswer(text)
            || looksLikeSalaryAmountAnswer(text)
            || looksLikeNoticePeriodAnswer(text)
            || looksLikeUrlAnswer(text)
        ) {
            return {
                coherent: false,
                reason: 'non_locality_on_locality',
                category,
                rejected: true,
            };
        }
    }

    // Numeric years/count fields must not swallow salary or notice text.
    if (
        category === 'number'
        && isFreeTextField(field)
        && looksLikeSalaryAmountAnswer(text)
    ) {
        return {
            coherent: false,
            reason: 'salary_on_number',
            category,
            rejected: true,
        };
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
 * Cover letters / why-join essays must name the target employer when known.
 * Rejects generic truthful essays that never mention job.company (live Climax).
 *
 * @param {{ label?: string, question?: string, field_type?: string }|null|undefined} field
 * @param {unknown} answer
 * @param {string|null|undefined} jobCompany
 * @returns {boolean}
 */
export function shouldRejectEssayMissingTargetCompany(
    field,
    answer,
    jobCompany,
) {
    const company = String(jobCompany || '').trim();

    if (!company || company.length < 2 || /^unknown\b/i.test(company)) {
        return false;
    }

    const label = normalizeQuestionLabel(field?.label || field?.question || '');
    const fieldType = String(field?.field_type || '').toLowerCase();

    if (fieldType !== 'textarea' && fieldType !== 'text') {
        return false;
    }

    if (
        !/\bcover letter\b/.test(label) &&
        !/\bwhy (?:do you want|are you interested|should we)\b/.test(label) &&
        !/\bwhy (?:this|our) (?:company|role|position|job|team)\b/.test(
            label,
        ) &&
        !/\bwhat interests you (?:about|in)\b/.test(label) &&
        !/\bwhat stands out\b/.test(label) &&
        !/\bworking at\b/.test(label) &&
        !/\badditional information\b/.test(label)
    ) {
        return false;
    }

    const answerNorm = normalizeQuestionLabel(answer);

    if (!answerNorm || answerNorm.length < 40) {
        return false;
    }

    const companyNorm = normalizeQuestionLabel(company);

    if (!companyNorm) {
        return false;
    }

    if (answerNorm.includes(companyNorm)) {
        return false;
    }

    // "Climax Studios" → require distinctive tokens (length >= 4), not "the".
    const tokens = companyNorm
        .split(/\s+/)
        .filter((token) => token.length >= 4);

    if (tokens.length === 0) {
        return !answerNorm.includes(companyNorm);
    }

    return !tokens.every((token) => answerNorm.includes(token));
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
