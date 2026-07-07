/**
 * AutoCVApply Content Script
 * Scans application forms mechanically, then Draft All uses AI for all answers (profile context in prompt).
 */

let profile = null;
let overlayRefreshTimer = null;
let overlayRefreshInFlight = false;
let fieldHighlightRefreshInFlight = false;
let cachedAuthenticated = false;
let pendingSidePanelOpen = undefined;
let lastMutationRefreshAt = 0;
let lastFormContentSignature = '';
let mutationObserver = null;
let overlayRefreshIntervalId = null;
let formContentSignatureNotifyTimer = null;
let pendingFormContentSignature = '';
let onWindowFocusRefresh = null;
let onVisibilityChangeRefresh = null;
let autoApplyBurstDepth = 0;
let autoApplyBurstCooldownUntil = 0;
let contentObserversPaused = false;

function extensionContext() {
    return typeof AutoCVApplyExtensionContext !== 'undefined'
        ? AutoCVApplyExtensionContext
        : null;
}

function isExtensionContextValid() {
    const ctx = extensionContext();

    return ctx ? ctx.isExtensionContextValid() : false;
}

function teardownContentScriptOnInvalidContext() {
    if (overlayRefreshTimer) {
        clearTimeout(overlayRefreshTimer);
        overlayRefreshTimer = null;
    }

    if (overlayRefreshIntervalId) {
        clearInterval(overlayRefreshIntervalId);
        overlayRefreshIntervalId = null;
    }

    if (formContentSignatureNotifyTimer) {
        clearTimeout(formContentSignatureNotifyTimer);
        formContentSignatureNotifyTimer = null;
    }

    pendingFormContentSignature = '';

    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }

    if (onWindowFocusRefresh) {
        window.removeEventListener('focus', onWindowFocusRefresh);
        onWindowFocusRefresh = null;
    }

    if (onVisibilityChangeRefresh) {
        document.removeEventListener('visibilitychange', onVisibilityChangeRefresh);
        onVisibilityChangeRefresh = null;
    }

    if (typeof AutoCVApplyPortalBar !== 'undefined') {
        AutoCVApplyPortalBar.destroy();
    }

    if (typeof AutoCVApplyFieldHighlighter !== 'undefined') {
        AutoCVApplyFieldHighlighter.clearHighlights();
    }
}

function ensureExtensionContextOrTeardown() {
    if (isExtensionContextValid()) {
        return true;
    }

    teardownContentScriptOnInvalidContext();

    return false;
}

function beginAutoApplyBurst() {
    autoApplyBurstDepth += 1;
}

function endAutoApplyBurst() {
    autoApplyBurstDepth = Math.max(0, autoApplyBurstDepth - 1);

    if (autoApplyBurstDepth === 0) {
        autoApplyBurstCooldownUntil = Date.now() + 3000;
    }
}

function isAutoApplyBurstActive() {
    return contentObserversPaused
        || autoApplyBurstDepth > 0
        || Date.now() < autoApplyBurstCooldownUntil;
}

function setContentObserversPaused(paused) {
    contentObserversPaused = paused;

    if (paused) {
        if (overlayRefreshTimer) {
            clearTimeout(overlayRefreshTimer);
            overlayRefreshTimer = null;
        }

        if (formContentSignatureNotifyTimer) {
            clearTimeout(formContentSignatureNotifyTimer);
            formContentSignatureNotifyTimer = null;
        }

        pendingFormContentSignature = '';
    }
}

extensionContext()?.onContextInvalidated?.(teardownContentScriptOnInvalidContext);

function computeFormContentSignature() {
    if (typeof AutoCVApplyFormContentSignature !== 'undefined') {
        return AutoCVApplyFormContentSignature.computeFormContentSignature(document);
    }

    const heading = document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '';
    const form = document.querySelector('form');

    return `${heading}|${form?.querySelectorAll('input, textarea, select').length || 0}|${form?.textContent?.length || 0}`;
}

function notifyFormContentSignatureChanged(signature) {
    if (window !== window.top || isAutoApplyBurstActive() || !ensureExtensionContextOrTeardown()) {
        return;
    }

    pendingFormContentSignature = signature;

    if (formContentSignatureNotifyTimer) {
        return;
    }

    formContentSignatureNotifyTimer = setTimeout(() => {
        formContentSignatureNotifyTimer = null;
        const signatureToSend = pendingFormContentSignature;
        pendingFormContentSignature = '';

        if (!ensureExtensionContextOrTeardown()) {
            return;
        }

        const ctx = extensionContext();

        if (!ctx) {
            teardownContentScriptOnInvalidContext();

            return;
        }

        try {
            void ctx.safeRuntimeSend({
                type: 'FORM_CONTENT_SIGNATURE_CHANGED',
                pageUrl: window.location.href.split('?')[0],
                signature: signatureToSend,
            });
        } catch {
            ctx.markContextInvalidated();
            teardownContentScriptOnInvalidContext();
        }
    }, 250);
}

function contentLog(level, phase, message, data) {
    if (!ensureExtensionContextOrTeardown() || typeof AutoCVApplyDebugLog === 'undefined') {
        return;
    }

    const logger = AutoCVApplyDebugLog[`log${level.charAt(0).toUpperCase()}${level.slice(1)}`];

    if (typeof logger === 'function') {
        logger('content', phase, message, {
            ...data,
            frameUrl: window.location.href.split('?')[0],
            isTopFrame: window === window.top,
        });
    }
}

function extractJobDescriptionFromPage() {
    if (typeof AutoCVApplyLinkedInAutoApply?.readJobDescriptionText === 'function') {
        const linkedInText = AutoCVApplyLinkedInAutoApply.readJobDescriptionText();

        if (linkedInText) {
            return linkedInText;
        }
    }

    const selectors = [
        '#job-details',
        '.jobs-description-content',
        '.jobs-description__content',
        '.jobs-description',
        '[data-testid="job-description"]',
        '[data-testid="jobDescriptionText"]',
        '[class*="job-description"]',
        '[class*="JobDescription"]',
        '[id*="job-description"]',
        '.jobs-search__job-details--container',
    ];

    let best = '';

    for (const selector of selectors) {
        const element = document.querySelector(selector);
        const text = element?.textContent?.replace(/\s+/g, ' ').trim() || '';

        if (text.length > best.length) {
            best = text;
        }
    }

    if (best.length < 200) {
        const mainText = document.querySelector('main')?.textContent?.replace(/\s+/g, ' ').trim() || '';

        if (mainText.length > best.length) {
            best = mainText;
        }
    }

    if (!best) {
        return null;
    }

    return best.slice(0, 20000);
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

function buildPageHtmlCapturePayload() {
    const maxBytes = 5_000_000;
    let html = document.documentElement?.outerHTML || '';

    if (html.length > maxBytes) {
        html = html.slice(0, maxBytes);
    }

    return {
        page_title: document.title || '',
        page_url: window.location.href.split('?')[0],
        html,
    };
}

function mapApplicationSettingsForAssist(settings) {
    const merged = {
        phone_country_code: '+44',
        years_of_experience: '2',
        expected_salary_weekly: '',
        expected_salary_monthly: '',
        expected_salary_yearly: '',
        visa_sponsorship: 'no',
        legally_authorized: 'yes',
        willing_to_relocate: 'yes',
        drivers_license: 'yes',
        ...(settings && typeof settings === 'object' ? settings : {}),
    };

    return {
        phoneCountryCode: merged.phone_country_code,
        yearsOfExperience: String(merged.years_of_experience ?? '2'),
        expectedSalaryWeekly: merged.expected_salary_weekly ?? '',
        expectedSalaryMonthly: merged.expected_salary_monthly ?? '',
        expectedSalaryYearly: merged.expected_salary_yearly ?? '',
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

function isAppDashboardPage() {
    const host = location.hostname.replace(/^www\./, '');

    return host === 'autocvapply.com'
        || host === 'localhost'
        || host === '127.0.0.1';
}

function getAutofillSettings() {
    return mapApplicationSettingsForAssist(profile?.application_settings);
}

async function ensureProfileLoaded() {
    if (!profile) {
        await loadProfile();
    }

    return profile?.profile ? profile : null;
}

async function countDraftableFieldsInDocument() {
    const profileData = await ensureProfileLoaded();

    if (!profileData?.profile) {
        return { success: false, count: 0, isFormHost: false };
    }

    const settings = getAutofillSettings();
    const count = AutoCVApplyFormHeuristics.countDraftableFields(
        document,
        profileData.profile,
        settings,
        {},
    );

    return {
        success: true,
        count,
        isFormHost: AutoCVApplyFormHeuristics.frameHasApplicationForm(document) || count > 0,
    };
}

async function fillResumeFileInput() {
    contentLog('debug', 'fill.resume', 'Attempting resume file attach', {});

    let fileInput = null;

    AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
        if (fileInput) {
            return;
        }

        for (const entry of doc.querySelectorAll('[data-field-path*="resume"], [data-field-path*="Resume"], .ashby-application-form-field-entry, [aria-labelledby="upload-label-resume"], [id="upload-label-resume"]')) {
            if (!/resume|cv/i.test(entry.textContent || entry.id || '')) {
                continue;
            }

            const candidate = entry.querySelector('input[type="file"]:not([disabled])');

            if (candidate) {
                fileInput = candidate;

                return;
            }
        }

        fileInput = doc.querySelector('#resume, input[type="file"][id*="resume" i]:not([disabled])')
            || doc.querySelector('input[type="file"]:not([disabled])');
    });

    if (!fileInput || fileInput.files?.length > 0 || fileInput.value) {
        contentLog('info', 'fill.resume', 'Resume input skipped', {
            foundInput: Boolean(fileInput),
            hasFiles: fileInput?.files?.length > 0,
            hasValue: Boolean(fileInput?.value),
        });

        return false;
    }

    try {
        const ctx = extensionContext();
        const result = await new Promise((resolve, reject) => {
            const onResponse = (response) => {
                if (response?.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            };

            if (!ctx) {
                reject(new Error('Extension context unavailable.'));

                return;
            }

            ctx.safeRuntimeSendCallback({ type: 'GET_CV_DOCUMENT' }, onResponse);
        });

        if (!ctx) {
            return false;
        }

        const fetchImpl = ctx.safeFetch;
        const response = await fetchImpl(result.base64);
        const blob = await response.blob();
        const file = new File([blob], result.fileName || 'cv.pdf', {
            type: result.mimeType || blob.type || 'application/pdf',
        });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        const view = fileInput.ownerDocument?.defaultView || window;
        const prototype = view.HTMLInputElement?.prototype;
        const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'files') : null;

        if (descriptor?.set) {
            descriptor.set.call(fileInput, dataTransfer.files);
        } else {
            fileInput.files = dataTransfer.files;
        }

        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));

        contentLog('info', 'fill.resume', 'Resume file attached', {
            fileName: result.fileName,
            mimeType: result.mimeType,
        });

        return true;
    } catch (error) {
        contentLog('warn', 'fill.resume', 'Resume attach failed', {
            error: error instanceof Error ? error.message : error,
        });

        return false;
    }
}

async function loadProfile() {
    if (!ensureExtensionContextOrTeardown()) {
        profile = null;

        return;
    }

    try {
        const ctx = extensionContext();
        profile = await new Promise((resolve, reject) => {
            const onResponse = (response) => {
                if (response?.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            };

            if (!ctx) {
                reject(new Error('Extension context unavailable.'));

                return;
            }

            ctx.safeRuntimeSendCallback({ type: 'GET_PROFILE' }, onResponse);
        });
    } catch {
        profile = null;
        teardownContentScriptOnInvalidContext();
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
    contentLog('info', 'draft-all.start', 'Draft All triggered from content script', {});

    if (!profile) {
        await loadProfile();
    }

    if (!profile) {
        return { ok: false, message: '⚠ Sign in to AutoCVApply first' };
    }

    const remaining = profile.subscription?.credits_remaining ?? 0;

    if (remaining <= 0 || profile.subscription?.can_use_credits === false) {
        contentLog('warn', 'draft-all.start', 'Credit limit reached', { remaining });

        return { ok: false, message: '⚠ Monthly limit reached' };
    }

    const ctx = extensionContext();

    if (!ctx) {
        return { ok: false, message: 'Extension context unavailable.' };
    }

    const draftResult = await new Promise((resolve) => {
        ctx.safeRuntimeSendCallback({ type: 'START_DRAFT_ALL' }, resolve);
    });

    if (draftResult?.error) {
        contentLog('error', 'draft-all.complete', 'Draft All returned error', { error: draftResult.error });

        return { ok: false, message: draftResult.error };
    }

    contentLog('info', 'draft-all.complete', 'Draft All background finished', {
        message: draftResult?.message,
    });

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

    await loadProfile();

    if (window !== window.top) {
        return;
    }

    if (typeof AutoCVApplyPortalBar !== 'undefined') {
        AutoCVApplyPortalBar.configure({ onFill: runFullFill });
    }

    removeLegacyFillOverlay();

    scheduleOverlayRefresh();

    onWindowFocusRefresh = () => {
        scheduleOverlayRefresh();
    };
    window.addEventListener('focus', onWindowFocusRefresh);

    onVisibilityChangeRefresh = () => {
        if (document.visibilityState === 'visible') {
            scheduleOverlayRefresh();
        }
    };
    document.addEventListener('visibilitychange', onVisibilityChangeRefresh);

    overlayRefreshIntervalId = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
            scheduleOverlayRefresh();
        }
    }, 4000);

    mutationObserver = new MutationObserver(() => {
        if (isAutoApplyBurstActive()) {
            return;
        }

        if (!ensureExtensionContextOrTeardown()) {
            return;
        }

        const now = Date.now();
        const signature = computeFormContentSignature();
        const signatureChanged = signature !== lastFormContentSignature;

        if (signatureChanged) {
            lastFormContentSignature = signature;
            notifyFormContentSignatureChanged(signature);
        }

        if (!signatureChanged && now - lastMutationRefreshAt < 800) {
            return;
        }

        lastMutationRefreshAt = now;
        scheduleOverlayRefresh();
    });

    lastFormContentSignature = computeFormContentSignature();

    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

    if (typeof AutoCVApplyFocusTracker !== 'undefined') {
        AutoCVApplyFocusTracker.bindFocusTracking(document);
    }
}

async function isSidePanelOpen() {
    if (!ensureExtensionContextOrTeardown()) {
        return false;
    }

    const ctx = extensionContext();

    if (!ctx) {
        return false;
    }

    try {
        const response = await ctx.safeRuntimeSend({ type: 'GET_SIDE_PANEL_STATE' });

        return response?.sidePanelOpen === true;
    } catch {
        return false;
    }
}

async function isAuthenticated() {
    if (!ensureExtensionContextOrTeardown()) {
        return false;
    }

    const ctx = extensionContext();

    if (!ctx) {
        return false;
    }

    try {
        const response = await ctx.safeRuntimeSend({ type: 'GET_AUTH_STATUS' });

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

function scheduleOverlayRefresh(sidePanelOpen = undefined) {
    if (isAutoApplyBurstActive() || !ensureExtensionContextOrTeardown()) {
        return;
    }

    if (typeof sidePanelOpen === 'boolean') {
        pendingSidePanelOpen = sidePanelOpen;
    }

    if (overlayRefreshTimer) {
        clearTimeout(overlayRefreshTimer);
    }

    overlayRefreshTimer = setTimeout(() => {
        const explicitSidePanelOpen = pendingSidePanelOpen;
        pendingSidePanelOpen = undefined;
        overlayRefreshTimer = null;
        void refreshFillButtonVisibility(explicitSidePanelOpen);
        void refreshFieldHighlights(explicitSidePanelOpen);
    }, 350);
}

async function refreshFillButtonVisibility(explicitSidePanelOpen) {
    if (overlayRefreshInFlight) {
        scheduleOverlayRefresh(explicitSidePanelOpen);

        return;
    }

    overlayRefreshInFlight = true;

    try {
        await runOverlayRefresh(explicitSidePanelOpen);
    } finally {
        overlayRefreshInFlight = false;
    }
}

async function runOverlayRefresh(explicitSidePanelOpen) {
    try {
        if (window !== window.top) {
            return;
        }

        const sidePanelOpen = typeof explicitSidePanelOpen === 'boolean'
            ? explicitSidePanelOpen
            : await isSidePanelOpen();
        const authenticated = await isAuthenticated();

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

async function refreshFieldHighlights(explicitSidePanelOpen) {
    if (fieldHighlightRefreshInFlight) {
        return;
    }

    fieldHighlightRefreshInFlight = true;

    try {
        await runFieldHighlightRefresh(explicitSidePanelOpen);
    } finally {
        fieldHighlightRefreshInFlight = false;
    }
}

async function runFieldHighlightRefresh(explicitSidePanelOpen) {
    if (typeof AutoCVApplyFieldHighlighter === 'undefined') {
        return;
    }

    if (isRestrictedPage() || isAppDashboardPage()) {
        AutoCVApplyFieldHighlighter.clearHighlights();

        return;
    }

    try {
        const authenticated = await isAuthenticated();

        if (!authenticated) {
            AutoCVApplyFieldHighlighter.clearHighlights();

            return;
        }

        const profileData = await ensureProfileLoaded();

        if (!profileData?.profile) {
            AutoCVApplyFieldHighlighter.clearHighlights();

            return;
        }

        const settings = getAutofillSettings();
        const count = AutoCVApplyFormHeuristics.countDraftableFields(
            document,
            profileData.profile,
            settings,
            {},
        );
        const sidePanelOpen = typeof explicitSidePanelOpen === 'boolean'
            ? explicitSidePanelOpen
            : await isSidePanelOpen();

        if (count === 0 || !sidePanelOpen) {
            AutoCVApplyFieldHighlighter.clearHighlights();

            return;
        }

        AutoCVApplyFieldHighlighter.applyHighlights(document, profileData.profile, settings, {});
    } catch {
        AutoCVApplyFieldHighlighter.clearHighlights();
    }
}

async function collectDraftContext(injectedProfile = null) {
    if (injectedProfile?.profile) {
        profile = injectedProfile;
    }

    const profileData = await ensureProfileLoaded();

    if (!profileData?.profile) {
        contentLog('warn', 'snapshot.collect', 'Profile not loaded for snapshot', {});

        return { success: false, error: 'Connect AutoCVApply first.' };
    }

    const settings = getAutofillSettings();
    const snapshot = typeof AutoCVApplyFieldInventory !== 'undefined'
        ? AutoCVApplyFieldInventory.buildSnapshotAllFrames(document, profileData.profile, settings, {})
        : null;
    const fields = typeof AutoCVApplyFieldInventory !== 'undefined' && snapshot
        ? AutoCVApplyFieldInventory.fieldsFromInventory(snapshot.elements)
        : [];

    contentLog('info', 'snapshot.collect', 'Built field snapshot', {
        elementCount: snapshot?.elements?.length || 0,
        controlCount: snapshot?.controls?.length || 0,
        fieldCount: fields.length,
    });

    return {
        success: true,
        fields,
        snapshot,
        page: buildPagePayloadForJobContext(),
        count: fields.length,
        isFormHost: AutoCVApplyFormHeuristics.frameHasApplicationForm(document) || fields.length > 0,
    };
}

const contentMessageListener = (message, sender, sendResponse) => {
    (async () => {
        const linkedInBurst = typeof message.type === 'string' && message.type.startsWith('LINKEDIN_');

        if (linkedInBurst) {
            beginAutoApplyBurst();
        }

        try {
        if (!ensureExtensionContextOrTeardown()) {
            return;
        }

        if (message.type === 'AUTO_APPLY_ACTIVE') {
            setContentObserversPaused(message.active === true);
            sendResponse({ success: true });

            return;
        }

        contentLog('debug', 'message.received', `Handler: ${message.type}`, {
            type: message.type,
            ref: message.ref,
            label: message.label,
            answerPreview: typeof message.answer === 'string' ? message.answer.slice(0, 80) : message.answer,
            batchSize: message.answers?.length,
        });

        if (message.type === 'COUNT_DRAFTABLE_FIELDS') {
            sendResponse(await countDraftableFieldsInDocument());

            return;
        }

        if (message.type === 'COLLECT_DRAFTABLE_FIELDS') {
            sendResponse(await collectDraftContext());

            return;
        }

        if (message.type === 'BUILD_FIELD_SNAPSHOT') {
            sendResponse(await collectDraftContext(message.profilePayload));

            return;
        }

        if (message.type === 'APPLY_DRAFT_BATCH') {
            const answers = message.answers || [];
            let applied = 0;

            function resolveApplyAnswer(label, rawAnswer) {
                if (typeof AutoCVApplyAnswerNormalization !== 'undefined') {
                    return AutoCVApplyAnswerNormalization.normalizeFieldAnswerForQuestion(label, rawAnswer);
                }

                return String(rawAnswer ?? '').trim();
            }

            function humanDelayMs(minMs, maxMs) {
                const min = Math.min(minMs, maxMs);
                const max = Math.max(minMs, maxMs);

                return min + Math.floor(Math.random() * (max - min + 1));
            }

            function humanPause(minMs, maxMs) {
                return new Promise((resolve) => window.setTimeout(resolve, humanDelayMs(minMs, maxMs)));
            }

            async function applySingleAnswer(answer) {
                if (answer.ref && typeof AutoCVApplyFieldInventory !== 'undefined') {
                    AutoCVApplyFieldInventory.clickRefAllFrames(document, answer.ref);
                    await humanPause(120, 260);
                }

                let filled = false;
                let method = null;
                const applyOptions = {
                    field_type: answer.field_type || null,
                    dom: answer.dom || null,
                    data_field_path: answer.data_field_path || answer.dom?.data_field_path || null,
                };

                const label = answer.label || '';
                const normalizedAnswer = resolveApplyAnswer(label, answer.answer);

                if (answer.ref && typeof AutoCVApplyFieldInventory !== 'undefined') {
                    filled = await AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
                        document,
                        answer.ref,
                        normalizedAnswer,
                        applyOptions,
                    );
                    method = 'ref';
                }

                if (!filled && label) {
                    filled = await AutoCVApplyFormHeuristics.applyAnswerByLabelAllFrames(
                        document,
                        label,
                        normalizedAnswer,
                    );
                    method = method ? `${method}+label` : 'label';
                }

                contentLog(filled ? 'info' : 'warn', 'apply.batch', filled ? 'Field applied' : 'Field apply failed', {
                    ref: answer.ref,
                    label: answer.label,
                    method,
                    field_type: answer.field_type,
                    answerPreview: typeof answer.answer === 'string' ? answer.answer.slice(0, 80) : answer.answer,
                    filled,
                });

                return filled ? 1 : 0;
            }

            for (let index = 0; index < answers.length; index += 1) {
                if (index > 0) {
                    await humanPause(240, 520);
                }

                applied += await applySingleAnswer(answers[index]);
            }

            contentLog('info', 'apply.batch', 'Batch apply complete', {
                requested: answers.length,
                applied,
            });

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

        if (message.type === 'APPLY_DRAFT_ANSWER' || message.type === 'APPLY_ANSWER_TO_FIELD') {
            let filled = false;
            let method = null;
            const label = message.label || '';
            const normalizedAnswer = typeof AutoCVApplyAnswerNormalization !== 'undefined'
                ? AutoCVApplyAnswerNormalization.normalizeFieldAnswerForQuestion(label, message.answer)
                : String(message.answer ?? '').trim();

            if (message.ref && typeof AutoCVApplyFieldInventory !== 'undefined') {
                filled = await AutoCVApplyFieldInventory.applyAnswerByRefWithFallback(
                    document,
                    message.ref,
                    normalizedAnswer,
                    {
                        field_type: message.field_type || null,
                        dom: message.dom || null,
                        data_field_path: message.data_field_path || message.dom?.data_field_path || null,
                    },
                );
                method = 'ref';
            }

            if (!filled && label) {
                filled = await AutoCVApplyFormHeuristics.applyAnswerByLabelAllFrames(
                    document,
                    label,
                    normalizedAnswer,
                );
                method = method ? `${method}+label` : 'label';
            }

            contentLog(filled ? 'info' : 'warn', 'apply.answer', filled ? 'Single answer applied' : 'Single answer failed', {
                ref: message.ref,
                label: message.label,
                method,
                filled,
            });

            sendResponse({ success: filled });

            return;
        }

        if (message.type === 'FILL_RESUME') {
            sendResponse({ success: await fillResumeFileInput() });

            return;
        }

        if (message.type === 'GET_JOB_META') {
            void (async () => {
                if (typeof AutoCVApplyLinkedInAutoApply?.prepareJobDescriptionForRead === 'function') {
                    await AutoCVApplyLinkedInAutoApply.prepareJobDescriptionForRead().catch(() => {});
                }

                sendResponse({
                    job: {
                        title: document.title || 'Job application',
                        company: 'Unknown company',
                        link: window.location.href.split('?')[0],
                        job_description: extractJobDescriptionFromPage(),
                    },
                    page: buildPagePayloadForJobContext(),
                });
            })();

            return;
        }

        if (message.type === 'LINKEDIN_PREPARE_JOB_DESCRIPTION') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            void AutoCVApplyLinkedInAutoApply.prepareJobDescriptionForRead()
                .then((result) => sendResponse({ success: true, ...result }))
                .catch((error) => sendResponse({ success: false, error: error.message }));

            return;
        }

        if (message.type === 'LINKEDIN_WAIT_FOR_JOB_DESCRIPTION') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            const minLength = Number(message.minLength) || 200;

            void AutoCVApplyLinkedInAutoApply.waitForJobDescriptionReady(minLength, 20_000)
                .then((result) => sendResponse({ success: result.ready, ...result }))
                .catch((error) => sendResponse({ success: false, error: error.message }));

            return;
        }

        if (message.type === 'RELOAD_CONTENT_PROFILE') {
            profile = null;
            await loadProfile();
            sendResponse({ success: Boolean(profile?.profile) });

            return;
        }

        if (message.type === 'GET_PAGE_HTML') {
            sendResponse(buildPageHtmlCapturePayload());

            return;
        }

        if (message.type === 'LINKEDIN_PREPARE_JOB_SEARCH') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.prepareJobSearch());

            return;
        }

        if (message.type === 'LINKEDIN_COLLECT_JOB_CARDS') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            sendResponse({
                success: true,
                jobs: AutoCVApplyLinkedInAutoApply.collectJobCards(),
            });

            return;
        }

        if (message.type === 'LINKEDIN_SELECT_JOB') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.selectJobById(message.jobId));

            return;
        }

        if (message.type === 'LINKEDIN_WAIT_FOR_JOB_DETAIL') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.waitForJobDetailReady(message.jobId));

            return;
        }

        if (message.type === 'LINKEDIN_CLICK_EASY_APPLY' || message.type === 'LINKEDIN_OPEN_EASY_APPLY') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.clickEasyApply());

            return;
        }

        if (message.type === 'LINKEDIN_EASY_APPLY_STATE') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ open: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyLinkedInAutoApply.getEasyApplyModalState());

            return;
        }

        if (message.type === 'LINKEDIN_VALIDATE_BLOCKED_FIELD') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ open: false, valid: true, validationError: null });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.validateBlockedFieldAfterFill({
                ref: message.ref,
                label: message.label,
                dom: message.dom,
            }));

            return;
        }

        if (message.type === 'LINKEDIN_PREFILL_CONTACT') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ filled: 0, success: false, skipped: true, errors: [] });

                return;
            }

            const profileData = await ensureProfileLoaded();

            sendResponse(await AutoCVApplyLinkedInAutoApply.prefillContactInfo(profileData));

            return;
        }

        if (message.type === 'LINKEDIN_ADVANCE_EASY_APPLY' || message.type === 'LINKEDIN_FILL_AND_ADVANCE') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            const profileData = await ensureProfileLoaded();
            await AutoCVApplyLinkedInAutoApply.prefillContactInfo(profileData);

            sendResponse(await AutoCVApplyLinkedInAutoApply.clickNextOrSubmit());

            return;
        }

        if (message.type === 'LINKEDIN_VERIFY_SUBMITTED') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ submitted: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyLinkedInAutoApply.verifySubmitted());

            return;
        }

        if (message.type === 'LINKEDIN_CLOSE_EASY_APPLY') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.closeEasyApplyModal());

            return;
        }

        if (message.type === 'LINKEDIN_NEXT_SEARCH_PAGE') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.goToNextSearchPage());

            return;
        }

        if (message.type === 'LINKEDIN_SCAN_PAGE_HEALTH') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ ok: true, issues: [], blocking: [], primary: null });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.scanPageHealth(message.options || {}));

            return;
        }

        if (message.type === 'LINKEDIN_ACCEPT_COOKIE_CONSENT') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ accepted: false });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.acceptCookieConsent());

            return;
        }

        if (message.type === 'LINKEDIN_DISMISS_BLOCKING_MODAL') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ dismissed: false });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.dismissBlockingModal());

            return;
        }

        if (message.type === 'LINKEDIN_DISMISS_SAVE_DIALOG') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ dismissed: false });

                return;
            }

            sendResponse(await AutoCVApplyLinkedInAutoApply.dismissSaveApplicationDialog());

            return;
        }

        if (message.type === 'LINKEDIN_EXPORT_EASY_APPLY_MODAL') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ html: null, diagnostics: null, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyLinkedInAutoApply.exportEasyApplyModalDebug());

            return;
        }

        if (message.type === 'AUTOFILL_VISIBILITY_CHANGED' || message.type === 'AUTH_STATE_CHANGED') {
            if (!isAutoApplyBurstActive()) {
                scheduleOverlayRefresh(
                    typeof message.sidePanelOpen === 'boolean' ? message.sidePanelOpen : undefined,
                );
            }

            sendResponse({ success: true });

            return;
        }
        } finally {
            if (linkedInBurst) {
                endAutoApplyBurst();
            }
        }
    })();

    return true;
};

if (extensionContext()?.safeOnMessageAddListener(contentMessageListener) !== true) {
    try {
        chrome.runtime.onMessage.addListener(contentMessageListener);
    } catch {
        // Ignore listener registration when the extension was reloaded.
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
