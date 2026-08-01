/**
 * Deterministic Auto Apply job blacklist matcher.
 * Empty blacklist is a no-op. Matching never throws.
 */

export const JOB_BLACKLIST_MAX_LENGTH = 5000;

/**
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeBlacklistText(text) {
    if (typeof text !== 'string') {
        return '';
    }

    return text.replace(/\r\n/g, '\n').trim().slice(0, JOB_BLACKLIST_MAX_LENGTH);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeForMatch(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Phrase match with loose word boundaries (avoids matching "soft" inside "microsoft").
 *
 * @param {string} haystack normalized lowercase text
 * @param {string} needle normalized lowercase phrase
 * @returns {boolean}
 */
function containsPhrase(haystack, needle) {
    if (!haystack || !needle) {
        return false;
    }

    if (haystack === needle) {
        return true;
    }

    const pattern = new RegExp(`(?:^| )${escapeRegExp(needle)}(?: |$)`);

    return pattern.test(` ${haystack} `);
}

/**
 * @param {string} clause
 * @returns {string}
 */
function stripAvoidPrefix(clause) {
    return clause
        .replace(
            /^(?:please\s+)?(?:do\s+not|don't|never|no|avoid|skip|exclude|block|ignore)\s+/i,
            '',
        )
        .replace(/\s+jobs?\s*$/i, '')
        .replace(/\s+roles?\s*$/i, '')
        .replace(/\s+companies?\s*$/i, '')
        .replace(/\s+employers?\s*$/i, '')
        .trim();
}

/**
 * @typedef {{ raw: string, phrase: string }} BlacklistRule
 */

/**
 * @param {string} blacklistText
 * @returns {BlacklistRule[]}
 */
export function parseBlacklistRules(blacklistText) {
    const normalized = normalizeBlacklistText(blacklistText);

    if (!normalized) {
        return [];
    }

    /** @type {BlacklistRule[]} */
    const rules = [];
    const seen = new Set();

    /**
     * @param {string} raw
     * @param {string} phrase
     */
    function pushRule(raw, phrase) {
        const cleanedPhrase = normalizeForMatch(phrase);

        if (cleanedPhrase.length < 2) {
            return;
        }

        if (seen.has(cleanedPhrase)) {
            return;
        }

        seen.add(cleanedPhrase);
        rules.push({
            raw: String(raw || phrase).trim(),
            phrase: cleanedPhrase,
        });
    }

    let remainder = normalized;

    for (const match of normalized.matchAll(/"([^"]+)"|'([^']+)'/g)) {
        const quoted = (match[1] || match[2] || '').trim();

        if (quoted) {
            pushRule(match[0], quoted);
        }
    }

    remainder = remainder.replace(/"[^"]*"|'[^']*'/g, ' ');

    const clauses = remainder
        .split(/\n+|;+|,(?![^()]*\))|\band\b/i)
        .map((part) => part.trim())
        .filter(Boolean);

    for (const clause of clauses) {
        const stripped = stripAvoidPrefix(clause);
        pushRule(clause, stripped || clause);
    }

    return rules;
}

/**
 * @param {{
 *   blacklistText?: string|null,
 *   title?: string|null,
 *   company?: string|null,
 *   description?: string|null,
 *   location?: string|null,
 * }} input
 * @returns {{ blocked: boolean, reason: string }}
 */
export function evaluateJobAgainstBlacklist(input = {}) {
    try {
        const blacklistText = normalizeBlacklistText(input.blacklistText);

        if (!blacklistText) {
            return { blocked: false, reason: '' };
        }

        const title = normalizeForMatch(input.title);
        const company = normalizeForMatch(input.company);
        const description = normalizeForMatch(input.description);
        const location = normalizeForMatch(input.location);
        const rules = parseBlacklistRules(blacklistText);

        for (const rule of rules) {
            if (containsPhrase(company, rule.phrase)) {
                return {
                    blocked: true,
                    reason: `employer matches "${rule.raw}"`,
                };
            }

            if (containsPhrase(title, rule.phrase)) {
                return {
                    blocked: true,
                    reason: `title matches "${rule.raw}"`,
                };
            }

            if (containsPhrase(location, rule.phrase)) {
                return {
                    blocked: true,
                    reason: `location matches "${rule.raw}"`,
                };
            }

            // Single-token keywords (e.g. gambling, NHS) may appear only in the
            // JD. Multi-word employer phrases must not match description text -
            // live false positive: "client server" blocked State Street JD copy.
            if (
                !rule.phrase.includes(' ')
                && containsPhrase(description, rule.phrase)
            ) {
                return {
                    blocked: true,
                    reason: `description matches "${rule.raw}"`,
                };
            }
        }

        return { blocked: false, reason: '' };
    } catch {
        return { blocked: false, reason: '' };
    }
}
