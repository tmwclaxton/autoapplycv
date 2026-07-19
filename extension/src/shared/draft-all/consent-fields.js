/**
 * Draft All consent checkboxes: required privacy/terms vs marketing/future recruitment opt-ins.
 * Lives under extension/src/shared/draft-all/ with pipeline and answer-utils.
 */
import { normalizeQuestionLabel } from '../draft-all-optimizations.js';
import { isMeaningfulAnswer } from './answer-utils.js';

/**
 * Required certification / terms checkboxes should be auto-accepted.
 * Skip marketing SMS / newsletter opt-ins unless they are the only consent copy.
 */
export function isMarketingOrFutureConsentField(field) {
    const label = String(field?.label || field?.question || '');
    const optionsText = Array.isArray(field?.options)
        ? field.options.join(' ')
        : '';
    const text = normalizeQuestionLabel(`${label} ${optionsText}`);

    if (!text) {
        return false;
    }

    // Source-of-hire selects often sit near consent copy; never treat them as opt-ins.
    // Keep this inline to avoid a circular import with pending-fields.js.
    if (
        /\b(?:where|how)\s+did\s+you\s+(?:hear|learn|find|see)\b/i.test(label)
    ) {
        return false;
    }

    return /\b(sms|text messages?|newsletter|(?:email )?marketing(?: communications?| emails?| messages?| consent| material| opt[- ]?in)|promotional emails?|future job opportunities|contact me about|future recruitment|store (?:my|your) data|would like\b.*\bstore\b.*\b(?:contact|future|data)|(?:\d+|twelve|six|three)\s*months?\b.*\b(?:contact|future|opportunit|store)|keep (?:my|your) (?:data|details|information)|talent (?:pool|community)|future contact|przyszł(?:ych|ym|e)\b.*rekrut)/i.test(
        text,
    );
}

function marketingConsentFieldOptions(field) {
    return (Array.isArray(field?.options) ? field.options : [])
        .map((option) => String(option ?? '').trim())
        .filter((option) => option !== '');
}

function agreementCheckboxFieldText(field) {
    const label = String(field?.label || field?.question || '');
    const context = String(field?.context || '');
    const domName = String(field?.dom?.name || '');
    const optionsText = Array.isArray(field?.options)
        ? field.options.join(' ')
        : '';

    return normalizeQuestionLabel(
        `${label} ${context} ${domName} ${optionsText}`,
    );
}

function isTechnicalCheckboxOptionValue(option) {
    const normalized = String(option ?? '')
        .trim()
        .toLowerCase();

    return (
        normalized === '' ||
        normalized === 'false' ||
        normalized === 'true' ||
        normalized === 'on' ||
        normalized === 'off'
    );
}

function isRecruiteeAgreementConsentField(field) {
    const domName = String(field?.dom?.name || '');
    const dataTestId = String(field?.dom?.data_testid || '');
    const context = normalizeQuestionLabel(String(field?.context || ''));

    if (/candidate\.agreements\.\d+\.consent/i.test(domName)) {
        return true;
    }

    if (dataTestId === 'legal-input-field-value-input') {
        return true;
    }

    return /\blegal agreements?\b/.test(context);
}

function findMarketingConsentDeclineOption(options) {
    return (
        options.find(
            (option) =>
                /^(no|n|false)\b/i.test(option) ||
                /^(i )?(?:do not|don't) (?:consent|wish|want)/i.test(option) ||
                /\bdecline\b/i.test(option) ||
                /\bopt[- ]?out\b/i.test(option),
        ) || ''
    );
}

/**
 * Default voluntary marketing / future-jobs / data-retention opt-ins to decline.
 * Single affirmative checkboxes stay unchecked (no apply answer).
 */
export function resolveMarketingConsentAnswer(field) {
    if (!isMarketingOrFutureConsentField(field)) {
        return '';
    }

    const fieldType = String(field?.field_type || '').toLowerCase();
    const options = marketingConsentFieldOptions(field);
    const declineOption = findMarketingConsentDeclineOption(options);

    if (declineOption) {
        return declineOption;
    }

    const hasYes = options.some((option) => /^yes\b/i.test(option));
    const hasNo = options.some((option) => /^no\b/i.test(option));

    if (hasYes && hasNo) {
        return 'No';
    }

    if (fieldType === 'checkbox' && options.length <= 1) {
        return '';
    }

    // Greenhouse react-select often has empty options until opened. Talent
    // community / future-jobs Yes/No boards still decline from the label alone.
    const isChoiceField =
        fieldType === 'radio' ||
        fieldType === 'select' ||
        field?.dom?.role === 'combobox';

    if (isChoiceField && options.length === 0) {
        return 'No';
    }

    // Do not emit bare No onto non-Yes/No selects (combobox first-option fallback
    // would invent University Career Page / nationality answers).
    return '';
}

export function isAgreementCheckboxField(field) {
    if (String(field?.field_type || '').toLowerCase() !== 'checkbox') {
        return false;
    }

    if (isRecruiteeAgreementConsentField(field)) {
        return !isMarketingOrFutureConsentField(field);
    }

    const text = agreementCheckboxFieldText(field);

    if (!text) {
        return false;
    }

    if (isMarketingOrFutureConsentField(field)) {
        return false;
    }

    return (
        /\b(i certify|i have read|read and understood|read and understand|hereby confirm|i understand|i agree|i accept|accept the use of my data|applicant statement|terms (?:and|&) conditions|privacy policy|legal agreements?|acknowledge|true complete and correct|wyrażam zgodę|polityk[aę] prywatności)\b/.test(
            text,
        ) && !/\bprzyszł/.test(text)
    );
}

export function resolveAgreementCheckboxAnswer(field) {
    if (!isAgreementCheckboxField(field)) {
        return '';
    }

    const options = (Array.isArray(field.options) ? field.options : [])
        .map((option) => String(option ?? '').trim())
        .filter((option) => option !== '');

    const affirmative = options.find((option) =>
        /^(yes\b|i (?:agree|certify|have read|understand|accept|consent|provide|hereby confirm))/i.test(
            option,
        ),
    );

    if (affirmative) {
        return affirmative;
    }

    if (options.length === 0 || options.every(isTechnicalCheckboxOptionValue)) {
        return 'yes';
    }

    return options[0] || 'yes';
}

export function partitionAgreementCheckboxFields(fields) {
    const agreementAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const answer = resolveAgreementCheckboxAnswer(field);

        if (isMeaningfulAnswer(answer)) {
            agreementAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer,
            });
        } else {
            remainingFields.push(field);
        }
    }

    return { agreementAnswers, remainingFields };
}

/**
 * Auto-decline voluntary marketing / future-jobs opt-ins before LLM and memo paths.
 * Required privacy/terms agreement checkboxes are handled deterministically and
 * should never surface as sidebar clarifying questions.
 */
export function filterMarketingConsentPendingFields(pendingFields = []) {
    return (pendingFields || []).filter(
        (field) =>
            !isMarketingOrFutureConsentField(field) &&
            !isAgreementCheckboxField(field),
    );
}

export function partitionMarketingConsentFields(fields) {
    const marketingConsentAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        if (!isMarketingOrFutureConsentField(field)) {
            remainingFields.push(field);
            continue;
        }

        const answer = resolveMarketingConsentAnswer(field);

        if (isMeaningfulAnswer(answer)) {
            marketingConsentAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer,
            });
        } else {
            // Keep unresolved marketing fields in the pipeline (do not drop).
            remainingFields.push(field);
        }
    }

    return { marketingConsentAnswers, remainingFields };
}

const ELECTRONIC_SIGNATURE_FIELD_TYPES = new Set(['text', 'textarea', '']);

function splitProfileFullName(fullName) {
    const trimmed = String(fullName || '').trim();

    if (!trimmed) {
        return { first: '', last: '' };
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
        return { first: parts[0], last: parts[0] };
    }

    return {
        first: parts[0],
        last: parts.slice(1).join(' '),
    };
}

function readProfileString(profileData, ...paths) {
    for (const path of paths) {
        const parts = String(path).split('.').filter(Boolean);
        let node = profileData;

        for (const part of parts) {
            node = node?.[part];
        }

        const value = String(node ?? '').trim();

        if (value) {
            return value;
        }
    }

    return '';
}

function formatMiddleInitial(middle) {
    const trimmed = String(middle || '').trim();

    if (!trimmed) {
        return '';
    }

    const initial = trimmed.replace(/\./g, '').charAt(0).toUpperCase();

    return initial || '';
}

/**
 * Build "First M Last" from profile name parts for typed electronic signatures.
 */
export function resolveFullLegalNameFromProfile(profileData) {
    const fullName = readProfileString(
        profileData,
        'full_name',
        'profile.full_name',
        'candidate.name',
        'user.name',
    );
    const split = splitProfileFullName(fullName);
    const first =
        readProfileString(profileData, 'first_name', 'profile.first_name') ||
        split.first;
    const middle = readProfileString(
        profileData,
        'middle_name',
        'middle_initial',
        'profile.middle_name',
        'profile.middle_initial',
    );
    const last =
        readProfileString(profileData, 'last_name', 'profile.last_name') ||
        split.last;
    const middleInitial = formatMiddleInitial(middle);
    const parts = [first, middleInitial, last].filter(Boolean);

    if (parts.length > 0) {
        return parts.join(' ');
    }

    return fullName;
}

function electronicSignatureFieldText(field) {
    const label = String(field?.label || field?.question || '');
    const context = String(field?.context || '');
    const domHint = [
        field?.dom?.name,
        field?.dom?.id,
        field?.dom?.placeholder,
        field?.dom?.question_prefix,
    ]
        .filter(Boolean)
        .join(' ');

    return normalizeQuestionLabel(`${label} ${context} ${domHint}`);
}

function hasCertificationAcknowledgmentLanguage(text) {
    return (
        /\b(i certify|i acknowledge|certify that all|applicant statement)\b/.test(
            text,
        ) ||
        /\b(correct and complete)\b.*\b(falsification|misrepresentation)\b/.test(
            text,
        ) ||
        /\b(falsification|misrepresentation)\b.*\b(correct and complete)\b/.test(
            text,
        ) ||
        /\belectronic signature acknowledgment\b/.test(text)
    );
}

function hasTypedSignatureInstruction(text) {
    return (
        /\b(sign by typing|type your (?:full )?legal|electronic signature|e-?signature|typed signature|full legal(?:\s+first)?|middle initial(?:\s+and)?\s+last name|please sign)\b/.test(
            text,
        ) ||
        /\b(?:electronic[_-]?signature|e[_-]?signature|typed[_-]?signature|applicant[_-]?signature)\b/i.test(
            text,
        )
    );
}

/**
 * Required certification text fields where the applicant types their legal name as signature.
 */
export function isElectronicSignatureField(field) {
    if (isAgreementCheckboxField(field)) {
        return false;
    }

    const fieldType = String(field?.field_type || '').toLowerCase();

    if (!ELECTRONIC_SIGNATURE_FIELD_TYPES.has(fieldType)) {
        return false;
    }

    const text = electronicSignatureFieldText(field);

    if (!text) {
        return false;
    }

    return (
        hasCertificationAcknowledgmentLanguage(text) &&
        (hasTypedSignatureInstruction(text) ||
            /\b(falsification|misrepresentation)\b/.test(text))
    );
}

export function resolveElectronicSignatureAnswer(field, profileData) {
    if (!isElectronicSignatureField(field)) {
        return '';
    }

    return resolveFullLegalNameFromProfile(profileData);
}

export function partitionElectronicSignatureFields(fields, profileData) {
    const signatureAnswers = [];
    const remainingFields = [];

    for (const field of fields || []) {
        const answer = resolveElectronicSignatureAnswer(field, profileData);

        if (isMeaningfulAnswer(answer)) {
            signatureAnswers.push({
                ref: field.ref,
                label: field.label || field.question || '',
                field_type: field.field_type,
                options: field.options ?? null,
                dom: field.dom || null,
                answer,
            });
        } else {
            remainingFields.push(field);
        }
    }

    return { signatureAnswers, remainingFields };
}
