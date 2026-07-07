import { existsSync, readFileSync } from 'node:fs';
import { buildLinkedInJobSearchUrl as buildLinkedInJobSearchUrlFromExtension } from '../../../extension/src/shared/linkedin-platform.js';

export { buildLinkedInJobSearchUrlFromExtension as buildLinkedInJobSearchUrl };

export const LINKEDIN_PAGE_ERROR_SELECTORS = [
    '.artdeco-toast-item--error',
    '[data-test-artdeco-toast-item-type="error"]',
    '.artdeco-inline-feedback--error',
    '.jobs-easy-apply-modal .artdeco-inline-feedback--error',
    '.jobs-easy-apply-modal [role="alert"]',
    '.feed-shared-error',
    '.jobs-search-box__error-text',
];

export const LINKEDIN_ERROR_TEXT_PATTERNS = [
    /something went wrong/i,
    /rate limit|too many requests|try again later/i,
    /session expired|sign in again/i,
    /unable to load|could not load/i,
];

export function loadEnvFile(filePath) {
    if (!existsSync(filePath)) {
        return {};
    }

    const values = {};

    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
        const trimmed = line.trim();

        if (trimmed === '' || trimmed.startsWith('#')) {
            continue;
        }

        const separatorIndex = trimmed.indexOf('=');

        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        values[key] = value;
    }

    return values;
}

export function requireEnv(env, key) {
    const value = env[key]?.trim();

    if (!value) {
        throw new Error(`Missing ${key}. Add it to .env for local LinkedIn E2E runs.`);
    }

    return value;
}

export function scrubSecrets(text, secrets) {
    let scrubbed = String(text || '');

    for (const secret of secrets) {
        if (!secret || secret.length < 3) {
            continue;
        }

        scrubbed = scrubbed.split(secret).join('[REDACTED]');
    }

    return scrubbed;
}

export function classifyLinkedInUrl(urlString) {
    try {
        const url = new URL(urlString);

        if (!url.hostname.includes('linkedin.com')) {
            return { loggedIn: false, checkpoint: false, login: false };
        }

        const login = url.pathname.includes('/login') || url.pathname.includes('/authwall');
        const checkpoint = url.pathname.includes('/checkpoint') || url.pathname.includes('/challenge');
        const loggedIn = !login && !checkpoint && (
            url.pathname.startsWith('/feed')
            || url.pathname.startsWith('/jobs')
            || url.pathname === '/'
            || url.pathname.startsWith('/mynetwork')
            || url.pathname.startsWith('/in/')
        );

        return { loggedIn, checkpoint, login, url: urlString };
    } catch {
        return { loggedIn: false, checkpoint: false, login: false, url: urlString };
    }
}

/**
 * @param {import('playwright').Page} page
 * @param {{ timeoutMs?: number, checkpointMessage?: string }} [options]
 */
export async function waitForLinkedInAuthenticated(page, options = {}) {
    const timeoutMs = options.timeoutMs ?? 180_000;
    const deadline = Date.now() + timeoutMs;
    let announcedCheckpoint = false;

    while (Date.now() < deadline) {
        const state = classifyLinkedInUrl(page.url());

        if (state.loggedIn) {
            return state;
        }

        if (state.checkpoint && !announcedCheckpoint) {
            announcedCheckpoint = true;
            console.log(
                options.checkpointMessage
                    || 'LinkedIn checkpoint detected - complete verification in the browser window, then wait…',
            );
        }

        await page.waitForTimeout(2000);
    }

    return classifyLinkedInUrl(page.url());
}

export function slugify(value, maxLength = 48) {
    return String(value || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, maxLength)
        || 'unknown';
}

export async function acceptLinkedInCookieConsent(page) {
    return page.evaluate(async () => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        if (!api?.acceptCookieConsent) {
            return { accepted: false };
        }

        return api.acceptCookieConsent();
    });
}

export async function dismissSaveApplicationDialog(page) {
    return page.evaluate(async () => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        if (!api?.dismissSaveApplicationDialog) {
            return { dismissed: false };
        }

        return api.dismissSaveApplicationDialog();
    });
}

export async function dismissLinkedInCookieBanner(page) {
    const extensionResult = await acceptLinkedInCookieConsent(page).catch(() => ({ accepted: false }));

    if (extensionResult?.accepted) {
        return extensionResult;
    }

    const selectors = [
        '.artdeco-global-alert--cookie_consent [data-test-global-alert-action="0"]',
        '[data-test-global-alert-action="0"]',
        'button[data-control-name="ga-cookie.consent.accept.v4"]',
        'button[action-type="ACCEPT"]',
        'button:has-text("Accept")',
        'button:has-text("Agree")',
    ];

    for (const selector of selectors) {
        const button = page.locator(selector).first();

        if (await button.isVisible({ timeout: 1500 }).catch(() => false)) {
            await button.click().catch(() => {});
            await page.waitForTimeout(500);

            return;
        }
    }
}

export async function fillLinkedInCredentials(page, email, password) {
    const visibleEmail = page.locator(
        'input[autocomplete="username webauthn"], input[autocomplete="username"], input#username, input[name="session_key"]',
    ).last();
    const visiblePassword = page.locator(
        'input[autocomplete="current-password"], input#password, input[name="session_password"]',
    ).last();

    await visibleEmail.waitFor({ state: 'visible', timeout: 60_000 });
    await visiblePassword.waitFor({ state: 'visible', timeout: 60_000 });
    await visibleEmail.click();
    await visibleEmail.fill(email);
    await visiblePassword.click();
    await visiblePassword.fill(password);
}

export async function loginToLinkedIn(page, email, password, options = {}) {
    const skipIfLoggedIn = options.skipIfLoggedIn !== false;

    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 120_000 });

    let state = await waitForLinkedInAuthenticated(page, { timeoutMs: 5000 });

    if (skipIfLoggedIn && state.loggedIn) {
        return state;
    }

    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await dismissLinkedInCookieBanner(page);
    await fillLinkedInCredentials(page, email, password);

    const signInButton = page.getByRole('button', { name: /^Sign in$/i });

    if (await signInButton.count() > 0) {
        await signInButton.first().click();
    } else {
        await page.locator('button[type="submit"]').first().click({ timeout: 10_000 }).catch(() => {});
    }

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 120_000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    const wrongCredentials = await page
        .getByText(/wrong email or password/i)
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);

    if (wrongCredentials) {
        throw new Error('LinkedIn rejected the login (wrong email or password). Update LINKEDIN_TEST_* in .env.');
    }

    state = await waitForLinkedInAuthenticated(page, {
        timeoutMs: options.checkpointTimeoutMs ?? 180_000,
    });

    if (!state.loggedIn) {
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
        state = await waitForLinkedInAuthenticated(page, { timeoutMs: 15_000 });
    }

    if (!state.loggedIn) {
        if (state.checkpoint) {
            throw new Error(
                'LinkedIn checkpoint still active. Complete verification in the headed browser, then rerun with the same --profile-dir and --keep-profile.',
            );
        }

        if (state.login) {
            throw new Error('LinkedIn login did not complete. Check LINKEDIN_TEST_EMAIL and LINKEDIN_TEST_PASSWORD in .env.');
        }

        throw new Error(`LinkedIn session is not authenticated. Last URL: ${state.url || page.url()}`);
    }

    return state;
}

export function randomDelayMs(minMs, maxMs) {
    return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

/** Contact prefill profile for capture runs (matches LINKEDIN_PREFILL_CONTACT test data). */
export const CAPTURE_CONTACT_PREFILL = {
    user: { email: 'candidate@example.com' },
    profile: {
        phone: '+44 7700 900123',
        country: 'United Kingdom',
    },
    application_settings: {
        phone_country_code: '+44',
    },
};

export async function advanceEasyApplyStep(page) {
    const before = await page.evaluate(() => {
        const api = window.AutoCVApplyLinkedInAutoApply;
        const modal = api?.readEasyApplyModal?.();

        if (!modal) {
            return { success: false, error: 'Easy Apply modal is not open.' };
        }

        const primary = api.findPrimaryActionButton(modal);
        const validationErrors = api.readEasyApplyModalErrors();

        if (!primary) {
            return {
                success: false,
                error: 'No Next/Review/Submit button found in Easy Apply modal.',
                validationErrors,
                stepFingerprint: api.readStepFingerprint(modal),
            };
        }

        if (primary.disabled) {
            return {
                success: false,
                action: 'blocked',
                error: `${primary.label} is disabled.`,
                validationErrors,
                stepFingerprint: api.readStepFingerprint(modal),
            };
        }

        return {
            success: true,
            action: primary.action,
            label: primary.label,
            stepFingerprint: api.readStepFingerprint(modal),
            validationErrors,
        };
    });

    if (!before.success) {
        return before;
    }

    const clicked = await page.evaluate(() => {
        const api = window.AutoCVApplyLinkedInAutoApply;
        const primary = api?.findPrimaryActionButton?.();

        if (!primary?.button || primary.disabled) {
            return { clicked: false };
        }

        primary.button.scrollIntoView({ block: 'center', inline: 'nearest' });
        primary.button.click();

        return { clicked: true, action: primary.action, label: primary.label };
    });

    if (!clicked.clicked) {
        return {
            success: false,
            action: 'blocked',
            error: 'Primary action button could not be clicked.',
            stepFingerprint: before.stepFingerprint,
            validationErrors: before.validationErrors,
        };
    }

    if (clicked.action === 'submit') {
        await page.waitForTimeout(2500);

        const submitted = await page.evaluate(() => {
            const api = window.AutoCVApplyLinkedInAutoApply;

            return {
                submitted: api.verifySubmitted(),
                stepFingerprint: api.readStepFingerprint(),
                validationErrors: api.readEasyApplyModalErrors(),
            };
        });

        return {
            success: true,
            action: clicked.action,
            submitted: submitted.submitted?.submitted,
            stepFingerprint: submitted.stepFingerprint,
            validationErrors: submitted.validationErrors,
        };
    }

    const transition = await waitForEasyApplyStepTransition(page, before.stepFingerprint);

    const after = await page.evaluate(() => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        return {
            stepFingerprint: api.readStepFingerprint(),
            validationErrors: api.readEasyApplyModalErrors(),
            submitted: api.verifySubmitted(),
        };
    });

    return {
        success: transition.changed || transition.submitted,
        action: clicked.action,
        submitted: Boolean(transition.submitted || after.submitted?.submitted),
        stepFingerprint: after.stepFingerprint,
        validationErrors: after.validationErrors,
        closed: transition.changed && !after.stepFingerprint,
    };
}

export async function prefillEasyApplyContact(page, profileData = CAPTURE_CONTACT_PREFILL) {
    return page.evaluate((data) => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        if (!api?.prefillContactInfo) {
            return { skipped: true, success: false, filled: 0, errors: [] };
        }

        return api.prefillContactInfo(data);
    }, profileData);
}

export async function waitForEasyApplyStepTransition(page, previousFingerprint, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const diagnostics = await page.evaluate(() => {
            const api = window.AutoCVApplyLinkedInAutoApply;

            if (!api) {
                return { ok: false };
            }

            return {
                ok: true,
                stepFingerprint: api.readStepFingerprint(),
                submitted: api.verifySubmitted(),
                saveDialogPresent: Boolean(api.findSaveApplicationDialog?.()),
            };
        });

        if (!diagnostics.ok) {
            await page.waitForTimeout(250);

            continue;
        }

        if (diagnostics.submitted?.submitted) {
            return { changed: true, submitted: true, stepFingerprint: diagnostics.stepFingerprint };
        }

        if (diagnostics.saveDialogPresent) {
            return { changed: false, saveDialogPresent: true, stepFingerprint: diagnostics.stepFingerprint };
        }

        if (previousFingerprint && diagnostics.stepFingerprint !== previousFingerprint) {
            return { changed: true, stepFingerprint: diagnostics.stepFingerprint };
        }

        await page.waitForTimeout(300);
    }

    return { changed: false };
}

export function inferCaptureReason({ suffix, hasValidationErrors, stuckReason, primaryAction, stepNumber }) {
    if (stuckReason) {
        return `stuck-${stuckReason}`;
    }

    if (suffix === 'step1-open' || suffix.endsWith('-open')) {
        return 'open';
    }

    if (suffix.includes('-filled')) {
        return 'filled';
    }

    if (hasValidationErrors || suffix.includes('validation-errors')) {
        return 'validation-errors';
    }

    if (suffix === 'submitted') {
        return 'submitted';
    }

    if (suffix === 'pre-submit-review' || primaryAction === 'review') {
        return 'review';
    }

    if (suffix.endsWith('-open') && stepNumber && stepNumber >= 2) {
        return `step${stepNumber}-open`;
    }

    if (suffix.endsWith('-filled') && stepNumber && stepNumber >= 2) {
        return `step${stepNumber}-filled`;
    }

    if (stepNumber === 2 || /-step2(?:$|-)/.test(suffix)) {
        return 'step2';
    }

    if (stepNumber === 3 || /-step3(?:$|-)/.test(suffix)) {
        return 'step3';
    }

    if (primaryAction === 'submit') {
        return 'review';
    }

    return suffix;
}

export function inferStuckReasonFromSuffix(suffix) {
    const match = suffix.match(/-stuck-([a-z0-9-]+)$/);

    if (!match) {
        return null;
    }

    return match[1];
}
