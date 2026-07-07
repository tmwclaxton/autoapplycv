#!/usr/bin/env node
/**
 * LinkedIn Auto Apply live E2E harness.
 *
 * Local setup (.env, gitignored):
 *   LINKEDIN_TEST_EMAIL=you@example.com
 *   LINKEDIN_TEST_PASSWORD=your-password
 *   EXTENSION_E2E_API_BASE=http://localhost:8000   # defaults from APP_URL
 *   EXTENSION_E2E_TOKEN=your-sanctum-token
 *
 * Generate a local token (Sail must be running):
 *   ./vendor/bin/sail up -d
 *   php artisan migrate --seed
 *   php artisan tinker --execute 'echo App\Models\User::first()->createToken("extension-e2e")->plainTextToken;'
 *
 * Manual run:
 *   npm run build:extension
 *   npm run extension-e2e:linkedin-auto-apply -- --max-applications=3 --role="software engineer"
 *
 * Flags:
 *   --max-applications=N   Cap applications for this run (default 3)
 *   --role="software engineer remote UK"
 *   --headless             Run headless (default headed for debugging)
 *   --screenshot-dir=path  Defaults to tests/output/linkedin-auto-apply
 *   --clear-profile        Delete persistent browser profile before run
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { EXTENSION_DIR } from '../form-corpus/lib/extension-fill-e2e.mjs';
import { parseAutoApplyRunOptions } from './lib/linkedin-e2e-bootstrap.mjs';
import { acceptLinkedInCookieConsent, dismissLinkedInCookieBanner, dismissSaveApplicationDialog } from './lib/linkedin-e2e-shared.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = join(ROOT, 'tests/output/linkedin-auto-apply/report.json');
const PROFILE_DIR = join(ROOT, 'tests/output/linkedin-auto-apply/profile');
const STUCK_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 3000;

const LINKEDIN_PAGE_ERROR_SELECTORS = [
    '.artdeco-toast-item--error',
    '[data-test-artdeco-toast-item-type="error"]',
    '.artdeco-inline-feedback--error',
    '.jobs-easy-apply-modal .artdeco-inline-feedback--error',
    '.jobs-easy-apply-modal [role="alert"]',
    '.feed-shared-error',
    '.jobs-search-box__error-text',
];

const LINKEDIN_ERROR_TEXT_PATTERNS = [
    /something went wrong/i,
    /rate limit|too many requests|try again later/i,
    /session expired|sign in again/i,
    /unable to load|could not load/i,
];

function loadEnvFile(filePath) {
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

function upsertEnvVar(filePath, key, value) {
    const quoted = `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const lines = existsSync(filePath) ? readFileSync(filePath, 'utf8').split('\n') : [];
    let found = false;

    const nextLines = lines.map((line) => {
        if (!line.startsWith(`${key}=`)) {
            return line;
        }

        found = true;

        return `${key}=${quoted}`;
    });

    if (!found) {
        nextLines.push(`${key}=${quoted}`);
    }

    writeFileSync(filePath, `${nextLines.join('\n').replace(/\n+$/, '')}\n`);
}

function parseArgs(argv) {
    const maxApplicationsArg = argv.find((arg) => arg.startsWith('--max-applications='));
    const roleArg = argv.find((arg) => arg.startsWith('--role='));
    const screenshotDirArg = argv.find((arg) => arg.startsWith('--screenshot-dir='));

    return {
        maxApplications: maxApplicationsArg ? Number.parseInt(maxApplicationsArg.split('=')[1], 10) : 3,
        roleDescription: roleArg ? roleArg.split('=').slice(1).join('=') : 'software engineer remote UK',
        headless: argv.includes('--headless'),
        clearProfile: argv.includes('--clear-profile'),
        screenshotDir: screenshotDirArg
            ? screenshotDirArg.split('=').slice(1).join('=')
            : join(ROOT, 'tests/output/linkedin-auto-apply'),
        ...parseAutoApplyRunOptions(argv),
    };
}

function scrubSecrets(text, secrets) {
    let scrubbed = String(text || '');

    for (const secret of secrets) {
        if (!secret) {
            continue;
        }

        scrubbed = scrubbed.split(secret).join('[REDACTED]');
    }

    return scrubbed;
}

function requireEnv(env, key) {
    const value = env[key]?.trim();

    if (!value) {
        throw new Error(`Missing ${key}. Add it to .env for local LinkedIn E2E runs.`);
    }

    return value;
}

function resolveApiBase(env) {
    const raw = env.EXTENSION_E2E_API_BASE || env.APP_URL || 'http://localhost:8000';

    return raw.replace(/\/+$/, '');
}

function tryGenerateExtensionToken() {
    const phpBin = spawnSync('which', ['php'], { encoding: 'utf8' }).stdout?.trim() || 'php';
    const sailBin = join(ROOT, 'vendor/bin/sail');
    const command = [
        'try {',
        '$user = App\\Models\\User::first();',
        'if (!$user) { $user = App\\Models\\User::factory()->create(["name" => "E2E User", "email" => "e2e@example.com"]); }',
        'echo $user->createToken("extension-e2e")->plainTextToken;',
        '} catch (Throwable $e) {',
        'fwrite(STDERR, $e->getMessage());',
        'exit(1);',
        '}',
    ].join(' ');

    const runners = [];

    if (existsSync(sailBin)) {
        runners.push({
            bin: sailBin,
            args: ['artisan', 'tinker', '--execute', command],
        });
    }

    runners.push({
        bin: phpBin,
        args: ['artisan', 'tinker', '--execute', command],
    });

    for (const runner of runners) {
        const result = spawnSync(runner.bin, runner.args, {
            cwd: ROOT,
            encoding: 'utf8',
            env: {
                ...process.env,
                PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}`,
            },
        });

        const token = result.stdout?.trim();

        if (result.status === 0 && token && !token.includes('ERR:')) {
            return token;
        }
    }

    return null;
}

function ensureExtensionConnection(env, envPath) {
    const apiBase = resolveApiBase(env);
    let token = env.EXTENSION_E2E_TOKEN?.trim() || '';
    let wroteEnv = false;

    if (!env.EXTENSION_E2E_API_BASE) {
        upsertEnvVar(envPath, 'EXTENSION_E2E_API_BASE', apiBase);
        env.EXTENSION_E2E_API_BASE = apiBase;
        wroteEnv = true;
    }

    if (!token) {
        token = tryGenerateExtensionToken();

        if (token) {
            upsertEnvVar(envPath, 'EXTENSION_E2E_TOKEN', token);
            env.EXTENSION_E2E_TOKEN = token;
            wroteEnv = true;
        }
    }

    return {
        apiBase,
        token,
        wroteEnv,
        connected: Boolean(apiBase && token),
    };
}

async function getServiceWorker(context) {
    const existing = context.serviceWorkers()[0];

    if (existing) {
        return existing;
    }

    return context.waitForEvent('serviceworker', { timeout: 60_000 });
}

async function screenshot(page, dir, name, secrets) {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${name}.png`);
    await page.screenshot({ path, fullPage: true });

    return scrubSecrets(path, secrets);
}

async function fillLinkedInCredentials(page, email, password) {
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

function classifyLinkedInUrl(urlString) {
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
        );

        return { loggedIn, checkpoint, login };
    } catch {
        return { loggedIn: false, checkpoint: false, login: false };
    }
}

async function detectLinkedInPageErrors(page) {
    const urlState = classifyLinkedInUrl(page.url());
    const issues = [];

    if (urlState.checkpoint) {
        issues.push({ code: 'checkpoint', message: 'LinkedIn security checkpoint page.', source: 'url' });
    }

    if (urlState.login) {
        issues.push({ code: 'login_loop', message: 'Redirected to LinkedIn login.', source: 'url' });
    }

    const bodyText = await page.locator('body').innerText().catch(() => '');

    for (const pattern of LINKEDIN_ERROR_TEXT_PATTERNS) {
        const match = bodyText.match(pattern);

        if (match) {
            issues.push({ code: 'page_text', message: match[0], source: 'text' });
        }
    }

    for (const selector of LINKEDIN_PAGE_ERROR_SELECTORS) {
        const nodes = page.locator(selector);
        const count = await nodes.count().catch(() => 0);

        for (let index = 0; index < Math.min(count, 3); index += 1) {
            const node = nodes.nth(index);

            if (!(await node.isVisible().catch(() => false))) {
                continue;
            }

            const message = (await node.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

            if (message.length >= 3) {
                issues.push({ code: 'dom_error', message, source: 'selector', selector });
            }
        }
    }

    const spinnerVisible = await page.locator('.artdeco-loader, .jobs-loader, [data-test-loader]').first()
        .isVisible()
        .catch(() => false);

    return {
        ok: issues.length === 0,
        issues,
        primary: issues[0] || null,
        spinnerVisible,
        url: page.url(),
    };
}

async function loginToLinkedIn(page, email, password, secrets, screenshotDir) {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 120_000 });

    const initialState = classifyLinkedInUrl(page.url());

    if (initialState.loggedIn) {
        await screenshot(page, screenshotDir, '01-after-login', secrets);

        return;
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
        await screenshot(page, screenshotDir, '01-wrong-credentials', secrets);

        throw new Error('LinkedIn rejected the login (wrong email or password). Update LINKEDIN_TEST_* in .env.');
    }

    const postLoginState = classifyLinkedInUrl(page.url());

    if (postLoginState.checkpoint) {
        console.log('LinkedIn checkpoint detected - complete verification in the browser (180s wait)...');
        await page.waitForURL(
            (url) => !url.pathname.includes('/checkpoint')
                && !url.pathname.includes('/challenge')
                && !url.pathname.includes('/login'),
            { timeout: 180_000 },
        ).catch(() => {});
    }

    await screenshot(page, screenshotDir, '01-after-login', secrets);

    const finalState = classifyLinkedInUrl(page.url());

    if (finalState.login) {
        throw new Error('LinkedIn login did not complete. Check credentials or complete any verification challenge.');
    }

    const loginErrors = await detectLinkedInPageErrors(page);

    if (!loginErrors.ok) {
        await screenshot(page, screenshotDir, '01-login-page-error', secrets);

        throw new Error(`LinkedIn login page error: [${loginErrors.primary?.code}] ${loginErrors.primary?.message}`);
    }
}

function summarizeTopErrors(log = []) {
    const counts = new Map();

    for (const entry of log) {
        if (entry.level !== 'error') {
            continue;
        }

        const key = entry.message.replace(/^[^:]+:\s*/, '').slice(0, 120);
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([message, count]) => ({ message, count }));
}

async function findLinkedInPage(context) {
    const pages = context.pages().filter((entry) => entry.url().includes('linkedin.com'));

    return pages.find((entry) => entry.url().includes('/jobs')) || pages.at(-1) || context.pages()[0];
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const envPath = join(ROOT, '.env');
    const env = { ...loadEnvFile(envPath), ...process.env };
    const email = requireEnv(env, 'LINKEDIN_TEST_EMAIL');
    const password = requireEnv(env, 'LINKEDIN_TEST_PASSWORD');
    const connection = ensureExtensionConnection(env, envPath);
    const secrets = [email, password, connection.token, connection.apiBase].filter(Boolean);

    if (args.clearProfile && existsSync(PROFILE_DIR)) {
        rmSync(PROFILE_DIR, { recursive: true, force: true });
    }

    if (!existsSync(join(EXTENSION_DIR, 'manifest.json'))) {
        throw new Error('Extension dist missing. Run: npm run build:extension');
    }

    mkdirSync(args.screenshotDir, { recursive: true });

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        channel: 'chromium',
        headless: args.headless,
        timeout: 300_000,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`,
        ],
        viewport: { width: 1400, height: 900 },
    });

    const report = {
        started_at: new Date().toISOString(),
        role_description: args.roleDescription,
        max_applications: args.maxApplications,
        filters: args.filters,
        fit_check_enabled: args.fitCheckEnabled,
        min_fit_score: args.minFitScore,
        api_base: connection.apiBase,
        api_connected: false,
        success: false,
        applied: 0,
        skipped: 0,
        errors: 0,
        found: 0,
        status: null,
        screenshots: [],
        page_errors: [],
        stuck_events: [],
        top_errors: [],
        error: null,
        last_error: null,
        log: [],
        login_succeeded: null,
        env_vars_written: connection.wroteEnv ? ['EXTENSION_E2E_API_BASE', ...(connection.token ? ['EXTENSION_E2E_TOKEN'] : [])] : [],
    };

    let lastProgressAt = Date.now();
    let lastFingerprint = '';

    try {
        const serviceWorker = await getServiceWorker(context);

        if (connection.connected) {
            await serviceWorker.evaluate(({ base, token }) => {
                return self.__autocvapplyE2e.setConnection({ apiBase: base, apiToken: token });
            }, {
                base: connection.apiBase,
                token: connection.token,
            });
            report.api_connected = true;
        } else {
            console.warn(
                'EXTENSION_E2E_TOKEN missing and could not be generated. Start Sail/Docker, migrate, then rerun.',
            );
        }

        await serviceWorker.evaluate(async () => {
            await self.__autocvapplyE2e.resetAutoApplySession();
        });

        const page = await context.newPage();
        await loginToLinkedIn(page, email, password, secrets, args.screenshotDir);
        report.login_succeeded = classifyLinkedInUrl(page.url()).loggedIn;

        await serviceWorker.evaluate(({ roleDescription, maxApplications, filters, fitCheckEnabled, minFitScore }) => {
            void self.__autocvapplyE2e.startAutoApply({
                platform: 'linkedin',
                roleDescription,
                maxApplications,
                filters,
                fitCheckEnabled,
                minFitScore,
            });
        }, {
            roleDescription: args.roleDescription,
            maxApplications: args.maxApplications,
            filters: args.filters,
            fitCheckEnabled: args.fitCheckEnabled,
            minFitScore: args.minFitScore,
        });

        const deadline = Date.now() + 20 * 60_000;
        let session = null;
        let lastScreenshotFingerprint = '';
        let easyApplyStepScreenshots = 0;

        while (Date.now() < deadline) {
            session = await serviceWorker.evaluate(() => self.__autocvapplyE2e.getAutoApplyStatus());
            const activePage = await findLinkedInPage(context);
            const pageHealth = activePage ? await detectLinkedInPageErrors(activePage) : { ok: true, issues: [] };

            if (activePage) {
                await acceptLinkedInCookieConsent(activePage).catch(() => {});
                await dismissSaveApplicationDialog(activePage).catch(() => {});

                const modalSnapshot = await activePage.evaluate(() => {
                    const modal = document.querySelector(
                        '[data-test-modal], .jobs-easy-apply-modal, div[role="dialog"] .jobs-easy-apply-content, div[role="dialog"]',
                    );

                    if (!modal) {
                        return null;
                    }

                    const style = window.getComputedStyle(modal);

                    if (style.display === 'none' || style.visibility === 'hidden') {
                        return null;
                    }

                    const heading = modal.querySelector('h2, h3, .jobs-easy-apply-form-section__title');
                    const footerButton = modal.querySelector(
                        '.jobs-easy-apply-footer .artdeco-button--primary, .artdeco-modal__actionbar .artdeco-button--primary',
                    );
                    const fieldCount = modal.querySelectorAll('input, textarea, select').length;
                    const stepLabel = heading?.textContent?.replace(/\s+/g, ' ').trim() || null;
                    const actionLabel = footerButton?.textContent?.replace(/\s+/g, ' ').trim() || null;

                    return {
                        open: true,
                        stepLabel,
                        actionLabel,
                        stepFingerprint: `${stepLabel || ''}|${fieldCount}|${actionLabel || ''}`,
                    };
                }).catch(() => null);

                if (modalSnapshot?.open) {
                    const screenshotKey = modalSnapshot.stepFingerprint || modalSnapshot.stepLabel || 'open';

                    if (screenshotKey !== lastScreenshotFingerprint) {
                        lastScreenshotFingerprint = screenshotKey;
                        easyApplyStepScreenshots += 1;
                        const stepName = `easy-apply-step-${String(easyApplyStepScreenshots).padStart(2, '0')}-${String(modalSnapshot.stepLabel || 'modal').replace(/[^\w.-]+/g, '-').slice(0, 40)}`;
                        report.screenshots.push(await screenshot(activePage, args.screenshotDir, stepName, secrets));
                    }
                }
            }

            if (pageHealth.primary) {
                report.page_errors.push({
                    at: new Date().toISOString(),
                    ...pageHealth.primary,
                    url: pageHealth.url,
                });

                const label = `error-${pageHealth.primary.code}-${Date.now()}`;
                report.screenshots.push(await screenshot(activePage, args.screenshotDir, label, secrets));

                if (['checkpoint', 'login_loop', 'page_text'].includes(pageHealth.primary.code)) {
                    report.error = `LinkedIn frontend error: [${pageHealth.primary.code}] ${pageHealth.primary.message}`;
                    break;
                }
            }

            const fingerprint = JSON.stringify({
                status: session?.status,
                applied: session?.stats?.applied,
                skipped: session?.stats?.skipped,
                errors: session?.stats?.errors,
                currentIndex: session?.currentIndex,
                logLength: session?.log?.length || 0,
            });

            if (fingerprint !== lastFingerprint) {
                lastFingerprint = fingerprint;
                lastProgressAt = Date.now();
            } else if (session?.status === 'running' && Date.now() - lastProgressAt >= STUCK_TIMEOUT_MS) {
                const stuckReason = pageHealth.spinnerVisible
                    ? 'LinkedIn loading spinner visible with no Auto Apply progress'
                    : 'No Auto Apply progress detected';

                report.stuck_events.push({
                    at: new Date().toISOString(),
                    reason: stuckReason,
                    url: activePage?.url() || null,
                });

                report.screenshots.push(await screenshot(activePage, args.screenshotDir, `stuck-${Date.now()}`, secrets));

                if (activePage) {
                    await activePage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                }

                lastProgressAt = Date.now();
            }

            if (session && session.status !== 'running') {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        report.status = session?.status || null;
        report.found = session?.stats?.found || 0;
        report.applied = session?.stats?.applied || 0;
        report.skipped = session?.stats?.skipped || 0;
        report.errors = session?.stats?.errors || 0;
        report.last_error = session?.lastError || null;
        report.log = session?.log || [];
        report.top_errors = summarizeTopErrors(report.log);
        report.easy_apply_step_screenshots = easyApplyStepScreenshots;
        report.success = (session?.stats?.applied || 0) > 0 && session?.status !== 'error';

        if (!report.success && !report.error) {
            if ((session?.stats?.applied || 0) === 0 && !report.api_connected) {
                report.error = 'No applications submitted. Draft All requires EXTENSION_E2E_API_BASE + EXTENSION_E2E_TOKEN against a running local API.';
            } else if (session?.status === 'error') {
                report.error = session?.lastError || 'Auto Apply ended in error state.';
            } else if ((session?.stats?.applied || 0) === 0) {
                report.error = `Auto Apply finished without submissions (applied=${report.applied}, skipped=${report.skipped}, errors=${report.errors}).`;
            }
        }

        const activePage = await findLinkedInPage(context);
        report.screenshots.push(await screenshot(activePage || page, args.screenshotDir, '02-after-auto-apply', secrets));
    } catch (error) {
        report.error = scrubSecrets(error.message || String(error), secrets);
        report.success = false;

        const activePage = context.pages().find((entry) => entry.url().includes('linkedin.com'));

        if (activePage) {
            report.screenshots.push(await screenshot(activePage, args.screenshotDir, '99-fatal-error', secrets));
        }
    } finally {
        report.finished_at = new Date().toISOString();
        mkdirSync(dirname(REPORT_PATH), { recursive: true });
        writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

        await context.close();
    }

    const printable = scrubSecrets(JSON.stringify(report, null, 2), secrets);
    console.log(printable);

    if (!report.success) {
        process.exit(1);
    }
}

await main();
