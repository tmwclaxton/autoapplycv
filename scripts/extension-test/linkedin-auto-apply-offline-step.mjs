#!/usr/bin/env node
/**
 * Offline LinkedIn Easy Apply step test using Playwright + extension on captured HTML.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { getServiceWorker } from '../extension-e2e/lib/linkedin-e2e-bootstrap.mjs';
import {
    CAPTURE_CONTACT_PREFILL,
    prefillEasyApplyContact,
} from '../extension-e2e/lib/linkedin-e2e-shared.mjs';
import { EXTENSION_DIR } from '../form-corpus/lib/extension-fill-e2e.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin/captured/senior-angular-frontend-engineer-spica-technologies-4430-step1-open.html',
);
const PAGE_URL = 'https://www.linkedin.com/jobs/view/4430-e2e-offline-step/';
const PARSER_SCRIPT = join(ROOT, 'extension/src/content/linkedin-parser.js');
const FIELDS_SCRIPT = join(ROOT, 'extension/src/content/linkedin-easy-apply-fields.js');
const AUTO_APPLY_SCRIPT = join(ROOT, 'extension/src/content/linkedin-auto-apply.js');

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

async function main() {
    if (!existsSync(FIXTURE_PATH)) {
        throw new Error(`Missing captured fixture: ${FIXTURE_PATH}`);
    }

    if (!existsSync(join(EXTENSION_DIR, 'manifest.json'))) {
        throw new Error('Extension dist missing. Run: npm run build:extension');
    }

    const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf8');

    const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless: true,
        timeout: 120_000,
        args: [
            `--disable-extensions-except=${EXTENSION_DIR}`,
            `--load-extension=${EXTENSION_DIR}`,
        ],
        viewport: { width: 1400, height: 900 },
    });

    try {
        await getServiceWorker(context);

        const page = await context.newPage();

        await page.route('**/*', (route) => {
            const url = route.request().url();

            if (route.request().resourceType() === 'document' && url.startsWith(PAGE_URL.split('/jobs')[0])) {
                return route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: fixtureHtml,
                });
            }

            if (url.includes('linkedin.com')) {
                return route.abort();
            }

            return route.continue();
        });

        await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
        await injectLinkedInApi(page);

        await page.waitForFunction(() => Boolean(window.AutoCVApplyLinkedInAutoApply?.readEasyApplyModal?.()), {
            timeout: 10_000,
        });

        const modalState = await page.evaluate(() => window.AutoCVApplyLinkedInAutoApply.getEasyApplyModalState());
        assert.equal(modalState.open, true, 'expected Easy Apply modal to be open');
        assert.equal(modalState.canContinue, true, 'expected Next button to be available');
        assert.match(modalState.actionLabel || '', /next/i, 'expected Next primary action');

        const prefill = await prefillEasyApplyContact(page, CAPTURE_CONTACT_PREFILL);
        assert.ok(prefill.success || prefill.filled > 0, `contact prefill failed: ${JSON.stringify(prefill)}`);

        const filledFields = await page.evaluate(() => {
            const modal = window.AutoCVApplyLinkedInAutoApply.readEasyApplyModal();
            const selects = [...modal.querySelectorAll('select')];
            const filledSelects = selects.filter((select) => {
                const option = select.selectedOptions?.[0];

                return option && option.value && !/select an option/i.test(option.textContent || '');
            }).length;

            const phoneInput = modal.querySelector('input[type="tel"], input[id*="phoneNumber"]');
            const phoneValue = phoneInput?.value?.trim() || '';

            return {
                filledSelects,
                phoneValue,
            };
        });

        assert.ok(
            filledFields.filledSelects >= 1 || filledFields.phoneValue.length >= 6,
            `expected profile-driven fills, got ${JSON.stringify(filledFields)}`,
        );

        const advance = await page.evaluate(async () => {
            const api = window.AutoCVApplyLinkedInAutoApply;
            const primary = api.findPrimaryActionButton();

            if (!primary) {
                return { error: 'No Next/Review/Submit button found in Easy Apply modal.' };
            }

            const result = await api.clickNextOrSubmit();

            return {
                ...result,
                primaryLabel: primary.label,
            };
        });

        assert.ok(advance.primaryLabel, `expected Next click attempt: ${JSON.stringify(advance)}`);
        assert.match(advance.primaryLabel || '', /next|review|submit/i, 'expected Next/Review/Submit button');
        assert.notEqual(
            advance.error,
            'No Next/Review/Submit button found in Easy Apply modal.',
            `advance failed: ${JSON.stringify(advance)}`,
        );

        console.log('ok - offline LinkedIn Easy Apply step prefill + advance');
    } finally {
        await context.close();
    }
}

await main();
