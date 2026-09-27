/**
 * Pure LinkedIn parser exposed to content script (classic script global).
 * Keep in sync with extension/src/shared/linkedin-platform.js card helpers.
 */
var AutoCVApplyLinkedInParser = (() => {
    const LEGACY_JOB_CARD_SELECTORS = [
        'li.scaffold-layout__list-item[data-occludable-job-id]',
        'li.jobs-search-results__list-item',
        'div.job-card-container[data-job-id]',
        'li[data-occludable-job-id]',
        '.jobs-search-results-list__item',
        'div.job-card-list__entity-lockup',
    ];

    const SDUI_JOB_CARD_SELECTORS = [
        '[componentkey^="job-card-component-ref-"][role="button"]',
        'div[role="button"][componentkey^="job-card-component-ref-"]',
        '[componentkey^="job-card-component-ref-"]',
    ];

    const JOB_CARD_SELECTORS = [
        ...SDUI_JOB_CARD_SELECTORS,
        ...LEGACY_JOB_CARD_SELECTORS,
    ];

    const JOB_TITLE_SELECTORS = [
        '.job-card-list__title-link strong',
        '.job-card-list__title strong',
        '.job-card-list__title-link',
        '.job-card-list__title',
        '.base-search-card__title',
        'a[data-control-name="job_card_title"]',
        '.job-card-container__link-wrapper a',
        'a[href*="/jobs/view/"] span[aria-hidden="true"]',
        'a[href*="/jobs/view/"]',
    ];

    const JOB_COMPANY_SELECTORS = [
        '.artdeco-entity-lockup__subtitle',
        '.artdeco-entity-lockup__caption',
        '.job-card-container__company-name',
        '.job-card-container__primary-description',
        '[data-test-job-card-company-name]',
        '.base-search-card__subtitle',
        '.job-card-container__company-name a',
    ];

    const EASY_APPLY_TEXT = /\beasy\s+apply\b/i;
    const APPLIED_TEXT = /\bapplied\b/i;
    const SDUI_JOB_CARD_KEY_PATTERN = /job-card-component-ref-(\d+)/i;
    const SELECTED_TITLE_PREFIX = /^selected,\s*/i;

    function readJobIdFromComponentKey(componentKey) {
        const match = String(componentKey || '').match(SDUI_JOB_CARD_KEY_PATTERN);

        return match?.[1] || null;
    }

    function isDomElement(node) {
        return Boolean(
            node
            && node.nodeType === 1
            && typeof node.getAttribute === 'function'
            && typeof node.closest === 'function',
        );
    }

    function resolveSduiJobCardRoot(node) {
        if (!isDomElement(node)) {
            return node;
        }

        const jobId = readJobIdFromComponentKey(node.getAttribute('componentkey'));

        if (!jobId) {
            return node;
        }

        const withRole = node.closest(
            `[componentkey="job-card-component-ref-${jobId}"][role="button"]`,
        );

        if (withRole) {
            return withRole;
        }

        return (
            node.closest(`[componentkey="job-card-component-ref-${jobId}"]`) || node
        );
    }

    function readJobIdFromCard(root) {
        if (!root || typeof root.getAttribute !== 'function') {
            return null;
        }

        const fromComponentKey = readJobIdFromComponentKey(
            root.getAttribute('componentkey'),
        );

        if (fromComponentKey) {
            return fromComponentKey;
        }

        const nestedKey = root
            .querySelector?.('[componentkey^="job-card-component-ref-"]')
            ?.getAttribute('componentkey');
        const fromNested = readJobIdFromComponentKey(nestedKey);

        if (fromNested) {
            return fromNested;
        }

        const directId = root.getAttribute('data-occludable-job-id')
            || root.getAttribute('data-job-id')
            || root.querySelector('[data-job-id]')?.getAttribute('data-job-id');

        if (directId) {
            return String(directId);
        }

        const link = root.querySelector('a[href*="/jobs/view/"]');
        const match = link?.getAttribute('href')?.match(/\/jobs\/view\/(\d+)/);

        return match?.[1] || null;
    }

    function readSduiJobCardTextFields(root) {
        const paragraphs = [...(root.querySelectorAll?.('p') || [])];
        let title = null;
        let company = null;
        let location = null;

        for (const paragraph of paragraphs) {
            if (!isDomElement(paragraph)) {
                continue;
            }

            const raw = paragraph.textContent?.replace(/\s+/g, ' ').trim() || '';

            if (
                !raw
                || /^posted\b/i.test(raw)
                || EASY_APPLY_TEXT.test(raw)
                || /\bconnection[s]?\s+work/i.test(raw)
                || /^·$/.test(raw)
            ) {
                continue;
            }

            const ariaHidden = paragraph
                .querySelector('span[aria-hidden="true"]')
                ?.textContent?.replace(/\s+/g, ' ')
                .trim();
            const candidate = (ariaHidden || raw).replace(SELECTED_TITLE_PREFIX, '').trim();

            if (!candidate || /^\d+$/.test(candidate)) {
                continue;
            }

            if (!title) {
                title = candidate;
                continue;
            }

            if (!company) {
                company = candidate;
                continue;
            }

            if (!location) {
                location = candidate;
                break;
            }
        }

        return { title, company, location };
    }

    function readJobTitleFromCard(root) {
        const sdui = readSduiJobCardTextFields(root);

        if (sdui.title && sdui.title.length > 1) {
            return sdui.title;
        }

        for (const selector of JOB_TITLE_SELECTORS) {
            const titleEl = root.querySelector(selector);
            const text = titleEl?.textContent?.replace(/\s+/g, ' ').trim();

            if (text && text.length > 1 && !/^\d+$/.test(text)) {
                return text.replace(SELECTED_TITLE_PREFIX, '').trim();
            }
        }

        const dismiss = root.querySelector?.('button[aria-label^="Dismiss "]');
        const dismissLabel = dismiss?.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim();

        if (dismissLabel) {
            const fromDismiss = dismissLabel
                .replace(/^Dismiss\s+/i, '')
                .replace(/\s+job$/i, '')
                .trim();

            if (fromDismiss.length > 1) {
                return fromDismiss;
            }
        }

        const link = root.querySelector('a[href*="/jobs/view/"]');
        const ariaLabel = link?.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim();

        if (ariaLabel) {
            const fromLabel = ariaLabel
                .replace(/\s+with\s+verification.*$/i, '')
                .replace(/\s+in\s+.+$/i, '')
                .replace(/\s+·.*$/i, '')
                .trim();

            if (fromLabel.length > 1) {
                return fromLabel;
            }
        }

        return 'Unknown role';
    }

    function readCompanyFromCard(root) {
        const sdui = readSduiJobCardTextFields(root);

        if (sdui.company && sdui.company.length > 1) {
            return sdui.company;
        }

        for (const selector of JOB_COMPANY_SELECTORS) {
            const companyEl = root.querySelector(selector);
            const text = companyEl?.textContent?.replace(/\s+/g, ' ').trim();

            if (text && text.length > 1) {
                return text;
            }
        }

        return 'Unknown company';
    }

    function jobCardHasEasyApply(root) {
        const text = root.textContent?.replace(/\s+/g, ' ') || '';

        if (EASY_APPLY_TEXT.test(text)) {
            return true;
        }

        return Boolean(root.querySelector('[data-is-easy-apply="true"], .jobs-apply-button--easy-apply, .job-card-container__apply-method'));
    }

    function jobCardIsAlreadyApplied(root) {
        const text = root.textContent?.replace(/\s+/g, ' ') || '';

        if (APPLIED_TEXT.test(text)) {
            const appliedButton = [...root.querySelectorAll('button, span')].find((node) => {
                const label = node.textContent?.replace(/\s+/g, ' ').trim() || '';

                return APPLIED_TEXT.test(label) && !EASY_APPLY_TEXT.test(label);
            });

            if (appliedButton) {
                return true;
            }
        }

        return Boolean(root.querySelector('.jobs-apply-button--applied, [aria-label*="Applied"]'));
    }

    function countLinkedInJobCardSelectorMatches(rootDocument) {
        if (!rootDocument || typeof rootDocument.querySelectorAll !== 'function') {
            return JOB_CARD_SELECTORS.map((selector) => ({ selector, count: 0 }));
        }

        return JOB_CARD_SELECTORS.map((selector) => ({
            selector,
            count: rootDocument.querySelectorAll(selector).length,
        }));
    }

    function parseLinkedInJobCards(document) {
        const seen = new Set();
        const cards = [];

        for (const selector of JOB_CARD_SELECTORS) {
            for (const node of document.querySelectorAll(selector)) {
                const root = resolveSduiJobCardRoot(node);
                const jobId = readJobIdFromCard(root);

                if (!jobId || seen.has(jobId)) {
                    continue;
                }

                seen.add(jobId);

                const sdui = readSduiJobCardTextFields(root);

                cards.push({
                    jobId,
                    title: readJobTitleFromCard(root),
                    company: readCompanyFromCard(root),
                    location: sdui.location || null,
                    easyApply: jobCardHasEasyApply(root),
                    alreadyApplied: jobCardIsAlreadyApplied(root),
                });
            }
        }

        return cards;
    }

    return {
        JOB_CARD_SELECTORS,
        SDUI_JOB_CARD_SELECTORS,
        LEGACY_JOB_CARD_SELECTORS,
        parseLinkedInJobCards,
        countLinkedInJobCardSelectorMatches,
        readJobIdFromCard,
        readJobIdFromComponentKey,
        resolveSduiJobCardRoot,
        readJobTitleFromCard,
        readCompanyFromCard,
        readSduiJobCardTextFields,
        jobCardHasEasyApply,
        jobCardIsAlreadyApplied,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyLinkedInParser = AutoCVApplyLinkedInParser;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyLinkedInParser = AutoCVApplyLinkedInParser;
}
