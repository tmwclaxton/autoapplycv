const TEXT_ERROR_PATTERNS = [
    /your form needs corrections/i,
    /missing entry for required field/i,
    /this field is required/i,
    /please fix the errors/i,
    /please complete all required fields/i,
];

const SELECTOR_PATTERNS = [
    { selector: '[role="alert"]', requireVisibleText: true },
    { selector: '.error, .errors, .field-error, .form-error', requireVisibleText: true },
    { selector: '[aria-invalid="true"]', requireVisibleText: false },
    { selector: '[data-testid*="error"]', requireVisibleText: true },
    { selector: '.ashby-application-form-error, .ashby-application-form-errors', requireVisibleText: true },
];

function isVisible(element) {
    if (!element || element.nodeType !== 1) {
        return false;
    }

    const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);

    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
        return false;
    }

    return true;
}

function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function scanTextErrors(document) {
    const bodyText = normalizeText(document.body?.textContent || '');
    const matches = [];

    for (const pattern of TEXT_ERROR_PATTERNS) {
        const match = bodyText.match(pattern);

        if (match) {
            matches.push({
                kind: 'text',
                pattern: pattern.source,
                message: match[0],
            });
        }
    }

    return matches;
}

function scanSelectorErrors(document) {
    const matches = [];

    for (const { selector, requireVisibleText } of SELECTOR_PATTERNS) {
        const elements = Array.from(document.querySelectorAll(selector));

        for (const element of elements) {
            if (!isVisible(element)) {
                continue;
            }

            const text = normalizeText(element.textContent || element.getAttribute('aria-label') || '');

            if (requireVisibleText && text.length === 0) {
                continue;
            }

            matches.push({
                kind: 'selector',
                selector,
                message: text || selector,
                ariaInvalid: element.getAttribute('aria-invalid'),
            });
        }
    }

    return matches;
}

/**
 * @param {Document} document
 */
export function detectFormErrors(document) {
    const errors = [
        ...scanTextErrors(document),
        ...scanSelectorErrors(document),
    ];

    const deduped = [];
    const seen = new Set();

    for (const error of errors) {
        const key = `${error.kind}:${error.pattern || error.selector}:${error.message}`;

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        deduped.push(error);
    }

    return {
        passed: deduped.length === 0,
        errors: deduped,
        error_count: deduped.length,
    };
}

/**
 * Playwright page variant for live/fixture browser tests.
 *
 * @param {import('playwright').Page} page
 */
export async function detectFormErrorsInPage(page) {
    const errors = await page.evaluate(() => {
        const TEXT_ERROR_PATTERNS = [
            /your form needs corrections/i,
            /missing entry for required field/i,
            /this field is required/i,
            /please fix the errors/i,
            /please complete all required fields/i,
        ];
        const SELECTOR_PATTERNS = [
            { selector: '[role="alert"]', requireVisibleText: true },
            { selector: '.error, .errors, .field-error, .form-error', requireVisibleText: true },
            { selector: '[aria-invalid="true"]', requireVisibleText: false },
            { selector: '[data-testid*="error"]', requireVisibleText: true },
            { selector: '.ashby-application-form-error, .ashby-application-form-errors', requireVisibleText: true },
        ];

        function normalizeText(text) {
            return String(text || '').replace(/\s+/g, ' ').trim();
        }

        function isVisible(element) {
            const style = window.getComputedStyle(element);

            return !(style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0');
        }

        const matches = [];
        const bodyText = normalizeText(document.body?.textContent || '');

        for (const pattern of TEXT_ERROR_PATTERNS) {
            const match = bodyText.match(pattern);

            if (match) {
                matches.push({ kind: 'text', pattern: pattern.source, message: match[0] });
            }
        }

        for (const { selector, requireVisibleText } of SELECTOR_PATTERNS) {
            for (const element of document.querySelectorAll(selector)) {
                if (!isVisible(element)) {
                    continue;
                }

                const text = normalizeText(element.textContent || element.getAttribute('aria-label') || '');

                if (requireVisibleText && text.length === 0) {
                    continue;
                }

                matches.push({
                    kind: 'selector',
                    selector,
                    message: text || selector,
                    ariaInvalid: element.getAttribute('aria-invalid'),
                });
            }
        }

        return matches;
    });

    return {
        passed: errors.length === 0,
        errors,
        error_count: errors.length,
    };
}
