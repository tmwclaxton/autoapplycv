#!/usr/bin/env node
/**
 * Live check (~4 min max): fit gate scores a job, then Easy Apply continues.
 *
 * Pass when activity log shows "Scored …/100 - applying" OR a submission/apply step.
 *
 *   npm run extension-e2e:linkedin-fit-apply-quick
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { EXTENSION_DIR } from '../form-corpus/lib/extension-fill-e2e.mjs';
import {
    ensureExtensionConnection,
    findEasyApplyProgressLogEntry,
    findFitPassedAndApplyingLogEntry,
    getServiceWorker,
    parseFullFlowArgs,
} from './lib/linkedin-e2e-bootstrap.mjs';
import {
    classifyLinkedInUrl,
    loadEnvFile,
    loginToLinkedIn,
    requireEnv,
    scrubSecrets,
} from './lib/linkedin-e2e-shared.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = join(ROOT, 'tests/output/linkedin-auto-apply-fit-apply-quick/report.json');
const AUTH_PROFILE_DIR = join(ROOT, 'tests/output/linkedin-auto-apply/profile');
const POLL_INTERVAL_MS = 2500;
const DEADLINE_MS = 4 * 60_000;

function parseArgs(argv) {
    const base = parseFullFlowArgs(argv);
    const minFitArg = argv.find((entry) => entry.startsWith('--min-fit-score='));
    const parsedMin = minFitArg ? Number.parseInt(minFitArg.split('=')[1], 10) : 1;

    return {
        ...base,
        minFitScore: Number.isNaN(parsedMin) ? 1 : parsedMin,
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
        min_fit_score: args.minFitScore,
        fit_passed_log: null,
        easy_apply_progress_log: null,
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

        spawnSync('node', ['scripts/extension-e2e/ensure-extension-e2e-user.mjs'], {
            cwd: ROOT,
            encoding: 'utf8',
            env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` },
        });

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
                throw new Error('LinkedIn profile not logged in.');
            }
        }

        await serviceWorker.evaluate(({ roleDescription, minFitScore }) => {
            void self.__autocvapplyE2e.startAutoApply({
                platform: 'linkedin',
                roleDescription,
                maxApplications: 1,
                fitCheckEnabled: true,
                minFitScore,
            });
        }, {
            roleDescription: args.roleDescription,
            minFitScore: args.minFitScore,
        });

        const deadline = Date.now() + DEADLINE_MS;

        while (Date.now() < deadline) {
            const session = await serviceWorker.evaluate(() => self.__autocvapplyE2e.getAutoApplyStatus());
            const log = session?.log || [];

            const fitPassed = findFitPassedAndApplyingLogEntry(log);
            const applyProgress = findEasyApplyProgressLogEntry(log);

            if (fitPassed) {
                report.fit_passed_log = fitPassed.message;
            }

            if (applyProgress) {
                report.easy_apply_progress_log = applyProgress.message;
            }

            report.applied = session?.stats?.applied || 0;
            report.fit_skipped = session?.stats?.fitSkipped || 0;
            report.status = session?.status || null;
            report.log = log.slice(-16);

            if (report.fit_passed_log && (report.easy_apply_progress_log || report.applied > 0)) {
                break;
            }

            if (session?.status === 'error') {
                break;
            }

            if (session?.status === 'finished' || session?.status === 'completed') {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        await serviceWorker.evaluate(async () => {
            await self.__autocvapplyE2e.stopAutoApply();
        }).catch(() => {});

        if (!report.fit_passed_log) {
            const shortOnly = (report.log || []).some((entry) => /too short to score fit/i.test(entry.message || ''));

            throw new Error(shortOnly
                ? 'Never scored a job (descriptions too short). Reload extension/dist.'
                : 'Never reached "Scored …/100 - applying" in the activity log.');
        }

        if (!report.easy_apply_progress_log && report.applied === 0) {
            throw new Error(
                `Fit gate passed (${report.fit_passed_log}) but Easy Apply did not continue (no submit/advance/Draft All log).`,
            );
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
