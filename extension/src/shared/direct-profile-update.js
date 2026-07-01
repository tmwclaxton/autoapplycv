const DIRECT_PROFILE_FIELDS = [
    { field: 'full_name', path: 'full_name', label: 'Full name', keywords: ['full name', 'name'], dashboard_tab: 'profile', dashboard_anchor: 'field-full-name' },
    { field: 'headline', path: 'headline', label: 'Headline', keywords: ['headline', 'title'], dashboard_tab: 'profile', dashboard_anchor: 'field-headline' },
    { field: 'email', path: 'email', label: 'Email', keywords: ['email'], dashboard_tab: 'profile', dashboard_anchor: 'field-email' },
    { field: 'phone', path: 'phone', label: 'Phone', keywords: ['phone', 'mobile', 'telephone'], dashboard_tab: 'profile', dashboard_anchor: 'field-phone' },
    { field: 'location', path: 'location', label: 'Location', keywords: ['location'], dashboard_tab: 'profile', dashboard_anchor: 'field-location' },
    { field: 'city', path: 'city', label: 'City', keywords: ['city', 'town'], dashboard_tab: 'profile', dashboard_anchor: 'field-city' },
    { field: 'postcode', path: 'postcode', label: 'Postcode', keywords: ['postcode', 'post code', 'zip code', 'zip'], dashboard_tab: 'profile', dashboard_anchor: 'field-postcode' },
    { field: 'country', path: 'country', label: 'Country', keywords: ['country'], dashboard_tab: 'profile', dashboard_anchor: 'field-country' },
    { field: 'linkedin_url', path: 'linkedin_url', label: 'LinkedIn', keywords: ['linkedin'], dashboard_tab: 'profile', dashboard_anchor: 'field-linkedin-url' },
    { field: 'website_url', path: 'website_url', label: 'Website', keywords: ['website'], dashboard_tab: 'profile', dashboard_anchor: 'field-website-url' },
    { field: 'summary', path: 'summary', label: 'Professional summary', keywords: ['summary', 'professional summary', 'bio'], dashboard_tab: 'profile', dashboard_anchor: 'field-summary' },
    { field: 'extra_context', path: 'extra_context', label: 'Extra context', keywords: ['extra context', 'context'], dashboard_tab: 'profile', dashboard_anchor: 'field-extra-context' },
    { field: 'structured_data.address_line_1', path: 'structured_data.address_line_1', label: 'Address line 1', keywords: ['address line 1', 'address line', 'street address', 'street', 'address'], dashboard_tab: 'profile', dashboard_anchor: 'field-address-line-1' },
    { field: 'structured_data.address_line_2', path: 'structured_data.address_line_2', label: 'Address line 2', keywords: ['address line 2'], dashboard_tab: 'profile', dashboard_anchor: 'field-address-line-2' },
    { field: 'structured_data.state_region', path: 'structured_data.state_region', label: 'State / region', keywords: ['state/region', 'state region', 'state', 'region', 'county'], dashboard_tab: 'profile', dashboard_anchor: 'field-state-region' },
    { field: 'application_settings.expected_salary', path: 'application_settings.expected_salary', label: 'Expected salary', keywords: ['expected salary', 'salary expectation', 'salary'], dashboard_tab: 'preferences', dashboard_anchor: 'field-expected-salary' },
    { field: 'application_settings.visa_sponsorship', path: 'application_settings.visa_sponsorship', label: 'Visa sponsorship', keywords: ['visa sponsorship', 'visa'], dashboard_tab: 'preferences', dashboard_anchor: 'field-visa-sponsorship' },
    { field: 'application_settings.willing_to_relocate', path: 'application_settings.willing_to_relocate', label: 'Willing to relocate', keywords: ['willing to relocate', 'relocate'], dashboard_tab: 'preferences', dashboard_anchor: 'field-willing-to-relocate' },
];

function cleanValue(rawValue) {
    return String(rawValue || '')
        .trim()
        .replace(/[.!?]+$/, '')
        .trim();
}

function looksLikeProfileCommand(message) {
    return /\b(?:update|set|change|clear|blank|apply)\b|\bdo it\b|\b(?:address|street)\s+(?:blank|clear|empty)\b|\b(?:region|state|county)\s+(?!.*\?\s*$)\S/iu.test(
        message,
    );
}

function makeUpdate(spec, value) {
    return {
        type: 'profile_update',
        field: spec.field,
        path: spec.path,
        label: spec.label,
        value,
        reason: 'Direct profile update command.',
        dashboard_tab: spec.dashboard_tab,
        dashboard_anchor: spec.dashboard_anchor,
    };
}

function parseSegment(segment) {
    const text = String(segment || '').trim();

    if (text === '') {
        return null;
    }

    const lower = text.toLowerCase();

    for (const spec of DIRECT_PROFILE_FIELDS) {
        for (const keyword of spec.keywords) {
            const keywordPattern = new RegExp(
                `\\b${keyword.replace(/\s+/g, '\\s+')}\\b`,
                'i',
            );

            if (!keywordPattern.test(lower)) {
                continue;
            }

            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            if (
                new RegExp(`\\b${escapedKeyword}\\s+(blank|clear|empty)\\b`, 'i').test(text)
                || new RegExp(`\\b(?:clear|blank|empty)\\s+(?:the\\s+)?${escapedKeyword}\\b`, 'i').test(text)
            ) {
                return makeUpdate(spec, '');
            }

            const toMatch = text.match(
                new RegExp(`\\b${escapedKeyword}\\s+(?:to|as|=)\\s*(.+)$`, 'is'),
            );

            if (toMatch) {
                return makeUpdate(spec, cleanValue(toMatch[1]));
            }

            const commandMatch = text.match(
                new RegExp(
                    `\\b(?:update|set|change)\\b.*\\b${escapedKeyword}\\b.*\\b(?:to|as)\\s+(.+)$`,
                    'is',
                ),
            );

            if (commandMatch) {
                return makeUpdate(spec, cleanValue(commandMatch[1]));
            }

            const inlineMatch = text.match(
                new RegExp(`\\b${escapedKeyword}\\s+(?!blank|clear|empty|to|as\\b)(.+)$`, 'is'),
            );

            if (inlineMatch) {
                const value = cleanValue(inlineMatch[1]);

                if (value !== '') {
                    return makeUpdate(spec, value);
                }
            }
        }
    }

    if (/\b(?:update|set|change)\b/i.test(text)) {
        const valueMatch = text.match(/\b(?:to|as)\s+(.+)$/is);

        if (valueMatch) {
            for (const spec of DIRECT_PROFILE_FIELDS) {
                const keywordPattern = new RegExp(
                    `\\b(?:${spec.keywords.map((keyword) => keyword.replace(/\s+/g, '\\s+')).join('|')})\\b`,
                    'i',
                );

                if (keywordPattern.test(lower)) {
                    return makeUpdate(spec, cleanValue(valueMatch[1]));
                }
            }
        }
    }

    return null;
}

export function parseDirectProfileUpdateActions(message) {
    const text = String(message || '').trim();

    if (text === '' || !looksLikeProfileCommand(text)) {
        return [];
    }

    const segments = text.split(/\s*,\s*|\s*;\s*|\band\b/i);
    const updates = [];
    const seenFields = new Set();

    for (const segment of segments) {
        const update = parseSegment(segment.trim());

        if (!update || seenFields.has(update.field)) {
            continue;
        }

        updates.push(update);
        seenFields.add(update.field);
    }

    if (updates.length === 0) {
        const update = parseSegment(text);

        if (update) {
            updates.push(update);
        }
    }

    return updates;
}

export function parseDirectProfileUpdateAction(message) {
    return parseDirectProfileUpdateActions(message)[0] ?? null;
}
