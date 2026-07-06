/**
 * Pure LinkedIn parser exposed to content script (classic script global).
 */
const AutoCVApplyLinkedInParser = (() => {
    const JOB_CARD_SELECTORS = [
        'li.scaffold-layout__list-item[data-occludable-job-id]',
        'li.jobs-search-results__list-item',
        'div.job-card-container[data-job-id]',
        'li[data-occludable-job-id]',
        '.jobs-search-results-list__item',
        'div.job-card-list__entity-lockup',
    ];

    const EASY_APPLY_TEXT = /\beasy\s+apply\b/i;
    const APPLIED_TEXT = /\bapplied\b/i;

    function readJobIdFromCard(root) {
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

    function readJobTitleFromCard(root) {
        for (const selector of JOB_TITLE_SELECTORS) {
            const titleEl = root.querySelector(selector);
            const text = titleEl?.textContent?.replace(/\s+/g, ' ').trim();

            if (text && text.length > 1 && !/^\d+$/.test(text)) {
                return text;
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

    function parseLinkedInJobCards(document) {
        const seen = new Set();
        const cards = [];

        for (const selector of JOB_CARD_SELECTORS) {
            for (const node of document.querySelectorAll(selector)) {
                const jobId = readJobIdFromCard(node);

                if (!jobId || seen.has(jobId)) {
                    continue;
                }

                seen.add(jobId);

                cards.push({
                    jobId,
                    title: readJobTitleFromCard(node),
                    company: readCompanyFromCard(node),
                    easyApply: jobCardHasEasyApply(node),
                    alreadyApplied: jobCardIsAlreadyApplied(node),
                });
            }
        }

        return cards;
    }

    return {
        parseLinkedInJobCards,
        readJobIdFromCard,
        readJobTitleFromCard,
        readCompanyFromCard,
        jobCardHasEasyApply,
        jobCardIsAlreadyApplied,
    };
})();

if (typeof window !== 'undefined') {
    window.AutoCVApplyLinkedInParser = AutoCVApplyLinkedInParser;
}
