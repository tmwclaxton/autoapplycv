/**
 * LinkedIn Easy Apply DOM helpers (content script global).
 */
const AutoCVApplyLinkedInAutoApply = (() => {
    const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const MODAL_SELECTORS = [
        '[data-test-modal].jobs-easy-apply-modal',
        '.jobs-easy-apply-modal',
        '[data-test-modal]',
        '.jobs-easy-apply-modal__content',
        '.jobs-easy-apply-content',
        'div[role="dialog"] .jobs-easy-apply-modal__content',
        'div[role="dialog"] .jobs-easy-apply-content',
        'div[role="dialog"][aria-labelledby*="easy-apply"]',
        'div[role="dialog"][aria-labelledby="jobs-apply-header"]',
        'div[role="dialog"]',
    ].join(', ');

    const JOB_DETAIL_ROOT_SELECTORS = [
        '.jobs-details',
        '.jobs-search__job-details',
        '.job-view-layout',
        '.jobs-unified-top-card',
        '.jobs-details__main-content',
        '.jobs-details-top-card',
    ].join(', ');

    const JOB_CARD_ROOT_SELECTORS = [
        'li.scaffold-layout__list-item',
        'li.jobs-search-results__list-item',
        'li[data-occludable-job-id]',
        'div.job-card-container',
        '.jobs-search-results-list__item',
    ].join(', ');

    const SUBMIT_PATTERN = /\b(submit(?:\s+application)?|send\s+application)\b/i;
    const REVIEW_PATTERN = /\b(review|review your application)\b/i;
    const NEXT_PATTERN = /\b(next|continue)\b/i;
    const APPLICATION_SENT_PATTERN = /(?:your\s+application\s+was\s+sent|application\s+(?:submitted|sent)|thanks\s+for\s+applying)/i;
    const STANDALONE_JOB_VIEW_PATTERN = /\/jobs\/view\/(\d+)/;

    const APPLY_BUTTON_SELECTORS = [
        'a[aria-label*="Easy Apply"][href*="/apply/"]',
        'a[aria-label*="Easy Apply"]',
        'a[href*="/apply/"][href*="openSDUIApplyFlow"]',
        'a[href*="openSDUIApplyFlow"]',
        'a.jobs-apply-button[href*="openSDUIApplyFlow"]',
        '.jobs-apply-button--top-card button.jobs-apply-button',
        '.jobs-apply-button--top-card button',
        'button.jobs-apply-button--top-card',
        '.jobs-apply-button--top-card',
        '.jobs-unified-top-card__buttons button.jobs-apply-button',
        '.jobs-unified-top-card button.jobs-apply-button',
        '.jobs-unified-top-card button[aria-label*="Apply"]',
        '.top-card-layout button.jobs-apply-button',
        '.top-card-layout button[aria-label*="Apply"]',
        'button.jobs-apply-button',
        '.jobs-s-apply button.jobs-apply-button',
        '.jobs-s-apply button',
        'button[data-control-name="jobdetails_topcard_inlinemodal_apply"]',
        'button[data-control-name="jobdetails_topcard_apply"]',
        'button[data-live-test-job-apply-button]',
        'button[aria-label*="Easy Apply"]',
        'button[aria-label*="LinkedIn Apply"]',
        'button[aria-label*="Apply to"]',
        'button[aria-label*="Apply"]',
    ];

    function normalize(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function isStandaloneJobViewPage() {
        return STANDALONE_JOB_VIEW_PATTERN.test(window.location.pathname || '');
    }

    function readJobIdFromPageUrl() {
        const match = (window.location.pathname || '').match(STANDALONE_JOB_VIEW_PATTERN);

        return match?.[1] || null;
    }

    function isEasyApplyButtonLabel(label) {
        return /\b(easy\s+apply|linkedin\s+apply)\b/i.test(label)
            || /^apply\b/i.test(label);
    }

    function isAnchorElement(element) {
        return element instanceof HTMLElement && element.tagName === 'A';
    }

    function isSduiEasyApplyAnchor(element) {
        if (!isAnchorElement(element)) {
            return false;
        }

        const href = element.getAttribute('href') || '';

        if (href.includes('openSDUIApplyFlow') || (href.includes('/apply/') && isEasyApplyButtonLabel(element.getAttribute('aria-label') || ''))) {
            return true;
        }

        const label = normalize(element.textContent || element.getAttribute('aria-label') || '');

        return isEasyApplyButtonLabel(label);
    }

    function isEasyApplyApplyControl(element) {
        return element.matches('.jobs-apply-button, a.jobs-apply-button')
            || isSduiEasyApplyAnchor(element);
    }

    function readApplyButtonSearchRoot() {
        if (isStandaloneJobViewPage()) {
            const standaloneRoots = [
                'main#workspace',
                '[data-testid="lazy-column"]',
                '[data-sdui-component*="jobsee"]',
                '.job-view-layout',
                '.jobs-unified-top-card',
                '.jobs-details-top-card',
                '.top-card-layout',
                'main.scaffold-layout__main',
                '.jobs-details',
                '.jobs-search__job-details',
            ];

            for (const selector of standaloneRoots) {
                const node = document.querySelector(selector);

                if (node instanceof HTMLElement) {
                    return node;
                }
            }

            return document.body instanceof HTMLElement ? document.body : document;
        }

        return readJobDetailRoot();
    }

    function readApplicationSubmittedConfirmation(modal = readEasyApplyModal()) {
        if (!modal) {
            return null;
        }

        const heading = normalize(readStepSectionTitle(modal) || modal.querySelector('h2')?.textContent || '');

        if (/^application sent$/i.test(heading)) {
            return heading;
        }

        const modalText = normalize(modal.textContent || '');
        const match = modalText.match(APPLICATION_SENT_PATTERN);

        return match?.[0] || null;
    }

    function isApplicationSuccessScreen(modal = readEasyApplyModal()) {
        return Boolean(readApplicationSubmittedConfirmation(modal));
    }

    function isElementVisible(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
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

    function queryVisible(selector, root = document) {
        const nodes = [...root.querySelectorAll(selector)];

        return nodes.find((node) => isElementVisible(node)) || null;
    }

    function clickElement(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        element.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        element.focus({ preventScroll: true });

        if (typeof PointerEvent !== 'undefined') {
            element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
            element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
        }

        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        element.click();

        return true;
    }

    function readJobDetailRoot() {
        const match = document.querySelector(JOB_DETAIL_ROOT_SELECTORS);

        return match instanceof HTMLElement ? match : document;
    }

    function isInsideJobCard(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        return Boolean(element.closest(JOB_CARD_ROOT_SELECTORS));
    }

    function resolveApplyButtonCandidate(element) {
        if (!(element instanceof HTMLElement)) {
            return null;
        }

        if (element.matches([
            'button',
            'a.jobs-apply-button',
            'a[aria-label*="Easy Apply"]',
            'a[href*="openSDUIApplyFlow"]',
        ].join(', '))) {
            return element;
        }

        const nestedButton = element.querySelector([
            'a[aria-label*="Easy Apply"][href*="/apply/"]',
            'a[href*="/apply/"][href*="openSDUIApplyFlow"]',
            'button.jobs-apply-button',
            'button[aria-label*="Easy Apply"]',
            'button[aria-label*="LinkedIn Apply"]',
            'button[aria-label*="Apply"]',
            'a.jobs-apply-button',
        ].join(', '));

        return nestedButton instanceof HTMLElement ? nestedButton : element;
    }

    function findEasyApplyAnchorByText(root) {
        for (const anchor of root.querySelectorAll('a[href]')) {
            if (!isAnchorElement(anchor) || isInsideJobCard(anchor)) {
                continue;
            }

            const label = normalize(anchor.textContent || anchor.getAttribute('aria-label') || '');

            if (!isEasyApplyButtonLabel(label)) {
                continue;
            }

            const href = anchor.getAttribute('href') || '';

            if (href.includes('/apply/') || href.includes('openSDUIApplyFlow') || /\beasy\s+apply\b/i.test(label)) {
                return anchor;
            }
        }

        return null;
    }

    function readApplyButtonFromRoot(root) {
        for (const selector of APPLY_BUTTON_SELECTORS) {
            const match = queryVisible(selector, root);

            if (!match) {
                continue;
            }

            const button = resolveApplyButtonCandidate(match);

            if (!(button instanceof HTMLElement) || isInsideJobCard(button)) {
                continue;
            }

            const label = normalize(button.textContent || button.getAttribute('aria-label') || '');

            if (button.matches('.jobs-apply-button--applied') || (/\bapplied\b/i.test(label) && !isEasyApplyButtonLabel(label))) {
                continue;
            }

            if (isElementVisible(button) || isEasyApplyApplyControl(button)) {
                return button;
            }
        }

        const textAnchor = findEasyApplyAnchorByText(root);

        if (textAnchor instanceof HTMLElement && !isInsideJobCard(textAnchor)) {
            return textAnchor;
        }

        return null;
    }

    function escapeCssIdent(value) {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(value);
        }

        return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function readJobCardRoot(match) {
        if (!(match instanceof HTMLElement)) {
            return null;
        }

        return match.closest([
            'li.scaffold-layout__list-item',
            'li.jobs-search-results__list-item',
            'li[data-occludable-job-id]',
            'div.job-card-container',
            'div.job-card-list__entity-lockup',
            '.jobs-search-results-list__item',
            'li',
        ].join(', ')) || match;
    }

    function findJobCardById(jobId) {
        const escapedJobId = escapeCssIdent(jobId);
        const selectors = [
            `[data-occludable-job-id="${escapedJobId}"]`,
            `[data-job-id="${escapedJobId}"]`,
            `[data-entity-urn*="jobPosting:${escapedJobId}"]`,
            `[data-entity-urn*=":${escapedJobId}"]`,
            `a[href*="/jobs/view/${escapedJobId}"]`,
            `a[href*="currentJobId=${escapedJobId}"]`,
        ];

        for (const selector of selectors) {
            const match = document.querySelector(selector);
            const card = readJobCardRoot(match);

            if (card) {
                return card;
            }
        }

        return null;
    }

    function findJobListScrollContainer() {
        const candidates = [
            '.jobs-search-results-list',
            '.scaffold-layout__list',
            'ul.jobs-search-results__list',
            '.jobs-search-results-list__container',
            '.jobs-search-two-pane__results-list',
        ];

        for (const selector of candidates) {
            const node = document.querySelector(selector);

            if (node instanceof HTMLElement) {
                return node;
            }
        }

        return null;
    }

    async function revealJobCardById(jobId) {
        let card = findJobCardById(jobId);

        if (card) {
            card.scrollIntoView?.({ block: 'center', inline: 'nearest' });
            await sleep(250);

            return card;
        }

        const listRoot = findJobListScrollContainer();

        if (!(listRoot instanceof HTMLElement)) {
            return null;
        }

        listRoot.scrollTop = 0;
        await sleep(250);

        for (let attempt = 0; attempt < 40; attempt += 1) {
            card = findJobCardById(jobId);

            if (card) {
                card.scrollIntoView?.({ block: 'center', inline: 'nearest' });
                await sleep(250);

                return card;
            }

            const nextScrollTop = listRoot.scrollTop + Math.max(120, Math.floor(listRoot.clientHeight * 0.75));
            listRoot.scrollTop = nextScrollTop;
            await sleep(200);

            if (nextScrollTop + listRoot.clientHeight >= listRoot.scrollHeight - 4) {
                break;
            }
        }

        card = findJobCardById(jobId);

        if (card) {
            card.scrollIntoView?.({ block: 'center', inline: 'nearest' });
            await sleep(250);
        }

        return card;
    }

    function pageReferencesJobId(jobId) {
        const href = window.location.href;

        if (href.includes(`/jobs/view/${jobId}`) || href.includes(`currentJobId=${jobId}`)) {
            return true;
        }

        const activeCard = document.querySelector(
            '.jobs-search-results__list-item--active, .job-card-list__entity-lockup--active, .jobs-search-results-list__list-item--active',
        );

        if (activeCard && findJobCardById(jobId) === readJobCardRoot(activeCard)) {
            return true;
        }

        return Boolean(findJobCardById(jobId)?.classList.contains('jobs-search-results__list-item--active'));
    }

    async function waitForJobDetailPanel(jobId, timeoutMs = 12_000) {
        const deadline = Date.now() + timeoutMs;
        const standaloneJobView = isStandaloneJobViewPage();
        const pageJobId = readJobIdFromPageUrl();

        while (Date.now() < deadline) {
            await acceptCookieConsent().catch(() => {});
            await dismissSaveApplicationDialog().catch(() => {});

            const button = readTopCardApplyButton();

            if (button && pageReferencesJobId(jobId)) {
                return { ready: true, button };
            }

            if (button && standaloneJobView && pageJobId === String(jobId)) {
                return { ready: true, button };
            }

            if (button && !findJobListScrollContainer()) {
                return { ready: true, button };
            }

            await sleep(300);
        }

        const button = readTopCardApplyButton();

        if (button) {
            return { ready: true, button };
        }

        const pageLabel = standaloneJobView ? 'job view page' : 'job detail panel';

        return { ready: false, button: null, error: `Apply button not found on ${pageLabel}.` };
    }

    async function waitForJobDetailReady(jobId) {
        const detail = await waitForJobDetailPanel(jobId);

        if (detail.ready) {
            return { success: true, jobId };
        }

        return {
            success: false,
            jobId,
            error: detail.error || `Job detail panel did not load for ${jobId}`,
        };
    }

    async function waitForApplyButton(timeoutMs = 10_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            await acceptCookieConsent().catch(() => {});
            await dismissSaveApplicationDialog().catch(() => {});

            const button = readTopCardApplyButton();

            if (button) {
                return button;
            }

            await sleep(250);
        }

        return null;
    }

    function collectJobCards() {
        if (typeof AutoCVApplyLinkedInParser !== 'undefined') {
            return AutoCVApplyLinkedInParser.parseLinkedInJobCards(document);
        }

        return [];
    }

    function findCookieConsentAlert() {
        const candidates = [
            ...document.querySelectorAll('.artdeco-global-alert--cookie_consent'),
            ...document.querySelectorAll('[data-test-global-alert]'),
        ];
        const seen = new Set();

        for (const alert of candidates) {
            if (!(alert instanceof HTMLElement) || seen.has(alert)) {
                continue;
            }

            seen.add(alert);

            if (!isElementVisible(alert)) {
                continue;
            }

            const text = normalize(alert.textContent || '');
            const isCookieConsent = alert.classList.contains('artdeco-global-alert--cookie_consent')
                || /cookie|privacy|respects your privacy/i.test(text);

            if (isCookieConsent) {
                return alert;
            }
        }

        return null;
    }

    async function acceptCookieConsent() {
        const alert = findCookieConsentAlert();

        if (!alert) {
            return { accepted: false };
        }

        const acceptButton = alert.querySelector('[data-test-global-alert-action="0"]');

        if (acceptButton instanceof HTMLElement) {
            clickElement(acceptButton);
            await sleep(500);

            return { accepted: true };
        }

        for (const button of alert.querySelectorAll('button')) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }

            if (/^accept$/i.test(normalize(button.textContent))) {
                clickElement(button);
                await sleep(500);

                return { accepted: true };
            }
        }

        return { accepted: false };
    }

    async function prepareJobSearch() {
        await acceptCookieConsent();

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
        const card = await revealJobCardById(jobId);

        if (!card) {
            return { success: false, error: `Job card not found: ${jobId}`, needsNavigation: true, jobId };
        }

        const clickable = card.querySelector([
            'a[href*="/jobs/view/"]',
            'a[href*="currentJobId="]',
            '.job-card-list__title-link',
            '.job-card-container__clickable',
            '.job-card-list__entity-lockup',
        ].join(', ')) || card;

        clickElement(clickable);

        const detail = await waitForJobDetailPanel(jobId);

        if (!detail.ready) {
            return { success: false, error: `Job detail panel did not load for ${jobId}`, needsNavigation: true, jobId };
        }

        return { success: true, jobId };
    }

    function readTopCardApplyButton() {
        const detailRoot = readApplyButtonSearchRoot();
        const button = readApplyButtonFromRoot(detailRoot);

        if (button) {
            return button;
        }

        if (isStandaloneJobViewPage()) {
            return readApplyButtonFromRoot(document);
        }

        return null;
    }

    function readEasyApplyModal() {
        for (const selector of MODAL_SELECTORS.split(', ')) {
            const match = queryVisible(selector);

            if (!match) {
                continue;
            }

            const modalRoot = match.closest('[data-test-modal], .jobs-easy-apply-modal, div[role="dialog"]') || match;

            if (isSaveApplicationDialog(modalRoot)) {
                continue;
            }

            if (selector.includes('role="dialog"') && !match.querySelector([
                '.jobs-easy-apply-content',
                '.jobs-easy-apply-modal__content',
                '.jobs-easy-apply-footer',
                'form',
            ].join(', '))) {
                const hasEasyApplyText = /\beasy\s+apply\b/i.test(match.textContent || '');

                if (!hasEasyApplyText) {
                    continue;
                }
            }

            return match.closest('[data-test-modal], .jobs-easy-apply-modal, div[role="dialog"]') || match;
        }

        return null;
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
            easyApply: isEasyApplyButtonLabel(label) || isEasyApplyApplyControl(button),
            alreadyApplied: /\bapplied\b/i.test(label) && !isEasyApplyButtonLabel(label),
            disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
        };
    }

    function isSaveApplicationDialog(modal) {
        if (!(modal instanceof HTMLElement)) {
            return false;
        }

        const titleText = normalize(
            modal.querySelector('[data-test-dialog-title], h2')?.textContent || '',
        );

        return /save this application/i.test(titleText);
    }

    function findSaveApplicationDialog() {
        const candidates = [
            ...document.querySelectorAll('[role="alertdialog"]'),
            ...document.querySelectorAll('.artdeco-modal--layer-confirmation'),
            ...document.querySelectorAll('[data-test-modal].artdeco-modal--layer-confirmation'),
        ];
        const seen = new Set();

        for (const modal of candidates) {
            if (!(modal instanceof HTMLElement) || seen.has(modal)) {
                continue;
            }

            seen.add(modal);

            if (!isElementVisible(modal) || !isSaveApplicationDialog(modal)) {
                continue;
            }

            return modal;
        }

        return null;
    }

    async function dismissSaveApplicationDialog() {
        const modal = findSaveApplicationDialog();

        if (!modal) {
            return { dismissed: false };
        }

        const discardButton = modal.querySelector('[data-test-dialog-secondary-btn]');
        const discardLabel = discardButton ? normalize(discardButton.textContent) : '';

        if (discardButton instanceof HTMLElement && /discard/i.test(discardLabel)) {
            clickElement(discardButton);
            await sleep(500);

            return { dismissed: true, action: 'discard' };
        }

        for (const button of modal.querySelectorAll('button')) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }

            if (/^discard$/i.test(normalize(button.textContent))) {
                clickElement(button);
                await sleep(500);

                return { dismissed: true, action: 'discard' };
            }
        }

        const closeButton = modal.querySelector('[data-test-modal-close-btn]')
            || modal.querySelector('button[aria-label="Dismiss"]')
            || modal.querySelector('.artdeco-modal__dismiss');

        if (closeButton instanceof HTMLElement) {
            clickElement(closeButton);
            await sleep(500);

            return { dismissed: true, action: 'dismiss-x' };
        }

        return { dismissed: false };
    }

    async function openEasyApplyFromControl(control) {
        clickElement(control);
        let modal = await waitForEasyApplyModal(10_000);

        if (modal) {
            return modal;
        }

        await dismissSaveApplicationDialog().catch(() => {});
        await dismissBlockingModal().catch(() => {});
        clickElement(control);
        modal = await waitForEasyApplyModal(6000);

        if (modal || !isAnchorElement(control)) {
            return modal;
        }

        const href = control.href || control.getAttribute('href') || '';

        if (!href.includes('openSDUIApplyFlow') && !href.includes('/apply/')) {
            return null;
        }

        if (control.getAttribute('aria-disabled') === 'true') {
            return null;
        }

        window.location.assign(href);
        modal = await waitForEasyApplyModal(12_000);

        return modal;
    }

    async function clickEasyApply() {
        await acceptCookieConsent();
        await dismissSaveApplicationDialog();
        await dismissBlockingModal().catch(() => {});

        const button = await waitForApplyButton();

        if (!button) {
            return {
                success: false,
                stage: 'button_missing',
                error: isStandaloneJobViewPage()
                    ? 'Apply button not found on job view page.'
                    : 'Apply button not found on job detail panel.',
            };
        }

        const state = readApplyButtonState(button);

        if (state.alreadyApplied) {
            return { success: false, alreadyApplied: true, error: 'Already applied to this job.' };
        }

        if (!state.easyApply) {
            return { success: false, easyApply: false, error: 'Job does not offer Easy Apply.' };
        }

        if (state.disabled) {
            return {
                success: false,
                stage: 'button_disabled',
                error: `${state.label || 'Easy Apply'} is disabled.`,
                applyButtonLabel: state.label,
            };
        }

        const modal = await openEasyApplyFromControl(button);

        if (!modal) {
            return {
                success: false,
                stage: 'modal_timeout',
                error: 'Easy Apply modal did not open.',
                applyButtonLabel: state.label,
                saveDialogPresent: Boolean(findSaveApplicationDialog()),
                blockingDialogCount: document.querySelectorAll('div[role="dialog"], div[role="alertdialog"]').length,
            };
        }

        return { success: true, easyApply: true, applyButtonLabel: state.label };
    }

    async function waitForEasyApplyModal(timeoutMs = 8000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            await acceptCookieConsent().catch(() => {});
            await dismissSaveApplicationDialog().catch(() => {});

            const modal = readEasyApplyModal();

            if (modal) {
                return modal;
            }

            await sleep(250);
        }

        return null;
    }

    function readModalFooterButtons(modal = readEasyApplyModal()) {
        if (!modal) {
            return [];
        }

        const footer = modal.querySelector('.jobs-easy-apply-footer, footer, .artdeco-modal__actionbar') || modal;

        return [...footer.querySelectorAll('button')].filter((button) => button instanceof HTMLElement);
    }

    function readButtonLabel(button) {
        return normalize(button.textContent || button.getAttribute('aria-label') || '');
    }

    function isButtonDisabled(button) {
        return button.disabled
            || button.getAttribute('aria-disabled') === 'true'
            || button.classList.contains('artdeco-button--disabled');
    }

    function findPrimaryActionButton(modal = readEasyApplyModal()) {
        if (!modal) {
            return null;
        }

        if (isApplicationSuccessScreen(modal)) {
            const doneButton = readModalFooterButtons(modal)
                .find((button) => /^done$/i.test(readButtonLabel(button)));

            if (doneButton) {
                return {
                    button: doneButton,
                    action: 'done',
                    label: readButtonLabel(doneButton),
                    disabled: isButtonDisabled(doneButton),
                };
            }
        }

        const buttons = readModalFooterButtons(modal);
        const candidates = [
            ...buttons.filter((button) => SUBMIT_PATTERN.test(readButtonLabel(button))),
            ...buttons.filter((button) => REVIEW_PATTERN.test(readButtonLabel(button))),
            ...buttons.filter((button) => NEXT_PATTERN.test(readButtonLabel(button))),
            ...modal.querySelectorAll('button[data-easy-apply-next-button], button[data-live-test-easy-apply-next-button], button[data-live-test-easy-apply-submit-button]'),
            ...modal.querySelectorAll('.jobs-easy-apply-footer .artdeco-button--primary, .artdeco-modal__actionbar .artdeco-button--primary'),
        ];

        const seen = new Set();

        for (const button of candidates) {
            if (!(button instanceof HTMLElement) || seen.has(button)) {
                continue;
            }

            seen.add(button);

            const label = readButtonLabel(button);

            if (!label) {
                continue;
            }

            let action = 'next';

            if (SUBMIT_PATTERN.test(label)) {
                action = 'submit';
            } else if (REVIEW_PATTERN.test(label)) {
                action = 'review';
            }

            return {
                button,
                action,
                label,
                disabled: isButtonDisabled(button),
            };
        }

        return null;
    }

    function readStepSectionTitle(modal) {
        if (!modal) {
            return null;
        }

        const sectionHeading = modal.querySelector(
            '.jobs-easy-apply-form-section__title, form h3.t-bold, form h3, .ph5 h3.t-bold, .ph5 h3',
        );

        if (sectionHeading?.textContent) {
            return normalize(sectionHeading.textContent);
        }

        for (const heading of modal.querySelectorAll('h3')) {
            const text = normalize(heading.textContent);

            if (text && !/^apply to /i.test(text)) {
                return text;
            }
        }

        return normalize(modal.querySelector('h2')?.textContent) || null;
    }

    function readStepFingerprint(modal = readEasyApplyModal()) {
        if (!modal) {
            return null;
        }

        const heading = readStepSectionTitle(modal) || '';
        const fieldCount = modal.querySelectorAll('input, textarea, select').length;
        const progress = normalize(modal.querySelector('.artdeco-stepper__indicator, .jpac-form-header')?.textContent);
        const primary = findPrimaryActionButton(modal);

        return `${heading}|${fieldCount}|${progress}|${primary?.action || 'none'}|${primary?.label || ''}`;
    }

    function readModalValidationErrors(modal = readEasyApplyModal()) {
        if (!modal) {
            return [];
        }

        const selectors = [
            '[data-test-form-element-error-messages] .artdeco-inline-feedback__message',
            '.artdeco-inline-feedback--error .artdeco-inline-feedback__message',
            '.artdeco-inline-feedback--error',
            '.artdeco-form-element__error-text',
            '[role="alert"]',
        ];

        const errors = [];

        for (const selector of selectors) {
            for (const node of modal.querySelectorAll(selector)) {
                if (!isElementVisible(node)) {
                    continue;
                }

                if (node.tagName?.toLowerCase() === 'select') {
                    continue;
                }

                if (node.closest('[hidden], [style*="display: none"], [style*="display:none"]')) {
                    continue;
                }

                const message = normalize(node.textContent);

                if (message.length >= 3 && message.length <= 240) {
                    errors.push(message);
                }
            }
        }

        return [...new Set(errors)];
    }

    function readInvalidFieldsFromModal(modal = readEasyApplyModal()) {
        if (!modal) {
            return [];
        }

        const fields = [];

        for (const errorRoot of modal.querySelectorAll('[data-test-form-element-error-messages]')) {
            if (!isElementVisible(errorRoot)) {
                continue;
            }

            const message = normalize(errorRoot.querySelector('.artdeco-inline-feedback__message')?.textContent || '');

            if (!message) {
                continue;
            }

            const formElement = errorRoot.closest('[data-test-form-element]');

            if (!formElement) {
                continue;
            }

            const labelEl = formElement.querySelector(
                '[data-test-single-typeahead-entity-form-title], [data-test-text-entity-list-form-title], .fb-dash-form-element__label, label',
            );
            const label = normalize(labelEl?.textContent || '');

            if (label.length < 3) {
                continue;
            }

            const control = formElement.querySelector('input[role="combobox"], select, textarea, input:not([type="hidden"])');
            const fieldType = control?.getAttribute('role') === 'combobox' || control?.tagName?.toLowerCase() === 'select'
                ? 'select'
                : 'text';

            fields.push({
                label,
                question: label,
                field_type: fieldType,
                dom: control?.id ? { id: control.id, input_id: control.id, role: control.getAttribute('role') || null } : null,
            });
        }

        return fields;
    }

    function prefillContactInfo(profileData) {
        const modal = readEasyApplyModal();

        if (!modal || typeof AutoCVApplyLinkedInEasyApplyFields === 'undefined') {
            return Promise.resolve({ filled: 0, success: false, skipped: true, errors: [] });
        }

        return AutoCVApplyLinkedInEasyApplyFields.fillContactInfoStep(modal, profileData);
    }

    function getEasyApplyModalState() {
        const modal = readEasyApplyModal();

        if (!modal) {
            return {
                open: false,
                canSubmit: false,
                canContinue: false,
                submitted: false,
                stepLabel: null,
                stepFingerprint: null,
                validationErrors: [],
            };
        }

        const submittedConfirmation = readApplicationSubmittedConfirmation(modal);

        if (submittedConfirmation) {
            const primary = findPrimaryActionButton(modal);

            return {
                open: true,
                submitted: true,
                confirmation: submittedConfirmation,
                canSubmit: false,
                canContinue: Boolean(primary && primary.action === 'done' && !primary.disabled),
                stepLabel: readStepSectionTitle(modal) || normalize(modal.querySelector('h2, h3')?.textContent) || null,
                submitLabel: null,
                actionLabel: primary?.label || null,
                action: primary?.action || 'done',
                actionDisabled: primary?.disabled || false,
                stepFingerprint: readStepFingerprint(modal),
                validationErrors: [],
            };
        }

        const primary = findPrimaryActionButton(modal);
        const validationErrors = readModalValidationErrors(modal);
        const invalidFields = readInvalidFieldsFromModal(modal);

        return {
            open: true,
            submitted: false,
            canSubmit: primary?.action === 'submit' && !primary.disabled,
            canContinue: Boolean(primary && primary.action !== 'submit' && !primary.disabled),
            stepLabel: readStepSectionTitle(modal) || normalize(modal.querySelector('h2, h3')?.textContent) || null,
            submitLabel: primary?.action === 'submit' ? primary.label : null,
            actionLabel: primary?.label || null,
            action: primary?.action || null,
            actionDisabled: primary?.disabled || false,
            stepFingerprint: readStepFingerprint(modal),
            validationErrors,
            invalidFields,
        };
    }

    async function waitForLoadingToSettle(modal, timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const spinner = modal.querySelector('.artdeco-loader, .jobs-loader, [data-test-loader]');

            if (!spinner || !isElementVisible(spinner)) {
                return;
            }

            await sleep(200);
        }
    }

    async function waitForStepTransition(previousFingerprint, timeoutMs = 10_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            await sleep(250);

            const modal = readEasyApplyModal();

            if (!modal) {
                return { transitioned: true, closed: true };
            }

            if (isApplicationSuccessScreen(modal)) {
                return {
                    transitioned: true,
                    closed: false,
                    submitted: true,
                    stepFingerprint: readStepFingerprint(modal),
                    confirmation: readApplicationSubmittedConfirmation(modal),
                };
            }

            await waitForLoadingToSettle(modal, 1000);

            const nextFingerprint = readStepFingerprint(modal);

            if (nextFingerprint !== previousFingerprint) {
                return { transitioned: true, closed: false, stepFingerprint: nextFingerprint };
            }
        }

        const modal = readEasyApplyModal();

        if (modal && isApplicationSuccessScreen(modal)) {
            return {
                transitioned: true,
                closed: false,
                submitted: true,
                stepFingerprint: readStepFingerprint(modal),
                confirmation: readApplicationSubmittedConfirmation(modal),
            };
        }

        return { transitioned: false, closed: false, stepFingerprint: readStepFingerprint() };
    }

    async function waitForSubmissionConfirmation(timeoutMs = 12_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const verify = verifySubmitted();

            if (verify.submitted) {
                return verify;
            }

            await sleep(250);
        }

        return verifySubmitted();
    }

    async function clickNextOrSubmit() {
        await acceptCookieConsent();
        await dismissSaveApplicationDialog();

        const modal = readEasyApplyModal();

        if (!modal) {
            return { success: false, error: 'Easy Apply modal is not open.' };
        }

        const existingConfirmation = readApplicationSubmittedConfirmation(modal);

        if (existingConfirmation) {
            return {
                success: true,
                transitioned: true,
                action: 'done',
                submitted: true,
                stepFingerprint: readStepFingerprint(modal),
                validationErrors: [],
                confirmation: existingConfirmation,
            };
        }

        await waitForLoadingToSettle(modal);

        const validationErrors = readModalValidationErrors(modal);
        const previousFingerprint = readStepFingerprint(modal);
        const primary = findPrimaryActionButton(modal);

        if (!primary) {
            return {
                success: false,
                error: 'No Next/Review/Submit button found in Easy Apply modal.',
                validationErrors,
                stepFingerprint: previousFingerprint,
            };
        }

        if (primary.disabled) {
            return {
                success: false,
                action: 'blocked',
                error: `${primary.label} is disabled.`,
                validationErrors,
                stepFingerprint: previousFingerprint,
            };
        }

        if (primary.action === 'done') {
            clickElement(primary.button);
            await sleep(500);

            const verify = verifySubmitted();

            return {
                success: true,
                transitioned: true,
                action: primary.action,
                submitted: verify.submitted,
                closed: !readEasyApplyModal(),
                stepFingerprint: readStepFingerprint(),
                validationErrors: readModalValidationErrors(),
                confirmation: verify.confirmation || readApplicationSubmittedConfirmation() || null,
            };
        }

        clickElement(primary.button);

        if (primary.action === 'submit') {
            const verify = await waitForSubmissionConfirmation();

            return {
                success: true,
                transitioned: verify.submitted,
                action: primary.action,
                submitted: verify.submitted,
                stepFingerprint: readStepFingerprint(),
                validationErrors: readModalValidationErrors(),
                confirmation: verify.confirmation || null,
            };
        }

        const transition = await waitForStepTransition(previousFingerprint);

        if (transition.submitted) {
            return {
                success: true,
                transitioned: true,
                action: primary.action,
                submitted: true,
                stepFingerprint: transition.stepFingerprint || readStepFingerprint(),
                validationErrors: readModalValidationErrors(),
                confirmation: transition.confirmation || readApplicationSubmittedConfirmation() || null,
            };
        }

        return {
            success: true,
            transitioned: transition.transitioned || transition.closed,
            action: primary.action,
            submitted: false,
            stepFingerprint: transition.stepFingerprint || readStepFingerprint(),
            validationErrors: readModalValidationErrors(),
            closed: transition.closed,
        };
    }

    function verifySubmitted() {
        const modal = readEasyApplyModal();
        const modalConfirmation = readApplicationSubmittedConfirmation(modal);

        if (modalConfirmation) {
            return {
                submitted: true,
                confirmation: modalConfirmation,
                modalOpen: Boolean(modal),
            };
        }

        const bodyText = normalize(document.body?.textContent || '');

        const successPatterns = [
            /application submitted/i,
            /application sent/i,
            /your application was sent/i,
            /thanks for applying/i,
        ];

        for (const pattern of successPatterns) {
            const match = bodyText.match(pattern);

            if (match) {
                return {
                    submitted: true,
                    confirmation: match[0],
                    modalOpen: Boolean(modal),
                };
            }
        }

        if (modal) {
            const modalText = normalize(modal.textContent || '');

            for (const pattern of successPatterns) {
                const match = modalText.match(pattern);

                if (match) {
                    return {
                        submitted: true,
                        confirmation: match[0],
                        modalOpen: true,
                    };
                }
            }

            return {
                submitted: false,
                modalOpen: true,
            };
        }

        const applyState = readApplyButtonState(readTopCardApplyButton());

        if (applyState.alreadyApplied) {
            return {
                submitted: true,
                confirmation: applyState.label || 'Applied',
                modalOpen: false,
            };
        }

        const toast = queryVisible([
            '.artdeco-toast-item--success',
            '[data-test-artdeco-toast-item-type="success"]',
        ].join(', '));

        if (toast) {
            return {
                submitted: true,
                confirmation: normalize(toast.textContent),
                modalOpen: false,
            };
        }

        return {
            submitted: false,
            modalOpen: false,
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
            await dismissSaveApplicationDialog();

            return { success: true, closed: true };
        }

        const saveDialogResult = await dismissSaveApplicationDialog();

        if (saveDialogResult.dismissed) {
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

    async function scanPageHealth(options = {}) {
        await acceptCookieConsent();

        if (typeof AutoCVApplyLinkedInPageHealth !== 'undefined') {
            return AutoCVApplyLinkedInPageHealth.scanPageHealth(options);
        }

        return {
            ok: true,
            issues: [],
            blocking: [],
            primary: null,
            url: window.location.href,
            timestamp: Date.now(),
        };
    }

    function findBlockedFieldControl(modal, { label, dom } = {}) {
        if (!modal) {
            return null;
        }

        if (dom?.id) {
            const byId = modal.querySelector(`#${CSS.escape(dom.id)}`);

            if (byId) {
                return byId;
            }
        }

        const normalizedLabel = normalize(label || '');

        if (!normalizedLabel) {
            return null;
        }

        for (const formElement of modal.querySelectorAll('[data-test-form-element]')) {
            const labelEl = formElement.querySelector(
                '[data-test-single-typeahead-entity-form-title], [data-test-text-entity-list-form-title], .fb-dash-form-element__label, label',
            );
            const candidateLabel = normalize(labelEl?.textContent || '');

            if (candidateLabel !== normalizedLabel) {
                continue;
            }

            return formElement.querySelector('input[role="combobox"], select, textarea, input:not([type="hidden"])');
        }

        return null;
    }

    function dispatchBubbledEvent(element, type) {
        const view = element.ownerDocument?.defaultView || window;
        const EventConstructor = view.Event || Event;

        element.dispatchEvent(new EventConstructor(type, { bubbles: true }));
    }

    async function validateBlockedFieldAfterFill({ label, dom } = {}) {
        const modal = readEasyApplyModal();

        if (!modal) {
            return {
                open: false,
                valid: true,
                validationError: null,
                ...getEasyApplyModalState(),
            };
        }

        const control = findBlockedFieldControl(modal, { label, dom });

        if (control) {
            control.focus();
            dispatchBubbledEvent(control, 'input');
            dispatchBubbledEvent(control, 'change');
            control.blur();
            await sleep(350);
        }

        const state = getEasyApplyModalState();

        return {
            ...state,
            valid: (state.validationErrors?.length || 0) === 0 && (state.invalidFields?.length || 0) === 0,
            validationError: state.validationErrors?.[0] || null,
        };
    }

    function readEasyApplyModalErrors() {
        const modal = readEasyApplyModal();

        if (!modal) {
            return [];
        }

        return readModalValidationErrors(modal);
    }

    async function dismissBlockingModal() {
        const easyApplyModal = readEasyApplyModal();

        if (easyApplyModal) {
            return { dismissed: false };
        }

        const modal = queryVisible([
            'div[role="alertdialog"]',
            'div[role="dialog"]',
        ].join(', '));

        if (!modal) {
            return { dismissed: false };
        }

        const dismiss = queryVisible([
            'button[aria-label="Dismiss"]',
            'button[aria-label="Close"]',
            '.artdeco-modal__dismiss',
        ].join(', '), modal);

        if (dismiss) {
            clickElement(dismiss);
            await sleep(500);

            return { dismissed: true };
        }

        return { dismissed: false };
    }

    function exportEasyApplyModalDebug() {
        const modal = readEasyApplyModal();

        return {
            html: modal?.outerHTML || null,
            diagnostics: {
                state: getEasyApplyModalState(),
                errors: readEasyApplyModalErrors(),
                stepFingerprint: readStepFingerprint(),
                saveDialogPresent: Boolean(findSaveApplicationDialog()),
            },
        };
    }

    return {
        collectJobCards,
        prepareJobSearch,
        selectJobById,
        revealJobCardById,
        findJobCardById,
        waitForJobDetailPanel,
        waitForJobDetailReady,
        clickEasyApply,
        getEasyApplyModalState,
        clickNextOrSubmit,
        verifySubmitted,
        closeEasyApplyModal,
        goToNextSearchPage,
        readTopCardApplyButton,
        readApplyButtonState,
        readEasyApplyModal,
        findPrimaryActionButton,
        readStepFingerprint,
        scanPageHealth,
        readEasyApplyModalErrors,
        prefillContactInfo,
        dismissBlockingModal,
        findSaveApplicationDialog,
        dismissSaveApplicationDialog,
        findCookieConsentAlert,
        acceptCookieConsent,
        exportEasyApplyModalDebug,
        validateBlockedFieldAfterFill,
    };
})();

if (typeof window !== 'undefined') {
    window.AutoCVApplyLinkedInAutoApply = AutoCVApplyLinkedInAutoApply;
}
