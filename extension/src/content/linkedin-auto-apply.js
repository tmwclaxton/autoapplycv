/**
 * LinkedIn Easy Apply DOM helpers (content script global).
 */
const AutoCVApplyLinkedInAutoApply = (() => {
    const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    function normalize(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function queryVisible(selector, root = document) {
        const nodes = [...root.querySelectorAll(selector)];

        return nodes.find((node) => {
            if (!(node instanceof HTMLElement)) {
                return false;
            }

            const style = window.getComputedStyle(node);

            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && node.offsetParent !== null;
        }) || null;
    }

    function clickElement(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        element.click();

        return true;
    }

    function findJobCardById(jobId) {
        const selectors = [
            `[data-occludable-job-id="${CSS.escape(jobId)}"]`,
            `[data-job-id="${CSS.escape(jobId)}"]`,
            `a[href*="/jobs/view/${CSS.escape(jobId)}"]`,
        ];

        for (const selector of selectors) {
            const match = document.querySelector(selector);

            if (match) {
                return match.closest('li, div.job-card-container, div.job-card-list__entity-lockup') || match;
            }
        }

        return null;
    }

    function collectJobCards() {
        if (typeof AutoCVApplyLinkedInParser !== 'undefined') {
            return AutoCVApplyLinkedInParser.parseLinkedInJobCards(document);
        }

        return [];
    }

    async function prepareJobSearch() {
        const listRoot = document.querySelector(
            '.jobs-search-results-list, .scaffold-layout__list, ul.jobs-search-results__list',
        );

        if (listRoot instanceof HTMLElement) {
            listRoot.scrollTop = listRoot.scrollHeight;
        }

        window.scrollTo(0, document.body.scrollHeight);
        await sleep(800);
        window.scrollTo(0, 0);
        await sleep(400);

        return { success: true };
    }

    async function selectJobById(jobId) {
        const card = findJobCardById(jobId);

        if (!card) {
            return { success: false, error: `Job card not found: ${jobId}` };
        }

        const clickable = card.querySelector('a[href*="/jobs/view/"], .job-card-list__title-link, .job-card-container__clickable') || card;

        clickElement(clickable);
        await sleep(1200);

        return { success: true, jobId };
    }

    function readTopCardApplyButton() {
        return queryVisible([
            '.jobs-apply-button',
            'button.jobs-apply-button',
            '.jobs-s-apply button',
            'button[aria-label*="Easy Apply"]',
            'button[aria-label*="Apply"]',
        ].join(', '));
    }

    function readEasyApplyModal() {
        return queryVisible([
            '.jobs-easy-apply-modal',
            '.jobs-easy-apply-content',
            'div[role="dialog"] .jobs-easy-apply-content',
            'div[role="dialog"]',
        ].join(', '));
    }

    function readApplyButtonState(button) {
        if (!(button instanceof HTMLElement)) {
            return {
                present: false,
                label: '',
                easyApply: false,
                alreadyApplied: false,
                disabled: true,
            };
        }

        const label = normalize(button.textContent || button.getAttribute('aria-label'));

        return {
            present: true,
            label,
            easyApply: /\beasy\s+apply\b/i.test(label),
            alreadyApplied: /\bapplied\b/i.test(label) && !/\beasy\s+apply\b/i.test(label),
            disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
        };
    }

    async function clickEasyApply() {
        const button = readTopCardApplyButton();

        if (!button) {
            return { success: false, error: 'Apply button not found on job detail panel.' };
        }

        const state = readApplyButtonState(button);

        if (state.alreadyApplied) {
            return { success: false, alreadyApplied: true, error: 'Already applied to this job.' };
        }

        if (!state.easyApply) {
            return { success: false, easyApply: false, error: 'Job does not offer Easy Apply.' };
        }

        clickElement(button);
        await sleep(1500);

        const modal = readEasyApplyModal();

        if (!modal) {
            return { success: false, error: 'Easy Apply modal did not open.' };
        }

        return { success: true, easyApply: true };
    }

    function readModalFooterButtons(modal = readEasyApplyModal()) {
        if (!modal) {
            return [];
        }

        const footer = modal.querySelector('.jobs-easy-apply-footer, footer, .artdeco-modal__actionbar') || modal;

        return [...footer.querySelectorAll('button')].filter((button) => button instanceof HTMLElement);
    }

    function getEasyApplyModalState() {
        const modal = readEasyApplyModal();

        if (!modal) {
            return {
                open: false,
                canSubmit: false,
                canContinue: false,
                stepLabel: null,
            };
        }

        const buttons = readModalFooterButtons(modal);
        const submitButton = buttons.find((button) => /\bsubmit\s+application\b/i.test(normalize(button.textContent)));
        const reviewButton = buttons.find((button) => /\breview\b/i.test(normalize(button.textContent)));
        const nextButton = buttons.find((button) => /\b(next|continue)\b/i.test(normalize(button.textContent)));

        return {
            open: true,
            canSubmit: Boolean(submitButton && !submitButton.disabled),
            canContinue: Boolean((nextButton || reviewButton) && !(nextButton || reviewButton)?.disabled),
            stepLabel: normalize(modal.querySelector('h2, h3')?.textContent) || null,
            submitLabel: submitButton ? normalize(submitButton.textContent) : null,
        };
    }

    async function clickNextOrSubmit() {
        const modal = readEasyApplyModal();

        if (!modal) {
            return { success: false, error: 'Easy Apply modal is not open.' };
        }

        const buttons = readModalFooterButtons(modal);
        const submitButton = buttons.find((button) => /\bsubmit\s+application\b/i.test(normalize(button.textContent)));
        const reviewButton = buttons.find((button) => /\breview\b/i.test(normalize(button.textContent)));
        const nextButton = buttons.find((button) => /\b(next|continue)\b/i.test(normalize(button.textContent)));
        const target = submitButton || reviewButton || nextButton;

        if (!target) {
            return { success: false, error: 'No Next/Review/Submit button found in Easy Apply modal.' };
        }

        const action = submitButton ? 'submit' : reviewButton ? 'review' : 'next';

        clickElement(target);
        await sleep(action === 'submit' ? 2000 : 1200);

        return {
            success: true,
            action,
            submitted: action === 'submit',
        };
    }

    async function closeEasyApplyModal() {
        const modal = readEasyApplyModal();

        if (!modal) {
            return { success: true, closed: true };
        }

        const dismiss = queryVisible([
            'button[aria-label="Dismiss"]',
            'button[aria-label="Close"]',
            '.artdeco-modal__dismiss',
        ].join(', '), modal);

        if (dismiss) {
            clickElement(dismiss);
            await sleep(500);

            return { success: true, closed: true };
        }

        return { success: false, error: 'Could not close Easy Apply modal.' };
    }

    async function goToNextSearchPage() {
        const nextButton = queryVisible([
            'button[aria-label="View next page"]',
            'button.artdeco-pagination__button--next',
        ].join(', '));

        if (!nextButton || nextButton.disabled) {
            return { success: false, error: 'No next search results page.' };
        }

        clickElement(nextButton);
        await sleep(1800);

        return { success: true };
    }

    return {
        collectJobCards,
        prepareJobSearch,
        selectJobById,
        clickEasyApply,
        getEasyApplyModalState,
        clickNextOrSubmit,
        closeEasyApplyModal,
        goToNextSearchPage,
        readTopCardApplyButton,
        readApplyButtonState,
    };
})();

if (typeof window !== 'undefined') {
    window.AutoCVApplyLinkedInAutoApply = AutoCVApplyLinkedInAutoApply;
}
