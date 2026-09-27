export const LINKEDIN_PLATFORM_ID = 'linkedin';

/** @typedef {'remote'|'hybrid'|'on_site'} LinkedInWorkType */
/** @typedef {'entry'|'associate'|'mid_senior'|'director'|'executive'} LinkedInExperienceLevel */
/** @typedef {'24h'|'week'|'month'} LinkedInDatePosted */
/** @typedef {'40k'|'50k'|'60k'|'80k'|'100k'} LinkedInMinSalaryUk */

/**
 * @typedef {Object} LinkedInSearchFilters
 * @property {string} [location]
 * @property {LinkedInWorkType|''} [workType]
 * @property {LinkedInExperienceLevel|''} [experience]
 * @property {LinkedInDatePosted|''} [datePosted]
 * @property {LinkedInMinSalaryUk|''} [minSalaryUk]
 */

export const LINKEDIN_WORK_TYPE_PARAMS = {
    remote: '2',
    hybrid: '3',
    on_site: '1',
};

export const LINKEDIN_EXPERIENCE_PARAMS = {
    entry: '2',
    associate: '3',
    mid_senior: '4',
    director: '5',
    executive: '6',
};

export const LINKEDIN_DATE_POSTED_PARAMS = {
    '24h': 'r86400',
    week: 'r604800',
    month: 'r2592000',
};

/** UK salary bracket IDs for LinkedIn f_SB2 (market-dependent). */
export const LINKEDIN_UK_SALARY_PARAMS = {
    '40k': '1',
    '50k': '2',
    '60k': '3',
    '80k': '4',
    '100k': '5',
};

/**
 * @param {LinkedInSearchFilters|null|undefined} filters
 * @returns {URLSearchParams}
 */
export function appendLinkedInSearchFilters(params, filters) {
    const location = String(filters?.location || '').trim();

    if (location) {
        params.set('location', location);
    }

    const workType = filters?.workType;

    if (workType && LINKEDIN_WORK_TYPE_PARAMS[workType]) {
        params.set('f_WT', LINKEDIN_WORK_TYPE_PARAMS[workType]);
    }

    const experience = filters?.experience;

    if (experience && LINKEDIN_EXPERIENCE_PARAMS[experience]) {
        params.set('f_E', LINKEDIN_EXPERIENCE_PARAMS[experience]);
    }

    const datePosted = filters?.datePosted;

    if (datePosted && LINKEDIN_DATE_POSTED_PARAMS[datePosted]) {
        params.set('f_TPR', LINKEDIN_DATE_POSTED_PARAMS[datePosted]);
    }

    const minSalaryUk = filters?.minSalaryUk;

    if (minSalaryUk && LINKEDIN_UK_SALARY_PARAMS[minSalaryUk]) {
        params.set('f_SB2', LINKEDIN_UK_SALARY_PARAMS[minSalaryUk]);
    }

    return params;
}

/** Legacy Ember / jobs-search list cards. */
export const LEGACY_JOB_CARD_SELECTORS = [
    'li.scaffold-layout__list-item[data-occludable-job-id]',
    'li.jobs-search-results__list-item',
    'div.job-card-container[data-job-id]',
    'li[data-occludable-job-id]',
    '.jobs-search-results-list__item',
    'div.job-card-list__entity-lockup',
];

/**
 * LinkedIn 2026 /jobs/search-results/ SDUI cards.
 * Prefer the outer role=button node (inner div reuses the same componentkey).
 */
export const SDUI_JOB_CARD_SELECTORS = [
    '[componentkey^="job-card-component-ref-"][role="button"]',
    'div[role="button"][componentkey^="job-card-component-ref-"]',
    '[componentkey^="job-card-component-ref-"]',
];

export const JOB_CARD_SELECTORS = [
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

/**
 * @param {string} roleDescription
 * @param {{ easyApplyOnly?: boolean, filters?: LinkedInSearchFilters|null }} [options]
 * @returns {string}
 */
export function buildLinkedInJobSearchUrl(roleDescription, { easyApplyOnly = true, filters = null } = {}) {
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

    appendLinkedInSearchFilters(params, filters);

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
 * @param {string} url
 * @returns {boolean}
 */
export function isLinkedInJobViewUrl(url) {
    try {
        const parsed = new URL(url);

        return parsed.hostname.replace(/^www\./, '') === 'linkedin.com'
            && parsed.pathname.startsWith('/jobs/view/');
    } catch {
        return false;
    }
}

/**
 * LinkedIn jobs search or job-view surfaces where Draft All should avoid SERP filter harvest.
 * Includes /jobs/search/ and /jobs/search-results/.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isLinkedInJobsApplySurfaceUrl(url) {
    return isLinkedInJobsSearchUrl(url) || isLinkedInJobViewUrl(url);
}

/** Job detail / apply form regions - never the left SERP filter rail. */
export const LINKEDIN_JOB_DETAIL_INVENTORY_SELECTORS = [
    '.jobs-search__job-details--container',
    '.jobs-search__job-details',
    '.jobs-details__main-content',
    '.jobs-details',
    '.job-view-layout',
    '#job-details',
    // LinkedIn 2026 /jobs/search-results/ two-pane UI (hashed classes)
    '[id^="JobDetails_AboutTheJob_"]',
    '[componentkey^="JobDetails_AboutTheJob_"]',
    '[id^="JobDetails_"]',
    '[componentkey^="JobDetails_"]',
];

/**
 * @typedef {'full'|'easy_apply_modal'|'job_detail'|'linkedin_jobs_empty'} LinkedInDraftAllInventoryMode
 */

/**
 * Decide how Draft All should inventory a LinkedIn page.
 * - Easy Apply open → modal only (fast, correct)
 * - Modal closed on jobs SERP/view → job detail pane only (skip filter rails / tracker frames)
 * - No detail pane → empty snapshot (caller shows "no questions"), never a hard Easy Apply redirect
 *
 * @param {string|null|undefined} url
 * @param {{ easyApplyOpen?: boolean, hasJobDetailRoot?: boolean }} [options]
 * @returns {LinkedInDraftAllInventoryMode}
 */
export function resolveLinkedInDraftAllInventoryMode(url, {
    easyApplyOpen = false,
    hasJobDetailRoot = false,
} = {}) {
    if (!isLinkedInJobsApplySurfaceUrl(url || '')) {
        return 'full';
    }

    if (easyApplyOpen) {
        return 'easy_apply_modal';
    }

    if (hasJobDetailRoot) {
        return 'job_detail';
    }

    return 'linkedin_jobs_empty';
}

/**
 * @param {ParentNode|null|undefined} rootDocument
 * @returns {Element|null}
 */
export function queryLinkedInJobDetailInventoryRoot(rootDocument) {
    if (!rootDocument || typeof rootDocument.querySelector !== 'function') {
        return null;
    }

    for (const selector of LINKEDIN_JOB_DETAIL_INVENTORY_SELECTORS) {
        const element = rootDocument.querySelector(selector);

        if (element) {
            return element;
        }
    }

    return null;
}

/**
 * Prefer the standalone job view page when search cards are unavailable; otherwise keep split-view context.
 *
 * @param {string} jobId
 * @param {{ currentUrl?: string|null, preferJobView?: boolean }} [options]
 * @returns {string}
 */
export function buildLinkedInJobOpenUrl(jobId, { currentUrl = null, preferJobView = false } = {}) {
    const normalizedJobId = String(jobId || '').trim();

    if (!normalizedJobId) {
        throw new Error('Job id is required.');
    }

    if (preferJobView) {
        return `https://www.linkedin.com/jobs/view/${normalizedJobId}/`;
    }

    if (currentUrl && isLinkedInJobsSearchUrl(currentUrl)) {
        const params = new URLSearchParams(new URL(currentUrl).search);
        params.set('currentJobId', normalizedJobId);

        return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
    }

    return `https://www.linkedin.com/jobs/view/${normalizedJobId}/`;
}

/**
 * @param {string|null|undefined} componentKey
 * @returns {string|null}
 */
export function readJobIdFromComponentKey(componentKey) {
    const match = String(componentKey || '').match(SDUI_JOB_CARD_KEY_PATTERN);

    return match?.[1] || null;
}

function isDomElement(node) {
    return Boolean(
        node &&
            node.nodeType === 1 &&
            typeof node.getAttribute === 'function' &&
            typeof node.closest === 'function',
    );
}

/**
 * Prefer the outer SDUI role=button card when nested componentkey nodes share an id.
 *
 * @param {Element} node
 * @returns {Element}
 */
export function resolveSduiJobCardRoot(node) {
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

/**
 * @param {ParentNode} root
 * @returns {string|null}
 */
export function readJobIdFromCard(root) {
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

    if (!link) {
        return null;
    }

    const match = link.getAttribute('href')?.match(/\/jobs\/view\/(\d+)/);

    return match?.[1] || null;
}

/**
 * SDUI cards put title / company / location in successive <p> nodes.
 *
 * @param {ParentNode} root
 * @returns {{ title: string|null, company: string|null, location: string|null }}
 */
export function readSduiJobCardTextFields(root) {
    const paragraphs = [...(root.querySelectorAll?.('p') || [])];
    let title = null;
    let company = null;
    let location = null;

    for (const paragraph of paragraphs) {
        if (!isDomElement(paragraph)) {
            continue;
        }

        // Skip footer metadata rows (Posted / Easy Apply / connections).
        const raw = paragraph.textContent?.replace(/\s+/g, ' ').trim() || '';

        if (
            !raw ||
            /^posted\b/i.test(raw) ||
            EASY_APPLY_TEXT.test(raw) ||
            /\bconnection[s]?\s+work/i.test(raw) ||
            /^·$/.test(raw)
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

/**
 * @param {ParentNode} root
 * @returns {string}
 */
export function readJobTitleFromCard(root) {
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

/**
 * @param {ParentNode} root
 * @returns {string}
 */
export function readCompanyFromCard(root) {
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
 * @param {Document|ParentNode|null|undefined} rootDocument
 * @returns {Array<{ selector: string, count: number }>}
 */
export function countLinkedInJobCardSelectorMatches(rootDocument) {
    if (!rootDocument || typeof rootDocument.querySelectorAll !== 'function') {
        return JOB_CARD_SELECTORS.map((selector) => ({ selector, count: 0 }));
    }

    return JOB_CARD_SELECTORS.map((selector) => ({
        selector,
        count: rootDocument.querySelectorAll(selector).length,
    }));
}

/**
 * @param {Document} document
 * @returns {Array<{ jobId: string, title: string, company: string, location: string|null, easyApply: boolean, alreadyApplied: boolean }>}
 */
export function parseLinkedInJobCards(document) {
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
