import {
    bridgeCommand,
    clearActiveBridgeTab,
    setActiveBridgeTab,
} from '../../extension-bridge/lib/bridge-http.mjs';
import {
    ashbyBoardUrl,
    extractAshbyJobDetailUrlsFromHtml,
    parseAshbyUrl,
} from './ashby-board.mjs';
import { pollBridgeFieldInventory } from './bridge-inventory-hydration.mjs';
import { normalizeUrl } from './scrape-url-queue.mjs';

const ASHBY_HOSTNAME = 'jobs.ashbyhq.com';

const ASHBY_APPLY_PATTERN =
    /^apply(?:\s+(?:for\s+(?:this\s+)?job|now|to\s+this\s+job))?$/i;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Array<{ text?: string, disabled?: boolean, href?: string, id?: string }>} buttons
 * @returns {{ text: string } | null}
 */
export function findAshbyApplyButton(buttons = []) {
    for (const button of buttons) {
        if (button.disabled) {
            continue;
        }

        const text = String(button.text || '').trim();
        const href = String(button.href || '');
        const id = String(button.id || '');

        if (
            id === 'job-application-form' ||
            /\/application\/?$/i.test(href)
        ) {
            return button;
        }

        if (/^application$/i.test(text)) {
            return button;
        }
    }

    for (const button of buttons) {
        if (button.disabled) {
            continue;
        }

        const text = String(button.text || '').trim();

        if (!text) {
            continue;
        }

        if (ASHBY_APPLY_PATTERN.test(text)) {
            return button;
        }

        if (/^apply\b/i.test(text) && text.length <= 48 && !/applied/i.test(text)) {
            return button;
        }
    }

    for (const button of buttons) {
        if (button.disabled) {
            continue;
        }

        const href = String(button.href || '');

        if (href.endsWith('/application')) {
            return button;
        }
    }

    return null;
}

/**
 * @param {number} tabId
 * @param {number} timeoutMs
 * @returns {Promise<{ text: string } | null>}
 */
async function pollAshbyApplyButton(tabId, timeoutMs) {
    const deadline = Date.now() + Math.min(timeoutMs, 20000);
    let lastButtons = [];

    while (Date.now() < deadline) {
        const buttonsResult = await bridgeCommand(
            'find_buttons',
            { tabId },
            { timeoutMs },
        );
        lastButtons = buttonsResult?.buttons || [];
        const applyButton = findAshbyApplyButton(lastButtons);

        if (applyButton?.text) {
            return applyButton;
        }

        await sleep(1500);
    }

    return findAshbyApplyButton(lastButtons);
}

/**
 * Load an Ashby company board page and wait until job detail URLs are discoverable.
 *
 * @param {string} boardUrl
 * @param {{ tabId?: number | null, timeoutMs?: number, hydrateTimeoutMs?: number, pollIntervalMs?: number }} [options]
 */
export async function fetchAshbyBoardHtml(boardUrl, options = {}) {
    const timeoutMs = options.timeoutMs ?? 90000;
    const hydrateTimeoutMs = options.hydrateTimeoutMs ?? 45000;
    const pollIntervalMs = options.pollIntervalMs ?? 2500;
    const initialSettleMs = 3000;
    let tabId = options.tabId ?? null;
    let lastHtml = '';

    if (tabId !== null) {
        await setActiveBridgeTab(tabId);
    }

    const navigate = await bridgeCommand(
        'navigate_tab',
        {
            url: boardUrl,
            newTab: tabId === null,
            tabId: tabId ?? undefined,
            active: false,
        },
        { timeoutMs },
    );

    tabId = navigate.tabId;
    await setActiveBridgeTab(tabId);

    await bridgeCommand(
        'wait_for_tab',
        {
            tabId,
            urlIncludes: ASHBY_HOSTNAME,
            timeoutMs,
        },
        { timeoutMs },
    );

    if (initialSettleMs > 0) {
        await sleep(initialSettleMs);
    }

    const deadline = Date.now() + hydrateTimeoutMs;

    while (Date.now() < deadline) {
        const page = await bridgeCommand(
            'get_page_html',
            { tabId },
            { timeoutMs },
        );
        lastHtml = typeof page?.html === 'string' ? page.html : '';
        const jobDetailUrls = extractAshbyJobDetailUrlsFromHtml(
            lastHtml,
            boardUrl,
        );

        if (jobDetailUrls.length > 0) {
            return {
                html: lastHtml,
                tabId,
                jobDetailUrls,
                pageUrl: page?.page_url || boardUrl,
                pageTitle: page?.page_title || '',
            };
        }

        const remainingMs = deadline - Date.now();

        if (remainingMs <= 0) {
            break;
        }

        await sleep(Math.min(pollIntervalMs, remainingMs));
    }

    return {
        html: lastHtml,
        tabId,
        jobDetailUrls: extractAshbyJobDetailUrlsFromHtml(lastHtml, boardUrl),
        pageUrl: boardUrl,
        pageTitle: '',
    };
}

/**
 * Navigate to an Ashby job detail page, click Apply, wait for the application form, capture HTML.
 *
 * @param {string} jobDetailUrl
 * @param {{ tabId?: number | null, minFields?: number, timeoutMs?: number, hydrateTimeoutMs?: number, pollIntervalMs?: number }} [options]
 */
export async function captureAshbyJobViaApplyClick(jobDetailUrl, options = {}) {
    const timeoutMs = options.timeoutMs ?? 90000;
    const minFields = options.minFields ?? 2;
    const pollIntervalMs = options.pollIntervalMs ?? 2500;
    const hydrateTimeoutMs = options.hydrateTimeoutMs ?? 45000;
    const initialSettleMs = 3000;
    let tabId = options.tabId ?? null;

    if (tabId !== null) {
        await setActiveBridgeTab(tabId);
    }

    const navigate = await bridgeCommand(
        'navigate_tab',
        {
            url: jobDetailUrl,
            newTab: tabId === null,
            tabId: tabId ?? undefined,
            active: false,
        },
        { timeoutMs },
    );

    tabId = navigate.tabId;
    await setActiveBridgeTab(tabId);

    await bridgeCommand(
        'wait_for_tab',
        {
            tabId,
            urlIncludes: ASHBY_HOSTNAME,
            timeoutMs,
        },
        { timeoutMs },
    );

    if (initialSettleMs > 0) {
        await sleep(initialSettleMs);
    }

    const applyButton = await pollAshbyApplyButton(tabId, timeoutMs);

    if (!applyButton?.text) {
        return {
            status: 'skip',
            reason: 'no Apply/Application control on job detail page',
            url: jobDetailUrl,
            tabId,
            applyClicked: false,
        };
    }

    await bridgeCommand(
        'click_control',
        { tabId, name: applyButton.text },
        { timeoutMs },
    );

    try {
        await bridgeCommand(
            'wait_for_tab',
            {
                tabId,
                urlIncludes: '/application',
                timeoutMs: Math.min(timeoutMs, 45000),
            },
            { timeoutMs },
        );
    } catch {
        // Ashby may hydrate the form on the same URL via client-side routing.
    }

    await sleep(1500);

    const { inventory, gate } = await pollBridgeFieldInventory(tabId, {
        minFields,
        pollIntervalMs,
        hydrateTimeoutMs,
        timeoutMs,
    });

    if (!gate.accepted) {
        return {
            status: 'skip',
            reason: gate.reason,
            url: jobDetailUrl,
            tabId,
            inventory,
            applyClicked: true,
            applyButtonText: applyButton.text,
        };
    }

    const page = await bridgeCommand(
        'get_page_html',
        { tabId },
        { timeoutMs },
    );
    const html = typeof page?.html === 'string' ? page.html : '';

    if (!html || html.length < 500) {
        return {
            status: 'skip',
            reason: 'empty HTML after Apply click',
            url: jobDetailUrl,
            tabId,
            applyClicked: true,
            applyButtonText: applyButton.text,
        };
    }

    return {
        status: 'accept',
        url: page.page_url || jobDetailUrl,
        html,
        title: page.page_title || '',
        tabId,
        inventory,
        meaningfulCount: gate.meaningfulCount,
        fieldCount: gate.totalCount,
        applyClicked: true,
        applyButtonText: applyButton.text,
        jobDetailUrl,
    };
}

/**
 * Crawl an Ashby company board: discover job detail URLs, click Apply on each, capture forms.
 *
 * @param {string} boardUrl
 * @param {{
 *   tabId?: number | null,
 *   minFields?: number,
 *   existingUrls?: Set<string>,
 *   maxPerBoard?: number,
 *   maxAccept?: number,
 *   timeoutMs?: number,
 * }} [options]
 */
export async function crawlAshbyBoard(boardUrl, options = {}) {
    const minFields = options.minFields ?? 2;
    const existingUrls = options.existingUrls ?? new Set();
    const maxPerBoard = options.maxPerBoard ?? 5;
    const maxAccept = options.maxAccept ?? maxPerBoard;
    const parsed = parseAshbyUrl(boardUrl);
    const normalizedBoardUrl = ashbyBoardUrl(parsed?.companySlug ?? '');

    try {
        const board = await fetchAshbyBoardHtml(normalizedBoardUrl, {
            tabId: options.tabId ?? null,
            timeoutMs: options.timeoutMs,
        });

        let tabId = board.tabId;
        const jobDetailUrls = board.jobDetailUrls
            .filter((url) => !existingUrls.has(normalizeUrl(url)))
            .slice(0, maxPerBoard);

        /** @type {Array<{ jobDetailUrl: string, status: string, reason?: string, url?: string, html?: string, title?: string, tabId?: number, inventory?: unknown, meaningfulCount?: number, fieldCount?: number, applyClicked?: boolean, applyButtonText?: string }>} */
        const captures = [];
        let accepted = 0;

        for (const jobDetailUrl of jobDetailUrls) {
            if (accepted >= maxAccept) {
                break;
            }

            if (existingUrls.has(normalizeUrl(jobDetailUrl))) {
                captures.push({
                    jobDetailUrl,
                    status: 'skip',
                    reason: 'already in corpus',
                });
                continue;
            }

            try {
                const payload = await captureAshbyJobViaApplyClick(jobDetailUrl, {
                    tabId,
                    minFields,
                    timeoutMs: options.timeoutMs,
                });

                if (payload.tabId) {
                    tabId = payload.tabId;
                }

                captures.push({
                    jobDetailUrl,
                    ...payload,
                });

                if (payload.status === 'accept') {
                    accepted += 1;
                    existingUrls.add(normalizeUrl(payload.url || jobDetailUrl));
                    existingUrls.add(normalizeUrl(jobDetailUrl));
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                captures.push({
                    jobDetailUrl,
                    status: 'skip',
                    reason: message,
                });
            }
        }

        return {
            boardUrl: normalizedBoardUrl,
            companySlug: parsed?.companySlug ?? null,
            discoveredJobDetailUrls: board.jobDetailUrls,
            jobDetailUrls,
            captures,
            tabId,
            accepted,
        };
    } finally {
        await clearActiveBridgeTab().catch(() => {});
    }
}

/**
 * @param {{ url: string, ashbyBoard?: boolean, companySlug?: string }} row
 * @returns {boolean}
 */
export function isAshbyBoardQueueRow(row) {
    if (row.ashbyBoard) {
        return true;
    }

    const parsed = parseAshbyUrl(row.url);

    return parsed?.isBoard === true;
}
