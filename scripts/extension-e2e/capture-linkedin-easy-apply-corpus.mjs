#!/usr/bin/env node
/**
 * Capture live LinkedIn Easy Apply modal HTML for offline corpus tests.
 *
 * Usage:
 *   node scripts/extension-e2e/capture-linkedin-easy-apply-corpus.mjs --target-fixtures=50 --max-jobs=20
 *
 * Requires LINKEDIN_TEST_EMAIL and LINKEDIN_TEST_PASSWORD in .env (never commit).
 * Uses a single headed Playwright session with persistent profile reuse.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
    acceptLinkedInCookieConsent,
    advanceEasyApplyStep,
    buildLinkedInJobSearchUrl,
    CAPTURE_CONTACT_PREFILL,
    dismissSaveApplicationDialog,
    inferCaptureReason,
    loadEnvFile,
    loginToLinkedIn,
    prefillEasyApplyContact,
    randomDelayMs,
    requireEnv,
    scrubSecrets,
    slugify,
    waitForEasyApplyStepTransition,
} from './lib/linkedin-e2e-shared.mjs';
import {
    appendCaptureMetaComments,
    sanitizeLinkedInCaptureHtml,
    sanitizeValidationErrors,
    wrapModalCaptureHtml,
    wrapPageCaptureHtml,
} from './lib/sanitize-linkedin-capture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_DIR = join(ROOT, 'tests/fixtures/auto-apply/linkedin/captured');
const MANIFEST_PATH = join(ROOT, 'tests/fixtures/auto-apply/linkedin/captured-manifest.json');
const PROFILE_DIR = join(ROOT, 'tests/output/linkedin-corpus-capture/profile');
const PARSER_SCRIPT = join(ROOT, 'extension/src/content/linkedin-parser.js');
const FIELDS_SCRIPT = join(ROOT, 'extension/src/content/linkedin-easy-apply-fields.js');
const AUTO_APPLY_SCRIPT = join(ROOT, 'extension/src/content/linkedin-auto-apply.js');

const TEST_FILL = {
    email: 'candidate@example.com',
    phone: '+44 7700 900123',
    text: 'Test response for corpus capture.',
    name: 'Alex Candidate',
};

const SEARCH_LIST_SELECTORS = [
    'ul.jobs-search-results__list',
    '.jobs-search-results-list',
    '.scaffold-layout__list',
];

const DETAIL_PANEL_SELECTORS = [
    '.jobs-search__job-details--container',
    '.jobs-search__job-details',
    '.jobs-details__main-content',
    '.jobs-details',
    '.scaffold-layout__detail',
];

const JOB_VIEW_SELECTORS = [
    '.job-view-layout',
    '.jobs-unified-top-card',
    '.jobs-details-top-card',
    'main.scaffold-layout__main',
    'main',
];

const DEFAULT_ROLE_SEARCHES = [
    'software engineer',
    'frontend developer',
    'backend engineer',
    'full stack developer',
    'devops engineer',
    'python developer',
    'react developer',
    'senior software engineer',
    'javascript developer',
    'platform engineer',
    'data engineer',
    'mobile developer',
];

function parseRoleList(raw) {
    return String(raw || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseArgs(argv) {
    const targetFixturesArg = argv.find((arg) => arg.startsWith('--target-fixtures='));
    const maxJobsArg = argv.find((arg) => arg.startsWith('--max-jobs='));
    const rolesArg = argv.find((arg) => arg.startsWith('--roles='));
    const roleArg = argv.find((arg) => arg.startsWith('--role='));
    const delayMinArg = argv.find((arg) => arg.startsWith('--delay-min='));
    const delayMaxArg = argv.find((arg) => arg.startsWith('--delay-max='));
    const submitLimitArg = argv.find((arg) => arg.startsWith('--submit-limit='));

    const roleSearches = rolesArg
        ? parseRoleList(rolesArg.split('=').slice(1).join('='))
        : roleArg
            ? [roleArg.split('=').slice(1).join('=').trim()].filter(Boolean)
            : [...DEFAULT_ROLE_SEARCHES];

    return {
        targetFixtures: targetFixturesArg ? Number.parseInt(targetFixturesArg.split('=')[1], 10) : 50,
        maxJobs: maxJobsArg ? Number.parseInt(maxJobsArg.split('=')[1], 10) : 20,
        roleSearches,
        headless: argv.includes('--headless'),
        clearProfile: argv.includes('--clear-profile'),
        delayMinMs: delayMinArg ? Number.parseInt(delayMinArg.split('=')[1], 10) : 4000,
        delayMaxMs: delayMaxArg ? Number.parseInt(delayMaxArg.split('=')[1], 10) : 7000,
        submitLimit: submitLimitArg ? Number.parseInt(submitLimitArg.split('=')[1], 10) : 3,
        includeStuck: argv.includes('--include-stuck') || !argv.includes('--no-stuck'),
        advanceSteps: !argv.includes('--no-advance-steps'),
    };
}

async function enableCspBypass(page) {
    const client = await page.context().newCDPSession(page);
    await client.send('Page.setBypassCSP', { enabled: true });
}

async function injectLinkedInApi(page) {
    await enableCspBypass(page);
    await page.addScriptTag({ content: readFileSync(PARSER_SCRIPT, 'utf8') });
    await page.addScriptTag({ content: readFileSync(FIELDS_SCRIPT, 'utf8') });
    await page.addScriptTag({ content: readFileSync(AUTO_APPLY_SCRIPT, 'utf8') });
}

async function readModalDiagnostics(page) {
    return page.evaluate(() => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        if (!api) {
            return { ok: false, error: 'AutoCVApplyLinkedInAutoApply not loaded.' };
        }

        const modal = api.readEasyApplyModal();
        const state = api.getEasyApplyModalState();
        const errors = api.readEasyApplyModalErrors();
        const submitted = api.verifySubmitted();

        const progressMeter = modal
            ? (modal.querySelector('.artdeco-stepper__indicator, .jpac-form-header')?.textContent || '').replace(/\s+/g, ' ').trim()
            : null;

        return {
            ok: true,
            modalPresent: Boolean(modal),
            state,
            errors,
            submitted,
            stepFingerprint: api.readStepFingerprint(),
            progressMeter,
            saveDialogPresent: Boolean(api.findSaveApplicationDialog?.()),
            applyButton: api.readApplyButtonState(api.readTopCardApplyButton()),
        };
    });
}

async function readStuckDiagnostics(page) {
    return page.evaluate(() => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        if (!api) {
            return { ok: false, error: 'AutoCVApplyLinkedInAutoApply not loaded.' };
        }

        const modal = api.readEasyApplyModal();
        const exportResult = api.exportEasyApplyModalDebug?.() || {
            html: modal?.outerHTML || null,
            diagnostics: {
                state: api.getEasyApplyModalState(),
                errors: api.readEasyApplyModalErrors(),
                stepFingerprint: api.readStepFingerprint(),
                saveDialogPresent: Boolean(api.findSaveApplicationDialog?.()),
            },
        };

        return {
            ok: true,
            html: exportResult.html,
            diagnostics: exportResult.diagnostics,
        };
    });
}

async function prefillContactFields(page) {
    return prefillEasyApplyContact(page, CAPTURE_CONTACT_PREFILL);
}

async function ensureContactStepReady(page) {
    let prefillResult = await prefillContactFields(page);

    if (!prefillResult.success && !prefillResult.skipped) {
        await page.waitForTimeout(400);
        prefillResult = await prefillContactFields(page);
    }

    return prefillResult;
}

async function captureModalOuterHtml(page, { emphasizeErrors = false } = {}) {
    return page.evaluate(({ emphasizeErrors: showErrors }) => {
        const api = window.AutoCVApplyLinkedInAutoApply;
        const modal = api?.readEasyApplyModal?.()
            || document.querySelector('[data-test-modal], .jobs-easy-apply-modal, div[role="dialog"]');

        if (!modal) {
            return null;
        }

        const clone = modal.cloneNode(true);

        if (clone instanceof HTMLElement) {
            clone.style.position = 'fixed';
            clone.style.inset = '40px';
            clone.style.zIndex = '9999';
            clone.style.display = 'block';
            clone.style.visibility = 'visible';
            clone.style.opacity = '1';

            if (showErrors) {
                for (const node of clone.querySelectorAll(
                    '.artdeco-inline-feedback--error, .artdeco-form-element__error-text, [data-test-form-element-error-messages], .fb-dash-form-element__error-field',
                )) {
                    if (node instanceof HTMLElement) {
                        node.style.display = 'block';
                        node.style.visibility = 'visible';
                        node.style.opacity = '1';
                    }
                }
            }
        }

        return clone.outerHTML;
    }, { emphasizeErrors });
}

async function waitForModal(page, timeoutMs = 12_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const diagnostics = await readModalDiagnostics(page);

        if (diagnostics.modalPresent) {
            return diagnostics;
        }

        await page.waitForTimeout(400);
    }

    return readModalDiagnostics(page);
}

async function clickPrimaryAction(page) {
    return page.evaluate(() => {
        const api = window.AutoCVApplyLinkedInAutoApply;
        const primary = api?.findPrimaryActionButton?.();

        if (!primary?.button || primary.disabled) {
            return { clicked: false, action: primary?.action || null, disabled: primary?.disabled ?? true };
        }

        primary.button.scrollIntoView({ block: 'center', inline: 'nearest' });
        primary.button.click();

        return { clicked: true, action: primary.action, label: primary.label };
    });
}

async function closeModal(page) {
    return page.evaluate(async () => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        if (!api) {
            return { success: false };
        }

        return api.closeEasyApplyModal();
    });
}

async function clearVisibleInputs(page) {
    await page.evaluate(() => {
        const api = window.AutoCVApplyLinkedInAutoApply;
        const modal = api?.readEasyApplyModal?.();

        if (!modal) {
            return;
        }

        for (const input of modal.querySelectorAll('input, textarea')) {
            if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
                continue;
            }

            if (input.type === 'radio' || input.type === 'checkbox' || input.type === 'file' || input.type === 'hidden') {
                continue;
            }

            const setter = Object.getOwnPropertyDescriptor(
                input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
                'value',
            )?.set;

            if (setter) {
                setter.call(input, '');
            } else {
                input.value = '';
            }

            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        for (const select of modal.querySelectorAll('select')) {
            select.selectedIndex = 0;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}

async function fillVisibleFields(page) {
    await page.evaluate((fill) => {
        const api = window.AutoCVApplyLinkedInAutoApply;
        const modal = api?.readEasyApplyModal?.();

        if (!modal) {
            return;
        }

        const setValue = (element, value) => {
            const setter = Object.getOwnPropertyDescriptor(
                element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
                'value',
            )?.set;

            if (setter) {
                setter.call(element, value);
            } else {
                element.value = value;
            }

            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        };

        for (const input of modal.querySelectorAll('input')) {
            if (!(input instanceof HTMLInputElement)) {
                continue;
            }

            const name = `${input.name || ''} ${input.id || ''} ${input.getAttribute('aria-label') || ''}`.toLowerCase();

            if (input.type === 'hidden' || input.type === 'file') {
                continue;
            }

            if (input.type === 'radio') {
                continue;
            }

            if (input.type === 'checkbox') {
                if (!input.checked) {
                    input.click();
                }

                continue;
            }

            if (input.type === 'email' || name.includes('email')) {
                setValue(input, fill.email);
                continue;
            }

            if (input.type === 'tel' || name.includes('phone') || name.includes('mobile')) {
                setValue(input, fill.phone);
                continue;
            }

            if (name.includes('name') || name.includes('first') || name.includes('last')) {
                setValue(input, fill.name);
                continue;
            }

            if (input.type === 'number' || name.includes('salary') || name.includes('year')) {
                setValue(input, '65000');
                continue;
            }

            if (!input.value || input.value.trim() === '') {
                setValue(input, fill.text.slice(0, 80));
            }
        }

        const radioGroups = new Map();

        for (const radio of modal.querySelectorAll('input[type="radio"]')) {
            if (!(radio instanceof HTMLInputElement) || !radio.name) {
                continue;
            }

            if (!radioGroups.has(radio.name)) {
                radioGroups.set(radio.name, radio);
            }
        }

        for (const radio of radioGroups.values()) {
            if (!radio.checked) {
                radio.click();
            }
        }

        for (const select of modal.querySelectorAll('select')) {
            const option = [...select.options].find((entry) => entry.value && entry.value.trim() !== '');

            if (option) {
                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        for (const textarea of modal.querySelectorAll('textarea')) {
            if (!(textarea instanceof HTMLTextAreaElement)) {
                continue;
            }

            if (!textarea.value || textarea.value.trim() === '') {
                setValue(textarea, fill.text);
            }
        }
    }, TEST_FILL);
}

async function readProfileNameParts(page) {
    return page.evaluate(() => {
        const candidates = [
            document.querySelector('.global-nav__me-photo')?.getAttribute('alt'),
            document.querySelector('img.global-nav__me-photo')?.getAttribute('alt'),
            document.querySelector('.profile-card-member-details h3')?.textContent,
        ].filter(Boolean);

        const raw = candidates[0]?.replace(/\s+/g, ' ').trim() || '';
        const parts = raw.split(/\s+/).filter((part) => part.length >= 2);

        return {
            fullName: raw,
            parts: [...new Set([raw, ...parts])].filter(Boolean),
        };
    }).catch(() => ({ fullName: '', parts: [] }));
}

async function collectJobCards(page) {
    return page.evaluate(() => {
        const parser = window.AutoCVApplyLinkedInParser;

        if (!parser) {
            return [];
        }

        return parser.parseLinkedInJobCards(document);
    });
}

async function openJobById(page, jobId) {
    const clicked = await page.evaluate((id) => {
        const selectors = [
            `[data-occludable-job-id="${CSS.escape(id)}"]`,
            `[data-job-id="${CSS.escape(id)}"]`,
            `a[href*="/jobs/view/${CSS.escape(id)}"]`,
        ];

        for (const selector of selectors) {
            const match = document.querySelector(selector);

            if (match) {
                const card = match.closest('li, div.job-card-container, div.job-card-list__entity-lockup') || match;
                const link = card.querySelector('a[href*="/jobs/view/"]') || card;
                link.scrollIntoView({ block: 'center' });
                link.click();

                return true;
            }
        }

        return false;
    }, jobId);

    if (!clicked) {
        await page.goto(`https://www.linkedin.com/jobs/view/${jobId}/`, {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
        });
    }

    await page.waitForTimeout(1500);
}

async function clickEasyApplyButton(page) {
    return page.evaluate(async () => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        if (!api) {
            return { success: false, error: 'API not loaded.' };
        }

        return api.clickEasyApply();
    });
}

async function rateLimit(page, minMs, maxMs) {
    const delay = randomDelayMs(minMs, maxMs);
    await page.waitForTimeout(delay);
}

function buildScenarioEntry({
    slug,
    filename,
    suffix,
    job,
    diagnostics,
    stepNumber,
    hasValidationErrors,
    capturedAt,
    sanitizeOptions,
    stuckReason = null,
    stuckDiagnostics = null,
    roleSearch = null,
    diagnoseFile = null,
    pageType = null,
    pageUrl = null,
    expectsModal = true,
}) {
    const state = diagnostics?.state || {};
    const errors = diagnostics?.errors || [];
    const captureReason = inferCaptureReason({
        suffix,
        hasValidationErrors,
        stuckReason,
        primaryAction: state.action,
        stepNumber,
    });

    return {
        id: `captured-${slug}-${suffix}`,
        file: filename,
        source: 'live-capture',
        flow_id: slug,
        job_id: job.jobId,
        job_title: job.title,
        company: job.company,
        role_search: roleSearch,
        step: stepNumber,
        step_label: state.stepLabel || null,
        step_fingerprint: diagnostics?.stepFingerprint || null,
        capture_reason: pageType || captureReason,
        page_type: pageType,
        page_url: pageUrl,
        stuck_reason: stuckReason,
        has_validation_errors: hasValidationErrors,
        expects_validation_errors: hasValidationErrors,
        expected_errors: hasValidationErrors ? sanitizeValidationErrors(errors.slice(0, 5), sanitizeOptions) : [],
        primary_action: state.action || null,
        action_disabled: state.actionDisabled || false,
        expects_submitted: Boolean(diagnostics?.submitted?.submitted),
        expects_modal: expectsModal,
        captured_at: capturedAt,
        stuck_diagnostics: stuckDiagnostics,
        diagnose_file: diagnoseFile,
        notes: pageType
            ? `Live page capture (${pageType}) for ${job.title} at ${job.company}.`
            : stuckReason
                ? `Stuck capture (${stuckReason}) on step ${stepNumber} for ${job.title} at ${job.company}.`
                : `Live capture ${suffix} for ${job.title} at ${job.company}.`,
    };
}

async function saveCapture({
    page,
    filename,
    job,
    slug,
    suffix,
    stepNumber,
    hasValidationErrors,
    scenarios,
    sanitizeOptions,
    capturedFixtures,
    stuckReason = null,
    useStuckDiagnostics = false,
    roleSearch = null,
    secrets = [],
}) {
    let diagnostics;
    let stuckDiagnostics = null;

    if (useStuckDiagnostics) {
        const stuckPayload = await readStuckDiagnostics(page);
        stuckDiagnostics = stuckPayload.ok
            ? {
                step_fingerprint: stuckPayload.diagnostics?.stepFingerprint || null,
                errors: stuckPayload.diagnostics?.errors || [],
                state: stuckPayload.diagnostics?.state || null,
                save_dialog_present: stuckPayload.diagnostics?.saveDialogPresent || false,
            }
            : { error: stuckPayload.error || 'stuck diagnostics unavailable' };
        diagnostics = await readModalDiagnostics(page);
    } else {
        diagnostics = await readModalDiagnostics(page);
    }

    let modalHtml = await captureModalOuterHtml(page, {
        emphasizeErrors: hasValidationErrors || Boolean(stuckReason),
    });

    if (!modalHtml && useStuckDiagnostics) {
        const stuckPayload = await readStuckDiagnostics(page);
        modalHtml = stuckPayload.html;
    }

    if (!modalHtml) {
        return null;
    }

    const capturedAt = new Date().toISOString();
    const wrapped = wrapModalCaptureHtml(modalHtml, {
        jobTitle: job.title,
        company: job.company,
        roleSearch,
    });
    const sanitized = appendCaptureMetaComments(
        sanitizeLinkedInCaptureHtml(wrapped, sanitizeOptions),
        { capturedAt, roleSearch },
    );
    const filePath = join(OUTPUT_DIR, filename);

    writeFileSync(filePath, sanitized);

    let diagnoseFile = null;

    if (stuckReason && stuckDiagnostics) {
        diagnoseFile = filename.replace(/\.html$/, '.diagnose.json');
        const diagnosePayload = scrubSecrets(JSON.stringify({
            captured_at: capturedAt,
            job_id: job.jobId,
            job_title: job.title,
            company: job.company,
            role_search: roleSearch,
            suffix,
            capture_reason: inferCaptureReason({
                suffix,
                hasValidationErrors,
                stuckReason,
                primaryAction: diagnostics.state?.action,
                stepNumber,
            }),
            stuck_reason: stuckReason,
            step: stepNumber,
            step_fingerprint: diagnostics.stepFingerprint || null,
            stuck_diagnostics: stuckDiagnostics,
        }, null, 2), secrets);
        writeFileSync(join(OUTPUT_DIR, diagnoseFile), `${diagnosePayload}\n`);
    }

    const scenario = buildScenarioEntry({
        slug,
        filename,
        suffix,
        job,
        diagnostics,
        stepNumber,
        hasValidationErrors,
        capturedAt,
        sanitizeOptions,
        stuckReason,
        stuckDiagnostics,
        roleSearch,
        diagnoseFile,
    });

    scenarios.push(scenario);
    capturedFixtures.push(filename);

    const reasonLabel = stuckReason ? `stuck-${stuckReason}` : suffix;
    console.log(`  saved ${filename} (${reasonLabel}, ${diagnostics.stepFingerprint || 'no fingerprint'})`);

    return scenario;
}

async function captureJobViewFragment(page) {
    return page.evaluate(() => {
        const api = window.AutoCVApplyLinkedInAutoApply;
        const button = api?.readTopCardApplyButton?.();

        if (!button) {
            return null;
        }

        const root = button.closest(
            '.job-view-layout, .jobs-unified-top-card, .jobs-details-top-card, main.scaffold-layout__main, main',
        );

        return root?.outerHTML || button.closest('section')?.outerHTML || null;
    });
}

async function capturePageFragment(page, selectors, { pageType = null } = {}) {
    let fragmentHtml = await page.evaluate((selectorList) => {
        for (const selector of selectorList) {
            const node = document.querySelector(selector);

            if (node instanceof HTMLElement) {
                return node.outerHTML;
            }
        }

        return null;
    }, selectors);

    if (!fragmentHtml && pageType === 'job-view-page') {
        fragmentHtml = await captureJobViewFragment(page);
    }

    return fragmentHtml;
}

async function savePageCapture({
    page,
    filename,
    job,
    slug,
    suffix,
    pageType,
    selectors,
    scenarios,
    capturedFixtures,
    sanitizeOptions,
    roleSearch = null,
    secrets = [],
    capturedFixturesSet = null,
    captureKey = null,
}) {
    const fragmentHtml = await capturePageFragment(page, selectors, { pageType });

    if (!fragmentHtml) {
        console.log(`  skip ${filename}: page fragment not found (${pageType})`);

        return null;
    }

    const capturedAt = new Date().toISOString();
    const pageUrl = page.url();
    const wrapped = wrapPageCaptureHtml(fragmentHtml, {
        jobTitle: job.title,
        company: job.company,
        roleSearch,
        pageUrl,
        pageType,
    });
    const sanitized = appendCaptureMetaComments(
        sanitizeLinkedInCaptureHtml(wrapped, sanitizeOptions),
        { capturedAt, roleSearch, pageUrl, pageType },
    );
    const filePath = join(OUTPUT_DIR, filename);

    writeFileSync(filePath, sanitized);

    let diagnostics = null;

    try {
        diagnostics = await readModalDiagnostics(page);
    } catch {
        diagnostics = { state: {}, errors: [], submitted: { submitted: false }, stepFingerprint: null };
    }

    const scenario = buildScenarioEntry({
        slug,
        filename,
        suffix,
        job,
        diagnostics,
        stepNumber: null,
        hasValidationErrors: false,
        capturedAt,
        sanitizeOptions,
        roleSearch,
        pageType,
        pageUrl,
        expectsModal: false,
    });

    scenarios.push(scenario);
    capturedFixtures.push(filename);
    capturedFixturesSet?.add(captureKey || `${pageType}:${job.jobId}`);

    console.log(`  saved ${filename} (${pageType})`);

    return scenario;
}

async function openJobInSearchPanel(page, jobId) {
    const clicked = await page.evaluate((id) => {
        const selectors = [
            `[data-occludable-job-id="${CSS.escape(id)}"]`,
            `[data-job-id="${CSS.escape(id)}"]`,
            `a[href*="/jobs/view/${CSS.escape(id)}"]`,
        ];

        for (const selector of selectors) {
            const match = document.querySelector(selector);

            if (match) {
                const card = match.closest('li, div.job-card-container, div.job-card-list__entity-lockup') || match;
                const link = card.querySelector('a[href*="/jobs/view/"]') || card;
                link.scrollIntoView({ block: 'center' });
                link.click();

                return true;
            }
        }

        return false;
    }, jobId);

    if (!clicked) {
        return false;
    }

    await page.waitForTimeout(2000);

    return true;
}

async function captureJobPageStates({
    page,
    job,
    slug,
    scenarios,
    capturedFixtures,
    sanitizeOptions,
    roleSearch,
    secrets,
    capturedPageKeys,
}) {
    let localFixtures = 0;

    if (roleSearch && !page.url().includes('/jobs/search')) {
        const searchUrl = buildLinkedInJobSearchUrl(roleSearch, { easyApplyOnly: true });
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await page.waitForTimeout(1500);
    }

    await injectLinkedInApi(page);
    await acceptLinkedInCookieConsent(page).catch(() => {});

    const capturePage = async (suffix, pageType, selectors) => {
        const key = `${pageType}:${job.jobId}`;

        if (capturedPageKeys.has(key)) {
            return false;
        }

        const filename = `${slug}-${suffix}.html`;
        const saved = await savePageCapture({
            page,
            filename,
            job,
            slug,
            suffix,
            pageType,
            selectors,
            scenarios,
            capturedFixtures,
            sanitizeOptions,
            roleSearch,
            secrets,
            capturedFixturesSet: capturedPageKeys,
        });

        if (saved) {
            localFixtures += 1;
        }

        return Boolean(saved);
    };

    const openedInSearch = await openJobInSearchPanel(page, job.jobId);

    if (openedInSearch) {
        await injectLinkedInApi(page);
        await capturePage('search-detail-panel', 'search-detail-panel', DETAIL_PANEL_SELECTORS);
        await rateLimit(page, 1500, 2500);
    }

    await page.goto(`https://www.linkedin.com/jobs/view/${job.jobId}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
    });
    await page.waitForTimeout(3000);
    await injectLinkedInApi(page);
    await acceptLinkedInCookieConsent(page).catch(() => {});

    await page.waitForFunction(() => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        if (!api) {
            return false;
        }

        const button = api.readTopCardApplyButton?.();

        return Boolean(button);
    }, { timeout: 20_000 }).catch(() => {});

    await capturePage('job-view-page', 'job-view-page', JOB_VIEW_SELECTORS);

    return { localFixtures, openedInSearch };
}

async function prepareJobDetailPanelForApply(page, job, roleSearch) {
    if (roleSearch) {
        const searchUrl = buildLinkedInJobSearchUrl(roleSearch, { easyApplyOnly: true });
        const url = new URL(searchUrl);
        url.searchParams.set('currentJobId', job.jobId);
        await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 120_000 });
    } else {
        const opened = await openJobInSearchPanel(page, job.jobId);

        if (!opened) {
            await page.goto(`https://www.linkedin.com/jobs/view/${job.jobId}/`, {
                waitUntil: 'domcontentloaded',
                timeout: 60_000,
            });
        }
    }

    await page.waitForTimeout(2500);
    await injectLinkedInApi(page);
    await acceptLinkedInCookieConsent(page).catch(() => {});

    await page.waitForFunction(() => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        return Boolean(api?.readTopCardApplyButton?.());
    }, { timeout: 20_000 }).catch(() => {});
}

async function fillCurrentStep(page, stepNumber) {
    if (stepNumber === 1) {
        await ensureContactStepReady(page);
    } else {
        await prefillContactFields(page);
    }

    await fillVisibleFields(page);
    await page.waitForTimeout(600);
}

async function captureJobFlow({
    page,
    job,
    args,
    scenarios,
    capturedFixtures,
    sanitizeOptions,
    submitCount,
    roleSearch,
    secrets,
    capturedPageKeys,
}) {
    const slug = slugify(`${job.title}-${job.company}-${job.jobId}`, 56);
    let modalStep = 1;
    let localFixtures = 0;
    let submittedThisJob = false;
    const maxModalSteps = args.advanceSteps ? 10 : 1;

    const captureState = async (suffix, options = {}) => {
        const filename = `${slug}-${suffix}.html`;
        const saved = await saveCapture({
            page,
            filename,
            job,
            slug,
            suffix,
            stepNumber: options.stepNumber ?? modalStep,
            hasValidationErrors: options.hasValidationErrors || false,
            scenarios,
            sanitizeOptions,
            capturedFixtures,
            stuckReason: options.stuckReason || null,
            useStuckDiagnostics: Boolean(options.stuckReason),
            roleSearch,
            secrets,
        });

        if (saved) {
            localFixtures += 1;
        }

        await rateLimit(page, args.delayMinMs, args.delayMaxMs);

        return Boolean(saved);
    };

    const captureStuck = async (reason, options = {}) => {
        if (!args.includeStuck) {
            console.log(`  stuck (${reason}) on step ${options.stepNumber ?? modalStep} - capture skipped (--no-stuck)`);

            return false;
        }

        const stepNumber = options.stepNumber ?? modalStep;
        const suffix = `step${stepNumber}-stuck-${reason}`;
        console.log(`  stuck detected: ${reason} on step ${stepNumber}`);

        return captureState(suffix, {
            stuckReason: reason,
            hasValidationErrors: reason === 'validation',
            stepNumber,
        });
    };

    const tryAdvanceStep = async (stepNumber) => {
        let diagnostics = await readModalDiagnostics(page);

        if (diagnostics.saveDialogPresent) {
            await captureStuck('save-dialog', { stepNumber });
            await dismissSaveApplicationDialog(page).catch(() => {});

            return { advanced: false, reason: 'save-dialog' };
        }

        if (diagnostics.submitted?.submitted) {
            await captureState('submitted', { stepNumber });

            return { advanced: false, submitted: true, reason: 'submitted' };
        }

        const primary = diagnostics.state?.action;

        if (primary === 'submit') {
            if (submitCount.value >= args.submitLimit) {
                await captureState(`step${stepNumber}-review`, { stepNumber });
                await captureState('pre-submit-review', { stepNumber });

                return { advanced: false, reason: 'submit-limit' };
            }

            await fillCurrentStep(page, stepNumber);
            const submitResult = await advanceEasyApplyStep(page);
            await page.waitForTimeout(2500);
            diagnostics = await readModalDiagnostics(page);

            if (diagnostics.submitted?.submitted || submitResult.submitted) {
                await captureState('submitted', { stepNumber });
                submitCount.value += 1;

                return { advanced: false, submitted: true, reason: 'submitted' };
            }

            return { advanced: false, reason: 'submit-failed' };
        }

        if (stepNumber === 1) {
            await ensureContactStepReady(page);
        } else {
            await fillCurrentStep(page, stepNumber);
        }

        diagnostics = await readModalDiagnostics(page);

        if ((diagnostics.errors || []).length > 0) {
            await captureStuck('validation', { stepNumber });

            return { advanced: false, reason: 'validation' };
        }

        if (diagnostics.state?.actionDisabled) {
            await captureStuck('next-blocked', { stepNumber });

            return { advanced: false, reason: 'next-blocked' };
        }

        const previousFingerprint = diagnostics.stepFingerprint;
        const advanceResult = await advanceEasyApplyStep(page);

        if (!advanceResult.success) {
            const stuckReason = advanceResult.action === 'blocked' ? 'next-blocked' : 'no-progress';
            await captureStuck(stuckReason, { stepNumber });

            return { advanced: false, reason: stuckReason };
        }

        const transition = await waitForEasyApplyStepTransition(page, previousFingerprint);

        if (transition.saveDialogPresent) {
            await captureStuck('save-dialog', { stepNumber });
            await dismissSaveApplicationDialog(page).catch(() => {});

            return { advanced: false, reason: 'save-dialog' };
        }

        if (transition.submitted) {
            await captureState('submitted', { stepNumber });

            return { advanced: false, submitted: true, reason: 'submitted' };
        }

        if (!transition.changed) {
            await captureStuck('no-progress', { stepNumber });

            return { advanced: false, reason: 'no-progress' };
        }

        diagnostics = await readModalDiagnostics(page);

        if ((diagnostics.errors || []).length > 0) {
            await captureStuck('validation', { stepNumber });

            return { advanced: false, reason: 'validation' };
        }

        return { advanced: true, diagnostics };
    };

    const pageCaptureResult = await captureJobPageStates({
        page,
        job,
        slug,
        scenarios,
        capturedFixtures,
        sanitizeOptions,
        roleSearch,
        secrets,
        capturedPageKeys,
    });
    localFixtures += pageCaptureResult.localFixtures;
    await prepareJobDetailPanelForApply(page, job, roleSearch);
    await dismissSaveApplicationDialog(page).catch(() => {});
    await rateLimit(page, args.delayMinMs, args.delayMaxMs);

    const applyResult = await clickEasyApplyButton(page);

    if (!applyResult.success) {
        if (applyResult.alreadyApplied) {
            console.log(`  skip ${slug}: already applied`);
        } else if (applyResult.easyApply === false) {
            console.log(`  skip ${slug}: not Easy Apply`);
        } else {
            console.log(`  skip ${slug}: ${applyResult.error || 'could not open modal'}`);
        }

        return { localFixtures, submittedThisJob };
    }

    let diagnostics = await waitForModal(page);

    if (!diagnostics.modalPresent) {
        console.log(`  skip ${slug}: modal did not open`);

        return { localFixtures, submittedThisJob };
    }

    await captureState('step1-open', { stepNumber: 1 });

    await clearVisibleInputs(page);
    await page.waitForTimeout(600);
    await clickPrimaryAction(page);
    await page.waitForTimeout(1200);
    diagnostics = await readModalDiagnostics(page);

    if ((diagnostics.errors || []).length > 0) {
        await captureState('step1-validation-errors', { hasValidationErrors: true, stepNumber: 1 });
    }

    await fillCurrentStep(page, 1);
    diagnostics = await readModalDiagnostics(page);
    await captureState('step1-filled', { stepNumber: 1 });

    if (!args.advanceSteps) {
        await closeModal(page);
        await page.waitForTimeout(800);

        return { localFixtures, submittedThisJob };
    }

    let guard = 0;

    while (guard < maxModalSteps && capturedFixtures.length < args.targetFixtures) {
        guard += 1;
        await acceptLinkedInCookieConsent(page).catch(() => {});
        await dismissSaveApplicationDialog(page).catch(() => {});

        const advance = await tryAdvanceStep(modalStep);

        if (advance.submitted) {
            submittedThisJob = true;
            break;
        }

        if (!advance.advanced) {
            break;
        }

        modalStep += 1;
        diagnostics = advance.diagnostics || await readModalDiagnostics(page);

        const action = diagnostics.state?.action;

        if (action === 'review') {
            await captureState(`step${modalStep}-review`, { stepNumber: modalStep });
            break;
        }

        await captureState(`step${modalStep}-open`, { stepNumber: modalStep });
        await fillCurrentStep(page, modalStep);
        await captureState(`step${modalStep}-filled`, { stepNumber: modalStep });

        if (action === 'submit') {
            break;
        }
    }

    await closeModal(page);
    await page.waitForTimeout(800);

    return { localFixtures, submittedThisJob };
}

async function scrollSearchResults(page) {
    await page.evaluate(async () => {
        const listRoot = document.querySelector(
            '.jobs-search-results-list, .scaffold-layout__list, ul.jobs-search-results__list',
        );

        if (listRoot instanceof HTMLElement) {
            listRoot.scrollTop = listRoot.scrollHeight;
        }

        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        window.scrollTo(0, 0);
    });

    await page.waitForTimeout(600);
}

async function goToNextSearchPage(page) {
    const clicked = await page.evaluate(() => {
        const button = document.querySelector('button[aria-label="View next page"], button.artdeco-pagination__button--next');

        if (!button || button.disabled) {
            return false;
        }

        button.click();

        return true;
    });

    if (clicked) {
        await page.waitForTimeout(2000);
    }

    return clicked;
}

async function captureSearchResultsList({
    page,
    roleSearch,
    scenarios,
    capturedFixtures,
    sanitizeOptions,
    capturedPageKeys,
    secrets,
}) {
    const key = `search-results-list:${roleSearch}`;

    if (capturedPageKeys.has(key)) {
        return null;
    }

    const cards = await collectJobCards(page);
    const referenceJob = cards.find((card) => card.easyApply && !card.alreadyApplied) || {
        jobId: 'search',
        title: roleSearch,
        company: 'LinkedIn Search',
    };
    const slug = slugify(`${roleSearch}-search-results`, 48);

    return savePageCapture({
        page,
        filename: `${slug}-search-results-list.html`,
        job: referenceJob,
        slug,
        suffix: 'search-results-list',
        pageType: 'search-results-list',
        selectors: SEARCH_LIST_SELECTORS,
        scenarios,
        capturedFixtures,
        sanitizeOptions,
        roleSearch,
        secrets,
        capturedFixturesSet: capturedPageKeys,
        captureKey: key,
    });
}

async function navigateToRoleSearch(page, roleSearch, delayMinMs, delayMaxMs) {
    const searchUrl = buildLinkedInJobSearchUrl(roleSearch, { easyApplyOnly: true });
    console.log(`\nSearching LinkedIn jobs: "${roleSearch}"`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await injectLinkedInApi(page);
    await scrollSearchResults(page);
    await rateLimit(page, delayMinMs, delayMaxMs);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const envPath = join(ROOT, '.env');
    const env = { ...loadEnvFile(envPath), ...process.env };
    const email = requireEnv(env, 'LINKEDIN_TEST_EMAIL');
    const password = requireEnv(env, 'LINKEDIN_TEST_PASSWORD');
    const secrets = [email, password].filter(Boolean);

    if (args.clearProfile && existsSync(PROFILE_DIR)) {
        const { rmSync } = await import('node:fs');
        rmSync(PROFILE_DIR, { recursive: true, force: true });
    }

    mkdirSync(OUTPUT_DIR, { recursive: true });
    mkdirSync(PROFILE_DIR, { recursive: true });

    const scenarios = [];
    const capturedFixtures = [];
    const jobsCaptured = [];
    const submitCount = { value: 0 };
    const capturedPageKeys = new Set();

    const sanitizeOptions = {
        secrets,
        redactEmail: email,
        nameParts: [],
    };

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        channel: 'chromium',
        headless: args.headless,
        timeout: 300_000,
        viewport: { width: 1400, height: 900 },
    });

    const report = {
        started_at: new Date().toISOString(),
        target_fixtures: args.targetFixtures,
        max_jobs: args.maxJobs,
        role_searches: args.roleSearches,
        advance_steps: args.advanceSteps,
        fixtures_captured: 0,
        jobs_attempted: 0,
        jobs_captured: [],
        role_breakdown: {},
        capture_reason_breakdown: {},
        blockers: [],
        success: false,
    };

    try {
        let page = await context.newPage();
        await enableCspBypass(page);
        await loginToLinkedIn(page, email, password);

        const profile = await readProfileNameParts(page);
        sanitizeOptions.nameParts = profile.parts;
        sanitizeOptions.extraEmails = [];

        const visitedJobIds = new Set();
        let roleIndex = 0;
        let searchPage = 0;
        let currentRole = args.roleSearches[roleIndex];

        await navigateToRoleSearch(page, currentRole, args.delayMinMs, args.delayMaxMs);
        await captureSearchResultsList({
            page,
            roleSearch: currentRole,
            scenarios,
            capturedFixtures,
            sanitizeOptions,
            capturedPageKeys,
            secrets,
        });

        while (
            capturedFixtures.length < args.targetFixtures
            && jobsCaptured.length < args.maxJobs
        ) {
            let cards = await collectJobCards(page);
            cards = cards.filter((card) => card.easyApply && !card.alreadyApplied && !visitedJobIds.has(card.jobId));

            if (cards.length === 0) {
                const advanced = searchPage < 4 ? await goToNextSearchPage(page) : false;

                if (advanced) {
                    searchPage += 1;
                    await scrollSearchResults(page);
                    continue;
                }

                roleIndex += 1;

                if (roleIndex >= args.roleSearches.length) {
                    report.blockers.push('Exhausted all role searches without meeting target.');
                    break;
                }

                currentRole = args.roleSearches[roleIndex];
                searchPage = 0;
                await navigateToRoleSearch(page, currentRole, args.delayMinMs, args.delayMaxMs);
                await captureSearchResultsList({
                    page,
                    roleSearch: currentRole,
                    scenarios,
                    capturedFixtures,
                    sanitizeOptions,
                    capturedPageKeys,
                    secrets,
                });
                continue;
            }

            for (const job of cards) {
                if (capturedFixtures.length >= args.targetFixtures || jobsCaptured.length >= args.maxJobs) {
                    break;
                }

                visitedJobIds.add(job.jobId);
                report.jobs_attempted += 1;

                console.log(`\nJob ${jobsCaptured.length + 1}/${args.maxJobs} [${currentRole}]: ${job.title} @ ${job.company} (${job.jobId})`);

                try {
                    const result = await captureJobFlow({
                        page,
                        job,
                        args,
                        scenarios,
                        capturedFixtures,
                        sanitizeOptions,
                        submitCount,
                        roleSearch: currentRole,
                        secrets,
                        capturedPageKeys,
                    });

                    if (result.localFixtures > 0) {
                        jobsCaptured.push({
                            job_id: job.jobId,
                            title: job.title,
                            company: job.company,
                            role_search: currentRole,
                            fixtures: result.localFixtures,
                            submitted: result.submittedThisJob,
                        });
                    }
                } catch (error) {
                    const message = scrubSecrets(error.message || String(error), secrets);
                    console.error(`  error on ${job.jobId}: ${message}`);
                    report.blockers.push(`${job.jobId}: ${message}`);

                    if (/crashed|closed/i.test(message)) {
                        console.log('  recovering browser page after crash...');
                        page = await context.newPage();
                        await enableCspBypass(page);
                        await page.goto('https://www.linkedin.com/jobs/', {
                            waitUntil: 'domcontentloaded',
                            timeout: 120_000,
                        }).catch(() => {});
                        await injectLinkedInApi(page);
                    }

                    await closeModal(page).catch(() => {});
                }

                if (capturedFixtures.length >= args.targetFixtures) {
                    break;
                }
            }

            if (capturedFixtures.length >= args.targetFixtures || jobsCaptured.length >= args.maxJobs) {
                break;
            }

            const advanced = searchPage < 4 ? await goToNextSearchPage(page) : false;

            if (!advanced) {
                roleIndex += 1;

                if (roleIndex >= args.roleSearches.length) {
                    report.blockers.push('No more Easy Apply job cards found across role searches.');
                    break;
                }

                currentRole = args.roleSearches[roleIndex];
                searchPage = 0;
                await navigateToRoleSearch(page, currentRole, args.delayMinMs, args.delayMaxMs);
                await captureSearchResultsList({
                    page,
                    roleSearch: currentRole,
                    scenarios,
                    capturedFixtures,
                    sanitizeOptions,
                    capturedPageKeys,
                    secrets,
                });
                continue;
            }

            searchPage += 1;
            await scrollSearchResults(page);
        }

    } catch (error) {
        report.blockers.push(scrubSecrets(error.message || String(error), secrets));
        report.finished_at = new Date().toISOString();
        console.error(scrubSecrets(error.message || String(error), secrets));
    } finally {
        if (scenarios.length > 0) {
            writeFileSync(MANIFEST_PATH, `${JSON.stringify({ scenarios, captured_at: new Date().toISOString() }, null, 2)}\n`);
        }

        report.fixtures_captured = capturedFixtures.length;
        report.jobs_captured = jobsCaptured;

        for (const scenario of scenarios) {
            const role = scenario.role_search || 'unknown';
            report.role_breakdown[role] = (report.role_breakdown[role] || 0) + 1;
            const reason = scenario.capture_reason || 'unknown';
            report.capture_reason_breakdown[reason] = (report.capture_reason_breakdown[reason] || 0) + 1;
        }

        report.success = capturedFixtures.length >= args.targetFixtures;
        report.finished_at = report.finished_at || new Date().toISOString();

        console.log(`\nCaptured ${capturedFixtures.length} fixture(s) from ${jobsCaptured.length} job(s).`);

        if (scenarios.length > 0) {
            console.log(`Manifest: ${MANIFEST_PATH}`);
        }

        if (!report.success) {
            console.warn(`Target not met: ${capturedFixtures.length}/${args.targetFixtures} fixtures.`);
        }

        const reportPath = join(ROOT, 'tests/output/linkedin-corpus-capture/report.json');
        mkdirSync(dirname(reportPath), { recursive: true });
        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
        await context.close().catch(() => {});
    }

    if (capturedFixtures.length === 0) {
        process.exit(1);
    }

    process.exit(report.success ? 0 : 2);
}

await main();
