/**
 * AutoCVApply Content Script
 * Detects job application form fields and fills them from the user's profile.
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
        detect: () => location.hostname.includes('indeed.com'),
        fields: {
            firstName: ['input[name="applicant.name.first"]', '#input-firstName'],
            lastName: ['input[name="applicant.name.last"]', '#input-lastName'],
            email: ['input[name="applicant.emailAddress"]', 'input[type="email"]'],
            phone: ['input[name="applicant.phoneNumber"]', 'input[type="tel"]'],
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
};

let profile = null;
let fillButton = null;

function detectPlatform() {
    for (const [name, config] of Object.entries(PLATFORM_SELECTORS)) {
        if (config.detect()) {
 return { name, config }; 
}
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

function setFieldValue(element, value) {
    if (!element || !value) {
 return false; 
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
    for (const selector of selectors) {
        const el = document.querySelector(selector);

        if (el) {
 return el; 
}
    }

    return null;
}

function fillForm(platformConfig, p) {
    const fields = platformConfig.config.fields;
    const profileData = p.profile;
    let filled = 0;

    const fieldMappings = {
        firstName: getFirstName(profileData.full_name),
        lastName: getLastName(profileData.full_name),
        email: profileData.email,
        phone: profileData.phone,
        address: profileData.location,
        city: profileData.location?.split(',')[0]?.trim(),
        linkedin: profileData.linkedin_url,
        website: profileData.website_url,
        coverLetter: profileData.summary,
    };

    for (const [fieldKey, value] of Object.entries(fieldMappings)) {
        if (!value || !fields[fieldKey]) {
 continue; 
}

        const element = findElement(fields[fieldKey]);

        if (element && !element.value) {
            if (setFieldValue(element, value)) {
 filled++; 
}
        }
    }

    return filled;
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

        if (!profile) {
            await loadProfile();
        }

        if (!profile) {
            btn.textContent = '⚠ Sign in to AutoCVApply first';
            setTimeout(() => {
 btn.textContent = 'AutoFill with AutoCVApply'; 
}, 3000);

            return;
        }

        try {
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ type: 'RECORD_AUTOFILL' }, (response) => {
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
            btn.textContent = error.message.includes('limit') ? '⚠ Monthly limit reached' : '⚠ Autofill failed';
            setTimeout(() => {
 btn.innerHTML = btn.innerHTML.replace(/⚠.*/, 'AutoFill with AutoCVApply'); 
}, 3000);

            return;
        }

        const count = fillForm(platform, profile);
        btn.textContent = count > 0 ? `✓ Filled ${count} fields` : '✓ Already filled';
        setTimeout(() => {
 btn.innerHTML = btn.innerHTML.replace(/✓.*/, 'AutoFill with AutoCVApply'); 
}, 3000);
    });

    document.body.appendChild(fillButton);
}

async function init() {
    const platform = detectPlatform();

    if (!platform) {
 return; 
}

    const { isEnabled: enabled } = await chrome.storage.local.get(['isEnabled']);

    if (enabled === false) {
 return; 
}

    await loadProfile();
    createFillButton();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
