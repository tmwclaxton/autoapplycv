/**
 * SimplyHired Quick Apply DOM helpers (Indeed Apply runs in nested iframes).
 */
var AutoCVApplySimplyHiredAutoApply = (() => {
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

    function isSimplyHiredHostname() {
        return /(^|\.)simplyhired\.(co\.uk|com)$/i.test(window.location.hostname);
    }

    function isSimplyHiredSearchPage() {
        return isSimplyHiredHostname() && /^\/search$/i.test(window.location.pathname);
    }

    function isSimplyHiredJobPage() {
        return isSimplyHiredHostname() && /^\/job\//i.test(window.location.pathname);
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
            'button[data-testid="accept-cookies"]',
            'button[data-testid="acceptAllCookies"]',
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

    function readJobIdFromHref(href) {
        const match = String(href || '').match(/\/job\/([^/?#]+)/i);

        return match?.[1] || null;
    }

    function readJobIdFromUrl() {
        const match = window.location.pathname.match(/\/job\/([^/?#]+)/i);

        return match?.[1] || null;
    }

    function resolveSimplyHiredOrigin() {
        if (isSimplyHiredHostname()) {
            return `https://${window.location.hostname}`;
        }

        return 'https://www.simplyhired.co.uk';
    }

    function cardHasQuickApply(item) {
        if (item.querySelector('[data-testid="searchSerpJobQuickApply"]')) {
            return true;
        }

        return /\bquick apply\b/i.test(normalize(item.textContent));
    }

    function readJobCardTitleLink(item) {
        return item.querySelector('[data-testid="searchSerpJobTitle"] a')
            || item.querySelector('a[data-testid="searchSerpJobTitle"]');
    }

    function readEmployerName(item) {
        const company = normalize(item.querySelector('[data-testid="companyName"]')?.textContent)
            || normalize(item.querySelector('[data-testid="searchSerpJobCompany"]')?.textContent)
            || normalize(item.querySelector('[data-testid="viewJobCompanyName"]')?.textContent);

        if (company) {
            return company;
        }

        const text = normalize(item.textContent);
        const emDashMatch = text.match(/\s[\u2014\u2013-]\s*([^|\d]+?)(?:\s*\d(?:\.\d)?\s|\s+Quick apply|$)/i);

        if (emDashMatch?.[1]) {
            return emDashMatch[1].trim();
        }

        return '';
    }

    function readJobCardsFromDocument({ quickApplyOnly = true } = {}) {
        const jobs = [];
        const seen = new Set();
        const cards = document.querySelectorAll('[data-testid="searchSerpJob"]');

        for (const item of cards) {
            const titleLink = readJobCardTitleLink(item);
            const jobId = item.getAttribute('data-jobkey')
                || readJobIdFromHref(titleLink?.getAttribute('href') || '');

            if (!jobId || seen.has(jobId)) {
                continue;
            }

            const quickApply = cardHasQuickApply(item);

            if (quickApplyOnly && !quickApply) {
                continue;
            }

            seen.add(jobId);

            const href = titleLink?.getAttribute('href') || '';
            const title = normalize(titleLink?.textContent) || 'Unknown role';
            const company = readEmployerName(item) || 'Unknown company';
            const cardText = normalize(item.textContent);
            const alreadyApplied = /\bapplied\b/i.test(cardText);
            const origin = resolveSimplyHiredOrigin();

            jobs.push({
                jobId,
                path: href.startsWith('/') ? href.split('?')[0] : null,
                title,
                company,
                simplyHiredApply: quickApply,
                quickApply,
                alreadyApplied,
                url: href.startsWith('http') ? href : `${origin}${href}`,
            });
        }

        return jobs;
    }

    function collectJobCards() {
        const quickApplyJobs = readJobCardsFromDocument({ quickApplyOnly: true });

        if (quickApplyJobs.length > 0) {
            return quickApplyJobs;
        }

        return readJobCardsFromDocument({ quickApplyOnly: false })
            .filter((job) => job.quickApply);
    }

    async function prepareJobSearch() {
        await acceptCookieConsent();

        const deadline = Date.now() + 25_000;

        while (Date.now() < deadline) {
            const cards = document.querySelectorAll('[data-testid="searchSerpJob"]');
            const quickApplyCount = readJobCardsFromDocument({ quickApplyOnly: true }).length;

            if (cards.length >= 3 && quickApplyCount > 0) {
                return { success: true, cardCount: cards.length, quickApplyCount };
            }

            window.scrollBy({ top: 700, behavior: 'smooth' });
            await humanPause(550, 850);
        }

        const cardCount = document.querySelectorAll('[data-testid="searchSerpJob"]').length;
        const quickApplyCount = readJobCardsFromDocument({ quickApplyOnly: true }).length;

        return { success: cardCount > 0, cardCount, quickApplyCount };
    }

    function readApplyButton() {
        const selectors = [
            'button[data-testid="viewJobHeaderFooterApplyButton"]',
            'a[data-testid="viewJobHeaderFooterApplyButton"]',
            '[data-testid="viewJobShareApplyContainer"] button',
            '[data-testid="viewJobShareApplyContainer"] a',
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);

            if (button instanceof HTMLElement && isElementVisible(button)) {
                const label = normalize(button.textContent);

                if (!label || /share/i.test(label)) {
                    continue;
                }

                return button;
            }
        }

        for (const button of document.querySelectorAll('button, a[role="button"], a.chakra-button')) {
            if (!(button instanceof HTMLElement) || !isElementVisible(button)) {
                continue;
            }

            const text = normalize(button.textContent);
            const label = normalize(button.getAttribute('aria-label') || '');

            if (/^apply$/i.test(text)
                || /^apply now$/i.test(text)
                || /^quick apply$/i.test(text)
                || /apply now/i.test(label)
                || /quick apply/i.test(label)) {
                return button;
            }
        }

        return null;
    }

    function readExternalApplyMarker() {
        for (const element of document.querySelectorAll('a, button')) {
            if (!(element instanceof HTMLElement) || !isElementVisible(element)) {
                continue;
            }

            const text = normalize(element.textContent);

            if (/apply on company site|apply on employer|company website/i.test(text)) {
                return element;
            }
        }

        return null;
    }

    function hasIndeedApplyIframe() {
        for (const iframe of document.querySelectorAll('iframe')) {
            const title = iframe.getAttribute('title') || '';
            const src = iframe.getAttribute('src') || '';

            if (/job application form/i.test(title) || /indeedapply|smartapply\.indeed/i.test(src)) {
                return true;
            }
        }

        return false;
    }

    function readApplyAvailability() {
        if (hasIndeedApplyIframe()) {
            return { quickApply: true, hasApplyButton: true, alreadyOpen: true };
        }

        if (readExternalApplyMarker()) {
            return { quickApply: false, hasApplyButton: false, externalApply: true };
        }

        const applyButton = readApplyButton();

        if (applyButton) {
            const href = applyButton.getAttribute('href') || '';
            const external = /^https?:\/\//i.test(href)
                && !/simplyhired\.(co\.uk|com)/i.test(href)
                && !/indeedapply|smartapply/i.test(href);

            return {
                quickApply: !external,
                hasApplyButton: true,
                externalApply: external,
            };
        }

        return { quickApply: false, hasApplyButton: false };
    }

    async function clickSimplyHiredApply() {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            if (hasIndeedApplyIframe()) {
                return { success: true, quickApply: true, alreadyOpen: true };
            }

            const applyButton = readApplyButton();

            if (applyButton) {
                await scrollIntoViewHuman(applyButton);
                await clickElement(applyButton, { quick: false });

                const iframeDeadline = Date.now() + 18_000;

                while (Date.now() < iframeDeadline) {
                    if (hasIndeedApplyIframe()) {
                        return { success: true, quickApply: true };
                    }

                    await humanPause(500, 800);
                }

                const href = applyButton.getAttribute('href') || '';

                if (/^\/out\?/i.test(href) || /indeedapply|smartapply/i.test(href)) {
                    return { success: true, quickApply: true, clicked: true, navigating: true };
                }

                return { success: true, quickApply: true, clicked: true };
            }

            if (readExternalApplyMarker()) {
                return {
                    success: false,
                    quickApply: false,
                    error: 'Job uses external apply, not Quick Apply.',
                };
            }

            await humanPause(550, 850);
        }

        return { success: false, error: 'SimplyHired Quick Apply button not found on job page.' };
    }

    function findJobCardById(jobId) {
        const targetId = String(jobId || '').trim();

        for (const item of document.querySelectorAll('[data-testid="searchSerpJob"]')) {
            const cardJobId = item.getAttribute('data-jobkey')
                || readJobIdFromHref(readJobCardTitleLink(item)?.getAttribute('href') || '');

            if (cardJobId === targetId) {
                return { item };
            }
        }

        return null;
    }

    async function selectJobById(jobId) {
        const targetId = String(jobId || '').trim();
        const match = findJobCardById(targetId);

        if (!match?.item) {
            return {
                success: false,
                error: `SimplyHired job card not found for id ${targetId}.`,
                needsNavigation: true,
                jobId: targetId,
            };
        }

        const titleLink = readJobCardTitleLink(match.item);
        const href = titleLink?.getAttribute('href') || '';
        const path = href.startsWith('/')
            ? href.split('?')[0]
            : (targetId ? `/job/${targetId}` : null);

        // Do not click SERP title links: full /job navigations unload the content
        // script mid-handler and surface as SELECT_JOB tab-message timeouts.
        // Orchestrator opens the job URL directly (same pattern as Reed/Totaljobs).
        return {
            success: false,
            needsNavigation: true,
            jobId: targetId,
            path,
        };
    }

    async function waitForJobDetailReady(jobId, timeoutMs = 35_000) {
        const targetId = String(jobId || '').trim();
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            if (readJobIdFromUrl() === targetId && isSimplyHiredJobPage()) {
                if (readApplyButton() || readExternalApplyMarker() || hasIndeedApplyIframe()) {
                    return { success: true, jobId: targetId };
                }
            }

            const title = normalize(document.querySelector('[data-testid="viewJobTitle"]')?.textContent);

            if (title && (readApplyButton() || hasIndeedApplyIframe())) {
                const match = findJobCardById(targetId);

                if (match?.item) {
                    return { success: true, jobId: targetId };
                }
            }

            // Do not treat a bare /job URL as ready: SERP "Quick Apply" badges often
            // land on shells with no Apply control (or Cloudflare/Indeed interstitial).
            if (
                isSimplyHiredJobPage()
                && readJobIdFromUrl() === targetId
                && (readApplyButton() || readExternalApplyMarker() || hasIndeedApplyIframe())
            ) {
                return { success: true, jobId: targetId };
            }

            await humanPause(500, 800);
        }

        return { success: false, error: 'SimplyHired job detail panel did not load.' };
    }

    function readJobDescriptionText() {
        const selectors = [
            '[data-testid="viewJobBodyJobFullDescriptionContent"]',
            '[data-testid="viewJobBodyContainer"]',
            '[data-testid="viewJobBodyJobDetailsContainer"]',
            'main',
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

    async function waitForJobDescriptionReady(minLength = 200, timeoutMs = 20_000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const text = readJobDescriptionText();

            if (text.length >= minLength) {
                return { ready: true, length: text.length };
            }

            await humanPause(500, 900);
        }

        return { ready: false, length: readJobDescriptionText().length };
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

    function scanPageHealth() {
        const bodyText = normalize(document.body?.textContent);

        if (/humans only|mistakenly blocked|security protections may/i.test(bodyText)) {
            return {
                ok: false,
                primary: {
                    message: 'SimplyHired blocked automated access. Sign in manually and retry.',
                },
                blocking: ['SimplyHired bot protection page'],
            };
        }

        if (/sign in to simplyhired|create an account/i.test(bodyText)
            && !document.querySelector('[data-testid="searchSerpJob"]')
            && !document.querySelector('[data-testid="viewJobTitle"]')) {
            return {
                ok: false,
                primary: {
                    message: 'Sign in to SimplyHired to use Auto Apply.',
                },
                blocking: ['SimplyHired sign-in required'],
            };
        }

        return { ok: true };
    }

    async function goToNextSearchPage() {
        const next = document.querySelector('a[data-testid="pageNumberBlockNext"]');

        if (!(next instanceof HTMLElement)) {
            return { success: false };
        }

        await clickElement(next);
        await humanPause(800, 1300);

        return { success: true };
    }

    function isEasyApplyHostPage() {
        if (!isSimplyHiredHostname()) {
            return false;
        }

        return hasIndeedApplyIframe();
    }

    return {
        acceptCookieConsent,
        clickSimplyHiredApply,
        collectJobCards,
        goToNextSearchPage,
        isEasyApplyHostPage,
        isSimplyHiredSearchPage,
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

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplySimplyHiredAutoApply = AutoCVApplySimplyHiredAutoApply;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplySimplyHiredAutoApply = AutoCVApplySimplyHiredAutoApply;
}
