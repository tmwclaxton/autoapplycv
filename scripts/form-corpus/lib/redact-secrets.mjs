/**
 * Redact third-party API keys embedded in scraped HTML fixtures.
 * Applied before writing to tests/fixtures/form-extraction/html/.
 */

/** @type {{ pattern: RegExp, replacement: string, label: string }[]} */
export const SECRET_PATTERNS = [
    {
        label: 'Google API key',
        pattern: /AIzaSy[A-Za-z0-9_-]{33}/g,
        replacement: 'REDACTED_GOOGLE_API_KEY',
    },
    {
        label: 'GoCardless live widget key',
        pattern: /live_widget_key_[A-Za-z0-9_-]+/g,
        replacement: 'REDACTED_GOCARDLESS_WIDGET_KEY',
    },
    {
        label: 'OpenAI-style secret key',
        pattern: /sk-[A-Za-z0-9]{20,}/g,
        replacement: 'REDACTED_SECRET_KEY',
    },
];

/**
 * @param {string} html
 * @returns {string}
 */
export function redactSecrets(html) {
    let output = html;

    for (const { pattern, replacement } of SECRET_PATTERNS) {
        output = output.replace(pattern, replacement);
    }

    return output;
}

/**
 * Redact secrets in HTML content before persisting fixtures.
 *
 * @param {string} content
 * @returns {string}
 */
export function redactSecretsInPlace(content) {
    return redactSecrets(content);
}

/**
 * @param {string} html
 * @returns {boolean}
 */
export function htmlContainsSecrets(html) {
    return SECRET_PATTERNS.some(({ pattern }) => {
        pattern.lastIndex = 0;

        return pattern.test(html);
    });
}

/**
 * @param {string} html
 * @returns {{ label: string, match: string }[]}
 */
export function findSecretMatches(html) {
    /** @type {{ label: string, match: string }[]} */
    const matches = [];

    for (const { label, pattern } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;

        for (const match of html.matchAll(pattern)) {
            matches.push({ label, match: match[0] });
        }
    }

    return matches;
}
