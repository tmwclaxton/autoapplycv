#!/usr/bin/env node
/**
 * Live smoke test for Auto Apply search filters + ATS fit gate.
 *
 * Validates:
 * - Orchestrator logs the built LinkedIn search URL with expected f_* params
 * - Fit gate runs (Scored/Skipped log line) when API is connected
 *
 * Stops as soon as both checks pass. Does not require a successful Easy Apply submission.
 *
 * Run (headed - complete any LinkedIn checkpoint in the browser if prompted):
 *   npm run build:extension
 *   node scripts/extension-e2e/linkedin-auto-apply-filters-smoke.mjs \
 *     --role="software engineer" \
 *     --location="United Kingdom" \
 *     --work-type=remote \
 *     --fit-check=on
 *
 * Reuse an authenticated browser profile from a prior LinkedIn E2E run (recommended):
 *   node scripts/extension-e2e/linkedin-auto-apply-filters-smoke.mjs --keep-profile
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildLinkedInJobSearchUrl } from '../../extension/src/shared/linkedin-platform.js';
import { EXTENSION_DIR } from '../form-corpus/lib/extension-fill-e2e.mjs';
import {
    ensureExtensionConnection,
    findAtsFitScoreLogEntry,
    findFitGateLogEntry,
    findLinkedInPage,
    findLinkedInSearchLogEntry,
    getServiceWorker,
    parseFullFlowArgs,
    validateLinkedInSearchUrl,
} from './lib/linkedin-e2e-bootstrap.mjs';
import {
    acceptLinkedInCookieConsent,
    classifyLinkedInUrl,
    dismissSaveApplicationDialog,
    loadEnvFile,
    loginToLinkedIn,
    requireEnv,
    scrubSecrets,
} from './lib/linkedin-e2e-shared.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = join(ROOT, 'tests/output/linkedin-auto-apply-filters-smoke/report.json');
const AUTH_PROFILE_DIR = join(ROOT, 'tests/output/linkedin-auto-apply/profile');
const FRESH_PROFILE_DIR = join(ROOT, 'tests/output/linkedin-auto-apply-filters-smoke/profile');
const POLL_INTERVAL_MS = 3000;
const DEADLINE_MS = 8 * 60_000;

function parseArgs(argv) {
    const base = parseFullFlowArgs(argv);
    const profileDirArg = argv.find((arg) => arg.startsWith('--profile-dir='));
    const freshProfile = argv.includes('--fresh-profile');
    const keepProfile = argv.includes('--keep-profile') || !freshProfile;

    return {
        ...base,
        maxJobs: 1,
        headless: argv.includes('--headless'),
        outputDir: join(ROOT, 'tests/output/linkedin-auto-apply-filters-smoke'),
        profileDir: profileDirArg
            ? profileDirArg.split('=').slice(1).join('=')
            : (freshProfile ? FRESH_PROFILE_DIR : AUTH_PROFILE_DIR),
        keepProfile,
        freshProfile,
        skipLogin: argv.includes('--skip-login'),
    };
}

async function screenshot(page, dir, name) {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${name}.png`);
    await page.screenshot({ path, fullPage: true });

    return path;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const envPath = join(ROOT, '.env');
    const env = { ...loadEnvFile(envPath), ...process.env };
    const email = requireEnv(env, 'LINKEDIN_TEST_EMAIL');
    const password = requireEnv(env, 'LINKEDIN_TEST_PASSWORD');
    const connection = ensureExtensionConnection(env, envPath);
    const secrets = [email, password, connection.token, connection.apiBase].filter(Boolean);
    const expectedSearchUrl = buildLinkedInJobSearchUrl(args.roleDescription, {
        easyApplyOnly: true,
        filters: args.filters,
    });

    if (!existsSync(join(EXTENSION_DIR, 'manifest.json'))) {
        throw new Error('Extension dist missing. Run: npm run build:extension');
    }

    if (args.freshProfile && existsSync(args.profileDir)) {
        rmSync(args.profileDir, { recursive: true, force: true });
    }

    mkdirSync(args.outputDir, { recursive: true });

    const report = {
        started_at: new Date().toISOString(),
        role_description: args.roleDescription,
        filters: args.filters,
        fit_check_enabled: args.fitCheckEnabled,
        min_fit_score: args.minFitScore,
        expected_search_url: expectedSearchUrl,
        profile_dir: args.profileDir,
        api_connected: connection.connected,
        login_url: null,
        login_succeeded: false,
        session_fit_check_enabled: null,
        search_url: null,
        search_url_validated: false,
        search_url_issues: [],
        fit_gate_log: null,
        fit_gate_observed: false,
        ats_score_log: null,
        ats_score_observed: false,
        fit_skipped: 0,
        status: null,
        success: false,
        error: null,
        screenshots: [],
        log: [],
    };

    if (args.headless) {
        console.warn('Running headless. LinkedIn checkpoints cannot be completed manually - use headed mode (default).');
    }

    const context = await chromium.launchPersistentContext(args.profileDir, {
        channel: 'chromium',
        headless: args.headless,
        timeout: 300_000,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`,
        ],
        viewport: { width: 1400, height: 900 },
    });

    try {
    if (!connection.connected) {
        throw new Error('EXTENSION_E2E_API_BASE + EXTENSION_E2E_TOKEN required to validate fit gate.');
    }

    const ensureUser = spawnSync('node', ['scripts/extension-e2e/ensure-extension-e2e-user.mjs'], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` },
    });

    if (ensureUser.status !== 0) {
        throw new Error(`E2E user CV check failed: ${(ensureUser.stderr || ensureUser.stdout || '').trim()}`);
    }

        const serviceWorker = await getServiceWorker(context);

        await serviceWorker.evaluate(({ base, token }) => {
            return self.__autocvapplyE2e.setConnection({ apiBase: base, apiToken: token });
        }, {
            base: connection.apiBase,
            token: connection.token,
        });

        await serviceWorker.evaluate(async () => {
            await self.__autocvapplyE2e.resetAutoApplySession();
        });

        const page = await context.newPage();

        if (!args.skipLogin) {
            const loginState = await loginToLinkedIn(page, email, password, {
                checkpointTimeoutMs: args.headless ? 30_000 : 300_000,
            });
            report.login_url = loginState.url || page.url();
            report.login_succeeded = Boolean(loginState.loggedIn);
        } else {
            await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
            report.login_url = page.url();
            report.login_succeeded = classifyLinkedInUrl(page.url()).loggedIn;
        }

        if (!report.login_succeeded) {
            report.screenshots.push(await screenshot(page, args.outputDir, 'login-failed'));

            throw new Error(
                'LinkedIn login did not reach an authenticated session. Run headed (default), complete any checkpoint in the browser, then rerun with --keep-profile.',
            );
        }

        await serviceWorker.evaluate(({ roleDescription, filters, fitCheckEnabled, minFitScore }) => {
            void self.__autocvapplyE2e.startAutoApply({
                platform: 'linkedin',
                roleDescription,
                maxApplications: 1,
                filters,
                fitCheckEnabled,
                minFitScore,
            });
        }, {
            roleDescription: args.roleDescription,
            filters: args.filters,
            fitCheckEnabled: args.fitCheckEnabled,
            minFitScore: args.minFitScore,
        });

        const deadline = Date.now() + DEADLINE_MS;

        while (Date.now() < deadline) {
            const session = await serviceWorker.evaluate(() => self.__autocvapplyE2e.getAutoApplyStatus());
            const activePage = await findLinkedInPage(context);

            if (activePage) {
                await acceptLinkedInCookieConsent(activePage).catch(() => {});
                await dismissSaveApplicationDialog(activePage).catch(() => {});
            }

            report.session_fit_check_enabled = session?.fitCheckEnabled ?? null;

            const loggedSearchUrl = findLinkedInSearchLogEntry(session?.log || []);

            if (loggedSearchUrl && !report.search_url_validated) {
                const validation = validateLinkedInSearchUrl(loggedSearchUrl, args.filters);
                report.search_url = validation.url;
                report.search_url_validated = validation.ok;
                report.search_url_issues = validation.issues;
            }

            const fitLog = findFitGateLogEntry(session?.log || []);
            const atsScoreLog = findAtsFitScoreLogEntry(session?.log || []);

            if (fitLog) {
                report.fit_gate_observed = true;
                report.fit_gate_log = fitLog.message;
            }

            if (atsScoreLog) {
                report.ats_score_observed = true;
                report.ats_score_log = atsScoreLog.message;
            }

            report.fit_skipped = session?.stats?.fitSkipped || 0;
            report.log = session?.log || [];
            report.status = session?.status || null;

            const rateLimited = (session?.log || []).some((entry) => /rate_limit|slow down/i.test(entry.message || ''));

            if (rateLimited && !report.search_url_validated) {
                report.error = 'LinkedIn rate-limited job search before filters could be validated. Retry later or use a warmed profile.';
                break;
            }

            const searchReady = !args.filters || report.search_url_validated;
            const fitReady = !args.fitCheckEnabled || report.ats_score_observed;

            if (searchReady && fitReady) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        await serviceWorker.evaluate(async () => {
            await self.__autocvapplyE2e.stopAutoApply();
        }).catch(() => {});

        if (args.filters && !report.search_url_validated) {
            throw new Error(
                `LinkedIn search URL did not match filters: ${report.search_url_issues.join('; ') || 'LinkedIn search log line not observed'}`,
            );
        }

        if (args.fitCheckEnabled && report.session_fit_check_enabled === false) {
            throw new Error('Session fit gate was disabled unexpectedly.');
        }

        if (args.fitCheckEnabled && !report.ats_score_observed) {
            const shortOnly = report.fit_gate_observed && !report.ats_score_observed
                ? ' Fit gate ran but ATS score was not reached (job description may still be loading).'
                : '';

            throw new Error(`Fit gate did not produce a scored/skipped fit log line before timeout.${shortOnly}`);
        }

        report.success = true;
    } catch (error) {
        report.error = scrubSecrets(error.message || String(error), secrets);
        report.success = false;
    } finally {
        report.finished_at = new Date().toISOString();
        mkdirSync(dirname(REPORT_PATH), { recursive: true });
        writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
        await context.close();
    }

    console.log(scrubSecrets(JSON.stringify(report, null, 2), secrets));

    if (!report.success) {
        process.exit(1);
    }
}

await main();
