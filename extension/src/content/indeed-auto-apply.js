/**
 * Indeed Apply DOM helpers for Auto Apply (content script global).
 */
const AutoCVApplyIndeedAutoApply = (() => {
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

    function isIndeedHostname() {
        return /indeed\.com$/i.test(window.location.hostname);
    }

    function isIndeedSearchPage() {
        return isIndeedHostname() && /^\/jobs\/?$/i.test(window.location.pathname);
    }

    function isIndeedViewJobPage() {
        return isIndeedHostname() && /\/viewjob/i.test(window.location.pathname);
    }

    function isIndeedApplyFlowPage() {
        if (!isIndeedHostname()) {
            return false;
        }

        return /smartapply\.indeed\.com/i.test(window.location.hostname)
            || /indeedapply/i.test(window.location.pathname);
    }

    function readJobIdFromUrl() {
        const match = window.location.search.match(/[?&]jk=([a-f0-9]{16})/i);

        return match?.[1]?.toLowerCase() || null;
    }

    function readApplyStepSlug() {
        const url = window.location.href;
        const marker = '/indeedapply/form/';

        if (!url.includes(marker)) {
            return null;
        }

        return url.split(marker)[1]?.split('?')[0]?.split('#')[0] || null;
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

    function isElementMostlyVisible(element, { fraction = 0.55 } = {}) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        const rect = element.getBoundingClientRect();

        if (rect.width <= 0 || rect.height <= 0) {
            return false;
        }

        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);

        return visibleHeight >= rect.height * fraction;
    }

    async function scrollIntoViewHuman(element, { force = false } = {}) {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        if (!force && isElementMostlyVisible(element)) {
            await humanPause(100, 220);

            return;
        }

        const scrollParent = element.closest(
            '#jobsearch-ViewjobPaneWrapper, .jobsearch-LeftPane, [class*="jobsearch-ViewJob"]',
        );

        if (scrollParent instanceof HTMLElement && scrollParent !== document.documentElement) {
            const parentRect = scrollParent.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const offset = elementRect.top - parentRect.top - parentRect.height * 0.3;
            const target = Math.max(0, Math.min(scrollParent.scrollTop + offset, scrollParent.scrollHeight));
            const start = scrollParent.scrollTop;
            const total = target - start;

            if (Math.abs(total) < 24) {
                await humanPause(100, 200);

                return;
            }

            const steps = 2 + Math.floor(Math.random() * 2);

            for (let step = 1; step <= steps; step += 1) {
                scrollParent.scrollTop = start + Math.floor(total * (step / steps));
                await humanPause(90, 180);
            }

            await humanPause(180, 320);

            return;
        }

        element.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
            behavior: 'smooth',
        });
        await humanPause(280, 520);
    }

    function readJobViewRoot() {
        return document.querySelector(
            '#jobsearch-ViewjobPaneWrapper, .jobsearch-ViewJobLayout--embedded, .jobsearch-JobComponent, [class*="jobsearch-ViewJob"]',
        ) || document;
    }

    async function scrollContainerByHumanStep(container) {
        if (!(container instanceof HTMLElement)) {
            return;
        }

        const fraction = 0.16 + Math.random() * 0.12;
        const delta = Math.max(72, Math.floor(container.clientHeight * fraction));
        const target = Math.min(container.scrollTop + delta, container.scrollHeight);
        const start = container.scrollTop;
        const total = target - start;
        const steps = 2 + Math.floor(Math.random() * 2);

        for (let step = 1; step <= steps; step += 1) {
            container.scrollTop = start + Math.floor(total * (step / steps));
            await humanPause(90, 180);
        }

        await humanPause(180, 320);
    }

    function readClickCoordinates(element) {
        const rect = element.getBoundingClientRect();
        const insetX = Math.max(4, rect.width * 0.12);
        const insetY = Math.max(4, rect.height * 0.12);
        const usableWidth = Math.max(1, rect.width - insetX * 2);
        const usableHeight = Math.max(1, rect.height - insetY * 2);

        return {
            clientX: rect.left + insetX + Math.random() * usableWidth,
            clientY: rect.top + insetY + Math.random() * usableHeight,
        };
    }

    async function clickElement(element, { quick = false, skipScroll = false } = {}) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        if (!skipScroll) {
            await scrollIntoViewHuman(element, { force: quick });
        }

        const { clientX, clientY } = readClickCoordinates(element);
        const pointerInit = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX,
            clientY,
        };
        const mouseInit = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX,
            clientY,
        };

        element.dispatchEvent(new MouseEvent('mouseover', mouseInit));
        element.dispatchEvent(new MouseEvent('mouseenter', { ...mouseInit, bubbles: false }));
        await humanPause(quick ? 70 : 150, quick ? 160 : 380);

        element.focus({ preventScroll: true });
        await humanPause(quick ? 30 : 60, quick ? 90 : 140);

        if (typeof PointerEvent !== 'undefined') {
            element.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
            element.dispatchEvent(new PointerEvent('pointerup', pointerInit));
        }

        element.dispatchEvent(new MouseEvent('mousedown', mouseInit));
        element.dispatchEvent(new MouseEvent('mouseup', mouseInit));
        element.click();
        await humanPause(quick ? 60 : 120, quick ? 180 : 320);

        return true;
    }

    async function acceptCookieConsent() {
        const accept = document.querySelector('#onetrust-accept-btn-handler');

        if (accept instanceof HTMLElement && isElementVisible(accept)) {
            await clickElement(accept, { quick: true });

            return { accepted: true };
        }

        const reject = document.querySelector('#onetrust-reject-all-handler');

        if (reject instanceof HTMLElement && isElementVisible(reject)) {
            await clickElement(reject, { quick: true });

            return { accepted: true };
        }

        return { accepted: false };
    }

    function findJobCardById(jobId) {
        const target = String(jobId).toLowerCase();

        const classCard = document.querySelector(`div[class*="job_${target}"], .job_${target}`)?.closest(
            'div.cardOutline, div.job_seen_beacon, div.slider_item, li[data-testid="job-card"], td.resultContent',
        );

        if (classCard) {
            return classCard;
        }

        for (const card of document.querySelectorAll(
            'div.job_seen_beacon, div.slider_item, div[data-testid="slider_item"], li[data-testid="job-card"], div.cardOutline.tapItem',
        )) {
            const link = card.querySelector(`a[href*="jk=${target}"], a[data-jk="${target}"], a[jk="${target}"]`);

            if (link) {
                return card;
            }
        }

        return document.querySelector(`a[href*="jk=${target}"], a[data-jk="${target}"], a[jk="${target}"]`)?.closest(
            'div.job_seen_beacon, div.slider_item, li[data-testid="job-card"], td.resultContent',
        ) || null;
    }

    function findJobListScrollContainer() {
        return document.querySelector(
            '#mosaic-provider-jobcards, .jobsearch-LeftPane, [id*="jobsearch-ResultsList"], .jobsearch-ResultsList',
        );
    }

    async function revealJobCardById(jobId) {
        let card = findJobCardById(jobId);

        if (card) {
            await scrollIntoViewHuman(card);

            return card;
        }

        const listRoot = findJobListScrollContainer();

        if (!(listRoot instanceof HTMLElement)) {
            return null;
        }

        listRoot.scrollTop = 0;
        await humanPause(240, 480);

        for (let attempt = 0; attempt < 14; attempt += 1) {
            card = findJobCardById(jobId);

            if (card) {
                await scrollIntoViewHuman(card);

                return card;
            }

            await scrollContainerByHumanStep(listRoot);

            if (listRoot.scrollTop + listRoot.clientHeight >= listRoot.scrollHeight - 4) {
                break;
            }
        }

        card = findJobCardById(jobId);

        if (card) {
            await scrollIntoViewHuman(card);
        }

        return card;
    }

    function readJobCardsFromDocument() {
        const jobs = [];
        const seen = new Set();

        const cardRoots = [
            ...document.querySelectorAll('div.job_seen_beacon'),
            ...document.querySelectorAll('div.slider_item'),
            ...document.querySelectorAll('div[data-testid="slider_item"]'),
            ...document.querySelectorAll('li[data-testid="job-card"]'),
        ];

        for (const card of cardRoots) {
            const link = card.querySelector('a[href*="viewjob"], a[jk], a[data-jk]');
            const href = link?.getAttribute('href') || '';
            const jkMatch = href.match(/jk=([a-f0-9]{16})/i)
                || String(link?.getAttribute('data-jk') || link?.getAttribute('jk') || '').match(/^([a-f0-9]{16})$/i);
            const jobId = jkMatch?.[1]?.toLowerCase();

            if (!jobId || seen.has(jobId)) {
                continue;
            }

            seen.add(jobId);

            const title = normalize(
                card.querySelector('h2.jobTitle span[title], h2.jobTitle a, [data-testid="job-title"] a, a[data-jk] span')?.textContent
                || card.querySelector('.jobTitle')?.textContent,
            ) || 'Unknown role';

            const company = normalize(
                card.querySelector('[data-testid="company-name"], [data-testid="attribute_snippet_testid"], .companyName')?.textContent,
            ) || 'Unknown company';

            const cardText = normalize(card.textContent);
            const alreadyApplied = /\bapplied\b/i.test(cardText);

            jobs.push({
                jobId,
                title,
                company,
                indeedApply: true,
                easyApply: true,
                alreadyApplied,
                url: `https://uk.indeed.com/viewjob?jk=${jobId}`,
            });
        }

        if (jobs.length > 0) {
            return jobs;
        }

        for (const link of document.querySelectorAll('a[href*="viewjob?jk="]')) {
            const href = link.getAttribute('href') || '';
            const match = href.match(/jk=([a-f0-9]{16})/i);
            const jobId = match?.[1]?.toLowerCase();

            if (!jobId || seen.has(jobId)) {
                continue;
            }

            seen.add(jobId);

            jobs.push({
                jobId,
                title: normalize(link.textContent) || 'Unknown role',
                company: 'Unknown company',
                indeedApply: true,
                easyApply: true,
                alreadyApplied: false,
                url: `https://uk.indeed.com/viewjob?jk=${jobId}`,
            });
        }

        return jobs;
    }

    function collectJobCards() {
        return readJobCardsFromDocument();
    }

    let lastJobViewPrepareAt = 0;

    async function prepareJobSearch() {
        await acceptCookieConsent();

        const cardCount = document.querySelectorAll(
            'div.job_seen_beacon, div.cardOutline.tapItem, li[data-testid="job-card"]',
        ).length;

        if (cardCount >= 5) {
            return { success: true, skipped: true };
        }

        const listRoot = findJobListScrollContainer();

        if (listRoot instanceof HTMLElement) {
            await scrollContainerByHumanStep(listRoot);
        }

        await humanPause(280, 520);

        return { success: true };
    }

    function readIndeedApplyButton() {
        const root = readJobViewRoot();
        const selectors = [
            '[data-testid="indeedApplyButton-test"]',
            '#indeedApplyButton',
            'button[id*="indeedApply"]',
            'button[aria-label*="Apply with Indeed"]',
            'a[aria-label*="Apply with Indeed"]',
            'button[aria-label*="Apply now"]',
            'a[href*="smartapply.indeed.com"]',
        ];

        for (const selector of selectors) {
            const button = root.querySelector(selector);

            if (button instanceof HTMLElement && isElementVisible(button)) {
                return button;
            }
        }

        for (const element of root.querySelectorAll('button, a[role="button"], a')) {
            if (!(element instanceof HTMLElement) || !isElementVisible(element)) {
                continue;
            }

            const text = normalize(element.textContent);
            const label = normalize(element.getAttribute('aria-label') || '');

            if (/^apply with indeed$/i.test(text) || /apply with indeed/i.test(label)) {
                return element;
            }

            if (/^apply now$/i.test(text) && element.closest('[class*="jobsearch"], [class*="mosaic"], main')) {
                return element;
            }
        }

        return null;
    }

    function readExternalApplyMarker() {
        const root = readJobViewRoot();

        for (const element of root.querySelectorAll('a, button')) {
            if (!(element instanceof HTMLElement) || !isElementVisible(element)) {
                continue;
            }

            const text = normalize(element.textContent);

            if (/^apply on company site$/i.test(text)
                || /^apply externally$/i.test(text)
                || /apply on employer site/i.test(text)) {
                return element;
            }
        }

        return null;
    }

    async function prepareJobView({ force = false, light = false } = {}) {
        const now = Date.now();

        if (!force && now - lastJobViewPrepareAt < 3000) {
            return { success: true, skipped: true };
        }

        lastJobViewPrepareAt = now;
        await acceptCookieConsent();

        const applyButton = readIndeedApplyButton();

        if (applyButton instanceof HTMLElement) {
            await scrollIntoViewHuman(applyButton);

            return { success: true };
        }

        if (light) {
            return { success: true };
        }

        const description = document.querySelector('#jobDescriptionText, .jobsearch-JobComponent-description');

        if (description instanceof HTMLElement) {
            await scrollIntoViewHuman(description);
        }

        await humanPause(240, 480);

        return { success: true };
    }

    async function waitForJobDetailReady(jobId, timeoutMs = 35_000) {
        const deadline = Date.now() + timeoutMs;
        let scrollPass = 0;

        while (Date.now() < deadline) {
            await acceptCookieConsent();

            if (scrollPass === 0) {
                await prepareJobView({ force: true });
            } else if (scrollPass % 5 === 0) {
                await prepareJobView({ light: true });
            }

            scrollPass += 1;

            const currentJk = readJobIdFromUrl();
            const onTargetJob = currentJk === String(jobId).toLowerCase()
                || isIndeedViewJobPage()
                || (isIndeedSearchPage() && currentJk === String(jobId).toLowerCase());

            if (onTargetJob) {
                if (readExternalApplyMarker()) {
                    return {
                        success: false,
                        noIndeedApply: true,
                        error: 'Job uses external apply, not Indeed Apply.',
                    };
                }

                if (readIndeedApplyButton()) {
                    return { success: true, jobId };
                }
            }

            await humanPause(600, scrollPass > 4 ? 1200 : 900);
        }

        if (readExternalApplyMarker()) {
            return {
                success: false,
                noIndeedApply: true,
                error: 'Job uses external apply, not Indeed Apply.',
            };
        }

        return {
            success: false,
            jobUnavailable: true,
            error: `Job detail not ready for jk=${jobId}`,
        };
    }

    async function selectJobById(jobId) {
        const target = String(jobId).toLowerCase();
        const card = await revealJobCardById(target);

        if (!card) {
            return {
                success: false,
                error: `Job card not found: ${target}`,
                needsNavigation: true,
                jobId: target,
            };
        }

        await humanPause(420, 900);

        const clickable = card.querySelector(
            'h2.jobTitle a, a[data-jk], a[href*="viewjob"], .jcs-JobTitle, [data-testid="job-title"] a',
        ) || card;

        await clickElement(clickable);
        await humanPause(900, 1500);

        const detailReady = await waitForJobDetailReady(target, 25_000);

        if (detailReady.success) {
            return { success: true, jobId: target };
        }

        return {
            success: false,
            error: detailReady.error || `Job detail not ready for jk=${target}`,
            needsNavigation: !detailReady.noIndeedApply,
            noIndeedApply: Boolean(detailReady.noIndeedApply),
            jobUnavailable: Boolean(detailReady.jobUnavailable),
            jobId: target,
        };
    }

    function readJobDescriptionText() {
        const selectors = [
            '#jobDescriptionText',
            '.jobsearch-JobComponent-description',
            '[id*="jobDescriptionText"]',
            '[class*="jobDescriptionText"]',
            '#job-details',
        ];

        let best = '';

        for (const selector of selectors) {
            const text = normalize(document.querySelector(selector)?.textContent);

            if (text.length > best.length) {
                best = text;
            }
        }

        return best.slice(0, 20000);
    }

    async function prepareJobDescriptionForRead() {
        await prepareJobView({ light: true });

        return { success: true, length: readJobDescriptionText().length };
    }

    async function waitForJobDescriptionReady(minLength = 200, timeoutMs = 20_000) {
        const deadline = Date.now() + timeoutMs;
        let prepared = false;

        while (Date.now() < deadline) {
            if (!prepared) {
                await prepareJobView({ light: true }).catch(() => {});
                prepared = true;
            }

            const text = readJobDescriptionText();

            if (text.length >= minLength) {
                return { ready: true, length: text.length };
            }

            await humanPause(500, 900);
        }

        return { ready: false, length: readJobDescriptionText().length };
    }

    async function clickIndeedApply() {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            if (attempt === 0) {
                await prepareJobView({ force: true });
            }

            const applyButton = readIndeedApplyButton();

            if (applyButton) {
                await clickElement(applyButton, { skipScroll: isElementMostlyVisible(applyButton) });
                await humanPause(1200, 2200);

                return { success: true, easyApply: true };
            }

            if (readExternalApplyMarker()) {
                return {
                    success: false,
                    easyApply: false,
                    error: 'Job uses external apply, not Indeed Apply.',
                };
            }

            await humanPause(900, 1500);
        }

        return { success: false, error: 'Indeed Apply button not found on job page.' };
    }

    function readApplyModuleScope() {
        return document.querySelector('[id*="mosaic-provider-module-apply"]')
            || document.querySelector('[class*="mosaic-provider-module-apply"]')
            || document;
    }

    function readIndeedReviewRoot() {
        return document.querySelector('#mosaic-provider-module-apply-preview, [id*="mosaic-provider-module-apply-preview"]');
    }

    function isIndeedReviewStep() {
        const slug = readApplyStepSlug() || '';

        if (/review|preview/i.test(slug)) {
            return true;
        }

        return Boolean(readIndeedReviewRoot());
    }

    function readIndeedCaptchaPresent() {
        return Boolean(document.querySelector('[data-testid="captcha"], #captcha-wrapper, textarea.g-recaptcha-response'));
    }

    function readContinueButton() {
        const scopes = [readApplyModuleScope(), document];

        for (const scope of scopes) {
            for (const testId of ['continue-button', 'save-and-continue-button']) {
                const byTestId = scope.querySelector(`[data-testid="${testId}"]`);

                if (byTestId instanceof HTMLElement && !byTestId.disabled) {
                    return byTestId;
                }
            }

            for (const button of scope.querySelectorAll('button, [role="button"]')) {
                if (!(button instanceof HTMLElement) || button.disabled) {
                    continue;
                }

                if (button.closest('#onetrust-banner-sdk, #indeed-globalnav')) {
                    continue;
                }

                if (button.matches('[data-testid="submit-application-button"], [name="submit-application"]')) {
                    continue;
                }

                const label = normalize(button.getAttribute('aria-label') || button.textContent);

                if (
                    /^(continue|save and continue|next)$/i.test(label)
                    || /\bcontinue\b/i.test(label)
                ) {
                    return button;
                }
            }
        }

        return null;
    }

    function findSubmitButton({ includeDisabled = false, reviewOnly = true } = {}) {
        const reviewRoot = readIndeedReviewRoot();
        const scope = reviewOnly ? reviewRoot : (reviewRoot || readApplyModuleScope());

        if (reviewOnly && !scope) {
            return null;
        }

        const searchRoot = scope || document;
        const submit = searchRoot.querySelector('[data-testid="submit-application-button"], [name="submit-application"]');

        if (submit instanceof HTMLElement && (includeDisabled || !submit.disabled)) {
            return submit;
        }

        for (const button of searchRoot.querySelectorAll('button, [role="button"]')) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }

            if (!includeDisabled && button.disabled) {
                continue;
            }

            const label = normalize(button.getAttribute('aria-label') || button.textContent);

            if (/\b(submit application|submit your application)\b/i.test(label)) {
                return button;
            }
        }

        return null;
    }

    function readValidationErrors() {
        const errors = [];

        for (const node of document.querySelectorAll('[id*="error-text"], [class*="error"], [aria-invalid="true"]')) {
            if (!(node instanceof HTMLElement)) {
                continue;
            }

            if (node.matches('[aria-invalid="true"]')) {
                const describedBy = node.getAttribute('aria-describedby');

                if (describedBy) {
                    for (const id of describedBy.split(/\s+/)) {
                        const errorNode = document.getElementById(id);
                        const message = normalize(errorNode?.textContent);

                        if (message.length >= 3) {
                            errors.push(message);
                        }
                    }
                }
            }

            const message = normalize(node.textContent);

            if (message.length >= 3 && message.length < 240 && /required|invalid|enter|select/i.test(message)) {
                errors.push(message);
            }
        }

        return [...new Set(errors)].slice(0, 8);
    }

    function readInvalidFields() {
        const invalidFields = [];

        for (const input of document.querySelectorAll('input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"]')) {
            const label = typeof AutoCVApplyFormHeuristics !== 'undefined'
                ? AutoCVApplyFormHeuristics.getQuestionLabel(input)
                : normalize(input.getAttribute('aria-label') || input.name);

            invalidFields.push({
                label,
                question: label,
                field_type: input.type || 'text',
                dom: { id: input.id || null },
            });
        }

        return invalidFields;
    }

    function readStepFingerprint() {
        return readApplyStepSlug() || window.location.pathname;
    }

    function readStepLabel() {
        const slug = readApplyStepSlug() || '';
        const heading = document.querySelector(
            '[data-testid$="-heading"], h1[class*="mosaic-provider-module-apply"], h1',
        );

        return normalize(heading?.textContent) || slug.replace(/\//g, ' - ') || 'Indeed Apply';
    }

    function verifySubmitted() {
        const slug = readApplyStepSlug() || '';

        if (/post-apply|postapply/i.test(slug)) {
            return {
                submitted: true,
                confirmation: 'Application submitted',
            };
        }

        const bodyText = normalize(document.body?.textContent);
        const submitted = /application submitted|application has been submitted|thanks for applying|you applied|application was sent/i.test(bodyText)
            || Boolean(document.querySelector(
                '[data-testid="application-submitted"], [data-testid="post-apply"], #mosaic-provider-module-post-apply',
            ));

        return {
            submitted,
            confirmation: submitted ? 'Application submitted' : null,
        };
    }

    function getIndeedApplyState() {
        if (!isIndeedApplyFlowPage()) {
            const submittedCheck = verifySubmitted();

            return {
                open: false,
                submitted: submittedCheck.submitted,
                canSubmit: false,
                canContinue: false,
                stepLabel: null,
                stepFingerprint: null,
                validationErrors: [],
                invalidFields: [],
            };
        }

        const submittedCheck = verifySubmitted();

        if (submittedCheck.submitted) {
            return {
                open: true,
                submitted: true,
                canSubmit: false,
                canContinue: false,
                stepLabel: readStepLabel(),
                stepFingerprint: readStepFingerprint(),
                validationErrors: [],
                invalidFields: [],
                confirmation: submittedCheck.confirmation,
            };
        }

        const stepSlug = readApplyStepSlug() || '';
        const stepLabel = readStepLabel();

        if (/post-apply|postapply/i.test(stepSlug) || /application has been submitted/i.test(stepLabel)) {
            return {
                open: true,
                submitted: true,
                canSubmit: false,
                canContinue: false,
                stepLabel,
                stepFingerprint: readStepFingerprint(),
                validationErrors: [],
                invalidFields: [],
                confirmation: 'Application submitted',
            };
        }

        const onReviewStep = isIndeedReviewStep();
        const continueButton = readContinueButton();
        const submitButton = findSubmitButton({ includeDisabled: true, reviewOnly: true });
        const validationErrors = readValidationErrors();
        const invalidFields = readInvalidFields();
        const captchaPresent = readIndeedCaptchaPresent();

        return {
            open: true,
            submitted: false,
            canContinue: Boolean(continueButton),
            canSubmit: Boolean(submitButton && !submitButton.disabled),
            hasSubmitButton: Boolean(submitButton),
            submitDisabled: Boolean(submitButton?.disabled),
            isReviewStep: onReviewStep,
            captchaPresent,
            stepLabel: readStepLabel(),
            stepFingerprint: readStepFingerprint(),
            validationErrors,
            invalidFields,
            actionLabel: onReviewStep && submitButton
                ? normalize(submitButton.textContent)
                : (continueButton ? normalize(continueButton.textContent) : null),
        };
    }

    async function selectResumeCardIfNeeded() {
        const slug = readApplyStepSlug() || '';

        if (!slug.includes('resume-selection')) {
            return { selected: false };
        }

        const cardButton = document.querySelector('[data-testid="resume-selection-file-resume-radio-card-button"]');

        if (cardButton instanceof HTMLElement) {
            await clickElement(cardButton);

            return { selected: true };
        }

        return { selected: false };
    }

    async function clickContinueOrSubmit() {
        await acceptCookieConsent();
        await selectResumeCardIfNeeded();

        const previousFingerprint = readStepFingerprint();
        const onReviewStep = isIndeedReviewStep();

        if (onReviewStep) {
            const captchaPresent = readIndeedCaptchaPresent();
            const submitButton = findSubmitButton({ includeDisabled: true, reviewOnly: true });

            if (submitButton && !submitButton.disabled) {
                await clickElement(submitButton, { skipScroll: isElementMostlyVisible(submitButton) });
                await humanPause(1400, 2400);

                const verify = verifySubmitted();

                return {
                    success: true,
                    action: 'submit',
                    submitted: verify.submitted,
                    transitioned: true,
                    stepFingerprint: readStepFingerprint(),
                    validationErrors: readValidationErrors(),
                    confirmation: verify.confirmation,
                };
            }

            if (captchaPresent) {
                return {
                    success: false,
                    action: 'blocked',
                    error: 'Submit blocked by captcha on Indeed review step.',
                    validationErrors: readValidationErrors(),
                    stepFingerprint: previousFingerprint,
                };
            }

            if (submitButton?.disabled) {
                return {
                    success: false,
                    action: 'blocked',
                    error: 'Submit button is disabled on Indeed review step.',
                    validationErrors: readValidationErrors(),
                    stepFingerprint: previousFingerprint,
                };
            }
        }

        const continueButton = readContinueButton();

        if (!continueButton) {
            return {
                success: false,
                error: 'No Continue or Submit button found on Indeed Apply page.',
                validationErrors: readValidationErrors(),
                stepFingerprint: previousFingerprint,
            };
        }

        if (continueButton.disabled) {
            return {
                success: false,
                action: 'blocked',
                error: 'Continue is disabled.',
                validationErrors: readValidationErrors(),
                stepFingerprint: previousFingerprint,
            };
        }

        await clickElement(continueButton, { skipScroll: isElementMostlyVisible(continueButton) });

        const deadline = Date.now() + 14_000;

        while (Date.now() < deadline) {
            await humanPause(320, 560);

            const nextFingerprint = readStepFingerprint();

            if (nextFingerprint !== previousFingerprint) {
                return {
                    success: true,
                    action: 'continue',
                    submitted: false,
                    transitioned: true,
                    stepFingerprint: nextFingerprint,
                    validationErrors: readValidationErrors(),
                };
            }

            const verify = verifySubmitted();

            if (verify.submitted) {
                return {
                    success: true,
                    action: 'submit',
                    submitted: true,
                    transitioned: true,
                    stepFingerprint: nextFingerprint,
                    validationErrors: [],
                    confirmation: verify.confirmation,
                };
            }
        }

        const validationErrors = readValidationErrors();

        return {
            success: validationErrors.length === 0,
            action: validationErrors.length > 0 ? 'blocked' : 'continue',
            submitted: false,
            transitioned: false,
            stepFingerprint: readStepFingerprint(),
            validationErrors,
            error: validationErrors[0] || 'Indeed Apply did not advance after Continue.',
        };
    }

    async function goToNextSearchPage() {
        const nextLink = document.querySelector('a[aria-label="Next Page"], a[data-testid="pagination-page-next"]');

        if (!(nextLink instanceof HTMLElement)) {
            return { success: false, error: 'No next search page link found.' };
        }

        await clickElement(nextLink);
        await humanPause(1200, 2000);

        return { success: true };
    }

    async function scanPageHealth() {
        await acceptCookieConsent();

        if (document.querySelector('#authportal-main-container, #login-form')) {
            return {
                ok: false,
                issues: [{ code: 'login_required', message: 'Indeed sign-in required.' }],
                blocking: [{ code: 'login_required', message: 'Indeed sign-in required.' }],
                primary: { code: 'login_required', message: 'Indeed sign-in required.' },
            };
        }

        return { ok: true, issues: [], blocking: [], primary: null };
    }

    return {
        acceptCookieConsent,
        prepareJobSearch,
        prepareJobView,
        collectJobCards,
        selectJobById,
        waitForJobDetailReady,
        readJobDescriptionText,
        prepareJobDescriptionForRead,
        waitForJobDescriptionReady,
        clickIndeedApply,
        getIndeedApplyState,
        clickContinueOrSubmit,
        verifySubmitted,
        goToNextSearchPage,
        scanPageHealth,
        isIndeedApplyFlowPage,
        isIndeedSearchPage,
        isIndeedViewJobPage,
        revealJobCardById,
        findJobCardById,
    };
})();
