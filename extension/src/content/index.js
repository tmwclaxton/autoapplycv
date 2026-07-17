/**
 * AutoCVApply Content Script
 * Scans application forms mechanically, then Draft All uses AI for all answers (profile context in prompt).
 */

let profile = null;
let overlayRefreshTimer = null;
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

    if (typeof AutoCVApplyIndeedAutoApply?.readJobDescriptionText === 'function') {
        const indeedText = AutoCVApplyIndeedAutoApply.readJobDescriptionText();

        if (indeedText) {
            return indeedText;
        }
    }

    if (typeof AutoCVApplyTotalJobsAutoApply?.readJobDescriptionText === 'function') {
        const totaljobsText = AutoCVApplyTotalJobsAutoApply.readJobDescriptionText();

        if (totaljobsText) {
            return totaljobsText;
        }
    }

    if (typeof AutoCVApplyGlassdoorAutoApply?.readJobDescriptionText === 'function') {
        const glassdoorText = AutoCVApplyGlassdoorAutoApply.readJobDescriptionText();

        if (glassdoorText) {
            return glassdoorText;
        }
    }

    if (typeof AutoCVApplySimplyHiredAutoApply?.readJobDescriptionText === 'function') {
        const simplyHiredText = AutoCVApplySimplyHiredAutoApply.readJobDescriptionText();

        if (simplyHiredText) {
            return simplyHiredText;
        }
    }

    if (typeof AutoCVApplyReedAutoApply?.readJobDescriptionText === 'function') {
        const reedText = AutoCVApplyReedAutoApply.readJobDescriptionText();

        if (reedText) {
            return reedText;
        }
    }

    if (typeof AutoCVApplyCvLibraryAutoApply?.readJobDescriptionText === 'function') {
        const cvLibraryText = AutoCVApplyCvLibraryAutoApply.readJobDescriptionText();

        if (cvLibraryText) {
            return cvLibraryText;
        }
    }

    const selectors = [
        '#jobDescriptionText',
        '.jobsearch-JobComponent-description',
        '[id*="jobDescriptionText"]',
        '[data-test="job-description"]',
        '[data-test="jobDescriptionContent"]',
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
    // Avoid GET_PROFILE during frame probing. Background findBestFormFrameId probes every
    // frame in parallel while Draft All holds the run lock; nested profile messaging can stall
    // chrome.tabs.sendMessage and leave Draft All stuck as "already running".
    const settings = getAutofillSettings();
    const count = AutoCVApplyFormHeuristics.countDraftableFields(
        document,
        profile?.profile || {},
        settings,
        {},
    );

    return {
        success: true,
        count,
        isFormHost: AutoCVApplyFormHeuristics.frameHasApplicationForm(document) || count > 0,
    };
}

function isResumeFileInput(input) {
    const identity = `${input?.name || ''} ${input?.id || ''}`.toLowerCase();

    return /resume|\.cv\b|\bcv\b/.test(identity);
}

function isCoverLetterFileInput(input) {
    if (!input || input.type !== 'file' || isResumeFileInput(input)) {
        return false;
    }

    const identity = `${input.name || ''} ${input.id || ''}`.toLowerCase();

    if (/cover/i.test(identity)) {
        return true;
    }

    const labelRoot = input.closest('.field-wrapper, .form-group, label, [class*="field"]');
    const labelText = (labelRoot?.textContent || '').replace(/\s+/g, ' ').trim();

    return /\bcover letter\b/i.test(labelText);
}

async function attachDocumentToFileInput(fileInput, messageType, logPhase) {
    if (!fileInput || fileInput.files?.length > 0 || fileInput.value) {
        contentLog('info', logPhase, 'File input skipped', {
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

            ctx.safeRuntimeSendCallback({ type: messageType }, onResponse);
        });

        if (!ctx) {
            return false;
        }

        const fetchImpl = ctx.safeFetch;
        const response = await fetchImpl(result.base64);
        const blob = await response.blob();
        const file = new File([blob], result.fileName || 'document.pdf', {
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

        contentLog('info', logPhase, 'File attached', {
            fileName: result.fileName,
            mimeType: result.mimeType,
        });

        return true;
    } catch (error) {
        contentLog('warn', logPhase, 'File attach failed', {
            error: error instanceof Error ? error.message : error,
        });

        return false;
    }
}

function findResumeFileInput() {
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

        fileInput = doc.querySelector('input[type="file"][data-qa="input-resume"]:not([disabled])')
            || doc.querySelector('input[type="file"][data-field-path="_systemfield_resume"]:not([disabled])')
            || doc.querySelector('input[type="file"]#_systemfield_resume:not([disabled])')
            || doc.querySelector('[data-role="dropzone"] input[type="file"]:not([disabled])')
            || doc.querySelector('[data-ui="resume"] input[type="file"]:not([disabled])')
            || doc.querySelector('input[type="file"][name="documents.cv"]:not([disabled])')
            || doc.querySelector('input[type="file"]#doc-input-cv:not([disabled])')
            || doc.querySelector('input[type="file"][name="candidate.cv"]:not([disabled])')
            || doc.querySelector('input[type="file"][id*="candidate.cv" i]:not([disabled])')
            || doc.querySelector('input[type="file"]#resume-upload-input:not([disabled])')
            || doc.querySelector('input[type="file"][name="resume"]:not([disabled])')
            || doc.querySelector('input[type="file"][id*="resume" i]:not([disabled])')
            || doc.querySelector('input[type="file"][name*="resume" i]:not([disabled])')
            || doc.querySelector('input[type="file"][id^="input_files_input"]:not([disabled])')
            || doc.querySelector('#resume, input[type="file"][id="input_files_input"]:not([disabled])')
            || Array.from(doc.querySelectorAll('input[type="file"]:not([disabled])')).find(isResumeFileInput);
    });

    return fileInput;
}

function findCoverLetterFileInput() {
    let fileInput = null;

    AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
        if (fileInput) {
            return;
        }

        for (const entry of doc.querySelectorAll('[data-field-path*="cover"], [aria-labelledby*="cover" i], [id*="cover-letter" i], [id*="upload-label-cover" i]')) {
            if (!/cover letter/i.test(entry.textContent || entry.id || '')) {
                continue;
            }

            const candidate = entry.querySelector('input[type="file"]:not([disabled])');

            if (candidate && isCoverLetterFileInput(candidate)) {
                fileInput = candidate;

                return;
            }
        }

        fileInput = doc.querySelector('input[type="file"][name="candidate.coverLetterFile"]:not([disabled])')
            || doc.querySelector('input[type="file"][id*="coverLetter" i]:not([disabled])')
            || doc.querySelector('input[type="file"]#cover_letter:not([disabled])')
            || doc.querySelector('input[type="file"][name*="cover" i]:not([disabled])')
            || Array.from(doc.querySelectorAll('input[type="file"]:not([disabled])')).find(isCoverLetterFileInput);
    });

    return fileInput;
}

async function fillResumeFileInput() {
    contentLog('debug', 'fill.resume', 'Attempting resume file attach', {});

    return attachDocumentToFileInput(findResumeFileInput(), 'GET_CV_DOCUMENT', 'fill.resume');
}

async function fillCoverLetterFileInput(job = null) {
    contentLog('debug', 'fill.cover-letter', 'Attempting cover letter file attach', {});

    const fileInput = findCoverLetterFileInput();

    if (!fileInput) {
        contentLog('info', 'fill.cover-letter', 'Cover letter input not found', {});

        return false;
    }

    const ctx = extensionContext();

    if (!ctx) {
        return false;
    }

    try {
        const result = await new Promise((resolve, reject) => {
            ctx.safeRuntimeSendCallback({
                type: 'GET_COVER_LETTER_DOCUMENT',
                job: job || null,
            }, (response) => {
                if (response?.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });

        if (!fileInput || fileInput.files?.length > 0 || fileInput.value) {
            contentLog('info', 'fill.cover-letter', 'Cover letter input skipped', {
                foundInput: Boolean(fileInput),
                hasFiles: fileInput?.files?.length > 0,
                hasValue: Boolean(fileInput?.value),
            });

            return false;
        }

        const fetchImpl = ctx.safeFetch;
        const response = await fetchImpl(result.base64);
        const blob = await response.blob();
        const file = new File([blob], result.fileName || 'cover-letter.pdf', {
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

        contentLog('info', 'fill.cover-letter', 'Cover letter file attached', {
            fileName: result.fileName,
            mimeType: result.mimeType,
        });

        return true;
    } catch (error) {
        contentLog('warn', 'fill.cover-letter', 'Cover letter attach failed', {
            error: error instanceof Error ? error.message : error,
        });

        return false;
    }
}

async function loadProfile({ force = false } = {}) {
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

            ctx.safeRuntimeSendCallback({ type: 'GET_PROFILE', force }, onResponse);
        });
    } catch {
        profile = null;
        teardownContentScriptOnInvalidContext();
    }
}

function removeLegacyFillOverlay() {
    document.querySelectorAll('#autocvapply-fill-btn, #autocvapply-portal-bar').forEach((element) => {
        element.remove();
    });
}

async function init() {
    if (isRestrictedPage()) {
        return;
    }

    await loadProfile();

    if (window !== window.top) {
        return;
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
        removeLegacyFillOverlay();
        void refreshFieldHighlights(explicitSidePanelOpen);
    }, 350);
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
        ? await AutoCVApplyFieldInventory.buildSnapshotAllFramesAsync(document, profileData.profile, settings, {})
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
            sendResponse({ error: 'Extension context unavailable.' });

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

        if (message.type === 'FILTER_UNFILLED_REQUIRED_FIELDS') {
            const elements = typeof AutoCVApplyFormHeuristics?.filterUnfilledRequiredSnapshotElements === 'function'
                ? AutoCVApplyFormHeuristics.filterUnfilledRequiredSnapshotElements(
                    message.elements || [],
                    document,
                )
                : (message.elements || []);

            sendResponse({ elements });

            return;
        }

        if (message.type === 'APPLY_DRAFT_BATCH') {
            const answers = message.answers || [];
            let applied = 0;

            function resolveApplyAnswer(label, rawAnswer, fieldType = null) {
                if (typeof AutoCVApplyAnswerNormalization !== 'undefined') {
                    return AutoCVApplyAnswerNormalization.normalizeFieldAnswerForQuestion(label, rawAnswer, {
                        fieldType,
                    });
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

            function shouldClickRefBeforeBatchApply(answer) {
                const fieldType = String(answer?.field_type || answer?.dom?.type || '').toLowerCase();

                // Native selects/radios/checkboxes lose programmatic fills after a pre-click
                // (Personio future-jobs consent, Greenhouse Yes/No selects, etc.).
                if (['select', 'select-one', 'radio', 'checkbox', 'range'].includes(fieldType)) {
                    return false;
                }

                return Boolean(answer?.ref && typeof AutoCVApplyFieldInventory !== 'undefined');
            }

            async function applySingleAnswer(answer) {
                if (shouldClickRefBeforeBatchApply(answer)) {
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
                const normalizedAnswer = resolveApplyAnswer(label, answer.answer, answer.field_type || null);

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

            function applyTimeoutMsForAnswer(answer) {
                const answerText = typeof answer?.answer === 'string' ? answer.answer : '';
                const fieldType = answer?.field_type || '';

                if (fieldType === 'tel' || fieldType === 'select') {
                    return 45_000;
                }

                if (fieldType === 'textarea' || answerText.length > 120) {
                    return 45_000;
                }

                return 20_000;
            }

            for (let index = 0; index < answers.length; index += 1) {
                if (index > 0) {
                    await humanPause(240, 520);
                }

                const answer = answers[index];
                const applyFieldTimeoutMs = applyTimeoutMsForAnswer(answer);

                applied += await Promise.race([
                    applySingleAnswer(answer),
                    new Promise((resolve) => {
                        window.setTimeout(() => {
                            contentLog('warn', 'apply.batch', 'Field apply timed out; continuing batch', {
                                ref: answer?.ref,
                                label: answer?.label,
                                timeoutMs: applyFieldTimeoutMs,
                            });
                            resolve(0);
                        }, applyFieldTimeoutMs);
                    }),
                ]);
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

        if (message.type === 'BRIDGE_CLICK_SELECTOR') {
            const selector = String(message.selector || '').trim();
            let clicked = false;
            let error = null;

            if (!selector) {
                error = 'selector is required.';
            } else {
                const element = document.querySelector(selector);

                if (!element) {
                    error = `No element matched selector: ${selector}`;
                } else if (typeof element.click !== 'function') {
                    error = 'Matched element is not clickable.';
                } else {
                    element.focus();
                    element.click();
                    clicked = true;
                }
            }

            sendResponse({ success: clicked, error });

            return;
        }

        if (message.type === 'BRIDGE_READ_FIELD_VALUES') {
            if (typeof AutoCVApplyFormHeuristics === 'undefined') {
                sendResponse({ success: false, error: 'Form heuristics unavailable.' });

                return;
            }

            const controls = AutoCVApplyFormHeuristics.collectReadableFieldValueControlsAllFrames();
            sendResponse(AutoCVApplyFormHeuristics.summarizeReadableFieldValueControls(
                controls,
                window.location.href.split('?')[0],
                document.title || '',
            ));

            return;
        }

        if (message.type === 'SCAN_FORM_VALIDATION' || message.type === 'BRIDGE_SCAN_FORM_VALIDATION') {
            if (typeof AutoCVApplyFormValidation === 'undefined') {
                sendResponse({ success: false, error: 'Form validation helpers unavailable.' });

                return;
            }

            const triggerValidation = message.triggerValidation !== false;
            const state = triggerValidation
                ? await AutoCVApplyFormValidation.scanFormValidationStateWithTrigger(document, {
                    triggerValidation: true,
                    waitMs: message.waitMs,
                })
                : AutoCVApplyFormValidation.scanFormValidationState(document);

            sendResponse({
                success: true,
                page_url: window.location.href.split('?')[0],
                ...state,
            });

            return;
        }

        if (message.type === 'VALIDATE_BLOCKED_FIELD') {
            if (typeof AutoCVApplyFormValidation === 'undefined') {
                sendResponse({
                    valid: true,
                    validationErrors: [],
                    invalidFields: [],
                    validationError: null,
                    error: 'Form validation helpers unavailable.',
                });

                return;
            }

            const result = AutoCVApplyFormValidation.validateBlockedField(document, {
                ref: message.ref || null,
                label: message.label || null,
                question: message.question || message.label || null,
                dom: message.dom || null,
            });

            sendResponse(result);

            return;
        }

        if (message.type === 'BRIDGE_CLICK_TEXT') {
            const needle = String(message.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
            let clicked = false;
            let matchedText = null;
            let error = null;

            if (!needle) {
                error = 'text is required.';
            } else {
                const candidates = document.querySelectorAll(
                    'button, [role="button"], input[type="submit"], input[type="button"], a[href], a[role="button"]',
                );

                for (const element of candidates) {
                    const text = (
                        element.getAttribute('aria-label')
                        || element.textContent
                        || element.getAttribute('value')
                        || ''
                    ).replace(/\s+/g, ' ').trim();

                    if (!text) {
                        continue;
                    }

                    const normalized = text.toLowerCase();

                    if (normalized === needle || normalized.includes(needle) || needle.includes(normalized)) {
                        if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
                            continue;
                        }

                        element.focus();
                        element.click();
                        clicked = true;
                        matchedText = text;
                        break;
                    }
                }

                if (!clicked) {
                    error = `No clickable element matched text: ${message.text}`;
                }
            }

            sendResponse({ success: clicked, matchedText, error });

            return;
        }

        if (message.type === 'APPLY_DRAFT_ANSWER' || message.type === 'APPLY_ANSWER_TO_FIELD') {
            let filled = false;
            let method = null;
            const label = message.label || '';
            const normalizedAnswer = typeof AutoCVApplyAnswerNormalization !== 'undefined'
                ? AutoCVApplyAnswerNormalization.normalizeFieldAnswerForQuestion(label, message.answer, {
                    fieldType: message.field_type || null,
                    options: message.options || null,
                })
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

        if (message.type === 'FILL_COVER_LETTER') {
            sendResponse({ success: await fillCoverLetterFileInput(message.job || null) });

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

        if (message.type === 'LINKEDIN_WAIT_FOR_STEP_READY') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ ready: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            AutoCVApplyLinkedInAutoApply.waitForEasyApplyStepReady(message.timeoutMs || 20_000)
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ ready: false, error: error.message }));

            return true;
        }

        if (message.type === 'LINKEDIN_RECOVER_EMPTY_SHELL') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ recovered: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

            AutoCVApplyLinkedInAutoApply.recoverEmptyEasyApplyShell({
                waitMs: message.waitMs || 12_000,
            })
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ recovered: false, error: error.message }));

            return true;
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

        if (message.type === 'LINKEDIN_ENSURE_RESUME_STEP') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({
                    filled: 0,
                    success: false,
                    skipped: true,
                    resumeSelected: false,
                    errors: ['LinkedIn auto-apply helpers unavailable.'],
                });

                return;
            }

            const profileData = await ensureProfileLoaded();

            sendResponse(await AutoCVApplyLinkedInAutoApply.prefillResumeStep(profileData));

            return;
        }

        if (message.type === 'LINKEDIN_ADVANCE_EASY_APPLY') {
            if (typeof AutoCVApplyLinkedInAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'LinkedIn auto-apply helpers unavailable.' });

                return;
            }

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

            sendResponse(await AutoCVApplyLinkedInAutoApply.closeEasyApplyModal({
                force: message.force === true,
            }));

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

        if (message.type === 'INDEED_PREPARE_JOB_SEARCH') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyIndeedAutoApply.prepareJobSearch());

            return;
        }

        if (message.type === 'INDEED_PREPARE_JOB_VIEW') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyIndeedAutoApply.prepareJobView({
                force: message.force === true,
                light: message.light === true,
            }));

            return;
        }

        if (message.type === 'INDEED_COLLECT_JOB_CARDS') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            const health = await AutoCVApplyIndeedAutoApply.scanPageHealth();

            if (health?.captcha) {
                sendResponse({
                    success: false,
                    captcha: true,
                    jobs: [],
                    error: 'Indeed security check - solve captcha manually.',
                });

                return;
            }

            sendResponse({
                success: true,
                jobs: AutoCVApplyIndeedAutoApply.collectJobCards(),
            });

            return;
        }

        if (message.type === 'INDEED_SELECT_JOB') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyIndeedAutoApply.selectJobById(message.jobId));

            return;
        }

        if (message.type === 'INDEED_WAIT_FOR_JOB_DETAIL') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyIndeedAutoApply.waitForJobDetailReady(message.jobId));

            return;
        }

        if (message.type === 'INDEED_OPEN_APPLY') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(
                await AutoCVApplyIndeedAutoApply.clickIndeedApply(
                    message.jobId || null,
                ),
            );

            return;
        }

        if (message.type === 'INDEED_APPLY_STATE') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ open: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyIndeedAutoApply.getIndeedApplyState());

            return;
        }

        if (message.type === 'INDEED_OPEN_CONTACT_INFO') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyIndeedAutoApply.openIndeedContactInfoStep());

            return;
        }

        if (message.type === 'INDEED_FILL_AND_ADVANCE') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyIndeedAutoApply.clickContinueOrSubmit());

            return;
        }

        if (message.type === 'INDEED_VERIFY_SUBMITTED') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ submitted: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyIndeedAutoApply.verifySubmitted());

            return;
        }

        if (message.type === 'INDEED_NEXT_SEARCH_PAGE') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyIndeedAutoApply.goToNextSearchPage());

            return;
        }

        if (message.type === 'INDEED_SCAN_PAGE_HEALTH') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ ok: true, issues: [], blocking: [], primary: null });

                return;
            }

            sendResponse(await AutoCVApplyIndeedAutoApply.scanPageHealth());

            return;
        }

        if (message.type === 'INDEED_ACCEPT_COOKIE_CONSENT') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ accepted: false });

                return;
            }

            sendResponse(await AutoCVApplyIndeedAutoApply.acceptCookieConsent());

            return;
        }

        if (message.type === 'INDEED_WAIT_FOR_JOB_DESCRIPTION') {
            if (typeof AutoCVApplyIndeedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Indeed auto-apply helpers unavailable.' });

                return;
            }

            const minLength = Number(message.minLength) || 200;

            void AutoCVApplyIndeedAutoApply.waitForJobDescriptionReady(minLength, 20_000)
                .then((result) => sendResponse({ success: result.ready, ...result }))
                .catch((error) => sendResponse({ success: false, error: error.message }));

            return;
        }

        if (message.type === 'GLASSDOOR_PREPARE_JOB_SEARCH') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Glassdoor auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyGlassdoorAutoApply.prepareJobSearch({
                expectedKeyword: message.expectedKeyword || null,
                expectedLocation: message.expectedLocation || null,
            }));

            return;
        }

        if (message.type === 'GLASSDOOR_PREPARE_JOB_VIEW') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Glassdoor auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyGlassdoorAutoApply.prepareJobView({
                light: message.light === true,
            }));

            return;
        }

        if (message.type === 'GLASSDOOR_COLLECT_JOB_CARDS') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Glassdoor auto-apply helpers unavailable.' });

                return;
            }

            sendResponse({
                success: true,
                jobs: AutoCVApplyGlassdoorAutoApply.collectJobCards(),
            });

            return;
        }

        if (message.type === 'GLASSDOOR_SELECT_JOB') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Glassdoor auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyGlassdoorAutoApply.selectJobById(message.jobId));

            return;
        }

        if (message.type === 'GLASSDOOR_WAIT_FOR_JOB_DETAIL') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Glassdoor auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyGlassdoorAutoApply.waitForJobDetailReady(message.jobId));

            return;
        }

        if (message.type === 'GLASSDOOR_CHECK_APPLY_AVAILABILITY') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ easyApply: false, hasApplyButton: false });

                return;
            }

            sendResponse(AutoCVApplyGlassdoorAutoApply.readApplyAvailability());

            return;
        }

        if (message.type === 'GLASSDOOR_OPEN_APPLY') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Glassdoor auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyGlassdoorAutoApply.clickGlassdoorApply());

            return;
        }

        if (message.type === 'GLASSDOOR_NEXT_SEARCH_PAGE') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Glassdoor auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyGlassdoorAutoApply.goToNextSearchPage());

            return;
        }

        if (message.type === 'GLASSDOOR_SCAN_PAGE_HEALTH') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ ok: true, issues: [], blocking: [], primary: null });

                return;
            }

            sendResponse(AutoCVApplyGlassdoorAutoApply.scanPageHealth());

            return;
        }

        if (message.type === 'GLASSDOOR_ACCEPT_COOKIE_CONSENT') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ accepted: false });

                return;
            }

            sendResponse(await AutoCVApplyGlassdoorAutoApply.acceptCookieConsent());

            return;
        }

        if (message.type === 'GLASSDOOR_WAIT_FOR_JOB_DESCRIPTION') {
            if (typeof AutoCVApplyGlassdoorAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Glassdoor auto-apply helpers unavailable.' });

                return;
            }

            const minLength = Number(message.minLength) || 200;

            void AutoCVApplyGlassdoorAutoApply.waitForJobDescriptionReady(minLength, 20_000)
                .then((result) => sendResponse({ success: result.ready, ...result }))
                .catch((error) => sendResponse({ success: false, error: error.message }));

            return;
        }

        if (message.type === 'SIMPLYHIRED_PREPARE_JOB_SEARCH') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'SimplyHired auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplySimplyHiredAutoApply.prepareJobSearch());

            return;
        }

        if (message.type === 'SIMPLYHIRED_PREPARE_JOB_VIEW') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'SimplyHired auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplySimplyHiredAutoApply.prepareJobView({
                light: message.light === true,
            }));

            return;
        }

        if (message.type === 'SIMPLYHIRED_COLLECT_JOB_CARDS') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'SimplyHired auto-apply helpers unavailable.' });

                return;
            }

            sendResponse({
                success: true,
                jobs: AutoCVApplySimplyHiredAutoApply.collectJobCards(),
            });

            return;
        }

        if (message.type === 'SIMPLYHIRED_SELECT_JOB') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'SimplyHired auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplySimplyHiredAutoApply.selectJobById(message.jobId));

            return;
        }

        if (message.type === 'SIMPLYHIRED_WAIT_FOR_JOB_DETAIL') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'SimplyHired auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplySimplyHiredAutoApply.waitForJobDetailReady(message.jobId));

            return;
        }

        if (message.type === 'SIMPLYHIRED_CHECK_APPLY_AVAILABILITY') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ quickApply: false, hasApplyButton: false });

                return;
            }

            sendResponse(AutoCVApplySimplyHiredAutoApply.readApplyAvailability());

            return;
        }

        if (message.type === 'SIMPLYHIRED_OPEN_APPLY') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'SimplyHired auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplySimplyHiredAutoApply.clickSimplyHiredApply());

            return;
        }

        if (message.type === 'SIMPLYHIRED_NEXT_SEARCH_PAGE') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'SimplyHired auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplySimplyHiredAutoApply.goToNextSearchPage());

            return;
        }

        if (message.type === 'SIMPLYHIRED_SCAN_PAGE_HEALTH') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ ok: true, issues: [], blocking: [], primary: null });

                return;
            }

            sendResponse(AutoCVApplySimplyHiredAutoApply.scanPageHealth());

            return;
        }

        if (message.type === 'SIMPLYHIRED_ACCEPT_COOKIE_CONSENT') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ accepted: false });

                return;
            }

            sendResponse(await AutoCVApplySimplyHiredAutoApply.acceptCookieConsent());

            return;
        }

        if (message.type === 'SIMPLYHIRED_WAIT_FOR_JOB_DESCRIPTION') {
            if (typeof AutoCVApplySimplyHiredAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'SimplyHired auto-apply helpers unavailable.' });

                return;
            }

            const minLength = Number(message.minLength) || 200;

            void AutoCVApplySimplyHiredAutoApply.waitForJobDescriptionReady(minLength, 20_000)
                .then((result) => sendResponse({ success: result.ready, ...result }))
                .catch((error) => sendResponse({ success: false, error: error.message }));

            return;
        }

        if (message.type === 'TOTALJOBS_PREPARE_JOB_SEARCH') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyTotalJobsAutoApply.prepareJobSearch());

            return;
        }

        if (message.type === 'TOTALJOBS_PREPARE_JOB_VIEW') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyTotalJobsAutoApply.prepareJobView({
                force: message.force === true,
                light: message.light === true,
            }));

            return;
        }

        if (message.type === 'TOTALJOBS_COLLECT_JOB_CARDS') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            sendResponse({
                success: true,
                jobs: AutoCVApplyTotalJobsAutoApply.collectJobCards(),
            });

            return;
        }

        if (message.type === 'TOTALJOBS_SELECT_JOB') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyTotalJobsAutoApply.selectJobById(message.jobId));

            return;
        }

        if (message.type === 'TOTALJOBS_WAIT_FOR_JOB_DETAIL') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyTotalJobsAutoApply.waitForJobDetailReady(message.jobId));

            return;
        }

        if (message.type === 'TOTALJOBS_OPEN_APPLY') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyTotalJobsAutoApply.clickTotalJobsApply());

            return;
        }

        if (message.type === 'TOTALJOBS_APPLY_STATE') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ open: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyTotalJobsAutoApply.getTotalJobsApplyState());

            return;
        }

        if (message.type === 'TOTALJOBS_FILL_AND_ADVANCE') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyTotalJobsAutoApply.clickContinueOrSubmit());

            return;
        }

        if (message.type === 'TOTALJOBS_VERIFY_SUBMITTED') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ submitted: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyTotalJobsAutoApply.verifySubmitted());

            return;
        }

        if (message.type === 'TOTALJOBS_NEXT_SEARCH_PAGE') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyTotalJobsAutoApply.goToNextSearchPage());

            return;
        }

        if (message.type === 'TOTALJOBS_SCAN_PAGE_HEALTH') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ ok: true, issues: [], blocking: [], primary: null });

                return;
            }

            sendResponse(await AutoCVApplyTotalJobsAutoApply.scanPageHealth());

            return;
        }

        if (message.type === 'TOTALJOBS_ACCEPT_COOKIE_CONSENT') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ accepted: false });

                return;
            }

            sendResponse(await AutoCVApplyTotalJobsAutoApply.acceptCookieConsent());

            return;
        }

        if (message.type === 'TOTALJOBS_WAIT_FOR_JOB_DESCRIPTION') {
            if (typeof AutoCVApplyTotalJobsAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Totaljobs auto-apply helpers unavailable.' });

                return;
            }

            const minLength = Number(message.minLength) || 200;

            void AutoCVApplyTotalJobsAutoApply.waitForJobDescriptionReady(minLength, 20_000)
                .then((result) => sendResponse({ success: result.ready, ...result }))
                .catch((error) => sendResponse({ success: false, error: error.message }));

            return;
        }

        if (message.type === 'REED_PREPARE_JOB_SEARCH') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyReedAutoApply.prepareJobSearch());

            return;
        }

        if (message.type === 'REED_PREPARE_JOB_VIEW') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyReedAutoApply.prepareJobView({
                force: message.force === true,
                light: message.light === true,
            }));

            return;
        }

        if (message.type === 'REED_COLLECT_JOB_CARDS') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse({
                success: true,
                jobs: AutoCVApplyReedAutoApply.collectJobCards(),
            });

            return;
        }

        if (message.type === 'REED_SELECT_JOB') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyReedAutoApply.selectJobById(message.jobId));

            return;
        }

        if (message.type === 'REED_WAIT_FOR_JOB_DETAIL') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyReedAutoApply.waitForJobDetailReady(message.jobId));

            return;
        }

        if (message.type === 'REED_OPEN_APPLY') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyReedAutoApply.clickReedApply());

            return;
        }

        if (message.type === 'REED_APPLY_STATE') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ open: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyReedAutoApply.getReedApplyState());

            return;
        }

        if (message.type === 'REED_FILL_AND_ADVANCE') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyReedAutoApply.clickContinueOrSubmit());

            return;
        }

        if (message.type === 'REED_VERIFY_SUBMITTED') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ submitted: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyReedAutoApply.verifySubmitted());

            return;
        }

        if (message.type === 'REED_NEXT_SEARCH_PAGE') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyReedAutoApply.goToNextSearchPage());

            return;
        }

        if (message.type === 'REED_SCAN_PAGE_HEALTH') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ ok: true, issues: [], blocking: [], primary: null });

                return;
            }

            sendResponse(await AutoCVApplyReedAutoApply.scanPageHealth());

            return;
        }

        if (message.type === 'REED_ACCEPT_COOKIE_CONSENT') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ accepted: false });

                return;
            }

            sendResponse(await AutoCVApplyReedAutoApply.acceptCookieConsent());

            return;
        }

        if (message.type === 'REED_WAIT_FOR_JOB_DESCRIPTION') {
            if (typeof AutoCVApplyReedAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'Reed auto-apply helpers unavailable.' });

                return;
            }

            const minLength = Number(message.minLength) || 200;

            void AutoCVApplyReedAutoApply.waitForJobDescriptionReady(minLength, 20_000)
                .then((result) => sendResponse({ success: result.ready, ...result }))
                .catch((error) => sendResponse({ success: false, error: error.message }));

            return;
        }

        if (message.type === 'CV_LIBRARY_PREPARE_JOB_SEARCH') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyCvLibraryAutoApply.prepareJobSearch());

            return;
        }

        if (message.type === 'CV_LIBRARY_PREPARE_JOB_VIEW') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyCvLibraryAutoApply.prepareJobView({
                force: message.force === true,
                light: message.light === true,
            }));

            return;
        }

        if (message.type === 'CV_LIBRARY_COLLECT_JOB_CARDS') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse({
                success: true,
                jobs: AutoCVApplyCvLibraryAutoApply.collectJobCards(),
            });

            return;
        }

        if (message.type === 'CV_LIBRARY_CHECK_APPLY_AVAILABILITY') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyCvLibraryAutoApply.readApplyAvailability());

            return;
        }

        if (message.type === 'CV_LIBRARY_SELECT_JOB') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyCvLibraryAutoApply.selectJobById(message.jobId));

            return;
        }

        if (message.type === 'CV_LIBRARY_WAIT_FOR_JOB_DETAIL') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyCvLibraryAutoApply.waitForJobDetailReady(message.jobId));

            return;
        }

        if (message.type === 'CV_LIBRARY_OPEN_APPLY') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyCvLibraryAutoApply.clickCvLibraryApply());

            return;
        }

        if (message.type === 'CV_LIBRARY_APPLY_STATE') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ open: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyCvLibraryAutoApply.getCvLibraryApplyState());

            return;
        }

        if (message.type === 'CV_LIBRARY_FILL_AND_ADVANCE') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyCvLibraryAutoApply.clickContinueOrSubmit());

            return;
        }

        if (message.type === 'CV_LIBRARY_VERIFY_SUBMITTED') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ submitted: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(AutoCVApplyCvLibraryAutoApply.verifySubmitted());

            return;
        }

        if (message.type === 'CV_LIBRARY_NEXT_SEARCH_PAGE') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            sendResponse(await AutoCVApplyCvLibraryAutoApply.goToNextSearchPage());

            return;
        }

        if (message.type === 'CV_LIBRARY_SCAN_PAGE_HEALTH') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ ok: true, issues: [], blocking: [], primary: null });

                return;
            }

            sendResponse(await AutoCVApplyCvLibraryAutoApply.scanPageHealth());

            return;
        }

        if (message.type === 'CV_LIBRARY_ACCEPT_COOKIE_CONSENT') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ accepted: false });

                return;
            }

            sendResponse(await AutoCVApplyCvLibraryAutoApply.acceptCookieConsent());

            return;
        }

        if (message.type === 'CV_LIBRARY_WAIT_FOR_JOB_DESCRIPTION') {
            if (typeof AutoCVApplyCvLibraryAutoApply === 'undefined') {
                sendResponse({ success: false, error: 'CV-Library auto-apply helpers unavailable.' });

                return;
            }

            const minLength = Number(message.minLength) || 200;

            void AutoCVApplyCvLibraryAutoApply.waitForJobDescriptionReady(minLength, 20_000)
                .then((result) => sendResponse({ success: result.ready, ...result }))
                .catch((error) => sendResponse({ success: false, error: error.message }));

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
        } catch (error) {
            sendResponse({
                error: error instanceof Error ? error.message : String(error),
            });
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
