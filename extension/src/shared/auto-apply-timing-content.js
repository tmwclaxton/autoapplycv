/**
 * Content-script timing helper. Keep multiplier tiers aligned with auto-apply-timing.js.
 */
var AutoCVApplyTiming = (() => {
    const ACTIVE_KEY = 'autoApplyActiveTimingLevel';
    const DEFAULT_LEVEL = 5;
    const MIN_DELAY_MS = 40;
    const MULTIPLIERS = {
        1: 0.25,
        2: 0.4,
        3: 0.55,
        4: 0.78,
        5: 1,
    };

    /** @type {number|null} */
    let cachedMultiplier = null;

    function normalizeTimingLevel(value) {
        const parsed = Number.parseInt(String(value ?? ''), 10);

        if (Number.isNaN(parsed)) {
            return DEFAULT_LEVEL;
        }

        return Math.max(1, Math.min(5, parsed));
    }

    function resolveDelayMultiplier(level) {
        return MULTIPLIERS[normalizeTimingLevel(level)] ?? 1;
    }

    function scaleDelayMs(ms, multiplier) {
        return Math.max(MIN_DELAY_MS, Math.round(ms * multiplier));
    }

    async function refreshMultiplier() {
        try {
            const stored = await chrome.storage.session.get([ACTIVE_KEY]);
            cachedMultiplier = resolveDelayMultiplier(stored[ACTIVE_KEY]);
        } catch {
            cachedMultiplier = 1;
        }
    }

    async function humanPause(minMs, maxMs) {
        if (cachedMultiplier === null) {
            await refreshMultiplier();
        }

        const min = Math.min(minMs, maxMs);
        const max = Math.max(minMs, maxMs);
        const scaledMin = scaleDelayMs(min, cachedMultiplier);
        const scaledMax = Math.max(scaledMin, scaleDelayMs(max, cachedMultiplier));
        const delay = scaledMin + Math.floor(Math.random() * (scaledMax - scaledMin + 1));

        await new Promise((resolve) => window.setTimeout(resolve, delay));
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'session' && ACTIVE_KEY in changes) {
                cachedMultiplier = null;
            }
        });
    }

    return {
        humanPause,
        refreshMultiplier,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyTiming = AutoCVApplyTiming;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyTiming = AutoCVApplyTiming;
}
