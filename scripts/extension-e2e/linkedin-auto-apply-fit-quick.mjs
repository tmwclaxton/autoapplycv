#!/usr/bin/env node
/**
 * Short live check (~90s): open one LinkedIn job, confirm fit gate reaches a numeric ATS score.
 *
 *   npm run build:extension
 *   node scripts/extension-e2e/linkedin-auto-apply-fit-quick.mjs --skip-login --keep-profile
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { EXTENSION_DIR } from '../form-corpus/lib/extension-fill-e2e.mjs';
import {
    ensureExtensionConnection,
    findAtsFitScoreLogEntry,
    findLinkedInSearchLogEntry,
    getServiceWorker,
    parseFullFlowArgs,
    validateLinkedInSearchUrl,
} from './lib/linkedin-e2e-bootstrap.mjs';
import {
    classifyLinkedInUrl,
    loadEnvFile,
    loginToLinkedIn,
    requireEnv,
    scrubSecrets,
} from './lib/linkedin-e2e-shared.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = join(ROOT, 'tests/output/linkedin-auto-apply-fit-quick/report.json');
const AUTH_PROFILE_DIR = join(ROOT, 'tests/output/linkedin-auto-apply/profile');
const POLL_INTERVAL_MS = 2000;
const DEADLINE_MS = 90_000;

function parseArgs(argv) {
    const base = parseFullFlowArgs(argv);

    return {
        ...base,
        maxJobs: 1,
        headless: argv.includes('--headless'),
        profileDir: AUTH_PROFILE_DIR,
        skipLogin: argv.includes('--skip-login'),
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const envPath = join(ROOT, '.env');
    const env = { ...loadEnvFile(envPath), ...process.env };
    const email = requireEnv(env, 'LINKEDIN_TEST_EMAIL');
    const password = requireEnv(env, 'LINKEDIN_TEST_PASSWORD');
    const connection = ensureExtensionConnection(env, envPath);
    const secrets = [email, password, connection.token, connection.apiBase].filter(Boolean);

    if (!existsSync(join(EXTENSION_DIR, 'manifest.json'))) {
        throw new Error('Extension dist missing. Run: npm run build:extension');
    }

    const report = {
        started_at: new Date().toISOString(),
        role_description: args.roleDescription,
        filters: args.filters,
        fit_check_enabled: args.fitCheckEnabled,
        min_fit_score: args.minFitScore,
        api_connected: connection.connected,
        search_url_validated: false,
        ats_score_observed: false,
        ats_score_log: null,
        applied: 0,
        fit_skipped: 0,
        status: null,
        success: false,
        error: null,
        log: [],
    };

    const context = await chromium.launchPersistentContext(args.profileDir, {
        channel: 'chromium',
        headless: args.headless,
        timeout: 120_000,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`,
        ],
        viewport: { width: 1400, height: 900 },
    });

    try {
        if (!connection.connected) {
            throw new Error('EXTENSION_E2E_API_BASE + EXTENSION_E2E_TOKEN required.');
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
                checkpointTimeoutMs: args.headless ? 30_000 : 180_000,
            });

            if (!loginState.loggedIn) {
                throw new Error('LinkedIn login failed.');
            }
        } else {
            await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 120_000 });

            if (!classifyLinkedInUrl(page.url()).loggedIn) {
                throw new Error('LinkedIn profile not logged in. Run without --skip-login once.');
            }
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
            const loggedSearchUrl = findLinkedInSearchLogEntry(session?.log || []);

            if (loggedSearchUrl && args.filters) {
                const validation = validateLinkedInSearchUrl(loggedSearchUrl, args.filters);
                report.search_url_validated = validation.ok;
            } else if (!args.filters) {
                report.search_url_validated = true;
            }

            const atsScoreLog = findAtsFitScoreLogEntry(session?.log || []);

            if (atsScoreLog) {
                report.ats_score_observed = true;
                report.ats_score_log = atsScoreLog.message;
            }

            report.applied = session?.stats?.applied || 0;
            report.fit_skipped = session?.stats?.fitSkipped || 0;
            report.status = session?.status || null;
            report.log = (session?.log || []).slice(-12);

            if (report.ats_score_observed || report.applied > 0) {
                break;
            }

            if (session?.status === 'error' || session?.status === 'finished') {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        await serviceWorker.evaluate(async () => {
            await self.__autocvapplyE2e.stopAutoApply();
        }).catch(() => {});

        if (!report.ats_score_observed && report.applied === 0) {
            const shortOnly = (report.log || []).some((entry) => /Fit score unavailable - continuing apply|too short to score fit/i.test(entry.message || ''));

            throw new Error(shortOnly
                ? 'Fit gate ran but job descriptions stayed too short. Reload extension/dist and retry.'
                : 'No numeric ATS fit score observed within 90s.');
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
