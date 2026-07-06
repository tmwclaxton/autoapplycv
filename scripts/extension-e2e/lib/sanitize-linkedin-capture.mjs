import { redactSecrets } from '../../form-corpus/lib/redact-secrets.mjs';
import { scrubSecrets } from './linkedin-e2e-shared.mjs';

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PLACEHOLDER_EMAIL = 'candidate@example.com';
const PLACEHOLDER_PHONE = '+44 7700 900123';
const PLACEHOLDER_NAME = 'Alex Candidate';

/**
 * @param {string} html
 * @param {{ secrets?: string[], redactEmail?: string, nameParts?: string[], phoneNumbers?: string[] }} [options]
 * @returns {string}
 */
export function sanitizeLinkedInCaptureHtml(html, options = {}) {
    const secrets = options.secrets || [];
    let output = scrubSecrets(html, secrets);

    output = output.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<!-- script removed -->');
    output = output.replace(/<script\b[^>]*\/>/gi, '<!-- script removed -->');

    if (options.redactEmail) {
        output = output.split(options.redactEmail).join(PLACEHOLDER_EMAIL);
    }

    for (const email of options.extraEmails || []) {
        if (email) {
            output = output.split(email).join(PLACEHOLDER_EMAIL);
        }
    }

    output = output.replace(EMAIL_PATTERN, PLACEHOLDER_EMAIL);

    for (const phone of options.phoneNumbers || []) {
        if (phone) {
            output = output.split(phone).join(PLACEHOLDER_PHONE);
        }
    }

    for (const namePart of options.nameParts || []) {
        if (namePart && namePart.length >= 2) {
            output = output.split(namePart).join(PLACEHOLDER_NAME);
        }
    }

    output = output.replace(/\btitle="[^"]*"/gi, (match) => {
        for (const namePart of options.nameParts || []) {
            if (namePart && match.includes(namePart)) {
                return 'title="Alex Candidate"';
            }
        }

        return match;
    });

    output = output.replace(/\balt="[^"]*"/gi, (match) => {
        for (const namePart of options.nameParts || []) {
            if (namePart && match.includes(namePart)) {
                return 'alt="Alex Candidate"';
            }
        }

        return match;
    });

    output = redactSecrets(output);

    return output;
}

/**
 * @param {string[]} errors
 * @param {{ secrets?: string[], redactEmail?: string, nameParts?: string[] }} [options]
 * @returns {string[]}
 */
export function sanitizeValidationErrors(errors, options = {}) {
    return errors.map((message) => {
        let sanitized = scrubSecrets(String(message || ''), options.secrets || []);

        if (options.redactEmail) {
            sanitized = sanitized.split(options.redactEmail).join(PLACEHOLDER_EMAIL);
        }

        sanitized = sanitized.replace(EMAIL_PATTERN, PLACEHOLDER_EMAIL);

        for (const namePart of options.nameParts || []) {
            if (namePart && namePart.length >= 2) {
                sanitized = sanitized.split(namePart).join(PLACEHOLDER_NAME);
            }
        }

        return sanitized.slice(0, 120);
    }).filter((message) => message.length >= 3);
}

/**
 * @param {string} modalHtml
 * @param {{ jobTitle?: string, company?: string, capturedAt?: string, roleSearch?: string }} [meta]
 * @returns {string}
 */
function buildCaptureMetaComments(meta = {}) {
    const lines = [];

    if (meta.pageUrl) {
        lines.push(`<!-- page-url: ${String(meta.pageUrl).replace(/-->/g, '')} -->`);
    }

    if (meta.pageType) {
        lines.push(`<!-- page-type: ${String(meta.pageType).replace(/-->/g, '')} -->`);
    }

    if (meta.roleSearch) {
        lines.push(`<!-- role-search: ${String(meta.roleSearch).replace(/-->/g, '')} -->`);
    }

    return lines.length > 0 ? `\n    ${lines.join('\n    ')}` : '';
}

/**
 * Append capture metadata comments after sanitization so PII redaction cannot corrupt timestamps.
 *
 * @param {string} html
 * @param {{ capturedAt?: string, roleSearch?: string, pageUrl?: string, pageType?: string }} [meta]
 * @returns {string}
 */
export function appendCaptureMetaComments(html, meta = {}) {
    const capturedAt = meta.capturedAt || new Date().toISOString();
    const comments = [`<!-- captured-at: ${capturedAt} -->`, buildCaptureMetaComments(meta).trim()].filter(Boolean).join('\n    ');

    if (html.includes('</head>')) {
        return html.replace('</head>', `    ${comments}\n</head>`);
    }

    return `${comments}\n${html}`;
}

export function wrapModalCaptureHtml(modalHtml, meta = {}) {
    const title = [meta.jobTitle, meta.company].filter(Boolean).join(' at ') || 'LinkedIn Easy Apply Capture';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${title}</title>${buildCaptureMetaComments(meta)}
</head>
<body>
${modalHtml}
</body>
</html>
`;
}

/**
 * @param {string} bodyHtml
 * @param {{ jobTitle?: string, company?: string, roleSearch?: string, pageUrl?: string, pageType?: string }} [meta]
 * @returns {string}
 */
export function wrapPageCaptureHtml(bodyHtml, meta = {}) {
    const title = [meta.jobTitle, meta.company].filter(Boolean).join(' at ') || 'LinkedIn Page Capture';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${title}</title>${buildCaptureMetaComments(meta)}
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}
