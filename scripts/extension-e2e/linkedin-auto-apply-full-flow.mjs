#!/usr/bin/env node
/**
 * LinkedIn Auto Apply full-flow live E2E harness.
 *
 * Drives the production Auto Apply orchestrator (Draft All + FILL_AND_ADVANCE per step)
 * and writes a structured report with per-job step metrics and stuck captures.
 *
 * Manual run:
 *   npm run build:extension
 *   LINKEDIN_LIVE_E2E=1 npm run test:linkedin-full-flow -- --max-jobs=3 --roles="software engineer"
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { EXTENSION_DIR } from '../form-corpus/lib/extension-fill-e2e.mjs';
import {
    ensureExtensionConnection,
    findLinkedInPage,
    getServiceWorker,
    parseFullFlowArgs,
} from './lib/linkedin-e2e-bootstrap.mjs';
import {
    acceptLinkedInCookieConsent,
    classifyLinkedInUrl,
    dismissSaveApplicationDialog,
    loadEnvFile,
    loginToLinkedIn,
    requireEnv,
    scrubSecrets,
    slugify,
} from './lib/linkedin-e2e-shared.mjs';
import {
    buildFullFlowReport,
    FULL_FLOW_REPORT_PATH,
    writeFullFlowReport,
} from './lib/linkedin-full-flow-report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROFILE_DIR = join(ROOT, 'tests/output/linkedin-auto-apply-full-flow/profile');
const STUCK_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 3000;

async function screenshot(page, dir, name, secrets) {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${name}.png`);
    await page.screenshot({ path, fullPage: true });

    return scrubSecrets(path, secrets);
}

async function captureStuckArtifacts(page, outputDir, contextLabel, secrets) {
    const capturesDir = join(outputDir, 'captures');
    mkdirSync(capturesDir, { recursive: true });
    const stamp = Date.now();
    const slug = slugify(contextLabel, 32);
    const htmlPath = join(capturesDir, `${slug}-${stamp}.html`);
    const diagnosePath = join(capturesDir, `${slug}-${stamp}.json`);

    await dismissSaveApplicationDialog(page).catch(() => {});

    const exportResult = await page.evaluate(async () => {
        const api = window.AutoCVApplyLinkedInAutoApply;

        if (!api?.exportEasyApplyModalDebug) {
            const modal = api?.readEasyApplyModal?.();

            return {
                html: modal?.outerHTML || null,
                diagnostics: {
                    state: api?.getEasyApplyModalState?.() || null,
                    errors: api?.readEasyApplyModalErrors?.() || [],
                    stepFingerprint: api?.readStepFingerprint?.() || null,
                    url: window.location.href,
                },
            };
        }

        return api.exportEasyApplyModalDebug();
    }).catch(() => ({
        html: null,
        diagnostics: { error: 'Could not export Easy Apply modal.' },
    }));

    const diagnose = {
        captured_at: new Date().toISOString(),
        context: contextLabel,
        url: page.url(),
        ...exportResult,
    };

    if (exportResult.html) {
        writeFileSync(htmlPath, exportResult.html);
    }

    writeFileSync(diagnosePath, `${JSON.stringify(diagnose, null, 2)}\n`);

    const screenshotPath = await screenshot(page, join(outputDir, 'screenshots'), `${slug}-${stamp}`, secrets);

    return {
        html: exportResult.html ? scrubSecrets(htmlPath, secrets) : null,
        diagnose: scrubSecrets(diagnosePath, secrets),
        screenshot: screenshotPath,
    };
}

async function main() {
    const args = parseFullFlowArgs(process.argv.slice(2));
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

    mkdirSync(args.outputDir, { recursive: true });

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

    const startedAt = new Date().toISOString();
    /** @type {Array<Record<string, unknown>>} */
    const stuckEvents = [];
    /** @type {Array<{ title: string, company: string, path: string }>} */
    const captureIndex = [];
    let fatalError = null;

    try {
        const serviceWorker = await getServiceWorker(context);

        if (connection.connected) {
            await serviceWorker.evaluate(({ base, token }) => {
                return self.__autocvapplyE2e.setConnection({ apiBase: base, apiToken: token });
            }, {
                base: connection.apiBase,
                token: connection.token,
            });
        } else {
            console.warn(
                'EXTENSION_E2E_TOKEN missing and could not be generated. Start Sail/Docker, migrate, then rerun.',
            );
        }

        await serviceWorker.evaluate(async () => {
            await self.__autocvapplyE2e.resetAutoApplySession();
        });

        const page = await context.newPage();
        await loginToLinkedIn(page, email, password);

        await serviceWorker.evaluate(({ roleDescription, maxJobs }) => {
            void self.__autocvapplyE2e.startAutoApply({
                platform: 'linkedin',
                roleDescription,
                maxApplications: maxJobs,
            });
        }, {
            roleDescription: args.roleDescription,
            maxJobs: args.maxJobs,
        });

        const deadline = Date.now() + 25 * 60_000;
        let session = null;
        let lastProgressAt = Date.now();
        let lastFingerprint = '';

        while (Date.now() < deadline) {
            session = await serviceWorker.evaluate(() => self.__autocvapplyE2e.getAutoApplyStatus());
            const activePage = await findLinkedInPage(context);

            if (activePage) {
                await acceptLinkedInCookieConsent(activePage).catch(() => {});
                await dismissSaveApplicationDialog(activePage).catch(() => {});
            }

            const fingerprint = JSON.stringify({
                status: session?.status,
                applied: session?.stats?.applied,
                skipped: session?.stats?.skipped,
                errors: session?.stats?.errors,
                draftAllRuns: session?.stats?.draftAllRuns,
                stepsAdvanced: session?.stats?.stepsAdvanced,
                currentIndex: session?.currentIndex,
                logLength: session?.log?.length || 0,
            });

            if (fingerprint !== lastFingerprint) {
                lastFingerprint = fingerprint;
                lastProgressAt = Date.now();
            } else if (session?.status === 'running' && Date.now() - lastProgressAt >= STUCK_TIMEOUT_MS) {
                const reason = 'No Auto Apply progress detected';
                const artifacts = activePage
                    ? await captureStuckArtifacts(activePage, args.outputDir, reason, secrets)
                    : null;

                stuckEvents.push({
                    at: new Date().toISOString(),
                    reason,
                    url: activePage?.url() || null,
                    captures: artifacts ? [artifacts.html, artifacts.diagnose, artifacts.screenshot].filter(Boolean) : [],
                });

                if (activePage) {
                    await dismissSaveApplicationDialog(activePage).catch(() => {});

                    if (artifacts?.html) {
                        captureIndex.push({
                            title: session?.log?.at(-1)?.message?.replace(/^\[fill\]\s+/, '').split(' step ')[0] || 'unknown',
                            company: 'unknown',
                            path: artifacts.diagnose,
                        });
                    }

                    await activePage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                }

                lastProgressAt = Date.now();
            }

            if (session && session.status !== 'running') {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        const fullSession = await serviceWorker.evaluate(() => self.__autocvapplyE2e.getAutoApplySessionForE2e());
        const report = buildFullFlowReport(fullSession, {
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            role_description: args.roleDescription,
            max_jobs: args.maxJobs,
            api_base: connection.apiBase,
            api_connected: connection.connected,
            stuck_events: stuckEvents,
            captures: captureIndex,
        });

        if (!connection.connected && report.applied === 0) {
            report.error = 'Draft All requires EXTENSION_E2E_API_BASE + EXTENSION_E2E_TOKEN against a running local API.';
            report.success = false;
        } else if (report.applied >= 1 && report.steps_advanced_total > 0) {
            report.success = true;
        } else if (!report.error) {
            report.error = `Full flow finished without a submitted application (applied=${report.applied}, steps=${report.steps_advanced_total}).`;
            report.success = false;
        }

        if (context.pages().some((entry) => entry.url().includes('linkedin.com'))) {
            const activePage = await findLinkedInPage(context);
            await screenshot(activePage, join(args.outputDir, 'screenshots'), 'final-state', secrets);
        }

        writeFullFlowReport(report);

        const printable = scrubSecrets(JSON.stringify(report, null, 2), secrets);
        console.log(printable);

        if (!report.success) {
            process.exit(1);
        }
    } catch (error) {
        fatalError = scrubSecrets(error.message || String(error), secrets);

        const activePage = await findLinkedInPage(context).catch(() => null);

        if (activePage) {
            await captureStuckArtifacts(activePage, args.outputDir, 'fatal-error', secrets).catch(() => {});
        }

        const report = buildFullFlowReport(null, {
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            role_description: args.roleDescription,
            max_jobs: args.maxJobs,
            api_base: connection.apiBase,
            api_connected: connection.connected,
            stuck_events: stuckEvents,
            error: fatalError,
            success: false,
        });

        writeFullFlowReport(report);

        console.error(fatalError);
        process.exit(1);
    } finally {
        await context.close();
    }
}

await main();
