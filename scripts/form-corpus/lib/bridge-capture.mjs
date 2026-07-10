import {
    bridgeCommand,
    clearActiveBridgeTab,
    setActiveBridgeTab,
} from '../../extension-bridge/lib/bridge-http.mjs';
import { pollBridgeFieldInventory } from './bridge-inventory-hydration.mjs';
import { JS_HEAVY_HOST_PATTERN } from './scrape-url-queue.mjs';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} url
 * @param {{ tabId?: number | null, minFields?: number, timeoutMs?: number, hydrateTimeoutMs?: number, pollIntervalMs?: number, releaseActiveTab?: boolean }} [options]
 */
export async function captureUrlViaBridge(url, options = {}) {
    const timeoutMs = options.timeoutMs ?? 90000;
    const minFields = options.minFields ?? 2;
    const jsHeavy = JS_HEAVY_HOST_PATTERN.test(new URL(url).hostname);
    const pollIntervalMs = options.pollIntervalMs ?? 2500;
    const hydrateTimeoutMs =
        options.hydrateTimeoutMs ?? (jsHeavy ? 45000 : 30000);
    const initialSettleMs = jsHeavy ? 3000 : 1500;
    const waitAttempts = jsHeavy ? 2 : 1;
    const releaseActiveTab = options.releaseActiveTab !== false;
    let lastSkip = { status: 'skip', reason: 'empty inventory', url };

    let tabId = options.tabId ?? null;
    let pinnedTab = false;

    try {
        for (let waitAttempt = 0; waitAttempt < waitAttempts; waitAttempt += 1) {
            if (tabId !== null) {
                await setActiveBridgeTab(tabId);
                pinnedTab = true;
            }

            const navigate = await bridgeCommand(
                'navigate_tab',
                {
                    url,
                    newTab: tabId === null,
                    tabId: tabId ?? undefined,
                    active: false,
                },
                { timeoutMs },
            );

            tabId = navigate.tabId;
            await setActiveBridgeTab(tabId);
            pinnedTab = true;

            let urlIncludes = null;

            try {
                urlIncludes = new URL(url).hostname;
            } catch {
                // keep null
            }

            await bridgeCommand(
                'wait_for_tab',
                {
                    tabId,
                    urlIncludes,
                    timeoutMs,
                },
                { timeoutMs },
            );

            if (initialSettleMs > 0) {
                await sleep(initialSettleMs);
            }

            const { inventory, gate } = await pollBridgeFieldInventory(tabId, {
                minFields,
                pollIntervalMs,
                hydrateTimeoutMs: hydrateTimeoutMs + waitAttempt * 10000,
                timeoutMs,
            });

            if (!gate.accepted) {
                lastSkip = {
                    status: 'skip',
                    reason: gate.reason,
                    url,
                    tabId,
                    inventory,
                };

                if (jsHeavy && waitAttempt + 1 < waitAttempts) {
                    continue;
                }

                return lastSkip;
            }

            const page = await bridgeCommand(
                'get_page_html',
                { tabId },
                { timeoutMs },
            );
            const html = typeof page?.html === 'string' ? page.html : '';

            if (!html || html.length < 500) {
                lastSkip = { status: 'skip', reason: 'empty HTML', url, tabId };

                if (jsHeavy && waitAttempt + 1 < waitAttempts) {
                    continue;
                }

                return lastSkip;
            }

            return {
                status: 'accept',
                url: page.page_url || url,
                html,
                title: page.page_title || '',
                tabId,
                inventory,
                meaningfulCount: gate.meaningfulCount,
                fieldCount: gate.totalCount,
            };
        }

        return lastSkip;
    } finally {
        if (releaseActiveTab && pinnedTab) {
            await clearActiveBridgeTab().catch(() => {});
        }
    }
}
