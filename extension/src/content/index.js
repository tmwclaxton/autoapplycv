/**
 * AutoCVApply Content Script
 * Scans application forms mechanically, then Draft All uses AI inventory + draft-all on the server.
 */

let profile = null;
let overlayRefreshTimer = null;
let overlayRefreshInFlight = false;
let cachedAuthenticated = false;
let lastMutationRefreshAt = 0;

function extractJobDescriptionFromPage() {
    const selectors = [
        '#job-details',
        '[data-testid="job-description"]',
        '[data-testid="jobDescriptionText"]',
        '.jobs-description',
        '[class*="job-description"]',
        '[class*="JobDescription"]',
        '[id*="job-description"]',
        'article',
    ];

    for (const selector of selectors) {
        const element = document.querySelector(selector);

        if (element?.textContent?.trim().length > 200) {
            return element.textContent.trim().slice(0, 20000);
        }
    }

    const main = document.querySelector('main');

    if (main?.textContent?.trim().length > 400) {
        return main.textContent.trim().slice(0, 20000);
    }

    return null;
}

function buildPagePayloadForJobContext() {
    const pageText = extractJobDescriptionFromPage()
        || document.querySelector('main')?.textContent?.trim()?.slice(0, 20000)
        || '';

    return {
        page_title: document.title || '',
        page_url: window.location.href.split('?')[0],
        page_text: pageText,
    };
}

function mapApplicationSettingsForAssist(settings) {
    const merged = {
        phone_country_code: '+44',
        years_of_experience: '2',
        expected_salary: '',
        visa_sponsorship: 'no',
        legally_authorized: 'yes',
        willing_to_relocate: 'yes',
        drivers_license: 'yes',
        ...(settings && typeof settings === 'object' ? settings : {}),
    };

    return {
        phoneCountryCode: merged.phone_country_code,
        yearsOfExperience: String(merged.years_of_experience ?? '2'),
        expectedSalary: merged.expected_salary ?? '',
        visaSponsorship: merged.visa_sponsorship ?? 'no',
        legallyAuthorized: merged.legally_authorized ?? 'yes',
        willingToRelocate: merged.willing_to_relocate ?? 'yes',
        driversLicense: merged.drivers_license ?? 'yes',
    };
}

function isRestrictedPage() {
    const protocol = location.protocol;

    return protocol === 'chrome:'
        || protocol === 'chrome-extension:'
        || protocol === 'about:'
        || protocol === 'moz-extension:';
}

async function loadAutofillContext() {
    const profileResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, resolve);
    });

    return {
        settings: mapApplicationSettingsForAssist(profileResponse?.application_settings),
    };
}

async function fillResumeFileInput() {
    let fileInput = null;

    AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
        if (fileInput) {
            return;
        }

        fileInput = doc.querySelector('input[type="file"]:not([disabled])');
    });

    if (!fileInput || fileInput.files?.length > 0 || fileInput.value) {
        return false;
    }

    try {
        const result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'GET_CV_DOCUMENT' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response?.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });

        const response = await fetch(result.base64);
        const blob = await response.blob();
        const file = new File([blob], result.fileName || 'cv.pdf', {
            type: result.mimeType || blob.type || 'application/pdf',
        });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
    } catch {
        return false;
    }
}

async function loadProfile() {
    try {
        profile = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response?.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    } catch {
        profile = null;
    }
}

function removeLegacyFillOverlay() {
    document.querySelectorAll('#autocvapply-fill-btn').forEach((element) => {
        if (!element.closest('#autocvapply-portal-bar')) {
            element.remove();
        }
    });
}

async function runFullFill() {
    if (!profile) {
        await loadProfile();
    }

    if (!profile) {
        return { ok: false, message: '⚠ Sign in to AutoCVApply first' };
    }

    const remaining = profile.subscription?.autofills_remaining ?? 0;

    if (remaining <= 0 || profile.subscription?.can_autofill === false) {
        return { ok: false, message: '⚠ Monthly limit reached' };
    }

    const draftResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'START_DRAFT_ALL' }, resolve);
    });

    if (draftResult?.error) {
        return { ok: false, message: draftResult.error };
    }

    await fillResumeFileInput();

    return {
        ok: true,
        message: draftResult?.message || '✓ Fill complete',
    };
}

async function init() {
    if (isRestrictedPage()) {
        return;
    }

    if (typeof AutoCVApplyPortalBar !== 'undefined') {
        AutoCVApplyPortalBar.configure({ onFill: runFullFill });
    }

    removeLegacyFillOverlay();

    await loadProfile();

    scheduleOverlayRefresh();

    window.addEventListener('focus', () => {
        scheduleOverlayRefresh();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            scheduleOverlayRefresh();
        }
    });

    window.setInterval(() => {
        if (document.visibilityState === 'visible') {
            scheduleOverlayRefresh();
        }
    }, 4000);

    const observer = new MutationObserver(() => {
        const now = Date.now();

        if (now - lastMutationRefreshAt < 800) {
            return;
        }

        lastMutationRefreshAt = now;
        scheduleOverlayRefresh();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    if (typeof AutoCVApplyFocusTracker !== 'undefined') {
        AutoCVApplyFocusTracker.bindFocusTracking(document);
    }
}

async function isSidePanelOpen() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SIDE_PANEL_STATE' });

        return response?.sidePanelOpen === true;
    } catch {
        return false;
    }
}

async function isAuthenticated() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });

        if (response?.isAuthenticated === true) {
            cachedAuthenticated = true;

            return true;
        }

        cachedAuthenticated = false;

        return false;
    } catch {
        return cachedAuthenticated;
    }
}

function scheduleOverlayRefresh() {
    if (overlayRefreshTimer) {
        clearTimeout(overlayRefreshTimer);
    }

    overlayRefreshTimer = setTimeout(() => {
        overlayRefreshTimer = null;
        void refreshFillButtonVisibility();
    }, 350);
}

async function refreshFillButtonVisibility() {
    if (overlayRefreshInFlight) {
        scheduleOverlayRefresh();

        return;
    }

    overlayRefreshInFlight = true;

    try {
        await runOverlayRefresh();
    } finally {
        overlayRefreshInFlight = false;
    }
}

async function runOverlayRefresh() {
    try {
        if (window !== window.top) {
            return;
        }

        const [sidePanelOpen, authenticated] = await Promise.all([
            isSidePanelOpen(),
            isAuthenticated(),
        ]);

        if (!authenticated) {
            if (typeof AutoCVApplyPortalBar !== 'undefined') {
                AutoCVApplyPortalBar.destroy();
            }

            return;
        }

        if (typeof AutoCVApplyPortalBar === 'undefined') {
            return;
        }

        AutoCVApplyPortalBar.update({
            visible: sidePanelOpen,
            sidebarOpen: sidePanelOpen,
        });
    } catch {
        // Ignore visibility updates on restricted or disconnected pages.
    }
}

async function collectDraftContext() {
    if (!profile) {
        await loadProfile();
    }

    if (!profile?.profile) {
        return { success: false, error: 'Connect AutoCVApply first.' };
    }

    const { settings } = await loadAutofillContext();
    const snapshot = typeof AutoCVApplyFieldInventory !== 'undefined'
        ? AutoCVApplyFieldInventory.buildSnapshotAllFrames(document, profile.profile, settings, {})
        : null;
    const fields = typeof AutoCVApplyFieldInventory !== 'undefined' && snapshot
        ? AutoCVApplyFieldInventory.fieldsFromInventory(snapshot.elements)
        : [];

    return {
        success: true,
        fields,
        snapshot,
        page: buildPagePayloadForJobContext(),
        count: fields.length,
        isFormHost: AutoCVApplyFormHeuristics.frameHasApplicationForm(document) || fields.length > 0,
    };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        if (message.type === 'COUNT_DRAFTABLE_FIELDS') {
            const context = await collectDraftContext();
            sendResponse({
                success: context.success !== false,
                count: context.count || 0,
                isFormHost: context.isFormHost === true,
            });

            return;
        }

        if (message.type === 'COLLECT_DRAFTABLE_FIELDS') {
            sendResponse(await collectDraftContext());

            return;
        }

        if (message.type === 'BUILD_FIELD_SNAPSHOT') {
            sendResponse(await collectDraftContext());

            return;
        }

        if (message.type === 'APPLY_DRAFT_BATCH') {
            let applied = 0;

            for (const answer of message.answers || []) {
                const filled = answer.ref && typeof AutoCVApplyFieldInventory !== 'undefined'
                    ? AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(document, answer.ref, answer.answer)
                    : AutoCVApplyFormHeuristics.applyAnswerByLabelAllFrames(document, answer.label, answer.answer);

                if (filled) {
                    applied += 1;
                }
            }

            sendResponse({ success: true, applied });

            return;
        }

        if (message.type === 'INVENTORY_CLICK_REF') {
            const clicked = typeof AutoCVApplyFieldInventory !== 'undefined'
                ? AutoCVApplyFieldInventory.clickRefAllFrames(document, message.ref)
                : false;

            sendResponse({ success: clicked });

            return;
        }

        if (message.type === 'APPLY_DRAFT_ANSWER') {
            const filled = message.ref && typeof AutoCVApplyFieldInventory !== 'undefined'
                ? AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(document, message.ref, message.answer)
                : AutoCVApplyFormHeuristics.applyAnswerByLabelAllFrames(document, message.label, message.answer);

            sendResponse({ success: filled });

            return;
        }

        if (message.type === 'GET_JOB_META') {
            sendResponse({
                job: {
                    title: document.title || 'Job application',
                    company: 'Unknown company',
                    link: window.location.href.split('?')[0],
                    job_description: extractJobDescriptionFromPage(),
                },
                page: buildPagePayloadForJobContext(),
            });

            return;
        }

        if (message.type === 'AUTOFILL_VISIBILITY_CHANGED' || message.type === 'AUTH_STATE_CHANGED') {
            scheduleOverlayRefresh();
            sendResponse({ success: true });

            return;
        }
    })();

    return true;
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
