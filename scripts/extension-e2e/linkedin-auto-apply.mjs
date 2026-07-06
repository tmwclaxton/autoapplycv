#!/usr/bin/env node
/**
 * LinkedIn Auto Apply live E2E harness.
 *
 * Manual run:
 *   1. Add to .env (gitignored):
 *        LINKEDIN_TEST_EMAIL=you@example.com
 *        LINKEDIN_TEST_PASSWORD=your-password
 *      Optional for Draft All during applications:
 *        EXTENSION_E2E_API_BASE=https://autocvapply.com
 *        EXTENSION_E2E_TOKEN=your-autocvapply-token
 *   2. npm run build:extension
 *   3. npm run extension-e2e:linkedin-auto-apply -- --max-applications=3
 *
 * Flags:
 *   --max-applications=N   Cap applications for this run (default 3)
 *   --role="software engineer remote UK"
 *   --headless             Run headless (default headed for debugging)
 *   --screenshot-dir=path  Defaults to tests/output/linkedin-auto-apply
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { EXTENSION_DIR } from '../form-corpus/lib/extension-fill-e2e.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = join(ROOT, 'tests/output/linkedin-auto-apply/report.json');

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

function parseArgs(argv) {
    const maxApplicationsArg = argv.find((arg) => arg.startsWith('--max-applications='));
    const roleArg = argv.find((arg) => arg.startsWith('--role='));
    const screenshotDirArg = argv.find((arg) => arg.startsWith('--screenshot-dir='));

    return {
        maxApplications: maxApplicationsArg ? Number.parseInt(maxApplicationsArg.split('=')[1], 10) : 3,
        roleDescription: roleArg ? roleArg.split('=').slice(1).join('=') : 'software engineer remote UK',
        headless: argv.includes('--headless'),
        screenshotDir: screenshotDirArg
            ? screenshotDirArg.split('=').slice(1).join('=')
            : join(ROOT, 'tests/output/linkedin-auto-apply'),
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

async function dismissLinkedInCookieBanner(page) {
    const selectors = [
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

async function loginToLinkedIn(page, email, password, secrets, screenshotDir) {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 120_000 });

    const loggedInUrl = (urlString) => {
        try {
            const url = new URL(urlString);

            if (!url.hostname.includes('linkedin.com')) {
                return false;
            }

            if (['/login', '/checkpoint', '/challenge', '/authwall'].some((part) => url.pathname.includes(part))) {
                return false;
            }

            return url.pathname.startsWith('/feed')
                || url.pathname.startsWith('/jobs')
                || url.pathname === '/'
                || url.pathname.startsWith('/mynetwork');
        } catch {
            return false;
        }
    };

    if (loggedInUrl(page.url())) {
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

    if (page.url().includes('/checkpoint') || page.url().includes('/challenge')) {
        console.log('LinkedIn checkpoint detected - complete verification in the browser (180s wait)...');
        await page.waitForURL(
            (url) => !url.pathname.includes('/checkpoint')
                && !url.pathname.includes('/challenge')
                && !url.pathname.includes('/login'),
            { timeout: 180_000 },
        ).catch(() => {});
    }

    await screenshot(page, screenshotDir, '01-after-login', secrets);

    if (page.url().includes('/login')) {
        throw new Error('LinkedIn login did not complete. Check credentials or complete any verification challenge.');
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const env = { ...loadEnvFile(join(ROOT, '.env')), ...process.env };
    const email = requireEnv(env, 'LINKEDIN_TEST_EMAIL');
    const password = requireEnv(env, 'LINKEDIN_TEST_PASSWORD');
    const secrets = [email, password, env.EXTENSION_E2E_TOKEN, env.EXTENSION_E2E_API_BASE].filter(Boolean);

    if (!existsSync(join(EXTENSION_DIR, 'manifest.json'))) {
        throw new Error('Extension dist missing. Run: npm run build:extension');
    }

    mkdirSync(args.screenshotDir, { recursive: true });

    const context = await chromium.launchPersistentContext(join(ROOT, 'tests/output/linkedin-auto-apply/profile'), {
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
        success: false,
        applied: 0,
        skipped: 0,
        errors: 0,
        found: 0,
        status: null,
        screenshots: [],
        error: null,
        last_error: null,
        log: [],
        login_succeeded: null,
    };

    try {
        const serviceWorker = await getServiceWorker(context);

        if (env.EXTENSION_E2E_TOKEN && env.EXTENSION_E2E_API_BASE) {
            await serviceWorker.evaluate(({ base, token }) => {
                return self.__autocvapplyE2e.setConnection({ apiBase: base, apiToken: token });
            }, {
                base: env.EXTENSION_E2E_API_BASE.replace(/\/+$/, ''),
                token: env.EXTENSION_E2E_TOKEN,
            });
        }

        await serviceWorker.evaluate(async () => {
            await self.__autocvapplyE2e.resetAutoApplySession();
        });

        const page = await context.newPage();
        await loginToLinkedIn(page, email, password, secrets, args.screenshotDir);
        report.login_succeeded = !page.url().includes('/login')
            && !page.url().includes('/checkpoint')
            && !page.url().includes('/challenge');

        await serviceWorker.evaluate(({ roleDescription, maxApplications }) => {
            void self.__autocvapplyE2e.startAutoApply({
                platform: 'linkedin',
                roleDescription,
                maxApplications,
            });
        }, {
            roleDescription: args.roleDescription,
            maxApplications: args.maxApplications,
        });

        const deadline = Date.now() + 20 * 60_000;
        let session = null;

        while (Date.now() < deadline) {
            session = await serviceWorker.evaluate(() => self.__autocvapplyE2e.getAutoApplyStatus());

            if (session && session.status !== 'running') {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        report.status = session?.status || null;
        report.found = session?.stats?.found || 0;
        report.applied = session?.stats?.applied || 0;
        report.skipped = session?.stats?.skipped || 0;
        report.errors = session?.stats?.errors || 0;
        report.last_error = session?.lastError || null;
        report.log = session?.log || [];
        report.success = (session?.stats?.applied || 0) > 0 && session?.status !== 'error';

        const activePage = context.pages().find((entry) => entry.url().includes('linkedin.com/jobs')) || page;
        report.screenshots.push(await screenshot(activePage, args.screenshotDir, '02-after-auto-apply', secrets));
    } catch (error) {
        report.error = scrubSecrets(error.message || String(error), secrets);
        report.success = false;
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
