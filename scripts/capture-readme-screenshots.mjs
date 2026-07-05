#!/usr/bin/env node
/**
 * Capture README marketing screenshots with Playwright.
 *
 * Prerequisites:
 *   npm run build:extension
 *   ./vendor/bin/sail up -d   (or php artisan serve on APP_URL)
 *   ./vendor/bin/sail artisan readme:seed-demo
 *
 * Usage:
 *   npm run screenshots:readme
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import {
    createExtensionContext,
    injectConnection,
    loadMock,
    loadMocksForScenario,
    startDraftAll,
} from './form-corpus/lib/extension-fill-e2e.mjs';
import { startE2eMockServer } from './form-corpus/lib/e2e-mock-server.mjs';
import { HTML_DIR } from './form-corpus/lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = join(ROOT, 'public/screenshots');
const SCENARIO_ID = 'web-boards-greenhouse-io-8614025002';
const APP_BASE = process.env.APP_URL?.replace(/\/$/, '') || 'http://localhost:8000';
const VIEWPORT = { width: 1440, height: 900 };

function ensureOutputDir() {
    mkdirSync(OUTPUT_DIR, { recursive: true });
}

function loadScenario() {
    const manifestPath = join(ROOT, 'tests/fixtures/form-extraction/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const scenario = manifest.scenarios.find((entry) => entry.id === SCENARIO_ID);

    if (!scenario) {
        throw new Error(`Scenario not found: ${SCENARIO_ID}`);
    }

    return scenario;
}

function janeDoeMocks(baseMocks) {
    const profile = structuredClone(baseMocks.profile);
    profile.user = {
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        avatar: null,
    };
    profile.profile = {
        ...profile.profile,
        full_name: 'Jane Doe',
        headline: 'Product Marketing Manager',
        email: 'jane.doe@example.com',
        phone: '+44 7700 900123',
        location: 'Manchester, United Kingdom',
        summary: 'Product marketing manager with eight years in B2B SaaS.',
        formatted_cv_text: 'Jane Doe - Product Marketing Manager',
    };

    const draftAll = baseMocks.draftAll
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const payload = JSON.parse(line);

            if (payload.type !== 'batch' || !Array.isArray(payload.answers)) {
                return line;
            }

            for (const answer of payload.answers) {
                if (answer.ref === 'f0') {
                    answer.answer = 'Jane';
                }

                if (answer.ref === 'f1') {
                    answer.answer = 'Doe';
                }

                if (answer.ref === 'f2') {
                    answer.answer = 'jane.doe@example.com';
                }

                if (answer.ref === 'f37') {
                    answer.answer = 'https://linkedin.com/in/jane-doe-example';
                }
            }

            return JSON.stringify(payload);
        })
        .join('\n')
        .concat('\n');

    return {
        ...baseMocks,
        profile,
        draftAll,
    };
}

function stitchHorizontal(leftPath, rightPath, outputPath, rightWidth = 360) {
    const left = PNG.sync.read(readFileSync(leftPath));
    const right = PNG.sync.read(readFileSync(rightPath));
    const targetRightWidth = Math.min(rightWidth, right.width);
    const canvas = new PNG({ width: left.width + targetRightWidth, height: VIEWPORT.height });

    for (let y = 0; y < VIEWPORT.height; y += 1) {
        for (let x = 0; x < left.width; x += 1) {
            const sourceIdx = (left.width * y + x) << 2;
            const targetIdx = (canvas.width * y + x) << 2;
            canvas.data[targetIdx] = left.data[sourceIdx];
            canvas.data[targetIdx + 1] = left.data[sourceIdx + 1];
            canvas.data[targetIdx + 2] = left.data[sourceIdx + 2];
            canvas.data[targetIdx + 3] = left.data[sourceIdx + 3];
        }

        for (let x = 0; x < targetRightWidth; x += 1) {
            const sourceX = Math.floor((x / targetRightWidth) * right.width);
            const sourceIdx = (right.width * y + sourceX) << 2;
            const targetIdx = (canvas.width * y + (left.width + x)) << 2;
            canvas.data[targetIdx] = right.data[sourceIdx];
            canvas.data[targetIdx + 1] = right.data[sourceIdx + 1];
            canvas.data[targetIdx + 2] = right.data[sourceIdx + 2];
            canvas.data[targetIdx + 3] = right.data[sourceIdx + 3];
        }
    }

    writeFileSync(outputPath, PNG.sync.write(canvas));
}

async function waitForDashboard(page) {
    await page.waitForSelector('text=CV profile', { timeout: 30_000 });
    await page.waitForTimeout(1500);
}

async function captureDashboardScreenshots(browser) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    try {
        await page.goto(`${APP_BASE}/__readme/demo-login`, { waitUntil: 'networkidle' });
        await waitForDashboard(page);
        await page.screenshot({
            path: join(OUTPUT_DIR, 'dashboard-profile.png'),
            fullPage: false,
        });

        await page.goto(`${APP_BASE}/__readme/dashboard?tab=extension`, { waitUntil: 'networkidle' });
        await page.waitForSelector('text=Extension', { timeout: 30_000 });
        await page.waitForTimeout(1500);
        await page.screenshot({
            path: join(OUTPUT_DIR, 'dashboard-extension.png'),
            fullPage: false,
        });
    } finally {
        await context.close();
    }
}

async function captureExtensionScreenshot() {
    const scenario = loadScenario();
    const baseMocks = loadMocksForScenario(SCENARIO_ID);
    const mocks = janeDoeMocks(baseMocks);
    const html = readFileSync(join(HTML_DIR, scenario.html_file), 'utf8');
    const mockServer = await startE2eMockServer({ [SCENARIO_ID]: mocks }, { [SCENARIO_ID]: html });
    const { context, getServiceWorker, close } = await createExtensionContext();

    const formShot = join(OUTPUT_DIR, 'extension-autofill-form.png');
    const panelShot = join(OUTPUT_DIR, 'extension-autofill-panel.png');
    const outputPath = join(OUTPUT_DIR, 'extension-autofill.png');

    try {
        mockServer.setScenario(SCENARIO_ID);
        await injectConnection(context, getServiceWorker, mockServer.apiBase);

        const page = await context.newPage();
        page.setDefaultTimeout(90_000);
        await page.setViewportSize({ width: 1080, height: VIEWPORT.height });

        await page.route('**/*', (route) => {
            const url = route.request().url();

            if (url.startsWith(mockServer.apiBase)) {
                return route.continue();
            }

            return route.abort();
        });

        await page.goto(mockServer.fixtureUrl(SCENARIO_ID), { waitUntil: 'domcontentloaded' });
        await page.locator('#first_name, input').first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForTimeout(2000);

        const serviceWorker = await getServiceWorker();
        const extensionId = new URL(serviceWorker.url()).host;

        const tabId = await serviceWorker.evaluate(async () => {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

            return activeTab?.id ?? null;
        });

        if (!tabId) {
            throw new Error('Could not resolve extension tab id for README screenshot.');
        }

        await serviceWorker.evaluate(async (activeTabId) => {
            await chrome.tabs.sendMessage(activeTabId, { type: 'BUILD_FIELD_SNAPSHOT' });
        }, tabId);
        await page.waitForTimeout(500);

        const inventory = JSON.parse(loadMock(SCENARIO_ID, 'inventory.json'));
        const jobContext = JSON.parse(loadMock(SCENARIO_ID, 'job-context.json'));
        const startResult = await startDraftAll(context, getServiceWorker, tabId, {
            job: jobContext.job,
            fields: inventory.fields,
        });

        if (startResult?.error) {
            throw new Error(`Draft All failed: ${startResult.error}`);
        }

        await page.waitForTimeout(2500);

        const firstName = page.locator('#first_name');
        await firstName.waitFor({ state: 'visible', timeout: 10_000 });

        const firstNameValue = await firstName.inputValue();

        if (!firstNameValue.toLowerCase().includes('jane')) {
            throw new Error(`Expected autofilled first name "Jane", got "${firstNameValue}".`);
        }

        await page.screenshot({ path: formShot, fullPage: false });

        const sidePanelPage = await context.newPage();
        await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
        await sidePanelPage.waitForSelector('#auth-state', { timeout: 15_000 }).catch(() => {});
        await sidePanelPage.waitForTimeout(2000);
        await sidePanelPage.setViewportSize({ width: 360, height: VIEWPORT.height });
        await sidePanelPage.screenshot({ path: panelShot, fullPage: false });

        stitchHorizontal(formShot, panelShot, outputPath);

        for (const tempPath of [formShot, panelShot]) {
            try {
                unlinkSync(tempPath);
            } catch {
                // ignore cleanup errors
            }
        }
    } finally {
        await close();
        await mockServer.close();
    }
}

async function main() {
    ensureOutputDir();

    const browser = await chromium.launch({
        channel: 'chromium',
        headless: true,
    });

    try {
        console.log('Capturing dashboard screenshots...');
        await captureDashboardScreenshots(browser);
        console.log('Capturing extension autofill screenshot...');
        await captureExtensionScreenshot();
        console.log(`Screenshots saved to ${OUTPUT_DIR}`);
    } finally {
        await browser.close();
    }
}

await main();
