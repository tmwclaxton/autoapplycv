/**
 * CV-Library Easy Apply DOM helpers for Auto Apply (content script global).
 */
const AutoCVApplyCvLibraryAutoApply = (() => {
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

    function isCvLibraryHostname() {
        return /(^|\.)cv-library\.co\.uk$/i.test(window.location.hostname);
    }

    function isCvLibraryJobPage() {
        return isCvLibraryHostname()
            && /^\/job\/\d+\//i.test(window.location.pathname);
    }

    function isCvLibraryApplyPage() {
        return isCvLibraryHostname()
            && /^\/job\/apply\/\d+/i.test(window.location.pathname);
    }

    function isCvLibraryConfirmPage() {
        return isCvLibraryHostname()
            && /^\/job\/apply\/\d+\/confirm\/?$/i.test(window.location.pathname);
    }

    function isPreviouslyAppliedStepLabel(label = readStepLabel()) {
        return /you previously applied|already applied for this/i.test(String(label || ''));
    }

    function matchesSubmissionConfirmation(text) {
        return /(?:application (?:has been )?sent|application (?:has been )?submitted|thank you for applying|we received your application|your application has been sent|you have applied|application complete|^success!?$)/i
            .test(String(text || '').trim());
    }

    function isCvLibraryLoginPage() {
        return isCvLibraryHostname()
            && /^\/login$/i.test(window.location.pathname);
    }

    function readJobIdFromHref(href) {
        const match = String(href || '').match(/\/job\/(\d{5,})(?:\/|$|\?)/i)
            || String(href || '').match(/\/job\/apply\/(\d{5,})(?:[/?#]|$)/i)
            || String(href || '').match(/[?&]jobId=(\d{5,})/i);

        return match?.[1] || null;
    }

    function readJobIdFromUrl() {
        const queryJobId = new URLSearchParams(window.location.search).get('jobId');

        if (queryJobId && /^\d{5,}$/.test(queryJobId)) {
            return queryJobId;
        }

        const match = window.location.pathname.match(/\/job\/(\d{5,})(?:\/|$)/i)
            || window.location.pathname.match(/\/job\/apply\/(\d{5,})/i);

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
            'button[data-qa="accept-all-cookies"]',
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

    function readJobCardRoot(titleLink) {
        return titleLink?.closest('[class*="JobCard_job"]')
            || titleLink?.closest('[itemtype="https://schema.org/ListItem"]')
            || titleLink?.parentElement?.parentElement?.parentElement;
    }

    function cardHasEasyApply(card) {
        if (!(card instanceof HTMLElement)) {
            return false;
        }

        if (card.querySelector('[data-qa="easy-apply-chip"]')) {
            return true;
        }

        return /\beasy apply\b/i.test(normalize(card.textContent));
    }

    function cardIsExternalApply(card) {
        if (!(card instanceof HTMLElement)) {
            return false;
        }

        const applyLink = card.querySelector('a[data-qa="type-apply-now"]');

        if (!(applyLink instanceof HTMLElement)) {
            return false;
        }

        const html = applyLink.innerHTML || '';

        return /external-apply/i.test(html);
    }

    function readCompanyFromCard(card) {
        const company = normalize(card.querySelector('[data-qa^="job-card-company-link"]')?.textContent)
            || normalize(card.querySelector('a[data-qa="company-name-link"]')?.textContent);

        return company || 'Unknown company';
    }

    function readJobCardsFromDocument({ easyApplyOnly = true } = {}) {
        const jobs = [];
        const seen = new Set();

        for (const titleLink of document.querySelectorAll('a[data-qa="job-title-link"]')) {
            const card = readJobCardRoot(titleLink);

            if (!(card instanceof HTMLElement)) {
                continue;
            }

            const href = titleLink.getAttribute('href') || '';
            const jobId = readJobIdFromHref(href);

            if (!jobId || seen.has(jobId)) {
                continue;
            }

            const easyApply = cardHasEasyApply(card);
            const externalApply = cardIsExternalApply(card);

            if (easyApplyOnly && (!easyApply || externalApply)) {
                continue;
            }

            seen.add(jobId);

            const title = normalize(titleLink.textContent) || 'Unknown role';
            const company = readCompanyFromCard(card);
            const cardText = normalize(card.textContent);
            const alreadyApplied = /\bapplied\b/i.test(cardText);

            jobs.push({
                jobId,
                path: href.startsWith('/') ? href.split('?')[0] : null,
                title,
                company,
                cvLibraryApply: easyApply && !externalApply,
                easyApply: easyApply && !externalApply,
                alreadyApplied,
                url: href.startsWith('http') ? href.split('?')[0] : `https://www.cv-library.co.uk${href.split('?')[0]}`,
            });
        }

        return jobs;
    }

    function collectJobCards() {
        const easyApplyJobs = readJobCardsFromDocument({ easyApplyOnly: true });

        if (easyApplyJobs.length > 0) {
            return easyApplyJobs;
        }

        return readJobCardsFromDocument({ easyApplyOnly: false })
            .filter((job) => job.easyApply);
    }

    async function prepareJobSearch() {
        await acceptCookieConsent();

        const deadline = Date.now() + 25_000;

        while (Date.now() < deadline) {
            const cards = document.querySelectorAll('a[data-qa="job-title-link"]').length;
            const easyApplyCount = readJobCardsFromDocument({ easyApplyOnly: true }).length;

            if (cards >= 3 && easyApplyCount > 0) {
                return { success: true, cardCount: cards, easyApplyCount };
            }

            window.scrollBy({ top: 700, behavior: 'smooth' });
            await humanPause(600, 900);
        }

        return {
            success: document.querySelectorAll('a[data-qa="job-title-link"]').length > 0,
            cardCount: document.querySelectorAll('a[data-qa="job-title-link"]').length,
            easyApplyCount: readJobCardsFromDocument({ easyApplyOnly: true }).length,
        };
    }

    function findJobCardById(jobId) {
        const target = String(jobId || '').trim();

        for (const titleLink of document.querySelectorAll('a[data-qa="job-title-link"]')) {
            const href = titleLink.getAttribute('href') || '';
            const cardJobId = readJobIdFromHref(href);

            if (cardJobId === target) {
                return { card: readJobCardRoot(titleLink), titleLink };
            }
        }

        return null;
    }

    async function selectJobById(jobId) {
        const match = findJobCardById(jobId);

        if (!match?.titleLink) {
            return {
                success: false,
                error: `CV-Library job card not found for id ${jobId}.`,
                needsNavigation: true,
                jobId,
            };
        }

        const href = match.titleLink.getAttribute('href') || '';

        return {
            success: false,
            needsNavigation: true,
            jobId,
            path: href.startsWith('/') ? href.split('?')[0] : null,
        };
    }

    function readExternalApplyMarker() {
        const applyLink = document.querySelector('a[data-qa="type-apply-now"]');

        if (applyLink instanceof HTMLElement && /external-apply/i.test(applyLink.innerHTML || '')) {
            return applyLink;
        }

        for (const element of document.querySelectorAll('a, button')) {
            if (!(element instanceof HTMLElement) || !isElementVisible(element)) {
                continue;
            }

            const text = normalize(element.textContent);

            if (/apply on company site|external application|company website/i.test(text)) {
                return element;
            }
        }

        return null;
    }

    function readApplyButton() {
        const selectors = [
            'a[data-qa^="apply-now"]',
            'a[data-qa^="1-click-apply"]',
            'button[data-qa^="apply-now"]',
            'button[data-qa^="1-click-apply"]',
            'a[data-qa="type-apply-now"]',
            'a[href*="/job/apply/"]',
        ];

        for (const selector of selectors) {
            for (const link of document.querySelectorAll(selector)) {
                if (!(link instanceof HTMLElement) || !isElementVisible(link)) {
                    continue;
                }

                if (/external-apply/i.test(link.innerHTML || link.className || '')) {
                    continue;
                }

                return link;
            }
        }

        for (const button of document.querySelectorAll('button, a[role="button"], a')) {
            if (!(button instanceof HTMLElement) || !isElementVisible(button)) {
                continue;
            }

            const text = normalize(button.textContent);
            const label = normalize(button.getAttribute('aria-label') || '');
            const qa = normalize(button.getAttribute('data-qa') || '');

            if (
                /^apply now$/i.test(text)
                || /apply now/i.test(label)
                || /^1.?click apply$/i.test(text)
                || /^(apply-now|1-click-apply)/i.test(qa)
            ) {
                if (/external/i.test(text + label + qa)) {
                    continue;
                }

                return button;
            }
        }

        return null;
    }

    function readApplyAvailability() {
        if (readExternalApplyMarker()) {
            return { cvLibraryApply: false, hasApplyButton: false, externalApply: true };
        }

        const applyButton = readApplyButton();

        return {
            cvLibraryApply: Boolean(applyButton),
            hasApplyButton: Boolean(applyButton),
        };
    }

    async function waitForJobDetailReady(jobId, timeoutMs = 20_000) {
        const target = String(jobId || '').trim();
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            if (readJobIdFromUrl() === target && (isCvLibraryJobPage() || isCvLibraryApplyPage())) {
                if (readExternalApplyMarker()) {
                    return {
                        success: false,
                        noCvLibraryApply: true,
                        error: 'Job uses external apply.',
                    };
                }

                if (readApplyButton() || isCvLibraryApplyFlowPage()) {
                    return { success: true, jobId: target };
                }
            }

            const title = normalize(document.querySelector('h1, h2[data-testid="job-card-title"]')?.textContent);

            if (title && readJobIdFromUrl() === target) {
                return { success: true, jobId: target };
            }

            await humanPause(500, 800);
        }

        return { success: false, error: 'CV-Library job detail did not load.' };
    }

    async function prepareJobView({ light = false } = {}) {
        if (!light) {
            await acceptCookieConsent();
        }

        const applyButton = readApplyButton();

        if (applyButton instanceof HTMLElement) {
            await scrollIntoViewHuman(applyButton);
        }

        return { success: true };
    }

    function isCvLibraryApplyFlowPage() {
        if (!isCvLibraryHostname()) {
            return false;
        }

        if (isCvLibraryApplyPage()) {
            return true;
        }

        if (isCvLibraryLoginPage() && new URLSearchParams(window.location.search).get('jobId')) {
            return true;
        }

        return Boolean(document.querySelector('form[data-qa="application-form"], form[action*="/job/apply"]'))
            || Boolean(document.querySelector('[data-qa="application-step-title"], [data-qa="application-form-title"]'));
    }

    function isEasyApplyHostPage() {
        return isCvLibraryApplyFlowPage();
    }

    async function clickCvLibraryApply() {
        await prepareJobView({ force: true });

        if (readExternalApplyMarker()) {
            return {
                success: false,
                cvLibraryApply: false,
                error: 'Job uses external apply, not CV-Library Easy Apply.',
            };
        }

        if (isCvLibraryApplyFlowPage() && !isCvLibraryLoginPage()) {
            return { success: true, cvLibraryApply: true, alreadyOpen: true };
        }

        if (isCvLibraryLoginPage()) {
            return {
                success: false,
                error: 'Sign in to CV-Library to use Easy Apply.',
            };
        }

        const applyButton = readApplyButton();

        if (!(applyButton instanceof HTMLElement)) {
            return { success: false, error: 'CV-Library Easy Apply button not found on job page.' };
        }

        await clickElement(applyButton);

        const deadline = Date.now() + 15_000;

        while (Date.now() < deadline) {
            if (isCvLibraryApplyFlowPage() && !isCvLibraryLoginPage()) {
                return { success: true, cvLibraryApply: true };
            }

            if (isCvLibraryLoginPage()) {
                return {
                    success: false,
                    error: 'Sign in to CV-Library to use Easy Apply.',
                };
            }

            await humanPause(400, 700);
        }

        return { success: false, error: 'CV-Library application form did not open.' };
    }

    function readApplyRoot() {
        return document.querySelector('form[data-qa="application-form"], form[action*="/job/apply"], main form')
            || document;
    }

    function readStepLabel() {
        const applyTitle = document.querySelector('[data-qa="application-step-title"], [data-qa="application-form-title"]');

        if (applyTitle) {
            return normalize(applyTitle.textContent);
        }

        if (isCvLibraryLoginPage()) {
            return 'Login to start your application';
        }

        for (const heading of document.querySelectorAll('h1, h2')) {
            if (heading.closest('header, nav')) {
                continue;
            }

            const label = normalize(heading.textContent);

            if (label && !/cookie|sign in to your cv-library/i.test(label)) {
                return label;
            }
        }

        return null;
    }

    function readStepFingerprint() {
        const label = readStepLabel() || 'unknown';
        const slug = window.location.pathname.split('/').filter(Boolean).slice(-3).join('/');

        return `${slug}|${label}`;
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
        const scope = readApplyRoot();

        for (const testId of ['continue-button', 'next-button', 'save-and-continue-button', 'submit-button']) {
            const byTestId = scope.querySelector(`[data-qa="${testId}"], [data-testid="${testId}"]`);

            if (byTestId instanceof HTMLElement && !byTestId.disabled) {
                return byTestId;
            }
        }

        for (const button of scope.querySelectorAll('button, [role="button"]')) {
            if (!(button instanceof HTMLElement) || button.disabled) {
                continue;
            }

            if (button.closest('header, nav')) {
                continue;
            }

            const label = normalize(button.getAttribute('aria-label') || button.textContent);

            if (/^(continue|next|save and continue)$/i.test(label) || /\bnext\b/i.test(label)) {
                return button;
            }
        }

        return null;
    }

    function findSubmitButton() {
        const scope = readApplyRoot() || document;

        for (const testId of ['submit-button-apply', 'submit-application-button', 'submit-button', 'send-application-button']) {
            const byTestId = scope.querySelector(`[data-qa="${testId}"], [data-testid="${testId}"]`);

            if (byTestId instanceof HTMLElement && !byTestId.disabled && isElementVisible(byTestId)) {
                return byTestId;
            }
        }

        for (const button of scope.querySelectorAll('button, [role="button"], input[type="submit"], a')) {
            if (!(button instanceof HTMLElement) || button.disabled) {
                continue;
            }

            if (!(button instanceof HTMLInputElement) && !isElementVisible(button)) {
                continue;
            }

            if (button.closest('header, nav')) {
                continue;
            }

            const label = normalize(
                button.getAttribute('aria-label')
                || button.getAttribute('value')
                || button.textContent,
            );

            if (/^(submit|submit application|send application|re-apply for this job)$/i.test(label)
                || (/\bsubmit\b/i.test(label) && !/^apply now$/i.test(label))) {
                return button;
            }
        }

        return null;
    }

    function getCvLibraryApplyState() {
        const verify = verifySubmitted();

        if (verify.submitted) {
            return {
                open: false,
                submitted: true,
                alreadyApplied: false,
                canContinue: false,
                canSubmit: false,
                stepLabel: 'Application submitted',
                stepFingerprint: 'submitted',
                validationErrors: [],
                isReviewStep: false,
            };
        }

        const open = isCvLibraryApplyFlowPage() && !isCvLibraryLoginPage();

        if (!open) {
            return {
                open: false,
                submitted: verify.submitted,
                alreadyApplied: false,
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
        const alreadyApplied = isPreviouslyAppliedStepLabel(label);
        const isReviewStep = /review|check your application|summary|your details/i.test(label || '')
            || Boolean(document.querySelector('[data-qa="application-review-summary"]'));

        return {
            open: true,
            submitted: false,
            alreadyApplied,
            canContinue: Boolean(continueButton) && !isReviewStep && !alreadyApplied,
            canSubmit: Boolean(submitButton) || isReviewStep,
            hasSubmitButton: Boolean(submitButton),
            stepLabel: label,
            actionLabel: submitButton ? normalize(submitButton.textContent) : (continueButton ? normalize(continueButton.textContent) : null),
            stepFingerprint: readStepFingerprint(),
            validationErrors,
            isReviewStep,
        };
    }

    function readAppliedConfirmationText() {
        if (matchesSubmissionConfirmation(document.title)) {
            return [normalize(document.title)];
        }

        const markers = document.querySelectorAll(
            '[data-qa="applied-label"], [data-qa*="application-submitted"], [role="alert"], .alert, h1, h2',
        );

        for (const node of markers) {
            const text = normalize(node.textContent || '');

            if (matchesSubmissionConfirmation(text)) {
                return [text];
            }
        }

        return null;
    }

    function verifySubmitted() {
        if (isCvLibraryConfirmPage()) {
            return {
                submitted: true,
                confirmation: 'CV-Library application submitted',
            };
        }

        if (document.querySelector('[data-qa="applied-label"], [data-qa*="application-submitted"]')) {
            return {
                submitted: true,
                confirmation: 'CV-Library application submitted',
            };
        }

        const confirmation = readAppliedConfirmationText();

        if (confirmation) {
            return {
                submitted: true,
                confirmation: confirmation[0],
            };
        }

        return {
            submitted: false,
            confirmation: null,
        };
    }

    async function clickContinueOrSubmit() {
        await acceptCookieConsent();

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

        const validationErrors = readValidationErrors();
        const previousFingerprint = readStepFingerprint();
        const submitButton = findSubmitButton();
        const continueButton = findContinueButton();

        // Prefer Submit whenever present - Continue can match unrelated nav/footer
        // controls on the one-step "Complete your application" page.
        if (submitButton) {
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

            const verifyAfterContinue = verifySubmitted();

            if (verifyAfterContinue.submitted) {
                return {
                    success: true,
                    action: 'submit',
                    submitted: true,
                    pendingConfirmation: false,
                    transitioned: true,
                    stepFingerprint: readStepFingerprint(),
                    validationErrors: [],
                    confirmation: verifyAfterContinue.confirmation,
                };
            }

            const lateSubmit = findSubmitButton();

            if (lateSubmit) {
                await clickElement(lateSubmit);
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

            const nextFingerprint = readStepFingerprint();
            const transitioned = nextFingerprint !== previousFingerprint;

            return {
                success: transitioned,
                action: 'continue',
                submitted: false,
                transitioned,
                stepFingerprint: nextFingerprint,
                validationErrors: readValidationErrors(),
                error: transitioned ? undefined : 'CV-Library Apply step did not change after Continue.',
            };
        }

        return {
            success: false,
            action: 'blocked',
            submitted: false,
            transitioned: false,
            stepFingerprint: previousFingerprint,
            validationErrors,
            error: validationErrors[0] || 'No Continue or Submit control found on CV-Library Apply page.',
        };
    }

    async function goToNextSearchPage() {
        const next = document.querySelector('a[data-qa="next"]:not([aria-disabled="true"])');

        if (!(next instanceof HTMLElement)) {
            return { success: false, error: 'No next search page link found.' };
        }

        await clickElement(next);
        await humanPause(800, 1300);

        return { success: true };
    }

    async function scanPageHealth() {
        await acceptCookieConsent();

        const bodyText = normalize(document.body?.textContent);

        if (/humans only|mistakenly blocked|security protections may/i.test(bodyText)) {
            return {
                ok: false,
                primary: {
                    message: 'CV-Library blocked automated access. Sign in manually and retry.',
                },
                blocking: ['CV-Library bot protection page'],
            };
        }

        if (isCvLibraryLoginPage() || (/login to start your application/i.test(bodyText) && isCvLibraryApplyFlowPage())) {
            return {
                ok: false,
                primary: {
                    message: 'Sign in to CV-Library to use Auto Apply.',
                },
                blocking: ['CV-Library sign-in required'],
            };
        }

        return { ok: true };
    }

    function readJobDescriptionText() {
        const selectors = [
            '[data-qa="job-description"]',
            '[class*="JobDescription"]',
            '[class*="jobDescription"]',
            'article',
            'main',
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
        readApplyAvailability,
        readJobDescriptionText,
        waitForJobDescriptionReady,
        clickCvLibraryApply,
        getCvLibraryApplyState,
        clickContinueOrSubmit,
        verifySubmitted,
        goToNextSearchPage,
        scanPageHealth,
        isCvLibraryApplyFlowPage,
        isEasyApplyHostPage,
        findJobCardById,
    };
})();
