import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { chromium } from 'playwright';
import { checkA11yState } from './fill-a11y-runner.mjs';
import { detectFormErrorsInPage } from './fill-error-detector.mjs';
import { loadCuratedManifest, listPlaywrightScenarios, resolveCuratedScenarios } from './curated-manifest.mjs';
import { buildFillPlan } from './mock-answers.mjs';
import { runFillVerifyForScenario } from './fill-verify-runner.mjs';
import { FORM_HEURISTICS_PATH, FIELD_INVENTORY_PATH, HTML_DIR, EXPECTED_DIR } from './paths.mjs';

function extensionScriptContents() {
    const heuristics = readFileSync(FORM_HEURISTICS_PATH, 'utf8')
        .replace('const AutoCVApplyFormHeuristics =', 'globalThis.AutoCVApplyFormHeuristics =');
    const inventory = readFileSync(FIELD_INVENTORY_PATH, 'utf8')
        .replace('const AutoCVApplyFieldInventory =', 'globalThis.AutoCVApplyFieldInventory =');

    return { heuristics, inventory };
}

async function injectExtensionScripts(page) {
    const { heuristics, inventory } = extensionScriptContents();
    await page.addScriptTag({ content: heuristics });
    await page.addScriptTag({ content: inventory });
}

async function buildSnapshotInPage(page, pageTitle) {
    return page.evaluate((title) => window.AutoCVApplyFieldInventory.buildSnapshot(document, null, {}, {
        pageTitle: title,
    }), pageTitle);
}

async function applyPlanInPage(page, plan) {
    return page.evaluate(async (items) => {
        const failures = [];

        for (const item of items) {
            const applied = await window.AutoCVApplyFieldInventory.applyAnswerByRefAllFrames(
                document,
                item.ref,
                item.answer,
            );

            if (!applied) {
                failures.push({
                    stage: 'apply',
                    field: item.field?.question || item.ref,
                    ref: item.ref,
                    expected: item.answer,
                });
            }
        }

        return failures;
    }, plan.map(({ ref, answer, field }) => ({ ref, answer, field: { question: field?.question } })));
}

async function readDomValuesInPage(page, plan, applyFailures) {
    const applyFailedRefs = new Set(applyFailures.map((failure) => failure.ref));

    return page.evaluate(({ items, failedRefs }) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const complexTypes = new Set(['radio', 'checkbox', 'select', 'combobox']);

        const matchesAnswer = (actualValue, answer, fieldType) => {
            const actual = normalize(actualValue);
            const expected = normalize(answer);

            if (!actual || !expected) {
                return false;
            }

            if (fieldType === 'checkbox' || fieldType === 'radio') {
                if (actual === 'checked') {
                    return true;
                }

                if (expected === 'yes') {
                    return /^yes\b/.test(actual) || actual.includes('i am open');
                }

                if (expected === 'no') {
                    return /^no\b/.test(actual) || actual.includes('not open');
                }

                return actual === expected || actual.includes(expected) || expected.includes(actual);
            }

            return actual === expected || actual.includes(expected);
        };

        const readYesNo = (fieldPath) => {
            const scope = fieldPath
                ? document.querySelector(`[data-field-path="${fieldPath}"]`)
                : document.querySelector('[class*="_yesno_"]')?.closest('[data-field-path]');
            const container = scope?.querySelector('[class*="_yesno_"]');

            if (!container) {
                return null;
            }

            const selected = Array.from(container.querySelectorAll('button')).find(
                (button) => button.getAttribute('aria-pressed') === 'true',
            );

            return selected?.textContent.replace(/\s+/g, ' ').trim() ?? null;
        };

        const failures = [];
        const readbacks = [];

        for (const item of items) {
            if (failedRefs.includes(item.ref)) {
                continue;
            }

            const fieldType = item.fieldType || 'text';
            let actual = null;

            if (item.dataFieldPath) {
                actual = readYesNo(item.dataFieldPath);
            }

            const element = document.querySelector(`[data-autocv-ref="${item.ref}"]`)
                || (item.domId ? document.getElementById(item.domId) : null)
                || (item.domName ? document.querySelector(`[name="${CSS.escape(item.domName)}"]`) : null);

            if (!actual && element) {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    actual = element.checked ? 'checked' : 'unchecked';

                    const container = element.closest('[class*="_container_"]');
                    const ariaChecked = container?.getAttribute('data-selected')
                        ?? container?.getAttribute('aria-checked');

                    if (ariaChecked === 'true') {
                        actual = item.answer;
                    }
                } else if (element.tagName === 'SELECT') {
                    actual = element.selectedOptions?.[0]?.textContent?.trim() ?? element.value;
                } else {
                    actual = element.value ?? element.textContent?.trim() ?? null;
                }

                const yesNoContainer = element.closest('[class*="_yesno_"]');

                if (yesNoContainer) {
                    const selected = Array.from(yesNoContainer.querySelectorAll('button')).find(
                        (button) => button.getAttribute('aria-pressed') === 'true',
                    );

                    if (selected) {
                        actual = selected.textContent.replace(/\s+/g, ' ').trim();
                    }
                }
            }

            readbacks.push({ ref: item.ref, expected: item.answer, actual, fieldType });

            if (complexTypes.has(fieldType)) {
                continue;
            }

            if (!matchesAnswer(String(actual ?? ''), item.answer, fieldType)) {
                failures.push({
                    stage: 'verify',
                    field: item.question,
                    ref: item.ref,
                    expected: item.answer,
                    actual,
                });
            }
        }

        const alerts = Array.from(document.querySelectorAll('[role="alert"], [aria-invalid="true"], .error, .field-error'))
            .map((node) => node.textContent?.replace(/\s+/g, ' ').trim())
            .filter(Boolean);

        if (alerts.length > 0) {
            failures.push({
                stage: 'errorBanner',
                field: null,
                expected: 'no errors',
                actual: alerts.slice(0, 3).join(' | '),
            });
        }

        return { failures, readbacks };
    }, {
        items: plan.map(({ ref, answer, field, dom }) => ({
            ref,
            answer,
            fieldType: field?.field_type,
            question: field?.question || ref,
            domId: dom?.id || null,
            domName: dom?.name || null,
            dataFieldPath: dom?.data_field_path || field?.dom?.data_field_path || null,
        })),
        failedRefs: [...applyFailedRefs],
    });
}

async function runScenarioInPlaywright(page, scenario, entry, options = {}) {
    const checkA11y = options.checkA11y === true;
    const checkErrors = options.checkErrors !== false;
    const html = readFileSync(join(HTML_DIR, scenario.html_file), 'utf8');
    const expected = JSON.parse(readFileSync(join(EXPECTED_DIR, `${scenario.id}.json`), 'utf8'));
    const pageUrl = scenario.page_url || `https://example.test/forms/${scenario.id}`;
    const pageTitle = scenario.page_title || 'Job Application';

    await page.route('**/*', (route) => route.abort());
    await page.setContent(html, { url: pageUrl, waitUntil: 'domcontentloaded' });
    await injectExtensionScripts(page);

    const snapshot = await buildSnapshotInPage(page, pageTitle);
    const plan = buildFillPlan(expected, snapshot);

    if (plan.length === 0) {
        return {
            id: scenario.id,
            platform: entry.platform,
            priority: entry.priority,
            passed: false,
            skipped: true,
            reason: 'no fillable fields matched',
            plan_count: 0,
            failures: [],
        };
    }

    const applyFailures = await applyPlanInPage(page, plan);
    const verifyResult = await readDomValuesInPage(page, plan, applyFailures);
    const bannerFailures = verifyResult.failures.filter((failure) => failure.stage === 'errorBanner');
    const readbackFailures = verifyResult.failures.filter((failure) => failure.stage === 'verify');

    let a11yResult = { passed: true, failures: [] };

    if (checkA11y) {
        const html = await page.content();
        const dom = new JSDOM(html, { url: pageUrl }).window.document;
        a11yResult = checkA11yState(dom, plan);
    }

    let errorBanner = { passed: true, error_count: 0, errors: [] };

    if (checkErrors) {
        errorBanner = await detectFormErrorsInPage(page);
    }

    const a11yFailures = a11yResult.passed ? [] : (a11yResult.failures || []).map((failure) => ({
        stage: 'a11yState',
        field: failure.field,
        ref: failure.ref,
        message: failure.reason,
        expected: failure.expected,
        actual: failure.actual,
    }));

    const errorBannerFailures = errorBanner.passed ? [] : [{
        stage: 'errorBanner',
        field: null,
        expected: 'no errors',
        actual: (errorBanner.errors || []).slice(0, 3).map((error) => error.message).join(' | '),
    }];

    const requireA11yPass = options.requireA11yPass ?? false;

    return {
        id: scenario.id,
        platform: entry.platform,
        priority: entry.priority,
        passed: applyFailures.length === 0
            && bannerFailures.length === 0
            && errorBannerFailures.length === 0
            && (!requireA11yPass || a11yFailures.length === 0),
        plan_count: plan.length,
        apply_failures: applyFailures.length,
        readback_failures: readbackFailures.length,
        a11y_failures: a11yFailures.length,
        error_banner_count: errorBanner.error_count || 0,
        failures: [...applyFailures, ...bannerFailures, ...a11yFailures, ...errorBannerFailures],
        readback_failures_detail: readbackFailures,
        readbacks: verifyResult.readbacks,
        checks: {
            a11yState: { passed: a11yResult.passed, failures: a11yResult.failures || [] },
            errorBanner: { passed: errorBanner.passed, error_count: errorBanner.error_count || 0 },
        },
    };
}

export async function runPlaywrightFillVerify(options = {}) {
    const curatedManifest = loadCuratedManifest();
    const scenarioFilter = options.scenarios
        ?? (options.id
            ? curatedManifest.scenarios.filter((entry) => entry.id === options.id && entry.verify_engine === 'playwright')
            : listPlaywrightScenarios(curatedManifest, { priorityOnly: options.priorityOnly === true }));

    const playwrightEntries = scenarioFilter;

    const resolved = resolveCuratedScenarios({
        scenarios: playwrightEntries,
    });

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const results = [];

    try {
        for (const { entry, scenario } of resolved) {
            if (!scenario) {
                results.push({
                    id: entry.id,
                    platform: entry.platform,
                    passed: false,
                    skipped: true,
                    reason: 'missing manifest scenario',
                    failures: [],
                });
                continue;
            }

            try {
                const result = await runScenarioInPlaywright(page, scenario, entry, {
                    checkA11y: options.checkA11y === true,
                    checkErrors: options.checkErrors !== false,
                    requireA11yPass: options.requireA11yPass ?? false,
                });
                results.push(result);
            } catch (error) {
                results.push({
                    id: entry.id,
                    platform: entry.platform,
                    passed: false,
                    failures: [{ stage: 'runtime', field: null, message: error.message }],
                });
            }
        }
    } finally {
        await browser.close();
    }

    const evaluated = results.filter((result) => !result.skipped);
    const passed = evaluated.filter((result) => result.passed);

    return {
        generated_at: new Date().toISOString(),
        totals: {
            scenarios: results.length,
            evaluated: evaluated.length,
            passed: passed.length,
            failed: evaluated.length - passed.length,
            pass_rate: evaluated.length === 0 ? 0 : Number((passed.length / evaluated.length).toFixed(4)),
        },
        results,
    };
}

/**
 * Cross-check a single scenario: JSDOM vs Playwright readback agreement.
 */
export async function compareJsdomAndPlaywright(scenario, verifyOptions = {}) {
    const jsdomResult = await runFillVerifyForScenario(scenario, verifyOptions);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        const entry = { platform: 'compare', priority: 'standard' };
        const playwrightResult = await runScenarioInPlaywright(page, scenario, entry);
        return { jsdom: jsdomResult, playwright: playwrightResult };
    } finally {
        await browser.close();
    }
}
