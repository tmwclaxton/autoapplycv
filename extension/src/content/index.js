/**
 * AutoCVApply Content Script
 * Detects job application form fields and fills them from the user's profile.
 * Uses platform-specific selectors first, then universal heuristics and AI assist.
 */

const PLATFORM_SELECTORS = {
    workday: {
        detect: () => document.querySelector('[data-automation-id]') !== null || location.hostname.includes('workday') || location.hostname.includes('myworkdayjobs'),
        fields: {
            firstName: ['[data-automation-id="legalNameSection_firstName"]', 'input[name="firstName"]'],
            lastName: ['[data-automation-id="legalNameSection_lastName"]', 'input[name="lastName"]'],
            email: ['[data-automation-id="email"]', 'input[type="email"]'],
            phone: ['[data-automation-id="phone"]', 'input[type="tel"]'],
            address: ['[data-automation-id="addressSection_addressLine1"]'],
            city: ['[data-automation-id="addressSection_city"]'],
            linkedin: ['[data-automation-id="linkedIn"]', 'input[aria-label*="LinkedIn"]'],
            website: ['[data-automation-id="website"]', 'input[aria-label*="website"]'],
        },
    },
    indeed: {
        detect: () => (location.hostname.includes('indeed.com') || location.hostname.includes('indeed.co.uk'))
            && !location.hostname.includes('apply.indeed.com'),
        fields: {
            firstName: ['input[name="applicant.name.first"]', '#input-firstName', 'input[id="input-applicant.name"]'],
            lastName: ['input[name="applicant.name.last"]', '#input-lastName'],
            email: ['input[name="applicant.emailAddress"]', 'input[type="email"]'],
            phone: ['input[name="applicant.phoneNumber"]', 'input[type="tel"]'],
        },
    },
    indeed_apply: {
        detect: () => location.hostname.includes('apply.indeed.com'),
        fields: {
            firstName: ['input[name="applicant.name.first"]', '#input-firstName', 'input[id="input-applicant.name"]', '#input-applicant\\.name'],
            lastName: ['input[name="applicant.name.last"]', '#input-lastName'],
            email: ['input[name="applicant.emailAddress"]', 'input[type="email"]', 'input[id="input-applicant.email"]'],
            phone: ['input[name="applicant.phoneNumber"]', 'input[type="tel"]', 'input[id="input-applicant.phone"]'],
        },
    },
    linkedin: {
        detect: () => location.hostname.includes('linkedin.com'),
        fields: {
            firstName: ['input[name="firstName"]', '#single-line-text-form-component-profileName-first-name'],
            lastName: ['input[name="lastName"]', '#single-line-text-form-component-profileName-last-name'],
            email: ['input[name="emailAddress"]', 'input[type="email"]'],
            phone: ['input[name="phoneNumber"]', 'input[type="tel"]'],
            city: ['input[name="city"]'],
        },
    },
    greenhouse: {
        detect: () => location.hostname.includes('greenhouse.io'),
        fields: {
            firstName: ['input#first_name', 'input[name="job_application[first_name]"]'],
            lastName: ['input#last_name', 'input[name="job_application[last_name]"]'],
            email: ['input#email', 'input[name="job_application[email]"]'],
            phone: ['input#phone', 'input[name="job_application[phone]"]'],
            linkedin: ['input#job_application_answers_attributes_0_text_value[placeholder*="LinkedIn"]', 'input[placeholder*="linkedin"]'],
            website: ['input#website', 'input[placeholder*="website"]', 'input[placeholder*="portfolio"]'],
            coverLetter: ['textarea#cover_letter'],
        },
    },
    lever: {
        detect: () => location.hostname.includes('lever.co'),
        fields: {
            firstName: ['input[name="name"]'],
            email: ['input[name="email"]'],
            phone: ['input[name="phone"]'],
            linkedin: ['input[name="urls[LinkedIn]"]', 'input[placeholder*="linkedin"]'],
            website: ['input[name="urls[Portfolio]"]', 'input[placeholder*="portfolio"]', 'input[placeholder*="website"]'],
            coverLetter: ['textarea[name="comments"]'],
        },
    },
    glassdoor: {
        detect: () => location.hostname.includes('glassdoor'),
        fields: {
            firstName: ['input[name="applicant.name.first"]', 'input[id="input-applicant.name"]', '#input-firstName'],
            lastName: ['input[name="applicant.name.last"]', 'input[id="input-applicant.lastName"]', '#input-lastName'],
            email: ['input[name="applicant.emailAddress"]', 'input[type="email"]'],
            phone: ['input[name="applicant.phoneNumber"]', 'input[type="tel"]'],
        },
    },
    monster: {
        detect: () => location.hostname.includes('monster.com'),
        fields: {
            firstName: ['input[name="firstName"]', '#FirstName', 'input[data-test-id="firstName"]', 'input[autocomplete="given-name"]'],
            lastName: ['input[name="lastName"]', '#LastName', 'input[data-test-id="lastName"]', 'input[autocomplete="family-name"]'],
            email: ['input[name="email"]', 'input[type="email"]', 'input[data-test-id="email"]'],
            phone: ['input[name="phone"]', 'input[type="tel"]', 'input[data-test-id="phone"]'],
            city: ['input[name="city"]', 'input[data-test-id="city"]'],
            coverLetter: ['textarea[name="coverLetter"]', 'textarea[data-test-id="coverLetter"]'],
        },
    },
    wttj: {
        detect: () => location.hostname.includes('welcometothejungle.com'),
        fields: {
            firstName: ['input[name*="first"]', 'input[autocomplete="given-name"]', 'input[id*="first"]'],
            lastName: ['input[name*="last"]', 'input[autocomplete="family-name"]', 'input[id*="last"]'],
            email: ['input[type="email"]', 'input[name*="email"]'],
            phone: ['input[type="tel"]', 'input[name*="phone"]'],
            linkedin: ['input[name*="linkedin"]', 'input[placeholder*="LinkedIn"]'],
            coverLetter: ['textarea[name*="cover"]', 'textarea[name*="message"]', 'textarea[name*="motivation"]'],
        },
    },
    generic: {
        detect: () => false,
        fields: {},
    },
};

let profile = null;
let overlayRefreshTimer = null;
let overlayRefreshInFlight = false;
let cachedAuthenticated = false;
let lastMutationRefreshAt = 0;

function detectPlatform() {
    for (const [name, config] of Object.entries(PLATFORM_SELECTORS)) {
        if (name === 'generic') {
            continue;
        }

        if (config.detect()) {
            return { name, config };
        }
    }

    if (typeof AutoCVApplyFormHeuristics !== 'undefined'
        && AutoCVApplyFormHeuristics.looksLikeApplicationForm()) {
        return { name: 'generic', config: PLATFORM_SELECTORS.generic };
    }

    return null;
}

function getFirstName(fullName) {
    if (!fullName) {
        return '';
    }

    const parts = fullName.trim().split(' ');

    return parts[0] || '';
}

function getLastName(fullName) {
    if (!fullName) {
        return '';
    }

    const parts = fullName.trim().split(' ');

    return parts.slice(1).join(' ') || '';
}

function extractJobMeta(platformName) {
    if (platformName === 'linkedin') {
        return {
            title: document.querySelector('.jobs-unified-top-card__job-title, h1')?.textContent?.trim() || 'LinkedIn job',
            company: document.querySelector('.jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name')?.textContent?.trim() || 'Unknown company',
            link: window.location.href.split('?')[0],
            location: document.querySelector('.jobs-unified-top-card__bullet')?.textContent?.trim() || null,
            job_description: document.querySelector('#job-details, .jobs-description')?.textContent?.trim()?.slice(0, 20000) || null,
            source: 'linkedin',
        };
    }

    if (platformName === 'indeed' || platformName === 'indeed_apply') {
        const smartApplyHeader = document.querySelector('#ia-JobHeader-title, .ia-JobHeader-title');

        if (smartApplyHeader) {
            const locationText = document.querySelector('.ia-JobHeader-information span, .ia-JobHeader-subtitle')?.textContent?.trim() || null;
            const [companyPart, locationPart] = locationText?.split(' - ') || [];

            return {
                title: smartApplyHeader.textContent?.trim() || 'Indeed job',
                company: companyPart?.trim() || 'Unknown company',
                link: window.location.href.split('?')[0],
                location: locationPart?.trim() || locationText,
                job_description: document.querySelector('#job-description-container, .jobsearch-JobComponent-description')?.textContent?.trim()?.slice(0, 20000) || null,
                source: 'indeed',
            };
        }

        return {
            title: document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"], h1')?.textContent?.trim() || 'Indeed job',
            company: document.querySelector('[data-testid="inlineHeader-companyName"], [data-company-name="true"]')?.textContent?.trim() || 'Unknown company',
            link: window.location.href.split('?')[0],
            location: document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.textContent?.trim() || null,
            job_description: document.querySelector('#jobDescriptionText')?.textContent?.trim()?.slice(0, 20000) || null,
            source: 'indeed',
        };
    }

    if (platformName === 'glassdoor') {
        return {
            title: document.querySelector('[data-test="job-title"], .JobDetails_jobTitle, h1')?.textContent?.trim() || 'Glassdoor job',
            company: document.querySelector('[data-test="employer-name"], .EmployerProfile_employerName')?.textContent?.trim() || 'Unknown company',
            link: window.location.href.split('?')[0],
            location: document.querySelector('[data-test="location"], .JobDetails_location')?.textContent?.trim() || null,
            job_description: document.querySelector('[data-test="jobDescriptionContent"], .JobDetails_jobDescription')?.textContent?.trim()?.slice(0, 20000) || null,
            source: 'glassdoor',
        };
    }

    if (platformName === 'monster') {
        return {
            title: document.querySelector('[data-test-id="jobTitle"], h1')?.textContent?.trim() || 'Monster job',
            company: document.querySelector('[data-test-id="companyName"], [data-company]')?.textContent?.trim() || 'Unknown company',
            link: window.location.href.split('?')[0],
            location: document.querySelector('[data-test-id="jobLocation"]')?.textContent?.trim() || null,
            job_description: document.querySelector('[data-test-id="jobDescription"], .job-description')?.textContent?.trim()?.slice(0, 20000) || null,
            source: 'monster',
        };
    }

    if (platformName === 'wttj') {
        return {
            title: document.querySelector('h1, [data-testid="job-title"]')?.textContent?.trim() || 'WTTJ job',
            company: document.querySelector('[data-testid="company-name"], a[href*="/companies/"]')?.textContent?.trim() || 'Unknown company',
            link: window.location.href.split('?')[0],
            location: document.querySelector('[data-testid="job-location"]')?.textContent?.trim() || null,
            job_description: document.querySelector('[data-testid="job-description"]')?.textContent?.trim()?.slice(0, 20000) || null,
            source: 'wttj',
        };
    }

    return {
        title: document.title || 'Job application',
        company: 'Unknown company',
        link: window.location.href.split('?')[0],
        location: null,
        job_description: extractJobDescriptionFromPage(),
        source: platformName,
    };
}

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

function setFieldValue(element, value) {
    if (!element || !value) {
        return false;
    }

    if (typeof AutoCVApplyFormHeuristics !== 'undefined') {
        return AutoCVApplyFormHeuristics.setFieldValue(element, value);
    }

    try {
        element.value = value;
    } catch {
        return false;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    return true;
}

function findElement(selectors) {
    let found = null;

    AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
        if (found) {
            return;
        }

        for (const selector of selectors) {
            try {
                const element = doc.querySelector(selector);

                if (element) {
                    found = element;

                    return;
                }
            } catch {
                // Invalid selector on this document — skip.
            }
        }
    });

    return found;
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

async function readLocalStorage(keys) {
    try {
        return await chrome.storage.local.get(keys);
    } catch {
        return {};
    }
}

async function writeLocalStorage(values) {
    try {
        await chrome.storage.local.set(values);
    } catch {
        // Storage unavailable in this context.
    }
}

async function loadAutofillContext() {
    const [profileResponse, localSettings] = await Promise.all([
        new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, resolve);
        }),
        readLocalStorage(['questionMemo']),
    ]);

    return {
        settings: mapApplicationSettingsForAssist(profileResponse?.application_settings),
        memo: localSettings.questionMemo || {},
    };
}

async function saveQuestionMemo(updates) {
    const { questionMemo = {} } = await readLocalStorage(['questionMemo']);

    await writeLocalStorage({
        questionMemo: {
            ...questionMemo,
            ...updates,
        },
    });
}

function fillForm(platformConfig, p, maxFields = Infinity) {
    const fields = platformConfig.config.fields;
    const profileData = p.profile;
    let filled = 0;

    const fieldMappings = {
        firstName: getFirstName(profileData.full_name),
        lastName: getLastName(profileData.full_name),
        email: profileData.email,
        phone: profileData.phone,
        address: profileData.location ?? profileData.structured_data?.address_line_1,
        city: profileData.city ?? profileData.location?.split(',')[0]?.trim(),
        postcode: profileData.postcode,
        country: profileData.country,
        linkedin: profileData.linkedin_url,
        website: profileData.website_url,
        coverLetter: profileData.summary ?? profileData.formatted_cv_text?.slice(0, 2000),
    };

    for (const [fieldKey, value] of Object.entries(fieldMappings)) {
        if (filled >= maxFields) {
            break;
        }

        if (!value || !fields[fieldKey]) {
            continue;
        }

        const element = findElement(fields[fieldKey]);

        if (element && !element.value) {
            if (setFieldValue(element, value)) {
                filled += 1;
            }
        }
    }

    return filled;
}

function fillWithHeuristics(p, settings, maxFields, filledSoFar, memo) {
    let filled = filledSoFar;
    const profileData = p.profile;

    AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
        if (filled >= maxFields) {
            return;
        }

        filled += AutoCVApplyFormHeuristics.fillContainer(
            doc,
            profileData,
            settings,
            maxFields - filled,
            memo,
        );
    });

    return filled;
}

async function fillWithAiQuestions(platformName, p, settings, maxFields, filledSoFar, memo) {
    let filled = filledSoFar;
    const openQuestions = [];

    AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
        openQuestions.push(...AutoCVApplyFormHeuristics.collectOpenQuestions(doc, memo));
    });

    const unanswered = openQuestions
        .filter((question) => question.element && !question.element.value?.trim())
        .slice(0, 5)
        .map(({ label, field_type, max_chars }) => ({ label, field_type, max_chars }));

    if (unanswered.length === 0 || filled >= maxFields) {
        return filled;
    }

    const job = extractJobMeta(platformName);

    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'ASSIST_QUESTIONS',
                job,
                questions: unanswered,
                settings,
            }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });

        if (!response?.success || !Array.isArray(response.answers)) {
            return filled;
        }

        const memoUpdates = {};

        for (const answer of response.answers) {
            if (filled >= maxFields || !answer?.answer || !answer?.label) {
                continue;
            }

            for (const question of openQuestions) {
                if (question.label !== answer.label || question.element.value?.trim()) {
                    continue;
                }

                if (setFieldValue(question.element, answer.answer)) {
                    filled += 1;
                    memoUpdates[question.label] = answer.answer;
                }
            }
        }

        if (Object.keys(memoUpdates).length > 0) {
            await saveQuestionMemo(memoUpdates);
        }
    } catch {
        // AI assist is optional.
    }

    return filled;
}

async function fillResumeFileInput(maxFields, filled) {
    if (filled >= maxFields) {
        return filled;
    }

    let fileInput = null;

    AutoCVApplyFormHeuristics.forEachIframeDocument((doc) => {
        if (fileInput) {
            return;
        }

        fileInput = doc.querySelector('input[type="file"]:not([disabled])');
    });

    if (!fileInput || fileInput.files?.length > 0 || fileInput.value) {
        return filled;
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

        return filled + 1;
    } catch {
        return filled;
    }
}

async function performAutofill(platform) {
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

    const { settings, memo } = await loadAutofillContext();
    let filled = fillForm(platform, profile, remaining);

    if (typeof AutoCVApplyFormHeuristics !== 'undefined') {
        filled = fillWithHeuristics(profile, settings, remaining, filled, memo);
        filled = await fillWithAiQuestions(platform.name, profile, settings, remaining, filled, memo);
    }

    filled = await fillResumeFileInput(remaining, filled);

    if (filled === 0) {
        return { ok: true, message: '✓ Already filled', count: 0 };
    }

    try {
        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'RECORD_AUTOFILL', count: filled }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response?.error) {
                    reject(new Error(response.error));
                } else {
                    if (response?.subscription) {
                        profile.subscription = response.subscription;
                    }

                    resolve(response);
                }
            });
        });
    } catch (error) {
        return {
            ok: false,
            message: error.message.includes('autofill') ? '⚠ Monthly limit reached' : '⚠ Autofill failed',
        };
    }

    return {
        ok: true,
        count: filled,
        message: filled === 1 ? '✓ Filled 1 field' : `✓ Filled ${filled} fields`,
    };
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

async function runAutofill() {
    let platform = detectPlatform();

    if (!platform) {
        platform = { name: 'generic', config: PLATFORM_SELECTORS.generic };
    }

    return performAutofill(platform);
}

async function runFullFill() {
    const autofillResult = await runAutofill();

    if (!autofillResult.ok) {
        return autofillResult;
    }

    const draftResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'START_DRAFT_ALL' }, resolve);
    });

    if (draftResult?.error) {
        if (draftResult.error === 'No empty fields found to draft.') {
            return {
                ok: true,
                message: autofillResult.message || '✓ Application filled',
            };
        }

        return { ok: false, message: draftResult.error };
    }

    return {
        ok: true,
        message: draftResult?.message || autofillResult.message || '✓ Fill complete',
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

    const { settings, memo } = await loadAutofillContext();
    const platform = detectPlatform();
    const snapshot = typeof AutoCVApplyFieldInventory !== 'undefined'
        ? AutoCVApplyFieldInventory.buildSnapshot(document, profile.profile, settings, memo)
        : null;
    const fields = typeof AutoCVApplyFieldInventory !== 'undefined'
        ? AutoCVApplyFieldInventory.fieldsFromInventory(snapshot.elements)
        : AutoCVApplyFormHeuristics.collectAllDraftableFields(
            document,
            profile.profile,
            settings,
            memo,
        );

    const job = platform
        ? extractJobMeta(platform.name)
        : {
            title: document.title || 'Job application',
            company: 'Unknown company',
            link: window.location.href.split('?')[0],
            job_description: extractJobDescriptionFromPage(),
        };

    return {
        success: true,
        fields,
        snapshot,
        job,
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
            const platform = detectPlatform();

            sendResponse({
                job: platform
                    ? extractJobMeta(platform.name)
                    : {
                        title: document.title || 'Job application',
                        company: 'Unknown company',
                        link: window.location.href.split('?')[0],
                    },
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
