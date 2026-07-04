#!/usr/bin/env node
/**
 * Playwright smoke test: Ashby Yes/No button fill in real Chromium.
 *
 * Usage:
 *   npm run form-corpus:ashby-yesno-playwright
 *   EXTENSION_E2E_LIVE=1 npm run form-corpus:ashby-yesno-playwright
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ashbyNotionFillCases, loadAshbyNotionProfile } from './lib/ashby-notion-fill-cases.mjs';
import { FORM_HEURISTICS_PATH, FIELD_INVENTORY_PATH, HTML_DIR } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function extensionScriptContents() {
    const heuristics = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
        .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
    const inventory = readFileSync(FIELD_INVENTORY_PATH, 'utf8')
        .replace('const AutoCVApplyFieldInventory =', 'globalThis.AutoCVApplyFieldInventory =');

    return { heuristics, inventory };
}

function mountReactLikeAshbyYesNoHtml() {
    return `<!DOCTYPE html><html><body>
<div class="ashby-application-form-field-entry" data-field-path="e01a85db-feaa-42b3-a9ad-69b1dcbbab3f">
  <label class="ashby-application-form-question-title">Are you able to commit to working from one of our offices on Anchor Days each week?</label>
  <div class="_container_1svni_28 _yesno_1e3gg_148">
    <button type="button" class="_container_pjyt6_1 _option_1svni_32" aria-pressed="false">Yes</button>
    <button type="button" class="_container_pjyt6_1 _option_1svni_32" aria-pressed="false">No</button>
    <input type="checkbox" class="_input_1svni_78" tabindex="-1" name="e01a85db-feaa-42b3-a9ad-69b1dcbbab3f">
  </div>
</div>
<script>
(function () {
  const entry = document.querySelector('[data-field-path="e01a85db-feaa-42b3-a9ad-69b1dcbbab3f"]');
  const container = entry.querySelector('[class*="_yesno_"]');
  const buttons = Array.from(container.querySelectorAll('button'));
  const checkbox = container.querySelector('input[type="checkbox"]');
  let selected = null;

  Object.defineProperty(checkbox, 'checked', {
    configurable: true,
    get() { return selected === 'Yes'; },
    set(value) {
      if (!value) {
        selected = null;
      }
    },
  });

  for (const button of buttons) {
    button.addEventListener('click', () => {
      selected = button.textContent.trim();
      buttons.forEach((candidate) => {
        candidate.setAttribute('aria-pressed', candidate === button ? 'true' : 'false');
      });
      checkbox.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
})();
</script>
</body></html>`;
}

function readYesNoState(document, fieldPath) {
    const entry = document.querySelector(`[data-field-path="${fieldPath}"]`);
    const container = entry?.querySelector('[class*="_yesno_"]');
    const selected = Array.from(container?.querySelectorAll('button') || []).find(
        (button) => button.getAttribute('aria-pressed') === 'true',
    );
    const checkbox = container?.querySelector('input[type="checkbox"]');

    return {
        selection: selected?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        checkboxChecked: checkbox?.checked ?? null,
    };
}

async function runReactLikeMiniPage(page) {
    await page.setContent(mountReactLikeAshbyYesNoHtml(), {
        url: 'https://jobs.ashbyhq.com/notion/test/application',
        waitUntil: 'domcontentloaded',
    });

    const { heuristics, inventory } = extensionScriptContents();
    await page.addScriptTag({ content: heuristics });
    await page.addScriptTag({ content: inventory });

    return page.evaluate(async () => {
        const fieldPath = 'e01a85db-feaa-42b3-a9ad-69b1dcbbab3f';
        window.AutoCVApplyFieldInventory.buildSnapshot(document, null, {}, {});

        const appliedByRef = await window.AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(
            document,
            'f0',
            'Yes',
        );
        const appliedByLabel = appliedByRef || await window.AutoCVApplyFormHeuristics.applyAnswerByLabelAllFrames(
            document,
            'anchor days',
            'yes, I can commit to anchor days',
        );

        const entry = document.querySelector(`[data-field-path="${fieldPath}"]`);
        const container = entry?.querySelector('[class*="_yesno_"]');
        const selected = Array.from(container?.querySelectorAll('button') || []).find(
            (button) => button.getAttribute('aria-pressed') === 'true',
        );
        const checkbox = container?.querySelector('input[type="checkbox"]');

        return {
            appliedByRef,
            appliedByLabel,
            applied: appliedByRef || appliedByLabel,
            selection: selected?.textContent.replace(/\s+/g, ' ').trim() ?? null,
            checkboxChecked: checkbox?.checked ?? null,
        };
    });
}

async function runFixturePage(page, { useFixture, profile, fillCases }) {
    const { heuristics, inventory } = extensionScriptContents();

    if (useFixture) {
        const html = readFileSync(join(HTML_DIR, `${profile.id}.html`), 'utf8');
        await page.route('**/*', (route) => route.abort());
        await page.setContent(html, { url: profile.pageUrl, waitUntil: 'domcontentloaded' });
    } else {
        await page.goto(profile.pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForSelector('[data-field-path="e01a85db-feaa-42b3-a9ad-69b1dcbbab3f"] [class*="_yesno_"] button', {
            timeout: 30_000,
        }).catch(() => {});
    }

    await page.addScriptTag({ content: heuristics });
    await page.addScriptTag({ content: inventory });

    return page.evaluate(async ({ cases }) => {
        window.AutoCVApplyFieldInventory.buildSnapshot(document, null, {}, {});

        const yesNoCases = cases.filter((testCase) => testCase.ref === 'f0' || testCase.ref === 'f1');
        const failures = [];
        const debug = {};

        for (const testCase of yesNoCases) {
            const fieldPath = testCase.ref === 'f0'
                ? 'e01a85db-feaa-42b3-a9ad-69b1dcbbab3f'
                : '790b5934-74f5-46f5-897a-675b7f37f2f3';

            const before = (() => {
                const entry = document.querySelector(`[data-field-path="${fieldPath}"]`);
                const container = entry?.querySelector('[class*="_yesno_"]');
                const selected = Array.from(container?.querySelectorAll('button') || []).find(
                    (button) => button.getAttribute('aria-pressed') === 'true',
                );

                return selected?.textContent.replace(/\s+/g, ' ').trim() ?? null;
            })();

            const applied = await window.AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(
                document,
                testCase.ref,
                testCase.value,
            ) || await window.AutoCVApplyFormHeuristics.applyAnswerByLabelAllFrames(
                document,
                testCase.label,
                testCase.value,
            );

            const entry = document.querySelector(`[data-field-path="${fieldPath}"]`);
            const container = entry?.querySelector('[class*="_yesno_"]');
            const selected = Array.from(container?.querySelectorAll('button') || []).find(
                (button) => button.getAttribute('aria-pressed') === 'true'
                    || /selected|active|checked|true/i.test(String(button.className || '')),
            );
            const checkbox = container?.querySelector('input[type="checkbox"]');
            const after = selected?.textContent.replace(/\s+/g, ' ').trim() ?? null;

            debug[testCase.ref] = {
                fieldPath,
                before,
                applied,
                after,
                expected: testCase.value,
                checkboxChecked: checkbox?.checked ?? null,
            };

            if (!applied) {
                failures.push(`${testCase.ref}: apply returned false`);
            } else if (after !== testCase.value) {
                failures.push(`${testCase.ref}: selection is "${after ?? 'null'}", expected "${testCase.value}"`);
            }
        }

        return { failures, debug };
    }, {
        cases: fillCases.map(({ ref, label, value }) => ({ ref, label, value })),
    });
}

async function main() {
    const profile = loadAshbyNotionProfile();
    const fillCases = ashbyNotionFillCases();
    const useLive = Boolean(process.env.EXTENSION_E2E_LIVE);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    try {
        const reactLike = await runReactLikeMiniPage(page);
        const fixture = await runFixturePage(page, { useFixture: !useLive, profile, fillCases });

        const report = {
            mode: useLive ? 'live' : 'fixture',
            reactLike,
            fixture,
            passed: reactLike.applied
                && reactLike.selection === 'Yes'
                && fixture.failures.length === 0,
        };

        console.log(JSON.stringify(report, null, 2));

        if (!report.passed) {
            process.exit(1);
        }
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
