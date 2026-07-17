/**
 * Glassdoor Easy Apply DOM helpers (Indeed Apply runs in nested iframes).
 */
const AutoCVApplyGlassdoorAutoApply = (() => {
    const sleep = (ms) =>
        new Promise((resolve) => window.setTimeout(resolve, ms));

    function normalize(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .trim();
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

    function isGlassdoorHostname() {
        return /glassdoor\.(com|co\.uk)$/i.test(window.location.hostname);
    }

    function isGlassdoorSearchPage() {
        if (!isGlassdoorHostname()) {
            return false;
        }

        const path = window.location.pathname;

        return (
            /^\/Job\/(jobs|index)\.htm$/i.test(path) ||
            /^\/Job\/.+-jobs-SRCH_/i.test(path)
        );
    }

    function isGlassdoorJobListingPage() {
        return (
            isGlassdoorHostname() &&
            /\/job-listing\//i.test(window.location.pathname)
        );
    }

    function isElementVisible(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        const style = window.getComputedStyle(element);

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            element.getClientRects().length > 0
        );
    }

    async function scrollIntoViewHuman(element) {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        element.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
            behavior: 'smooth',
        });
        await humanPause(280, 520);
    }

    async function clickElement(element, { quick = false } = {}) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        if (!quick) {
            await scrollIntoViewHuman(element);
        }

        element.dispatchEvent(
            new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
            }),
        );
        element.dispatchEvent(
            new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window,
            }),
        );
        element.click();

        return true;
    }

    async function acceptCookieConsent() {
        const button = document.querySelector(
            '#onetrust-accept-btn-handler, button[data-test="accept-cookie-policy"], button[id*="accept-cookie"]',
        );

        if (!(button instanceof HTMLElement)) {
            return { accepted: false };
        }

        await clickElement(button, { quick: true });
        await humanPause(400, 700);

        return { accepted: true };
    }

    function dismissLoginOverlay() {
        for (const selector of [
            '#HardsellOverlay',
            '.LoginModal',
            '[data-test="authModal"]',
        ]) {
            const node = document.querySelector(selector);

            if (node instanceof HTMLElement) {
                node.style.setProperty('display', 'none', 'important');
            }
        }

        document.body?.style.setProperty('overflow', 'auto', 'important');
    }

    function readJobIdFromHref(href) {
        const match = String(href || '').match(
            /[?&](?:jl|jobListingId)=(\d+)/i,
        );

        return match?.[1] || null;
    }

    function readJobCardLink(item) {
        return (
            item.querySelector('a[data-test="job-title"][href*="jl="]') ||
            item.querySelector('a[data-test="job-title"]') ||
            item.querySelector('a[data-test="job-link"][href*="jl="]') ||
            item.querySelector('a[data-test="job-link"]') ||
            item.querySelector('a[href*="jl="]')
        );
    }

    function readEmployerName(item) {
        const selectors = [
            '[data-test="employer-name"]',
            '[class*="compactEmployerName"]',
            '[class*="employerName"]',
            '.EmployerProfile_compactEmployerName__9MGcV',
        ];

        for (const selector of selectors) {
            const text = normalize(item.querySelector(selector)?.textContent);

            if (text) {
                return text;
            }
        }

        return '';
    }

    function cardHasEasyApply(item, cardText) {
        if (item.matches('[data-is-easy-apply="true"]')) {
            return true;
        }

        if (
            item.querySelector(
                '[data-test="easyApply"], [data-test="easy-apply"], [class*="easyApplyTag"], [class*="easyApplyLabel"], [aria-label="Easy Apply"]',
            )
        ) {
            return true;
        }

        return /\beasy apply\b/i.test(cardText);
    }

    function resolveGlassdoorOrigin() {
        if (isGlassdoorHostname()) {
            return `https://${window.location.hostname}`;
        }

        return 'https://www.glassdoor.com';
    }

    function readJobSearchRoot() {
        return (
            document.querySelector('[data-test="job-list-panel"]') ||
            document.querySelector('[data-test="job-results"]') ||
            document.querySelector('[data-test="serp-job-list"]') ||
            document.querySelector('ul[aria-label="Jobs List"]') ||
            document.querySelector('[class*="JobsList_jobsList"]') ||
            document.querySelector('[class*="JobsList_wrapper"]') ||
            null
        );
    }

    function readJobCardsFromDocument() {
        if (!isGlassdoorSearchPage()) {
            return [];
        }

        const root = readJobSearchRoot() || document;

        const jobs = [];
        const seen = new Set();

        const listings = root.querySelectorAll('[data-test="jobListing"]');

        for (const item of listings) {
            const link = readJobCardLink(item);
            const href = link?.getAttribute('href') || '';
            const jobId =
                readJobIdFromHref(href) || item.getAttribute('data-jobid');

            if (!jobId || seen.has(jobId)) {
                continue;
            }

            seen.add(jobId);

            const title =
                normalize(
                    item.querySelector('[data-test="job-title"]')?.textContent,
                ) ||
                normalize(link?.textContent) ||
                'Unknown role';
            const company = readEmployerName(item) || 'Unknown company';
            const cardText = normalize(item.textContent);
            const alreadyApplied = /\bapplied\b/i.test(cardText);
            const easyApply = cardHasEasyApply(item, cardText);

            const origin = resolveGlassdoorOrigin();

            jobs.push({
                jobId,
                path: href.startsWith('/') ? href : null,
                title,
                company,
                glassdoorApply: easyApply,
                easyApply,
                alreadyApplied,
                url: href.startsWith('http') ? href : `${origin}${href}`,
            });
        }

        return jobs;
    }

    function collectJobCards() {
        return readJobCardsFromDocument();
    }

    function setNativeInputValue(input, value) {
        if (!(input instanceof HTMLInputElement)) {
            return false;
        }

        const prototype = Object.getPrototypeOf(input);
        const descriptor =
            Object.getOwnPropertyDescriptor(prototype, 'value') ||
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

        if (descriptor?.set) {
            descriptor.set.call(input, value);
        } else {
            input.value = value;
        }

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
    }

    async function fillAndSubmitJobSearch(keyword, location) {
        const keywordInput =
            document.querySelector('[data-test="keyword-search-input"]') ||
            document.querySelector('#searchBar-jobTitle') ||
            document.querySelector('#sc\\.keyword');
        const locationInput =
            document.querySelector('[data-test="location-search-input"]') ||
            document.querySelector('#sc\\.location');
        const searchButton = document.querySelector(
            '[data-test="search-button"]',
        );

        if (
            !(keywordInput instanceof HTMLInputElement) ||
            !(searchButton instanceof HTMLElement)
        ) {
            return { success: false, error: 'Glassdoor search form not found.' };
        }

        if (keyword) {
            keywordInput.focus();
            setNativeInputValue(keywordInput, keyword);
            await humanPause(200, 400);
        }

        if (location && locationInput instanceof HTMLInputElement) {
            locationInput.focus();
            setNativeInputValue(locationInput, location);
            await humanPause(200, 400);
        }

        await clickElement(searchButton, { quick: true });
        await humanPause(1200, 2000);

        return { success: true };
    }

    function evaluateSearchMatch(expectedKeyword, expectedLocation) {
        const params = new URLSearchParams(window.location.search);
        const currentKeyword = String(params.get('sc.keyword0') || '').trim();
        const currentLocation = String(params.get('locKeyword') || '').trim();
        const path = String(window.location.pathname || '');
        const slug = (text) =>
            String(text || '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');

        if (/countryRedirect=true/i.test(window.location.href)) {
            return false;
        }

        const keywordSlug = slug(expectedKeyword);
        const locationSlug = slug(expectedLocation);
        const pathSlug = slug(path);
        const seoSearch = /^\/Job\/.+-jobs-SRCH_/i.test(path);
        const queryKeywordMatched =
            Boolean(keywordSlug) && slug(currentKeyword) === keywordSlug;
        const queryLocationMatched =
            !locationSlug || slug(currentLocation) === locationSlug;

        // Query params already match even if Glassdoor keeps the Recommended title.
        if (queryKeywordMatched && queryLocationMatched) {
            return true;
        }

        if (
            /Recommended Jobs For You/i.test(document.title || '') &&
            !seoSearch
        ) {
            return false;
        }

        if (expectedKeyword) {
            const keywordMatched =
                queryKeywordMatched ||
                (seoSearch && pathSlug.includes(keywordSlug));

            if (!keywordMatched) {
                return false;
            }
        }

        if (expectedLocation) {
            const locationMatched =
                queryLocationMatched ||
                (seoSearch && pathSlug.includes(locationSlug));

            if (!locationMatched) {
                return false;
            }
        }

        return true;
    }

    async function prepareJobSearch(options = {}) {
        dismissLoginOverlay();
        await acceptCookieConsent();

        const expectedKeyword = String(options.expectedKeyword || '').trim();
        const expectedLocation = String(options.expectedLocation || '').trim();

        let searchMatched = evaluateSearchMatch(
            expectedKeyword,
            expectedLocation,
        );

        const cardCount = (
            readJobSearchRoot() || document
        ).querySelectorAll('[data-test="jobListing"]').length;

        if (cardCount >= 3 && searchMatched) {
            return { success: true, skipped: true, searchMatched: true };
        }

        if (!searchMatched && (expectedKeyword || expectedLocation)) {
            const submitted = await fillAndSubmitJobSearch(
                expectedKeyword,
                expectedLocation,
            );

            if (submitted.success) {
                const deadline = Date.now() + 12_000;

                while (Date.now() < deadline) {
                    searchMatched = evaluateSearchMatch(
                        expectedKeyword,
                        expectedLocation,
                    );

                    if (searchMatched) {
                        return {
                            success: true,
                            searchMatched: true,
                            submitted: true,
                        };
                    }

                    await humanPause(400, 700);
                }
            }

            return {
                success: false,
                searchMatched: false,
                error: /countryRedirect=true/i.test(window.location.href)
                    ? 'Glassdoor redirected this search to a regional recommended feed. Sign in with a US Glassdoor profile or clear the country redirect before Auto Apply.'
                    : 'Glassdoor search results do not match the expected role or location.',
            };
        }

        window.scrollBy({ top: 500, behavior: 'smooth' });
        await humanPause(400, 700);

        return { success: true, searchMatched };
    }

    function readApplyButton() {
        const selectors = [
            'button[data-test="easyApply"]',
            'button[data-test="applyButton"]',
            'button[aria-label*="Easy Apply"]',
            'button[aria-label*="Apply now"]',
            '[data-test="easyApply"] button',
            '.EasyApplyButton_applyButtonContainer__IZP9s button',
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);

            if (button instanceof HTMLElement && isElementVisible(button)) {
                return button;
            }
        }

        for (const button of document.querySelectorAll(
            'button, a[role="button"]',
        )) {
            if (!(button instanceof HTMLElement) || !isElementVisible(button)) {
                continue;
            }

            const text = normalize(button.textContent);
            const label = normalize(button.getAttribute('aria-label') || '');

            if (/^easy apply$/i.test(text) || /easy apply/i.test(label)) {
                return button;
            }
        }

        return null;
    }

    function readExternalApplyMarker() {
        for (const element of document.querySelectorAll('a, button')) {
            if (
                !(element instanceof HTMLElement) ||
                !isElementVisible(element)
            ) {
                continue;
            }

            const text = normalize(element.textContent);
            const href = element.getAttribute('href') || '';

            if (/apply on company site|apply on employer/i.test(text)) {
                return element;
            }

            if (href && !/glassdoor\.com/i.test(href) && /apply/i.test(text)) {
                return element;
            }
        }

        return null;
    }

    function hasIndeedApplyIframe() {
        for (const iframe of document.querySelectorAll('iframe')) {
            const title = iframe.getAttribute('title') || '';
            const src = iframe.getAttribute('src') || '';

            if (
                /job application form/i.test(title) ||
                /indeedapply|smartapply\.indeed/i.test(src)
            ) {
                return true;
            }
        }

        return false;
    }

    function readApplyAvailability() {
        if (hasIndeedApplyIframe()) {
            return { easyApply: true, hasApplyButton: true, alreadyOpen: true };
        }

        if (readExternalApplyMarker()) {
            return {
                easyApply: false,
                hasApplyButton: false,
                externalApply: true,
            };
        }

        const applyButton = readApplyButton();

        return {
            easyApply: Boolean(applyButton),
            hasApplyButton: Boolean(applyButton),
        };
    }

    async function clickGlassdoorApply() {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            dismissLoginOverlay();

            if (hasIndeedApplyIframe()) {
                return { success: true, easyApply: true, alreadyOpen: true };
            }

            const applyButton = readApplyButton();

            if (applyButton) {
                await scrollIntoViewHuman(applyButton);
                await clickElement(applyButton, { quick: false });

                const iframeDeadline = Date.now() + 18_000;

                while (Date.now() < iframeDeadline) {
                    if (hasIndeedApplyIframe()) {
                        return { success: true, easyApply: true };
                    }

                    await humanPause(500, 800);
                }

                return { success: true, easyApply: true, clicked: true };
            }

            if (readExternalApplyMarker()) {
                return {
                    success: false,
                    easyApply: false,
                    error: 'Job uses external apply, not Easy Apply.',
                };
            }

            await humanPause(550, 850);
        }

        return {
            success: false,
            error: 'Glassdoor Easy Apply button not found on job page.',
        };
    }

    function findJobCardById(jobId) {
        const targetId = String(jobId || '').trim();
        const root = readJobSearchRoot() || document;

        for (const item of root.querySelectorAll('[data-test="jobListing"]')) {
            const link = readJobCardLink(item);
            const href = link?.getAttribute('href') || '';
            const cardJobId =
                readJobIdFromHref(href) || item.getAttribute('data-jobid');

            if (cardJobId === targetId) {
                return { item, link };
            }
        }

        return null;
    }

    async function selectJobById(jobId) {
        const match = findJobCardById(jobId);

        if (!match?.item) {
            return {
                success: false,
                error: `Glassdoor job card not found for id ${jobId}.`,
            };
        }

        const cardClickTarget =
            match.item.querySelector('[data-test="job-card-wrapper"]') ||
            match.item.querySelector('[data-test="job-link"]') ||
            match.item;

        await clickElement(cardClickTarget);
        await humanPause(700, 1100);

        return { success: true, jobId };
    }

    async function waitForJobDetailReady(jobId, timeoutMs = 20_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            dismissLoginOverlay();

            if (
                readApplyButton() ||
                readExternalApplyMarker() ||
                hasIndeedApplyIframe()
            ) {
                return { success: true, jobId };
            }

            const match = findJobCardById(jobId);
            const selected =
                match?.item?.matches?.(
                    '[aria-current="true"], [data-selected="true"]',
                ) || match?.item?.classList?.contains('selected');

            if (selected) {
                await humanPause(500, 800);
                continue;
            }

            if (isGlassdoorJobListingPage()) {
                return { success: true, jobId };
            }

            await humanPause(500, 800);
        }

        return {
            success: false,
            error: 'Glassdoor job detail panel did not load.',
        };
    }

    function readJobDescriptionText() {
        const selectors = [
            '[data-test="job-description"]',
            '[data-test="jobDescriptionContent"]',
            '[class*="JobDetails_jobDescription"]',
            '[class*="jobDescription"]',
            '#JobDescription',
            '[data-test="jobViewHeader"]',
        ];

        let best = '';

        for (const selector of selectors) {
            const text = normalize(
                document.querySelector(selector)?.textContent,
            );

            if (text.length > best.length) {
                best = text;
            }
        }

        if (best.length < 200) {
            const mainText = normalize(
                document.querySelector('main')?.textContent,
            );

            if (mainText.length > best.length) {
                best = mainText;
            }
        }

        return best.slice(0, 20000);
    }

    async function waitForJobDescriptionReady(
        minLength = 200,
        timeoutMs = 20_000,
    ) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            dismissLoginOverlay();

            const text = readJobDescriptionText();

            if (text.length >= minLength) {
                return { ready: true, length: text.length };
            }

            await humanPause(500, 900);
        }

        return { ready: false, length: readJobDescriptionText().length };
    }

    async function prepareJobView({ light = false } = {}) {
        dismissLoginOverlay();

        if (!light) {
            await acceptCookieConsent();
        }

        return { success: true };
    }

    function scanPageHealth() {
        const bodyText = normalize(document.body?.textContent);
        const title = normalize(document.title);

        if (
            /^security$/i.test(title) ||
            /humans only|mistakenly blocked|security protections may|verify you are human/i.test(
                bodyText,
            )
        ) {
            return {
                ok: false,
                captcha: true,
                primary: {
                    code: 'captcha_required',
                    message:
                        'Glassdoor security check - solve in the browser, then resume Auto Apply.',
                },
                blocking: [
                    {
                        code: 'captcha_required',
                        message: 'Glassdoor security check',
                    },
                ],
            };
        }

        if (
            /sign in to glassdoor|create an account/i.test(bodyText) &&
            !document.querySelector('[data-test="jobListing"]')
        ) {
            return {
                ok: false,
                primary: {
                    message: 'Sign in to Glassdoor to use Auto Apply.',
                },
                blocking: ['Glassdoor sign-in required'],
            };
        }

        return { ok: true };
    }

    async function goToNextSearchPage() {
        const next = document.querySelector(
            '[data-test="pagination-next"], a[aria-label="Next"]',
        );

        if (
            !(next instanceof HTMLElement) ||
            next.getAttribute('aria-disabled') === 'true'
        ) {
            return { success: false };
        }

        await clickElement(next);
        await humanPause(800, 1300);

        return { success: true };
    }

    function isEasyApplyHostPage() {
        if (!isGlassdoorHostname()) {
            return false;
        }

        return hasIndeedApplyIframe();
    }

    return {
        acceptCookieConsent,
        clickGlassdoorApply,
        collectJobCards,
        readJobSearchRoot,
        goToNextSearchPage,
        isEasyApplyHostPage,
        isGlassdoorSearchPage,
        prepareJobSearch,
        prepareJobView,
        readApplyAvailability,
        readJobDescriptionText,
        scanPageHealth,
        selectJobById,
        waitForJobDescriptionReady,
        waitForJobDetailReady,
    };
})();
