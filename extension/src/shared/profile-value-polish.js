const POLISHABLE_FIELDS = new Set([
    'full_name',
    'headline',
    'city',
    'location',
    'country',
    'postcode',
    'structured_data.address_line_1',
    'structured_data.address_line_2',
    'structured_data.state_region',
]);

function titleCaseToken(token) {
    if (token.includes('-')) {
        return token.split('-').map(titleCaseToken).join('-');
    }

    const apostropheMatch = token.match(/^(.?)(['’])(.+)$/u);

    if (apostropheMatch) {
        return `${titleCaseToken(apostropheMatch[1])}${apostropheMatch[2]}${apostropheMatch[3]
            .charAt(0)
            .toUpperCase()}${apostropheMatch[3].slice(1).toLowerCase()}`;
    }

    if (/^mc(.+)$/iu.test(token)) {
        const rest = token.slice(2);

        return `Mc${rest.charAt(0).toUpperCase()}${rest.slice(1).toLowerCase()}`;
    }

    const upper = token.toUpperCase();

    if (['UK', 'USA', 'US', 'EU'].includes(upper)) {
        return upper;
    }

    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function polishProfileUpdateValue(field, value) {
    if (typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();

    if (trimmed === '') {
        return '';
    }

    if (field === 'postcode') {
        return trimmed.toUpperCase();
    }

    if (!POLISHABLE_FIELDS.has(field)) {
        return trimmed;
    }

    return trimmed
        .split(/(\s+)/u)
        .map((part) => (/^\s+$/u.test(part) ? part : titleCaseToken(part)))
        .join('')
        .replace(/,\s*Uk\b/u, ', UK');
}

export function polishProfileUpdateAction(action) {
    if (action?.type !== 'profile_update' || typeof action.value !== 'string') {
        return action;
    }

    return {
        ...action,
        value: polishProfileUpdateValue(action.field, action.value),
    };
}

export function polishProfileUpdateActions(actions = []) {
    return actions.map((action) => polishProfileUpdateAction(action));
}

export function cleanCapturedProfileValue(value) {
    return String(value || '')
        .trim()
        .replace(/[.!?]+$/, '')
        .replace(/\s+(?:though|too|also|as well|please|thanks|thank you)\s*$/iu, '')
        .replace(/\s+(?:instead|rather)\s*$/iu, '')
        .replace(/\s+based on (?:your|the|my)\s+(?:address|profile)\s*$/iu, '')
        .trim();
}

export function isMetaFieldReference(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized === '') {
        return false;
    }

    return /^(?:the\s+)?(?:profile\s+)?fields?(?:\s+(?:though|too|also|as well|please))*$/iu.test(normalized);
}

export function shouldRejectDirectProfileValue(field, value) {
    if (String(value || '').trim() === '') {
        return false;
    }

    if (isMetaFieldReference(value)) {
        return true;
    }

    const normalized = String(value || '').trim().toLowerCase();

    if (['though', 'too', 'also', 'as well', 'field', 'fields'].includes(normalized)) {
        return true;
    }

    if (field === 'location' && /^field(?:\s+(?:though|too|also|as well))?$/iu.test(normalized)) {
        return true;
    }

    if (isConversationalOrQuestionMessage(value)) {
        return true;
    }

    if (/\b(?:apply button|random values|profile fields)\b/iu.test(normalized)) {
        return true;
    }

    return false;
}

const CONVERSATIONAL_WORDS = [
    'where',
    'what',
    'why',
    'how',
    'when',
    'who',
    'which',
    'button',
    'apply',
    'extension',
    'dashboard',
    'sidebar',
    'chat',
    'reply',
    'message',
    'missing',
    'visible',
    'see',
    'find',
    'help',
    'testing',
    'test',
    'random',
    'values',
];

export function isConversationalOrQuestionMessage(message) {
    const text = String(message || '').trim();

    if (text === '') {
        return true;
    }

    if (text.includes('?')) {
        return true;
    }

    const normalized = text.toLowerCase();

    if (/^(?:where|what|why|how|when|who|which|can you|could you|do you|is there|are there|where's|what's)\b/iu.test(normalized)) {
        return true;
    }

    if (/\b(?:apply button|where is|where's|can't see|cannot see|not seeing|don't see|do not see|how do i|how to)\b/iu.test(normalized)) {
        return true;
    }

    return CONVERSATIONAL_WORDS.some((word) => new RegExp(`\\b${word}\\b`, 'iu').test(normalized));
}

export function looksLikeBareNameValue(message) {
    const text = String(message || '').trim();

    if (text === '' || isConversationalOrQuestionMessage(text)) {
        return false;
    }

    if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,80}$/u.test(text)) {
        return false;
    }

    const words = text.split(/\s+/u);

    if (words.length < 1 || words.length > 4) {
        return false;
    }

    return !words.some((word) => /\b(?:where|what|why|how|apply|button|extension|the|is|are|my|your|please|do|it|hte)\b/iu.test(word));
}

export function looksLikeProfileUpdateCommand(message) {
    const text = String(message || '').trim();

    if (text === '') {
        return false;
    }

    if (isConversationalOrQuestionMessage(text)
        && !/\b(?:update|set|change)\b.+\b(?:to|as)\s+\S/iu.test(text)
        && !/\bno\s*,?\s*i\s+meant\b/iu.test(text)) {
        return false;
    }

    return /\b(?:update|set|change|clear|blank)\b|\bno\s*,?\s*i\s+meant\b|\bdo it\b|\b(?:please\s+)?apply(?:\s+(?:it|changes?|this|them|all|below))?\b|\b(?:address|street)\s+(?:blank|clear|empty)\b|\b(?:region|state|county)\s+(?!.*\?\s*$)\S/iu.test(
        text,
    );
}
