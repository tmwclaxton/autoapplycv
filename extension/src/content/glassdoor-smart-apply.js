/**
 * Glassdoor Easy Apply automation (Indeed Apply iframe on Glassdoor).
 */
let isRunning = false;
let userExplicitlyClickedStart = false;
let config = {};
let appliedCount = 0;
let skippedCount = 0;

function log(msg) {
    console.log('[AutoCVApply Glassdoor]', msg);

    try {
        chrome.runtime.sendMessage({ type: 'log', message: msg });
    } catch {
        // Popup may be closed.
    }
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitFullName(fullName) {
    if (!fullName) {
        return { firstName: '', lastName: '' };
    }

    const parts = fullName.trim().split(/\s+/);

    return {
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' ') || '',
    };
}

async function buildBotConfig() {
    const settings = await chrome.storage.sync.get([
        'yearsOfExperience',
        'blacklistKeywords',
        'expectedSalary',
        'visaSponsorship',
        'legallyAuthorized',
    ]);

    const profileData = await new Promise((resolve, reject) => {
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

    const profile = profileData.profile || {};
    const { firstName, lastName } = splitFullName(profile.full_name);

    return {
        firstName,
        lastName,
        email: profile.email || profileData.user?.email || '',
        phone: profile.phone || '',
        blacklistKeywords: settings.blacklistKeywords || '',
    };
}

function setInputValue(element, value) {
    if (!element || !value) {
        return false;
    }

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

    if (setter) {
        setter.call(element, value);
    } else {
        element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
}

function fillVisibleFields(root = document) {
    let filled = 0;
    const mappings = [
        { selectors: ['input[name="applicant.name.first"]', '#input-firstName', 'input[id="input-applicant.name"]'], value: config.firstName },
        { selectors: ['input[name="applicant.name.last"]', '#input-lastName'], value: config.lastName },
        { selectors: ['input[name="applicant.emailAddress"]', 'input[type="email"]'], value: config.email },
        { selectors: ['input[name="applicant.phoneNumber"]', 'input[type="tel"]'], value: config.phone },
    ];

    for (const mapping of mappings) {
        for (const selector of mapping.selectors) {
            const element = root.querySelector(selector);

            if (element && !element.value && mapping.value) {
                if (setInputValue(element, mapping.value)) {
                    filled += 1;
                    break;
                }
            }
        }
    }

    return filled;
}

function clickByText(root, texts) {
    for (const text of texts) {
        for (const button of root.querySelectorAll('button, a, [role="button"], input[type="submit"]')) {
            const label = button.textContent?.trim() || button.value || button.getAttribute('aria-label') || '';

            if (label.toLowerCase().includes(text.toLowerCase()) && button.offsetParent !== null) {
                button.click();

                return true;
            }
        }
    }

    return false;
}

async function clickGlassdoorApply() {
    const applyButton = document.querySelector('[data-test="applyButton"], button[data-test="applyButton"]');

    if (applyButton) {
        applyButton.click();

        return true;
    }

    return clickByText(document, ['easy apply', 'apply now', 'apply']);
}

async function runApplyStep() {
    const filled = fillVisibleFields(document);

    if (filled > 0) {
        log(`Filled ${filled} field(s) in current frame.`);
    }

    if (clickByText(document, ['continue', 'next', 'review', 'submit application', 'submit'])) {
        await wait(1500);

        return true;
    }

    return filled > 0;
}

async function mainLoop() {
    log('Glassdoor bot loop started.');

    while (isRunning) {
        if (location.hostname.includes('glassdoor')) {
            await clickGlassdoorApply();
            await wait(2000);
        }

        await runApplyStep();
        await wait(1200);
    }

    log('Glassdoor bot loop ended.');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        if (request.action === 'start') {
            config = await buildBotConfig();

            if (!config.firstName || !config.email || !config.phone) {
                sendResponse({
                    success: false,
                    error: 'Complete your profile (name, email, phone) on autocvapply.com before starting the bot.',
                });

                return;
            }

            isRunning = true;
            userExplicitlyClickedStart = true;
            await chrome.storage.local.set({ isRunning: true, botRunning: true });
            sendResponse({ success: true });

            try {
                chrome.runtime.sendMessage({ type: 'botStarted' });
            } catch {
                // Popup may be closed.
            }

            mainLoop();
        } else if (request.action === 'stop') {
            isRunning = false;
            userExplicitlyClickedStart = false;
            await chrome.storage.local.set({ isRunning: false, botRunning: false });
            sendResponse({ success: true });

            try {
                chrome.runtime.sendMessage({ type: 'botStopped' });
            } catch {
                // Popup may be closed.
            }
        }
    })();

    return true;
});
