/**
 * Content-script timing helper. Keep multiplier tiers aligned with auto-apply-timing.js.
 */
var AutoCVApplyTiming = (() => {
    const ACTIVE_KEY = 'autoApplyActiveTimingLevel';
    const DEFAULT_LEVEL = 1;
    const MIN_DELAY_MS = 20;
    const MULTIPLIERS = {
        1: 1,
        2: 0.72,
        3: 0.45,
        4: 0.22,
        5: 0.1,
    };
    /** Match auto-apply-timing.js INDEED_HYDRATION_MIN_MULTIPLIER (balanced). */
    const HYDRATION_MIN_MULTIPLIER = MULTIPLIERS[3];
    const STOP_REQUESTED_KEY = 'autoApplyStopRequested';

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

    async function humanPause(minMs, maxMs, options = {}) {
        if (cachedMultiplier === null) {
            await refreshMultiplier();
        }

        const min = Math.min(minMs, maxMs);
        const max = Math.max(minMs, maxMs);
        const multiplier = options.hydration
            ? Math.max(HYDRATION_MIN_MULTIPLIER, cachedMultiplier ?? 1)
            : (cachedMultiplier ?? 1);
        const scaledMin = scaleDelayMs(min, multiplier);
        const scaledMax = Math.max(scaledMin, scaleDelayMs(max, multiplier));
        const delay = scaledMin + Math.floor(Math.random() * (scaledMax - scaledMin + 1));

        await new Promise((resolve) => window.setTimeout(resolve, delay));
    }

    /**
     * Pause used while waiting for SmartApply DOM (questions / Submit) to appear.
     * Ignores the fastest timing tiers so Speed cannot race hydration.
     */
    async function hydrationPause(minMs, maxMs) {
        await humanPause(minMs, maxMs, { hydration: true });
    }

    async function isAutoApplyStopRequested() {
        try {
            const stored = await chrome.storage.session.get([STOP_REQUESTED_KEY]);

            return stored[STOP_REQUESTED_KEY] === true;
        } catch {
            return false;
        }
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
        hydrationPause,
        isAutoApplyStopRequested,
        refreshMultiplier,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AutoCVApplyTiming = AutoCVApplyTiming;
}

if (typeof window !== 'undefined') {
    window.AutoCVApplyTiming = AutoCVApplyTiming;
}
