/**
 * Reed Apply DOM helpers for Auto Apply (content script global).
 */
var AutoCVApplyReedAutoApply = (() => {
    const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    function normalize(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function humanDelayMs(minMs, maxMs) {
        const min = Math.min(minMs, maxMs);
        const max = Math.max(minMs, maxMs);

        return min + Math.floor(Math.random() * (max - min + 1));
    }

    async function humanPause(minMs, maxMs) {
        if (typeof AutoCVApplyTiming !== 'undefined') {
            await AutoCVApplyTiming.humanPause(minMs, maxMs);

            return;
        }

        await sleep(humanDelayMs(minMs, maxMs));
    }

    function isReedHostname() {
        return /^(www\.)?reed\.co\.uk$/i.test(window.location.hostname);
    }

    function isReedSearchPage() {
        if (!isReedHostname() || !/^\/jobs\//i.test(window.location.pathname)) {
            return false;
        }

        if (/\/\d{5,}$/i.test(window.location.pathname) && !/-jobs/i.test(window.location.pathname)) {
            return false;
        }

        return /-jobs/i.test(window.location.pathname);
    }

    function isReedJobPage() {
        if (!isReedHostname()) {
            return false;
        }

        return /\/jobs\/[^/]+\/\d{5,}$/i.test(window.location.pathname);
    }

    function isReedApplySuccessPage() {
        if (!isReedHostname()) {
            return false;
        }

        return /\/application\/(?:success|confirmation)/i.test(window.location.pathname)
            || /\/jobs\/application\/success/i.test(window.location.pathname);
    }

    function isReedApplyFlowPage() {
        if (!isReedHostname()) {
            return false;
        }

        if (isReedApplySuccessPage()) {
            return false;
        }

        const path = window.location.pathname;

        // Job detail with an Apply button is NOT the apply flow - the Easy Apply
        // modal (or /jobs/apply route) must be open. Treating Apply-ready JD pages
        // as open made Draft All / advance run before the modal existed.
        return /^\/jobs\/apply\/\d+/i.test(path)
            || /^\/jobs\/application\/\d+/i.test(path)
            || /\/\d+\/apply$/i.test(path)
            || Boolean(document.querySelector('[data-qa="application-form"], form[data-qa="application-form"]'))
            || isReedApplyModalOpen();
    }

    function isReedApplyModalOpen() {
        const modal = document.querySelector('[data-qa="apply-job-modal"], [class*="apply-job-modal_modal"]');

        if (!(modal instanceof HTMLElement)) {
            return false;
        }

        if (isElementVisible(modal)) {
            return true;
        }

        return Boolean(modal.closest('.modal.show, .modal.d-block'))
            || modal.classList.contains('show')
            || modal.classList.contains('d-block')
            || modal.getAttribute('aria-hidden') === 'false';
    }

    /**
     * Reed's first Easy Apply step is often a profile + CV summary with
     * "Submit application" and no inventoriable inputs (About you / current CV).
     */
    function isReedApplicationSummaryStep() {
        const modal = document.querySelector('[data-qa="apply-job-modal"]');

        if (!(modal instanceof HTMLElement) || !isReedApplyModalOpen()) {
            return false;
        }

        const hasSubmit = Boolean(modal.querySelector('[data-qa="submit-application-btn"]'));
        const hasScreening = Boolean(modal.querySelector(
            '[data-qa="screening-questions-container"], '
            + '[class*="screening-questions_container"], '
            + '[id^="question-wrapper-"]',
        ));

        if (!hasSubmit || hasScreening) {
            return false;
        }

        return Boolean(modal.querySelector(
            '[data-qa="about-you-edit-btn"], '
            + '[data-qa="cv-name-card"], '
            + '[data-qa="UpdateCvBtn"], '
            + '[class*="about-you_card"]',
        ));
    }

    function hasReedApplyStepControls() {
        return Boolean(findSubmitButton() || findContinueButton())
            || Boolean(document.querySelector(
                '[data-qa="apply-job-modal"] [data-qa="screening-questions-container"], '
                + '[data-qa="apply-job-modal"] [id^="question-wrapper-"], '
                + '[data-qa="application-form"] input, '
                + '[data-qa="application-form"] textarea, '
                + '[data-qa="application-form"] select',
            ));
    }

    async function waitForApplyModalContent(timeoutMs = 12_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            if (!isReedApplyModalOpen()
                && !document.querySelector('[data-qa="application-form"], form[data-qa="application-form"]')) {
                await humanPause(350, 550);
                continue;
            }

            if (hasReedApplyStepControls() || isReedApplicationSummaryStep()) {
                return true;
            }

            await humanPause(350, 550);
        }

        return hasReedApplyStepControls() || isReedApplicationSummaryStep() || isReedApplyModalOpen();
    }

    function isEasyApplyHostPage() {
        return isReedApplyFlowPage();
    }

    function readJobIdFromUrl() {
        const queryJobId = new URLSearchParams(window.location.search).get('jobId');

        if (queryJobId && /^\d{5,}$/.test(queryJobId)) {
            return queryJobId;
        }

        const match = window.location.pathname.match(/\/jobs\/[^/]+\/(\d{5,})$/i)
            || window.location.pathname.match(/\/jobs\/apply\/(\d{5,})$/i)
            || window.location.pathname.match(/\/jobs\/application\/(\d{5,})$/i);

        return match?.[1] || null;
    }

    function readJobIdFromHref(href) {
        const match = String(href || '').match(/\/jobs\/[^/]+\/(\d{5,})(?:[/?#]|$)/i)
            || String(href || '').match(/\/jobs\/apply\/(\d{5,})(?:[/?#]|$)/i);

        return match?.[1] || null;
    }

    function isElementVisible(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        const style = window.getComputedStyle(element);

        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && element.getClientRects().length > 0;
    }

    async function scrollIntoViewHuman(element) {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        await humanPause(280, 520);
    }

    async function clickElement(element, { quick = false } = {}) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        if (!quick) {
            await scrollIntoViewHuman(element);
        }

        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        element.click();

        return true;
    }

    async function acceptCookieConsent() {
        const selectors = [
            '#onetrust-accept-btn-handler',
            'button[data-qa="acceptAllCookies"]',
            'button[data-qa="accept-cookies"]',
            'button[data-testid="accept-cookies"]',
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);

            if (button instanceof HTMLElement) {
                await clickElement(button, { quick: true });
                await humanPause(400, 700);

                return { accepted: true };
            }
        }

        for (const button of document.querySelectorAll('button')) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }

            const label = normalize(button.textContent);

            if (/^(accept all|accept cookies|allow all)$/i.test(label)) {
                await clickElement(button, { quick: true });
                await humanPause(400, 700);

                return { accepted: true };
            }
        }

        return { accepted: false };
    }

    function readCompanyFromCard(item) {
        const postedBy = item.querySelector('[data-qa="job-posted-by"]');
        const companyLink = postedBy?.querySelector('a');
        const company = normalize(companyLink?.textContent);

        if (company) {
            return company;
        }

        return normalize(
            item.querySelector('[data-qa="job-card-company-name"], [data-qa="company-name"]')?.textContent,
        ) || 'Unknown company';
    }

    function searchHasEasyApplyFilter() {
        return new URLSearchParams(window.location.search).get('filterEasilyApply') === 'true';
    }

    async function unhideJobCardsOnSearch(maxCards = 30) {
        if (!isReedSearchPage()) {
            return { success: false, unhidden: 0 };
        }

        let unhidden = 0;

        for (const button of document.querySelectorAll('[data-qa="UnhideJobBtn"]')) {
            if (!(button instanceof HTMLElement) || unhidden >= maxCards) {
                continue;
            }

            await clickElement(button);
            unhidden += 1;
            await humanPause(120, 220);
        }

        if (unhidden > 0) {
            await humanPause(500, 900);
        }

        return { success: unhidden > 0, unhidden };
    }

    function readJobCardsFromDocument() {
        const jobs = [];
        const seen = new Set();
        const onEasyApplySearch = searchHasEasyApplyFilter();

        for (const item of document.querySelectorAll('[data-qa="job-card"]')) {
            const dataId = item.getAttribute('data-id') || '';
            const jobId = dataId.replace(/^job/i, '') || null;
            const titleLink = item.querySelector('a[data-qa="job-card-title"]');
            const titleButton = item.querySelector('[data-qa="job-title-btn-wrapper"]');
            const href = titleLink?.getAttribute('href') || '';
            const resolvedJobId = jobId || readJobIdFromHref(href);

            if (!resolvedJobId || seen.has(resolvedJobId)) {
                continue;
            }

            const easyApplyBadge = Boolean(item.querySelector('[data-qa="badge-0-easyApply"], [data-qa*="easyApply"]'));

            if (!easyApplyBadge && !onEasyApplySearch) {
                continue;
            }

            const easyApply = easyApplyBadge || onEasyApplySearch;
            const cardText = normalize(item.textContent);
            const alreadyApplied = /\bapplied\b/i.test(cardText);

            seen.add(resolvedJobId);

            jobs.push({
                jobId: resolvedJobId,
                path: href.startsWith('/') ? href.split('?')[0] : null,
                title: normalize(titleLink?.textContent)
                    || normalize(titleButton?.textContent)
                    || normalize(item.querySelector('[data-qa="job-title-btn-wrapper"]')?.textContent)
                    || 'Unknown role',
                company: readCompanyFromCard(item),
                reedApply: easyApply,
                easyApply,
                alreadyApplied,
                url: href.startsWith('http') ? href : `https://www.reed.co.uk${href.split('?')[0]}`,
            });
        }

        return jobs;
    }

    function collectJobCards() {
        return readJobCardsFromDocument();
    }

    async function prepareJobSearch() {
        await acceptCookieConsent();
        await recoverSessionExpired().catch(() => {});

        if (readJobCardsFromDocument().length === 0) {
            await unhideJobCardsOnSearch();
        }

        const listRoot = document.querySelector('[data-qa="searchResultsList"], main');

        if (listRoot instanceof HTMLElement) {
            listRoot.scrollTop = Math.min(listRoot.scrollTop + listRoot.clientHeight * 0.5, listRoot.scrollHeight);
            await humanPause(400, 700);
        }

        return { success: true };
    }

    function findJobCardById(jobId) {
        const target = String(jobId).replace(/^job/i, '');

        for (const item of document.querySelectorAll('[data-qa="job-card"]')) {
            const dataId = item.getAttribute('data-id') || '';
            const id = dataId.replace(/^job/i, '') || readJobIdFromHref(
                item.querySelector('a[data-qa="job-card-title"]')?.getAttribute('href') || '',
            );

            if (id === target) {
                return item;
            }
        }

        return null;
    }

    async function selectJobById(jobId) {
        const target = String(jobId).replace(/^job/i, '');
        const card = findJobCardById(target);

        if (!card) {
            return {
                success: false,
                error: `Job card not found: ${target}`,
                needsNavigation: true,
                jobId: target,
            };
        }

        const link = card.querySelector('a[data-qa="job-card-title"]');
        const href = link?.getAttribute('href') || '';

        return {
            success: false,
            needsNavigation: true,
            jobId: target,
            path: href.startsWith('/') ? href.split('?')[0] : null,
        };
    }

    function readExternalApplyMarker() {
        const applyButton = document.querySelector('button[data-qa="apply-btn"]');

        if (applyButton instanceof HTMLElement && applyButton.classList.contains('redirectApply')) {
            return true;
        }

        const body = normalize(document.body?.textContent || '');

        return /open in new tab|apply on (?:the )?company website|external application/i.test(body);
    }

    async function waitForJobDetailReady(jobId, timeoutMs = 20_000) {
        const target = String(jobId).replace(/^job/i, '');
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const currentId = readJobIdFromUrl();

            if (currentId === target && (isReedJobPage() || readApplyButton())) {
                if (readExternalApplyMarker()) {
                    return {
                        success: false,
                        noReedApply: true,
                        error: 'Job uses external apply.',
                    };
                }

                return { success: true, jobId: target };
            }

            if (readExternalApplyMarker()) {
                return {
                    success: false,
                    noReedApply: true,
                    error: 'Job uses external apply.',
                };
            }

            await humanPause(400, 700);
        }

        return {
            success: false,
            jobUnavailable: true,
            error: `Job detail not ready for ${target}`,
        };
    }

    let lastJobViewPrepareAt = 0;

    async function prepareJobView({ force = false, light = false } = {}) {
        const now = Date.now();

        if (!force && now - lastJobViewPrepareAt < 3000) {
            return { success: true, skipped: true };
        }

        lastJobViewPrepareAt = now;

        if (!light) {
            await acceptCookieConsent();
        }

        await recoverSessionExpired().catch(() => {});

        const applyButton = readApplyButton();

        if (applyButton instanceof HTMLElement) {
            await scrollIntoViewHuman(applyButton);

            return { success: true };
        }

        const description = document.querySelector('[data-qa="job-description"]');

        if (description instanceof HTMLElement) {
            await scrollIntoViewHuman(description);
        }

        return { success: true };
    }

    function readApplyButton() {
        const button = document.querySelector('button[data-qa="apply-btn"]');

        if (!(button instanceof HTMLElement) || button.disabled) {
            return null;
        }

        if (button.classList.contains('redirectApply')) {
            return null;
        }

        const label = normalize(button.textContent);

        if (/unavailable|expired|closed/i.test(label)) {
            return null;
        }

        return isElementVisible(button) ? button : null;
    }

    async function clickReedApply() {
        await prepareJobView({ force: true });

        if (readExternalApplyMarker()) {
            return {
                success: false,
                reedApply: false,
                error: 'Job uses external apply, not Reed Easy Apply.',
            };
        }

        if (isReedApplyModalOpen() || document.querySelector('[data-qa="application-form"], form[data-qa="application-form"]')) {
            const contentReady = await waitForApplyModalContent(8_000);

            return {
                success: contentReady || isReedApplyModalOpen(),
                reedApply: true,
                alreadyOpen: true,
                contentReady,
            };
        }

        const applyButton = readApplyButton();

        if (!(applyButton instanceof HTMLElement)) {
            return { success: false, error: 'Reed Easy Apply button not found on job page.' };
        }

        await clickElement(applyButton);

        const deadline = Date.now() + 12_000;

        while (Date.now() < deadline) {
            const href = String(window.location.href || '');

            if (
                /^https:\/\/secure\.reed\.co\.uk\//i.test(href)
                || /\/authentication\/login/i.test(href)
            ) {
                return {
                    success: false,
                    loginRequired: true,
                    error: 'Reed sign-in required to apply.',
                };
            }

            if (isReedApplyModalOpen()
                || document.querySelector('[data-qa="application-form"], form[data-qa="application-form"]')) {
                const contentReady = await waitForApplyModalContent(8_000);

                return {
                    success: true,
                    reedApply: true,
                    navigating: false,
                    contentReady,
                };
            }

            await humanPause(350, 550);
        }

        return {
            success: false,
            error: 'Reed application modal did not open after clicking Apply.',
        };
    }

    function readApplyRoot() {
        if (isReedApplyModalOpen()) {
            return document.querySelector('[data-qa="apply-job-modal"], [class*="apply-job-modal_modal"]')
                || document;
        }

        return document.querySelector('[data-qa="application-form"], form[data-qa="application-form"], form')
            || document;
    }

    async function ensureApplyModalOpen() {
        if (isReedApplyModalOpen()) {
            return { success: true, alreadyOpen: true };
        }

        const applyButton = readApplyButton();

        if (!(applyButton instanceof HTMLElement)) {
            return { success: false, error: 'Apply now button not found.' };
        }

        await clickElement(applyButton);

        const deadline = Date.now() + 12_000;

        while (Date.now() < deadline) {
            if (isReedApplyModalOpen()) {
                return { success: true };
            }

            await humanPause(350, 550);
        }

        return { success: false, error: 'Reed application modal did not open.' };
    }

    function readStepLabel() {
        const modal = document.querySelector('[data-qa="apply-job-modal"]');

        if (modal instanceof HTMLElement) {
            const modalTitle = modal.querySelector('h3, h2, [data-qa="application-step-title"]');
            const title = normalize(modalTitle?.textContent);

            if (title) {
                return title;
            }

            if (modal.querySelector('[data-qa="screening-questions-container"], .screening-questions_container__PaYsQ')) {
                return 'Application questions';
            }
        }

        const applyTitle = document.querySelector('[data-qa="application-step-title"], [data-qa="application-form-title"]');

        if (applyTitle) {
            return normalize(applyTitle.textContent);
        }

        if (isReedJobPage()) {
            return null;
        }

        const candidates = document.querySelectorAll('h1, h2');

        for (const heading of candidates) {
            if (heading.closest('[data-qa="cookie-banner"], .modal')) {
                continue;
            }

            const label = normalize(heading.textContent);

            if (!label || /session expired|cookie preferences/i.test(label)) {
                continue;
            }

            return label;
        }

        return null;
    }

    function readActiveScreeningQuestionKey() {
        const wrapper = document.querySelector('[id^="question-wrapper-"]');

        if (wrapper instanceof HTMLElement) {
            const title = normalize(
                wrapper.querySelector('[class*="questions_title"]')?.textContent || '',
            );

            return [wrapper.id, title].filter(Boolean).join('|');
        }

        const progress = document.querySelector(
            '[data-qa="progress-bar"][role="progressbar"], [data-qa="screening-questions-container"] [role="progressbar"]',
        );
        const progressValue = progress?.getAttribute('aria-valuenow') || '';
        const field = document.querySelector(
            '[data-qa="screening-questions-container"] input:not([type="hidden"]), '
            + '[data-qa="screening-questions-container"] textarea, '
            + '[data-qa="screening-questions-container"] select, '
            + '.screening-questions_container__PaYsQ input:not([type="hidden"]), '
            + '.screening-questions_container__PaYsQ textarea, '
            + '.screening-questions_container__PaYsQ select',
        );

        return [progressValue, field?.id || field?.name || ''].filter(Boolean).join('|');
    }

    function readStepFingerprint() {
        const label = readStepLabel() || 'unknown';
        const slug = window.location.pathname.split('/').filter(Boolean).slice(-2).join('/');
        const questionKey = readActiveScreeningQuestionKey();

        return questionKey ? `${slug}|${label}|${questionKey}` : `${slug}|${label}`;
    }

    function readValidationErrors() {
        const errors = [];
        const seen = new Set();

        for (const node of document.querySelectorAll('[data-qa*="error"], [role="alert"], .invalid-feedback, [aria-invalid="true"]')) {
            const text = normalize(node.getAttribute('aria-label') || node.textContent);

            if (!text || seen.has(text)) {
                continue;
            }

            seen.add(text);
            errors.push(text);
        }

        return errors.slice(0, 8);
    }

    function findContinueButton() {
        const scopes = [readApplyRoot(), document];

        for (const scope of scopes) {
            for (const testId of ['continue-button', 'next-button', 'save-and-continue-button']) {
                const byTestId = scope.querySelector(`[data-qa="${testId}"], [data-testid="${testId}"]`);

                if (byTestId instanceof HTMLElement && !byTestId.disabled) {
                    return byTestId;
                }
            }

            for (const button of scope.querySelectorAll('button, [role="button"]')) {
                if (!(button instanceof HTMLElement) || button.disabled) {
                    continue;
                }

                // Reed Easy Apply lives in a Bootstrap modal - do not skip .modal.
                if (button.closest('nav, header')) {
                    continue;
                }

                const label = normalize(button.getAttribute('aria-label') || button.textContent);

                if (/^(continue|next|save and continue)$/i.test(label) || /\bcontinue\b/i.test(label)) {
                    return button;
                }
            }
        }

        return null;
    }

    function isReedApplySubmitPage() {
        return /^\/jobs\/apply\/\d+/i.test(window.location.pathname);
    }

    function findSubmitButton() {
        const modal = document.querySelector('[data-qa="apply-job-modal"]');

        if (modal instanceof HTMLElement) {
            const modalSubmit = modal.querySelector('[data-qa="submit-application-btn"]');

            if (modalSubmit instanceof HTMLElement && !modalSubmit.disabled && isElementVisible(modalSubmit)) {
                return modalSubmit;
            }

            for (const button of modal.querySelectorAll('button, [role="button"], input[type="submit"]')) {
                if (!(button instanceof HTMLElement) || button.disabled || !isElementVisible(button)) {
                    continue;
                }

                if (button.closest('header, .modal-header')) {
                    continue;
                }

                const label = normalize(
                    button.getAttribute('aria-label')
                    || button.getAttribute('value')
                    || button.textContent,
                );

                // Reed screening Continue is often button[type=submit].btn-primary - never
                // treat Continue/Next as the application Submit control.
                if (/^(continue|next|save and continue|back)$/i.test(label)) {
                    continue;
                }

                if (/^(submit|send application|submit application)$/i.test(label)
                    || button.matches('[data-qa="submit-application-btn"]')) {
                    return button;
                }
            }
        }

        const modalSubmit = document.querySelector('button[data-qa="submit-application-btn"]');

        if (modalSubmit instanceof HTMLElement && !modalSubmit.disabled) {
            return modalSubmit;
        }

        // Full-page apply route only - never the job-detail Apply now control.
        if (isReedApplySubmitPage()) {
            const applyBtn = document.querySelector('button[data-qa="apply-btn"]:not(.redirectApply)');

            if (applyBtn instanceof HTMLElement && !applyBtn.disabled && isElementVisible(applyBtn)) {
                return applyBtn;
            }
        }

        const scopes = [readApplyRoot(), document];

        for (const scope of scopes) {
            for (const testId of ['submit-button', 'submit-application-button', 'send-application-button', 'apply-button']) {
                const byTestId = scope.querySelector(`[data-qa="${testId}"], [data-testid="${testId}"]`);

                if (byTestId instanceof HTMLElement && !byTestId.disabled && !byTestId.classList.contains('redirectApply')) {
                    return byTestId;
                }
            }

            for (const button of scope.querySelectorAll('button, [role="button"]')) {
                if (!(button instanceof HTMLElement) || button.disabled) {
                    continue;
                }

                if (button.matches('[data-qa="apply-btn"]')) {
                    continue;
                }

                // Reed Easy Apply lives in a Bootstrap modal - do not skip .modal.
                if (button.closest('nav, header')) {
                    continue;
                }

                const label = normalize(button.getAttribute('aria-label') || button.textContent);

                if (/^(submit|send application|submit application)$/i.test(label)
                    || (/\bsubmit\b/i.test(label) && !/^apply now$/i.test(label))) {
                    return button;
                }
            }
        }

        return null;
    }

    function getReedApplyState() {
        const verify = verifySubmitted();

        if (verify.submitted) {
            return {
                open: false,
                submitted: true,
                canContinue: false,
                canSubmit: false,
                stepLabel: 'Application submitted',
                stepFingerprint: 'submitted',
                validationErrors: [],
                isReviewStep: false,
            };
        }

        const onApplyFlow = isReedApplyFlowPage();
        const open = onApplyFlow;

        if (!open) {
            const verify = verifySubmitted();

            return {
                open: false,
                submitted: verify.submitted,
                canContinue: false,
                canSubmit: false,
                stepLabel: null,
                stepFingerprint: null,
                validationErrors: [],
                isReviewStep: false,
            };
        }

        const submitButton = findSubmitButton();
        const continueButton = findContinueButton();
        const validationErrors = readValidationErrors();
        const label = readStepLabel();
        const summaryStep = isReedApplicationSummaryStep();
        const isReviewStep = summaryStep
            || /review|check your application|summary/i.test(label || '')
            || Boolean(document.querySelector('[data-qa="application-review-summary"]'));

        return {
            open: true,
            modalOpen: isReedApplyModalOpen(),
            submitted: false,
            canContinue: Boolean(continueButton) && !isReviewStep,
            canSubmit: Boolean(submitButton) || isReviewStep,
            hasSubmitButton: Boolean(submitButton),
            stepLabel: label || (summaryStep ? 'Application' : null),
            actionLabel: submitButton ? normalize(submitButton.textContent) : (continueButton ? normalize(continueButton.textContent) : null),
            stepFingerprint: readStepFingerprint(),
            validationErrors,
            isReviewStep,
            contentReady: hasReedApplyStepControls() || summaryStep,
        };
    }

    function readAppliedConfirmationText() {
        // Prefer applied UI chrome over full body text - job descriptions can
        // contain phrases like "successfully applied" that are not confirmations.
        const markerRoots = [
            document.querySelector('[class*="job-applied-card"]'),
            document.querySelector('[data-qa="applied-btn"], [data-qa*="applied-label"], [data-qa="job-applied"]'),
            document.querySelector('[data-qa="job-actions"], [data-qa="apply-section"], .job-actions'),
            document.querySelector('[data-qa="apply-job-modal"]'),
            document.querySelector('main, [role="main"]'),
        ].filter((node) => node instanceof HTMLElement);

        const pattern = /(?:application (?:has been )?submitted|thank you for applying|we received your application|your application has been sent|you have applied|you applied(?: for this job)?|application complete|application submitted|already applied)/i;

        for (const root of markerRoots) {
            const match = normalize(root.textContent).match(pattern);

            if (match) {
                return match;
            }
        }

        if (isReedApplySuccessPage()) {
            return normalize(document.body?.textContent || '').match(pattern);
        }

        return null;
    }

    function hasAppliedUiMarker() {
        if (readAppliedConfirmationText()) {
            return true;
        }

        if (document.querySelector('[data-qa="applied-btn"], [data-qa*="applied-label"], [data-qa="job-applied"], [class*="job-applied-card"]')) {
            return true;
        }

        const applySection = document.querySelector('[data-qa="job-actions"], [data-qa="apply-section"], .job-actions');

        if (applySection instanceof HTMLElement && /\byou applied\b|\balready applied\b/i.test(normalize(applySection.textContent))) {
            return true;
        }

        for (const applyButton of document.querySelectorAll(
            'button[data-qa="apply-btn"], [data-qa="apply-btn"], button[data-qa*="applied"]',
        )) {
            if (!(applyButton instanceof HTMLElement)) {
                continue;
            }

            const label = normalize(applyButton.textContent || applyButton.getAttribute('aria-label') || '');

            if (/^(applied|you applied|already applied)$/i.test(label) || /\byou applied\b/i.test(label)) {
                return true;
            }

            if (applyButton.disabled && /\bapplied\b/i.test(label)) {
                return true;
            }
        }

        return false;
    }

    function verifySubmitted() {
        if (isReedApplySuccessPage()) {
            return {
                submitted: true,
                confirmation: 'Reed application confirmation page',
            };
        }

        const confirmation = readAppliedConfirmationText();

        if (confirmation || hasAppliedUiMarker()) {
            return {
                submitted: true,
                confirmation: confirmation?.[0] || 'Reed application submitted',
            };
        }

        if (isReedApplySubmitPage() && !isReedApplyModalOpen()) {
            const applyButton = document.querySelector('button[data-qa="apply-btn"]:not(.redirectApply)');

            if (applyButton instanceof HTMLElement && isElementVisible(applyButton)) {
                return {
                    submitted: false,
                    confirmation: null,
                };
            }

            return {
                submitted: true,
                confirmation: 'Reed application modal closed after submit',
            };
        }

        return {
            submitted: false,
            confirmation: null,
        };
    }

    async function clickContinueOrSubmit() {
        await acceptCookieConsent();
        await recoverSessionExpired().catch(() => {});

        const existing = verifySubmitted();

        if (existing.submitted) {
            return {
                success: true,
                action: 'submit',
                submitted: true,
                transitioned: true,
                stepFingerprint: readStepFingerprint(),
                validationErrors: [],
                confirmation: existing.confirmation,
            };
        }

        if (!isReedApplyModalOpen() && readApplyButton()) {
            const modalResult = await ensureApplyModalOpen();

            if (!modalResult.success) {
                return {
                    success: false,
                    action: 'blocked',
                    submitted: false,
                    transitioned: false,
                    stepFingerprint: readStepFingerprint(),
                    validationErrors: readValidationErrors(),
                    error: modalResult.error || 'Could not open Reed application modal.',
                };
            }
        }

        const validationErrors = readValidationErrors();
        const previousFingerprint = readStepFingerprint();
        const submitButton = findSubmitButton();
        const continueButton = findContinueButton();
        const stepLabel = readStepLabel() || '';
        const isReview = isReedApplicationSummaryStep()
            || /review|check your application|summary/i.test(stepLabel);

        if (submitButton && (isReview || !continueButton)) {
            await clickElement(submitButton);
            // Do not wait long here - tab messaging times out around 20s. The
            // orchestrator polls VERIFY_SUBMITTED after ADVANCE returns.
            await humanPause(500, 900);
            const verify = verifySubmitted();

            return {
                success: true,
                action: 'submit',
                submitted: verify.submitted,
                pendingConfirmation: !verify.submitted,
                transitioned: true,
                stepFingerprint: readStepFingerprint(),
                validationErrors: verify.submitted ? [] : readValidationErrors(),
                confirmation: verify.confirmation,
            };
        }

        if (continueButton) {
            await clickElement(continueButton);
            await humanPause(650, 1100);

            // Reed screening Continue is often type=submit. On the final step that
            // posts the application and closes the modal - treat as submit so the
            // orchestrator waits for confirmation instead of counting a failed continue.
            const resolveContinueAsSubmit = () => {
                const verifyAfterContinue = verifySubmitted();

                if (verifyAfterContinue.submitted) {
                    return {
                        success: true,
                        action: 'submit',
                        submitted: true,
                        pendingConfirmation: false,
                        transitioned: true,
                        stepFingerprint: 'submitted',
                        validationErrors: [],
                        confirmation: verifyAfterContinue.confirmation,
                    };
                }

                if (!isReedApplyModalOpen()) {
                    return {
                        success: true,
                        action: 'submit',
                        submitted: false,
                        pendingConfirmation: true,
                        transitioned: true,
                        stepFingerprint: readStepFingerprint(),
                        validationErrors: readValidationErrors(),
                        confirmation: null,
                    };
                }

                return null;
            };

            let continueAsSubmit = resolveContinueAsSubmit();

            if (continueAsSubmit) {
                return continueAsSubmit;
            }

            // Modal close can lag the Continue click by a beat.
            await humanPause(500, 900);
            continueAsSubmit = resolveContinueAsSubmit();

            if (continueAsSubmit) {
                return continueAsSubmit;
            }

            let nextFingerprint = readStepFingerprint();
            let transitioned = nextFingerprint !== previousFingerprint;
            let validationErrorsAfter = readValidationErrors();

            // One-question-per-step screening keeps the same modal title; wait briefly
            // for the question wrapper / progress bar to swap before failing.
            if (!transitioned && validationErrorsAfter.length === 0) {
                await humanPause(450, 800);
                nextFingerprint = readStepFingerprint();
                transitioned = nextFingerprint !== previousFingerprint;
                validationErrorsAfter = readValidationErrors();
            }

            return {
                success: transitioned,
                action: 'continue',
                submitted: false,
                transitioned,
                stepFingerprint: nextFingerprint,
                validationErrors: validationErrorsAfter,
                error: transitioned ? undefined : 'Reed Apply step did not change after Continue.',
            };
        }

        return {
            success: false,
            action: 'blocked',
            submitted: false,
            transitioned: false,
            stepFingerprint: previousFingerprint,
            validationErrors,
            error: validationErrors[0] || 'No Continue or Submit control found on Reed Apply step.',
        };
    }

    async function goToNextSearchPage() {
        const nextLink = document.querySelector('a[data-qa="rel-page-next"], a[rel="next"]');

        if (!(nextLink instanceof HTMLElement)) {
            return { success: false, error: 'No next search page link found.' };
        }

        await clickElement(nextLink);
        await humanPause(800, 1300);

        return { success: true };
    }

    function isSessionExpiredModalVisible() {
        for (const dialog of document.querySelectorAll('[role="dialog"], .modal[data-modal="true"]')) {
            if (!(dialog instanceof HTMLElement) || !isElementVisible(dialog)) {
                continue;
            }

            const header = dialog.querySelector('.modal-header h2, header h2, h2');

            if (/session expired/i.test(header?.textContent || '')) {
                return true;
            }
        }

        return false;
    }

    async function recoverSessionExpired() {
        if (!isSessionExpiredModalVisible()) {
            return { recovered: false };
        }

        for (const button of document.querySelectorAll('[role="dialog"] button, .modal button')) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }

            if (/^refresh$/i.test(normalize(button.textContent))) {
                await clickElement(button);
                await humanPause(1200, 2000);

                return { recovered: true, method: 'refresh_button' };
            }
        }

        window.location.reload();

        return { recovered: true, method: 'reload' };
    }

    async function scanPageHealth() {
        await acceptCookieConsent();
        await recoverSessionExpired().catch(() => {});

        if (isSessionExpiredModalVisible()) {
            return {
                ok: false,
                issues: [{ code: 'session_expired', message: 'Reed session expired - refresh required.' }],
                blocking: [{ code: 'session_expired', message: 'Reed session expired - refresh required.' }],
                primary: { code: 'session_expired', message: 'Reed session expired - refresh required.' },
            };
        }

        const href = String(window.location.href || '');
        const onSecureLogin = /^https:\/\/secure\.reed\.co\.uk\//i.test(href)
            || /\/authentication\/login/i.test(href)
            || /signin_email|Sign in - reed/i.test(document.title || '');

        if (onSecureLogin) {
            return {
                ok: false,
                issues: [{ code: 'login_required', message: 'Reed sign-in required to apply.' }],
                blocking: [{ code: 'login_required', message: 'Reed sign-in required to apply.' }],
                primary: { code: 'login_required', message: 'Reed sign-in required to apply.' },
            };
        }

        const onApplyFlow = isReedApplyFlowPage();
        const signInWall = onApplyFlow && isElementVisible(
            document.querySelector('[data-qa="sign-in-to-apply"], a[href*="authentication/login"]'),
        );

        if (signInWall && /sign in to apply|log in to apply/i.test(document.body?.textContent || '')) {
            return {
                ok: false,
                issues: [{ code: 'login_required', message: 'Reed sign-in required to apply.' }],
                blocking: [{ code: 'login_required', message: 'Reed sign-in required to apply.' }],
                primary: { code: 'login_required', message: 'Reed sign-in required to apply.' },
            };
        }

        return { ok: true, issues: [], blocking: [], primary: null };
    }

    function readJobDescriptionText() {
        const selectors = [
            '[data-qa="job-description"]',
            '.job-description_jobDescription__26ney',
            '[class*="jobDescription"]',
        ];

        let best = '';

        for (const selector of selectors) {
            for (const node of document.querySelectorAll(selector)) {
                const text = normalize(node.textContent);

                if (text.length > best.length) {
                    best = text;
                }
            }
        }

        return best.slice(0, 20000);
    }

    async function waitForJobDescriptionReady(minLength = 200, timeoutMs = 20_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            await prepareJobView({ light: true }).catch(() => {});
            const text = readJobDescriptionText();

            if (text.length >= minLength) {
                return { ready: true, length: text.length };
            }

            await humanPause(500, 900);
        }

        return { ready: false, length: readJobDescriptionText().length };
    }

    return {
        acceptCookieConsent,
        prepareJobSearch,
        prepareJobView,
        collectJobCards,
        selectJobById,
        waitForJobDetailReady,
        readJobDescriptionText,
        waitForJobDescriptionReady,
        clickReedApply,
        getReedApplyState,
        clickContinueOrSubmit,
        verifySubmitted,
        goToNextSearchPage,
        scanPageHealth,
        isReedApplyFlowPage,
        isReedApplicationSummaryStep,
        isReedApplyModalOpen,
        isReedSearchPage,
        isReedJobPage,
        isEasyApplyHostPage,
        findJobCardById,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyReedAutoApply = AutoCVApplyReedAutoApply;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyReedAutoApply = AutoCVApplyReedAutoApply;
}
