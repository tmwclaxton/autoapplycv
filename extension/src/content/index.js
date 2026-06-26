/**
 * AutoCVApply Content Script
 * Detects job application form fields and fills them from the user's profile.
 * Uses platform-specific selectors first, then universal heuristics and AI assist.
 */

const SUPPORTED_HOSTS = [
    'workday',
    'myworkdayjobs',
    'indeed.com',
    'apply.indeed.com',
    'linkedin.com',
    'greenhouse.io',
    'lever.co',
    'glassdoor',
    'monster.com',
    'welcometothejungle.com',
];

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
        detect: () => location.hostname.includes('indeed.com') && !location.hostname.includes('apply.indeed.com'),
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
let fillButton = null;

function detectPlatform() {
    for (const [name, config] of Object.entries(PLATFORM_SELECTORS)) {
        if (name === 'generic') {
            continue;
        }

        if (config.detect()) {
            return { name, config };
        }
    }

    if (SUPPORTED_HOSTS.some((host) => location.hostname.includes(host))
        && typeof AutoCVApplyFormHeuristics !== 'undefined'
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
        job_description: null,
        source: platformName,
    };
}

async function recordAutofillApplication(platformName) {
    try {
        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'RECORD_APPLICATION',
                application: {
                    ...extractJobMeta(platformName),
                    applied_at: new Date().toISOString(),
                },
            }, (response) => {
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
        // Non-blocking if tracking fails.
    }
}

function setFieldValue(element, value) {
    if (!element || !value) {
        return false;
    }

    if (typeof AutoCVApplyFormHeuristics !== 'undefined') {
        return AutoCVApplyFormHeuristics.setFieldValue(element, value);
    }

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
    } else {
        element.value = value;
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

async function loadAutofillContext() {
    const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get([
            'yearsOfExperience',
            'expectedSalary',
            'visaSponsorship',
            'legallyAuthorized',
            'willingToRelocate',
            'driversLicense',
        ]),
        chrome.storage.local.get(['questionMemo']),
    ]);

    return {
        settings: {
            yearsOfExperience: syncSettings.yearsOfExperience || '2',
            expectedSalary: syncSettings.expectedSalary || '',
            visaSponsorship: syncSettings.visaSponsorship || 'no',
            legallyAuthorized: syncSettings.legallyAuthorized || 'yes',
            willingToRelocate: syncSettings.willingToRelocate || 'yes',
            driversLicense: syncSettings.driversLicense || 'yes',
        },
        memo: localSettings.questionMemo || {},
    };
}

async function saveQuestionMemo(updates) {
    const { questionMemo = {} } = await chrome.storage.local.get(['questionMemo']);

    await chrome.storage.local.set({
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

    await recordAutofillApplication(platform.name);

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

function createFillButton() {
    if (fillButton) {
        fillButton.remove();
    }

    fillButton = document.createElement('div');
    fillButton.id = 'autocvapply-fill-btn';
    fillButton.innerHTML = `
        <div style="
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            display: flex;
            align-items: center;
            gap: 8px;
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            color: white;
            padding: 12px 20px;
            border-radius: 50px;
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4);
            user-select: none;
            transition: transform 0.15s, box-shadow 0.15s;
        " onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 6px 25px rgba(37,99,235,0.5)'"
           onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 4px 20px rgba(37,99,235,0.4)'"
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            AutoFill with AutoCVApply
        </div>
    `;

    const btn = fillButton.querySelector('div');
    btn.addEventListener('click', async () => {
        const platform = detectPlatform();

        if (!platform) {
            return;
        }

        const result = await performAutofill(platform);
        btn.textContent = result.message;
        setTimeout(() => {
            btn.textContent = 'AutoFill with AutoCVApply';
        }, 3000);
    });

    document.body.appendChild(fillButton);
}

async function init() {
    const { isEnabled: enabled } = await chrome.storage.local.get(['isEnabled']);

    if (enabled === false) {
        return;
    }

    await loadProfile();

    const showButtonIfNeeded = () => {
        if (fillButton || !detectPlatform()) {
            return;
        }

        const inTopFrame = window === window.top;
        const inApplyFrame = typeof AutoCVApplyFormHeuristics !== 'undefined'
            && AutoCVApplyFormHeuristics.frameHasApplicationForm(document);

        if (inTopFrame || inApplyFrame) {
            createFillButton();
        }
    };

    showButtonIfNeeded();

    const observer = new MutationObserver(() => {
        showButtonIfNeeded();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
