export const LINKEDIN_PLATFORM_ID = 'linkedin';

const JOB_CARD_SELECTORS = [
    'li.scaffold-layout__list-item[data-occludable-job-id]',
    'li.jobs-search-results__list-item',
    'div.job-card-container[data-job-id]',
    'li[data-occludable-job-id]',
];

const EASY_APPLY_TEXT = /\beasy\s+apply\b/i;
const APPLIED_TEXT = /\bapplied\b/i;

/**
 * @param {string} roleDescription
 * @param {{ easyApplyOnly?: boolean }} [options]
 * @returns {string}
 */
export function buildLinkedInJobSearchUrl(roleDescription, { easyApplyOnly = true } = {}) {
    const keywords = String(roleDescription || '').trim();

    if (!keywords) {
        throw new Error('Role description is required.');
    }

    const params = new URLSearchParams({
        keywords,
        origin: 'JOBS_HOME_SEARCH_BUTTON',
    });

    if (easyApplyOnly) {
        params.set('f_AL', 'true');
    }

    return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isLinkedInJobsSearchUrl(url) {
    try {
        const parsed = new URL(url);

        return parsed.hostname.replace(/^www\./, '') === 'linkedin.com'
            && parsed.pathname.startsWith('/jobs/search');
    } catch {
        return false;
    }
}

/**
 * @param {ParentNode} root
 * @returns {string|null}
 */
export function readJobIdFromCard(root) {
    if (!root || typeof root.getAttribute !== 'function') {
        return null;
    }

    const directId = root.getAttribute('data-occludable-job-id')
        || root.getAttribute('data-job-id')
        || root.querySelector('[data-job-id]')?.getAttribute('data-job-id');

    if (directId) {
        return String(directId);
    }

    const link = root.querySelector('a[href*="/jobs/view/"]');

    if (!link) {
        return null;
    }

    const match = link.getAttribute('href')?.match(/\/jobs\/view\/(\d+)/);

    return match?.[1] || null;
}

/**
 * @param {ParentNode} root
 * @returns {string}
 */
export function readJobTitleFromCard(root) {
    const titleEl = root.querySelector(
        '.job-card-list__title, .job-card-list__title-link, a[data-control-name="job_card_title"], a[href*="/jobs/view/"]',
    );

    return titleEl?.textContent?.replace(/\s+/g, ' ').trim() || 'Unknown role';
}

/**
 * @param {ParentNode} root
 * @returns {string}
 */
export function readCompanyFromCard(root) {
    const companyEl = root.querySelector(
        '.artdeco-entity-lockup__subtitle, .artdeco-entity-lockup__caption, .job-card-container__company-name, .job-card-container__primary-description, [data-test-job-card-company-name]',
    );

    return companyEl?.textContent?.replace(/\s+/g, ' ').trim() || 'Unknown company';
}

/**
 * @param {ParentNode} root
 * @returns {boolean}
 */
export function jobCardHasEasyApply(root) {
    const text = root.textContent?.replace(/\s+/g, ' ') || '';

    if (EASY_APPLY_TEXT.test(text)) {
        return true;
    }

    return Boolean(root.querySelector('[data-is-easy-apply="true"], .jobs-apply-button--easy-apply, .job-card-container__apply-method'));
}

/**
 * @param {ParentNode} root
 * @returns {boolean}
 */
export function jobCardIsAlreadyApplied(root) {
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

/**
 * @param {Document} document
 * @returns {Array<{ jobId: string, title: string, company: string, easyApply: boolean, alreadyApplied: boolean }>}
 */
export function parseLinkedInJobCards(document) {
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
