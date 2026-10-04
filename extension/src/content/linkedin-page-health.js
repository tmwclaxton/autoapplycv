/**
 * LinkedIn page health: frontend errors, checkpoints, stuck loading (content script global).
 */
var AutoCVApplyLinkedInPageHealth = (() => {
    const ERROR_CODES = {
        SESSION_EXPIRED: 'session_expired',
        CHECKPOINT: 'checkpoint',
        LOGIN_LOOP: 'login_loop',
        RATE_LIMIT: 'rate_limit',
        GENERIC_ERROR: 'generic_error',
        MODAL_VALIDATION: 'modal_validation',
        LOADING_STUCK: 'loading_stuck',
        SOMETHING_WENT_WRONG: 'something_went_wrong',
        TOAST_ERROR: 'toast_error',
    };

    const BLOCKING_CODES = new Set([
        ERROR_CODES.SESSION_EXPIRED,
        ERROR_CODES.CHECKPOINT,
        ERROR_CODES.LOGIN_LOOP,
        ERROR_CODES.RATE_LIMIT,
        ERROR_CODES.SOMETHING_WENT_WRONG,
    ]);

    const TEXT_PATTERNS = [
        { code: ERROR_CODES.SOMETHING_WENT_WRONG, pattern: /something went wrong/i },
        { code: ERROR_CODES.RATE_LIMIT, pattern: /rate limit|too many requests|try again later|slow down/i },
        { code: ERROR_CODES.SESSION_EXPIRED, pattern: /session expired|sign in again|session has timed out|please sign in/i },
        { code: ERROR_CODES.GENERIC_ERROR, pattern: /unable to load|could not load|an error occurred/i },
    ];

    function normalize(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    // Only short, visible alert-like surfaces count. Scanning body.textContent
    // matched hidden <code>/<script> payloads, job descriptions ("rate limits"
    // in an AI engineer spec) and Easy Apply question text, so a normal job
    // page could stop a run with "[rate_limit] rate limit".
    const ALERT_SURFACE_SELECTOR = [
        '[role="alert"]',
        '[role="alertdialog"]',
        '[aria-live="assertive"]',
        '.artdeco-toast-item',
        '[data-test-artdeco-toast-item-type]',
        '.artdeco-global-alert',
        '.global-alert',
        '.error-container',
        '.artdeco-empty-state',
        '[data-test-error-page]',
        '.artdeco-modal',
        '[role="dialog"]',
        'dialog[open]',
    ].join(', ');

    const DIALOG_SELECTOR = '.artdeco-modal, [role="dialog"], dialog';

    // Page content that can legitimately mention "rate limit", "try again
    // later" or "something went wrong" without LinkedIn showing an error.
    const CONTENT_REGION_SELECTOR = [
        '.jobs-description',
        '.jobs-description-content',
        '.jobs-box__html-content',
        '.show-more-less-html',
        '[data-testid="expandable-text-box"]',
        '.job-card-container',
        '.jobs-search-results-list',
        '.scaffold-layout__list',
        '[componentkey^="job-card-component-ref-"]',
    ].join(', ');

    const NON_TEXT_SELECTOR = 'script, style, noscript, template, code, textarea, select, option, [hidden], [aria-hidden="true"]';

    const MAX_ALERT_TEXT = 400;
    const ERROR_PAGE_MAX_TEXT = 1200;

    function isVisible(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        if (element.closest('[hidden], [aria-hidden="true"]')) {
            return false;
        }

        if (typeof element.checkVisibility === 'function') {
            try {
                if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
                    return false;
                }
            } catch {
                // Fall through to the style/box checks below.
            }
        }

        const style = window.getComputedStyle(element);

        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
        }

        const rect = element.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
            return true;
        }

        if (element.offsetWidth > 0 && element.offsetHeight > 0) {
            return true;
        }

        return (style.position === 'fixed' || style.position === 'absolute')
            && style.display !== 'none';
    }

    /**
     * Visible-ish text under root, skipping scripts, hidden subtrees and form
     * control values. Stops once maxLength is exceeded.
     */
    function readRenderedText(root, maxLength = Infinity) {
        if (!root) {
            return '';
        }

        const doc = root.ownerDocument || root;
        const view = doc.defaultView || window;
        const walker = doc.createTreeWalker(root, view.NodeFilter.SHOW_TEXT);
        let text = '';

        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const parent = node.parentElement;

            if (!parent || parent.closest(NON_TEXT_SELECTOR)) {
                continue;
            }

            text += ` ${node.nodeValue || ''}`;

            if (text.length > maxLength * 2) {
                break;
            }
        }

        return normalize(text);
    }

    function matchTextPatterns(text, source) {
        const issues = [];

        if (!text) {
            return issues;
        }

        for (const { code, pattern } of TEXT_PATTERNS) {
            const match = text.match(pattern);

            if (match) {
                issues.push({
                    code,
                    message: match[0],
                    source,
                    context: text.slice(0, 200),
                });
            }
        }

        return issues;
    }

    function isAlertSurfaceCandidate(node) {
        if (!(node instanceof HTMLElement)) {
            return false;
        }

        if (node.closest(CONTENT_REGION_SELECTOR)) {
            return false;
        }

        // Easy Apply steps are dialogs full of question text; an error dialog
        // has buttons only.
        if (
            node.matches(DIALOG_SELECTOR)
            && node.querySelector('input:not([type="hidden"]), select, textarea, [role="radio"], [role="combobox"]')
        ) {
            return false;
        }

        return isVisible(node);
    }

    function readAlertSurfaceIssues(root = document) {
        const issues = [];

        for (const node of root.querySelectorAll(ALERT_SURFACE_SELECTOR)) {
            if (!isAlertSurfaceCandidate(node)) {
                continue;
            }

            const text = readRenderedText(node, MAX_ALERT_TEXT);

            if (!text || text.length > MAX_ALERT_TEXT) {
                continue;
            }

            issues.push(...matchTextPatterns(text, 'alert'));
        }

        return issues;
    }

    /** A bare error page (e.g. LinkedIn's 429 page) has very little rendered text. */
    function readErrorPageIssues(root = document) {
        const body = root.body || null;

        if (!body) {
            return [];
        }

        const text = readRenderedText(body, ERROR_PAGE_MAX_TEXT);

        if (!text || text.length > ERROR_PAGE_MAX_TEXT) {
            return [];
        }

        return matchTextPatterns(text, 'text');
    }

    function readUrlIssues() {
        const issues = [];

        try {
            const url = new URL(window.location.href);

            if (!url.hostname.includes('linkedin.com')) {
                return issues;
            }

            if (url.pathname.includes('/checkpoint') || url.pathname.includes('/challenge')) {
                issues.push({
                    code: ERROR_CODES.CHECKPOINT,
                    message: 'LinkedIn security checkpoint or challenge page.',
                    source: 'url',
                });
            }

            if (url.pathname.includes('/login') || url.pathname.includes('/authwall')) {
                issues.push({
                    code: ERROR_CODES.LOGIN_LOOP,
                    message: 'Redirected to LinkedIn login.',
                    source: 'url',
                });
            }
        } catch {
            // Ignore malformed URLs.
        }

        return issues;
    }

    function readTextIssues(root = document) {
        return [...readAlertSurfaceIssues(root), ...readErrorPageIssues(root)];
    }

    function readSelectorIssues(root = document) {
        const issues = [];
        const groups = [
            {
                code: ERROR_CODES.TOAST_ERROR,
                selector: '.artdeco-toast-item--error, [data-test-artdeco-toast-item-type="error"], .global-alert--error',
            },
            {
                code: ERROR_CODES.GENERIC_ERROR,
                selector: '.artdeco-inline-feedback--error, .feed-shared-error, .jobs-search-box__error-text',
            },
            {
                code: ERROR_CODES.MODAL_VALIDATION,
                selector: '.jobs-easy-apply-modal .artdeco-inline-feedback--error, .jobs-easy-apply-modal [role="alert"], .jobs-easy-apply-modal .artdeco-form-element__error-text',
            },
        ];

        for (const group of groups) {
            for (const node of root.querySelectorAll(group.selector)) {
                if (!isVisible(node)) {
                    continue;
                }

                const message = normalize(node.textContent);

                if (!message || message.length < 3) {
                    continue;
                }

                issues.push({
                    code: group.code,
                    message,
                    source: 'selector',
                });
            }
        }

        return issues;
    }

    function readLoadingOverlay(root = document) {
        const selectors = [
            '.artdeco-loader',
            '.jobs-loader',
            '[data-test-loader]',
            '.loading-overlay',
            '.jobs-search-results-list__loading-indicator',
            '.scaffold-layout__loading',
        ];

        for (const selector of selectors) {
            const node = root.querySelector(selector);

            if (node && isVisible(node)) {
                return {
                    code: ERROR_CODES.LOADING_STUCK,
                    message: 'LinkedIn loading indicator still visible.',
                    source: 'spinner',
                };
            }
        }

        return null;
    }

    function dedupeIssues(issues) {
        const seen = new Set();

        return issues.filter((issue) => {
            const key = `${issue.code}:${issue.message}`;

            if (seen.has(key)) {
                return false;
            }

            seen.add(key);

            return true;
        });
    }

    /**
     * @param {{ loadingStuck?: boolean }} [options]
     */
    function scanPageHealth(options = {}) {
        const issues = dedupeIssues([
            ...readUrlIssues(),
            ...readTextIssues(document),
            ...readSelectorIssues(document),
        ]);

        if (options.loadingStuck) {
            const loading = readLoadingOverlay(document);

            if (loading) {
                issues.push(loading);
            }
        }

        const blocking = issues.filter((issue) => BLOCKING_CODES.has(issue.code));

        return {
            ok: blocking.length === 0,
            issues,
            blocking,
            primary: blocking[0] || issues[0] || null,
            url: window.location.href,
            timestamp: Date.now(),
        };
    }

    function formatIssueLog(issue) {
        if (!issue) {
            return '';
        }

        return `[${issue.code}] ${issue.message}`;
    }

    return {
        ERROR_CODES,
        BLOCKING_CODES,
        scanPageHealth,
        formatIssueLog,
        readUrlIssues,
        readTextIssues,
        readAlertSurfaceIssues,
        readErrorPageIssues,
        readRenderedText,
        readSelectorIssues,
        readLoadingOverlay,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyLinkedInPageHealth = AutoCVApplyLinkedInPageHealth;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyLinkedInPageHealth = AutoCVApplyLinkedInPageHealth;
}
