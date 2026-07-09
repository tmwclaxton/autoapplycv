/**
 * Totaljobs Apply DOM helpers for Auto Apply (content script global).
 */
const AutoCVApplyTotalJobsAutoApply = (() => {
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
        await sleep(humanDelayMs(minMs, maxMs));
    }

    function isTotalJobsHostname() {
        return /totaljobs\.com$/i.test(window.location.hostname);
    }

    function isTotalJobsSearchPage() {
        return isTotalJobsHostname() && /^\/jobs\//i.test(window.location.pathname);
    }

    function isTotalJobsJobPage() {
        return isTotalJobsHostname() && /^\/job\//i.test(window.location.pathname);
    }

    function isTotalJobsApplySuccessPage() {
        if (!isTotalJobsHostname()) {
            return false;
        }

        return /\/application\/confirmation\/success/i.test(window.location.pathname)
            || /\/application\/success/i.test(window.location.pathname);
    }

    function isTotalJobsApplyFlowPage() {
        if (!isTotalJobsHostname()) {
            return false;
        }

        if (isTotalJobsApplySuccessPage()) {
            return false;
        }

        return /\/job-application\b|\/apply\b|\/application\b|\/candidate\//i.test(window.location.pathname)
            || Boolean(document.querySelector('form[data-testid="application-form"], [data-at="application-form"]'));
    }

    function readJobIdFromUrl() {
        const match = window.location.pathname.match(/-job(\d+)(?:\/|$)/i)
            || window.location.pathname.match(/\/job\/view\/(\d+)/i);

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
        const button = document.querySelector('#onetrust-accept-btn-handler, button[data-testid="accept-cookies"]');

        if (!(button instanceof HTMLElement)) {
            return { accepted: false };
        }

        await clickElement(button, { quick: true });
        await humanPause(400, 700);

        return { accepted: true };
    }

    function readJobCardsFromDocument() {
        const jobs = [];
        const seen = new Set();

        const items = document.querySelectorAll('[data-testid="job-item"], [data-at="job-item"]');

        for (const item of items) {
            const link = item.querySelector('a[data-testid="job-item-title"], a[data-at="job-item-title"]');
            const href = link?.getAttribute('href') || '';
            const jobId = readJobIdFromHref(href);

            if (!jobId || seen.has(jobId)) {
                continue;
            }

            seen.add(jobId);

            const title = normalize(link?.textContent) || 'Unknown role';
            const company = normalize(
                item.querySelector('[data-at="job-item-company-name"], [data-testid="job-item-company-name"]')?.textContent,
            ) || 'Unknown company';

            const cardText = normalize(item.textContent);
            const alreadyApplied = /\bapplied\b/i.test(cardText);

            jobs.push({
                jobId,
                path: href.startsWith('/') ? href : null,
                title,
                company,
                totaljobsApply: true,
                easyApply: true,
                alreadyApplied,
                url: href.startsWith('http') ? href : `https://www.totaljobs.com${href}`,
            });
        }

        if (jobs.length > 0) {
            return jobs;
        }

        for (const link of document.querySelectorAll('a[data-testid="job-item-title"], a[href*="/job/"][href*="-job"]')) {
            const href = link.getAttribute('href') || '';
            const jobId = readJobIdFromHref(href);

            if (!jobId || seen.has(jobId)) {
                continue;
            }

            seen.add(jobId);

            jobs.push({
                jobId,
                path: href.startsWith('/') ? href : null,
                title: normalize(link.textContent) || 'Unknown role',
                company: 'Unknown company',
                totaljobsApply: true,
                easyApply: true,
                alreadyApplied: false,
                url: href.startsWith('http') ? href : `https://www.totaljobs.com${href}`,
            });
        }

        return jobs;
    }

    function readJobIdFromHref(href) {
        const match = String(href || '').match(/-job(\d+)(?:[/?#]|$)/i)
            || String(href || '').match(/\/job\/view\/(\d+)/i);

        return match?.[1] || null;
    }

    function collectJobCards() {
        return readJobCardsFromDocument();
    }

    async function prepareJobSearch() {
        await acceptCookieConsent();

        const listRoot = document.querySelector('[data-testid="job-results-list"], main');

        if (listRoot instanceof HTMLElement) {
            listRoot.scrollTop = Math.min(listRoot.scrollTop + listRoot.clientHeight * 0.5, listRoot.scrollHeight);
            await humanPause(400, 700);
        }

        return { success: true };
    }

    function findJobCardById(jobId) {
        const target = String(jobId).replace(/^job/i, '');

        for (const link of document.querySelectorAll('a[data-testid="job-item-title"], a[href*="-job"]')) {
            const href = link.getAttribute('href') || '';
            const id = readJobIdFromHref(href);

            if (id === target) {
                return link.closest('[data-testid="job-item"], [data-at="job-item"]') || link;
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

        const link = card.querySelector('a[data-testid="job-item-title"], a[data-at="job-item-title"]');
        const href = link?.getAttribute('href') || '';

        return {
            success: false,
            needsNavigation: true,
            jobId: target,
            path: href.startsWith('/') ? href : null,
        };
    }

    function readExternalApplyMarker() {
        const body = normalize(document.body?.textContent || '');

        return /apply on (?:the )?company website|external application|redirected to the online application form/i.test(body);
    }

    async function waitForJobDetailReady(jobId, timeoutMs = 20_000) {
        const target = String(jobId).replace(/^job/i, '');
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const currentId = readJobIdFromUrl();

            if (currentId === target && isTotalJobsJobPage()) {
                return { success: true, jobId: target };
            }

            if (readExternalApplyMarker()) {
                return {
                    success: false,
                    noTotalJobsApply: true,
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

        const applySection = document.querySelector('[data-at="apply-now-section"]');
        const applyButton = readApplyButton();

        if (applyButton instanceof HTMLElement) {
            await scrollIntoViewHuman(applyButton);

            return { success: true };
        }

        if (applySection instanceof HTMLElement) {
            await scrollIntoViewHuman(applySection);
        }

        return { success: true };
    }

    function readApplyButton() {
        const candidates = [
            ...document.querySelectorAll('button[data-testid="harmonised-apply-button"]'),
            ...document.querySelectorAll('a[data-testid="harmonised-apply-button"]'),
            ...document.querySelectorAll('button[data-testid="apply-button"]'),
            ...document.querySelectorAll('button[data-testid="quick-apply-button"]'),
            ...document.querySelectorAll('[data-at="apply-now-section"] button'),
            ...document.querySelectorAll('[data-at="apply-now-section"] a'),
        ];

        for (const button of candidates) {
            if (!(button instanceof HTMLElement) || button.disabled) {
                continue;
            }

            if (button.matches('[data-testid="ineligible-apply-button"]')) {
                continue;
            }

            const label = normalize(button.textContent);

            if (/unavailable|expired|closed/i.test(label)) {
                continue;
            }

            if (isElementVisible(button)) {
                return button;
            }
        }

        return null;
    }

    async function clickTotalJobsApply() {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await prepareJobView({ force: attempt === 0 });

            const applyButton = readApplyButton();

            if (applyButton) {
                await clickElement(applyButton);

                return { success: true, totaljobsApply: true, navigating: true };
            }

            if (readExternalApplyMarker()) {
                return {
                    success: false,
                    totaljobsApply: false,
                    error: 'Job uses external apply, not Totaljobs Quick Apply.',
                };
            }

            const ineligible = document.querySelector('[data-testid="ineligible-apply-button"]');

            if (ineligible instanceof HTMLElement) {
                return {
                    success: false,
                    totaljobsApply: false,
                    error: normalize(ineligible.textContent) || 'Apply unavailable for this job.',
                };
            }

            await humanPause(500, 850);
        }

        return { success: false, error: 'Totaljobs Apply button not found on job page.' };
    }

    function readApplyRoot() {
        return document.querySelector('[data-testid="application-form"], [data-at="application-form"], form')
            || document;
    }

    function readStepLabel() {
        const candidates = document.querySelectorAll('[data-testid="application-step-title"], h1, h2');

        for (const heading of candidates) {
            if (heading.closest('#onetrust-banner-sdk, #onetrust-consent-sdk, [data-testid="cookie-banner"]')) {
                continue;
            }

            const label = normalize(heading.textContent);

            if (!label || /we use cookies|cookie preferences/i.test(label)) {
                continue;
            }

            return label;
        }

        return null;
    }

    function readStepFingerprint() {
        const label = readStepLabel() || 'unknown';
        const slug = window.location.pathname.split('/').filter(Boolean).slice(-2).join('/');

        return `${slug}|${label}`;
    }

    function readValidationErrors() {
        const errors = [];
        const seen = new Set();

        for (const node of document.querySelectorAll('[data-testid*="error"], [role="alert"], .error, [aria-invalid="true"]')) {
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
                const byTestId = scope.querySelector(`[data-testid="${testId}"]`);

                if (byTestId instanceof HTMLElement && !byTestId.disabled) {
                    return byTestId;
                }
            }

            for (const button of scope.querySelectorAll('button, [role="button"]')) {
                if (!(button instanceof HTMLElement) || button.disabled) {
                    continue;
                }

                if (button.closest('#onetrust-banner-sdk, #onetrust-consent-sdk, header, [data-testid="cookie-banner"]')) {
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

    function findSubmitButton() {
        const scopes = [readApplyRoot(), document];

        for (const scope of scopes) {
            for (const testId of ['submit-button', 'submit-application-button', 'send-application-button']) {
                const byTestId = scope.querySelector(`[data-testid="${testId}"]`);

                if (byTestId instanceof HTMLElement && !byTestId.disabled) {
                    return byTestId;
                }
            }

            for (const button of scope.querySelectorAll('button, [role="button"]')) {
                if (!(button instanceof HTMLElement) || button.disabled) {
                    continue;
                }

                const label = normalize(button.getAttribute('aria-label') || button.textContent);

                if (/^(submit|send application|apply now|submit application)$/i.test(label)
                    || /\bsubmit\b/i.test(label)) {
                    return button;
                }
            }
        }

        return null;
    }

    function getTotalJobsApplyState() {
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

        const onApplyFlow = isTotalJobsApplyFlowPage();
        const onJobPage = isTotalJobsJobPage();
        const open = onApplyFlow || (onJobPage && Boolean(readApplyButton()));

        if (!open && !onApplyFlow) {
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
        const isReviewStep = /review|check your application|summary/i.test(label || '')
            || (Boolean(submitButton) && !continueButton);

        return {
            open: true,
            submitted: false,
            canContinue: Boolean(continueButton) && !isReviewStep,
            canSubmit: Boolean(submitButton) || isReviewStep,
            hasSubmitButton: Boolean(submitButton),
            stepLabel: label,
            actionLabel: submitButton ? normalize(submitButton.textContent) : (continueButton ? normalize(continueButton.textContent) : null),
            stepFingerprint: readStepFingerprint(),
            validationErrors,
            isReviewStep,
        };
    }

    function verifySubmitted() {
        if (isTotalJobsApplySuccessPage()) {
            return {
                submitted: true,
                confirmation: 'Totaljobs application confirmation page',
            };
        }

        const body = normalize(document.body?.textContent || '');
        const confirmation = body.match(/(?:application (?:has been )?submitted|thank you for applying|we received your application|successfully applied|did all go well with your application)/i);

        return {
            submitted: Boolean(confirmation),
            confirmation: confirmation?.[0] || null,
        };
    }

    async function waitForSubmissionConfirmation(timeoutMs = 30_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const verify = verifySubmitted();

            if (verify.submitted) {
                return verify;
            }

            await humanPause(450, 700);
        }

        return verifySubmitted();
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
        const isReview = /review|check your application|summary/i.test(readStepLabel() || '');

        if (submitButton && (isReview || !continueButton)) {
            await clickElement(submitButton);
            const verify = await waitForSubmissionConfirmation();

            return {
                success: true,
                action: 'submit',
                submitted: verify.submitted,
                transitioned: true,
                stepFingerprint: readStepFingerprint(),
                validationErrors: verify.submitted ? [] : readValidationErrors(),
                confirmation: verify.confirmation,
            };
        }

        if (continueButton) {
            await clickElement(continueButton);
            await humanPause(650, 1100);

            const nextFingerprint = readStepFingerprint();
            const transitioned = nextFingerprint !== previousFingerprint;

            return {
                success: transitioned || readValidationErrors().length === 0,
                action: 'continue',
                submitted: false,
                transitioned,
                stepFingerprint: nextFingerprint,
                validationErrors: readValidationErrors(),
            };
        }

        return {
            success: validationErrors.length === 0,
            action: validationErrors.length > 0 ? 'blocked' : 'continue',
            submitted: false,
            transitioned: false,
            stepFingerprint: previousFingerprint,
            validationErrors,
            error: validationErrors[0] || 'Totaljobs Apply did not advance.',
        };
    }

    async function goToNextSearchPage() {
        const nextLink = document.querySelector(
            'a[rel="next"], a[data-testid="pagination-next"], a[aria-label*="Next"]',
        );

        if (!(nextLink instanceof HTMLElement)) {
            return { success: false, error: 'No next search page link found.' };
        }

        await clickElement(nextLink);
        await humanPause(800, 1300);

        return { success: true };
    }

    async function scanPageHealth() {
        await acceptCookieConsent();

        if (document.querySelector('a[href*="login"], a[href*="register"]') && /sign in to apply/i.test(document.body?.textContent || '')) {
            return {
                ok: false,
                issues: [{ code: 'login_required', message: 'Totaljobs sign-in required to apply.' }],
                blocking: [{ code: 'login_required', message: 'Totaljobs sign-in required to apply.' }],
                primary: { code: 'login_required', message: 'Totaljobs sign-in required to apply.' },
            };
        }

        return { ok: true, issues: [], blocking: [], primary: null };
    }

    function readJobDescriptionText() {
        const selectors = [
            '[data-at="job-ad-description"]',
            '[data-testid="job-description"]',
            '.job-ad-display-',
            'article',
        ];

        let best = '';

        for (const selector of selectors) {
            const nodes = selector.endsWith('-')
                ? [...document.querySelectorAll(`[class*="${selector.slice(1)}"]`)]
                : [...document.querySelectorAll(selector)];

            for (const node of nodes) {
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
        clickTotalJobsApply,
        getTotalJobsApplyState,
        clickContinueOrSubmit,
        verifySubmitted,
        goToNextSearchPage,
        scanPageHealth,
        isTotalJobsApplyFlowPage,
        isTotalJobsSearchPage,
        isTotalJobsJobPage,
        findJobCardById,
    };
})();
