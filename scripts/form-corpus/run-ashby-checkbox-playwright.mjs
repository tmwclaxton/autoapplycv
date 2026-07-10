#!/usr/bin/env node
/**
 * Playwright smoke test: Ashby styled checkbox fill in real Chromium.
 * Static fixture (no React) - native label association must toggle input.checked.
 *
 * Usage:
 *   node scripts/form-corpus/run-ashby-checkbox-playwright.mjs
 *   EXTENSION_E2E_LIVE=1 node scripts/form-corpus/run-ashby-checkbox-playwright.mjs
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

function mountReactLikeAshbyCheckboxHtml() {
    return `<!DOCTYPE html><html><body>
<div class="ashby-application-form-field-entry" data-field-path="hear-about">
  <label class="ashby-application-form-question-title">How did you hear about this opportunity? (select all that apply)</label>
  <div class="_option_1258i_34">
    <span class="_container_1danv_28" data-disabled="false">
      <svg height="1em" viewBox="0 0 512 512"><path d="M173.898 439.404L7.498 273.004"/></svg>
      <input type="checkbox" id="ashby-checkbox-linkedin" name="LinkedIn" style="position:absolute;opacity:0;width:1px;height:1px;">
    </span>
    <label for="ashby-checkbox-linkedin" class="_label_1258i_42">LinkedIn</label>
  </div>
  <div class="_option_1258i_34">
    <span class="_container_1danv_28" data-disabled="false">
      <svg height="1em" viewBox="0 0 512 512"><path d="M173.898 439.404L7.498 273.004"/></svg>
      <input type="checkbox" id="ashby-checkbox-glassdoor" name="Glassdoor" style="position:absolute;opacity:0;width:1px;height:1px;">
    </span>
    <label for="ashby-checkbox-glassdoor" class="_label_1258i_42">Glassdoor</label>
  </div>
</div>
<script>
(function () {
  const state = new Map();
  for (const input of document.querySelectorAll('input[type="checkbox"]')) {
    state.set(input.id, false);
    const toggleFrom = (source) => {
      const next = !state.get(input.id);
      state.set(input.id, next);
      source?.setAttribute?.('data-selected', next ? 'true' : 'false');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const container = input.closest('[class*="_container_"]');
    const option = input.closest('[class*="_option_"]');
    const label = document.querySelector('label[for="' + input.id + '"]');
    for (const el of [container, option, label]) {
      el?.addEventListener('click', (event) => {
        event.preventDefault();
        toggleFrom(container);
      });
    }
    Object.defineProperty(input, 'checked', {
      configurable: true,
      get() { return state.get(input.id); },
      set(value) {
        state.set(input.id, Boolean(value));
        container?.setAttribute('data-selected', Boolean(value) ? 'true' : 'false');
      },
    });
  }
})();
</script>
</body></html>`;
}

async function runFillInPage(page, { useFixture, profile, fillCases }) {
    const { heuristics, inventory } = extensionScriptContents();

    if (useFixture) {
        const html = readFileSync(join(HTML_DIR, `${profile.id}.html`), 'utf8');
        await page.route('**/*', (route) => route.abort());
        await page.setContent(html, { url: profile.pageUrl, waitUntil: 'domcontentloaded' });
    } else {
        await page.goto(profile.pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForSelector('[data-field-path="0b3b7773-f6d9-4032-9ab1-368c4164e95a"] input[type="checkbox"]', {
            timeout: 30_000,
        }).catch(() => {});
    }

    await page.addScriptTag({ content: heuristics });
    await page.addScriptTag({ content: inventory });

    return page.evaluate(async ({ cases, hearAboutInputId }) => {
        window.AutoCVApplyFieldInventory.buildSnapshot(document, null, {}, {});

        const hearCase = cases.find((c) => c.label.includes('hear')) || cases.find((c) => c.ref === 'f9');
        const failures = [];
        const debug = {};

        if (hearCase) {
            const before = document.getElementById(hearAboutInputId)?.checked ?? null;
            const applied = await window.AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(
                document,
                hearCase.ref,
                hearCase.value,
            ) || await window.AutoCVApplyFormHeuristics.applyAnswerByLabelAllFrames(
                document,
                hearCase.label,
                hearCase.value,
            );

            const input = document.getElementById(hearAboutInputId);
            const after = input?.checked ?? null;
            const container = input?.closest('[class*="_container_"]');
            const ariaChecked = container?.getAttribute('data-selected')
                ?? container?.getAttribute('aria-checked')
                ?? null;

            debug.hearAbout = {
                applied,
                before,
                after,
                ariaChecked,
                inputId: hearAboutInputId,
                hasInput: Boolean(input),
            };

            if (!applied) {
                failures.push('hear-about: apply returned false');
            } else if (!after && ariaChecked !== 'true') {
                failures.push(`hear-about: not checked after fill (checked=${after}, aria=${ariaChecked})`);
            }
        } else {
            failures.push('hear-about: test case missing');
        }

        return { failures, debug };
    }, {
        cases: fillCases.map(({ ref, label, value }) => ({ ref, label, value })),
        hearAboutInputId: '8e2fc878-49e3-46fd-8c39-c49a11bf8b7a_0b3b7773-f6d9-4032-9ab1-368c4164e95a-labeled-checkbox-0',
    });
}

async function runReactLikeMiniPage(page) {
    await page.setContent(mountReactLikeAshbyCheckboxHtml(), {
        url: 'https://jobs.ashbyhq.com/notion/test/application',
        waitUntil: 'domcontentloaded',
    });

    const { heuristics, inventory } = extensionScriptContents();
    await page.addScriptTag({ content: heuristics });
    await page.addScriptTag({ content: inventory });

    return page.evaluate(async () => {
        const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
            document,
            'How did you hear about this opportunity? (select all that apply)',
            'LinkedIn',
        );
        const input = document.getElementById('ashby-checkbox-linkedin');
        const container = input?.closest('[class*="_container_"]');

        return {
            applied,
            checked: input?.checked ?? null,
            dataSelected: container?.getAttribute('data-selected') ?? null,
        };
    });
}

async function main() {
    const report = await runAshbyCheckboxSmoke({ live: Boolean(process.env.EXTENSION_E2E_LIVE) });

    console.log(JSON.stringify(report, null, 2));

    if (!report.passed) {
        process.exit(1);
    }
}

export async function runAshbyCheckboxSmoke({ live = false } = {}) {
    const profile = loadAshbyNotionProfile();
    const fillCases = ashbyNotionFillCases();

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    try {
        const reactLike = await runReactLikeMiniPage(page);
        const fixture = await runFillInPage(page, { useFixture: !live, profile, fillCases });

        return {
            mode: live ? 'live' : 'fixture',
            reactLike,
            fixture,
            passed: reactLike.applied
                && (reactLike.checked === true || reactLike.dataSelected === 'true')
                && fixture.failures.length === 0,
        };
    } finally {
        await browser.close();
    }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
