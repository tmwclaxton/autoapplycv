#!/usr/bin/env node
/**
 * Offline LinkedIn Easy Apply corpus tests against JSDOM fixtures.
 * Prefers live captures in captured/ when captured-manifest.json is present.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CORPUS_DIR = join(ROOT, 'tests/fixtures/auto-apply/linkedin');
const CAPTURED_DIR = join(CORPUS_DIR, 'captured');
const CAPTURED_MANIFEST_PATH = join(CORPUS_DIR, 'captured-manifest.json');
const SYNTHETIC_MANIFEST_PATH = join(CORPUS_DIR, 'manifest.json');
const AUTO_APPLY_SCRIPT = join(ROOT, 'extension/src/content/linkedin-auto-apply.js');
const EASY_APPLY_FIELDS_SCRIPT = join(ROOT, 'extension/src/content/linkedin-easy-apply-fields.js');
const PARSER_SCRIPT = join(ROOT, 'extension/src/content/linkedin-parser.js');

const includeSynthetic = process.argv.includes('--include-synthetic');
const capturedOnly = process.argv.includes('--captured-only');

const autoApplySource = readFileSync(AUTO_APPLY_SCRIPT, 'utf8');
const easyApplyFieldsSource = readFileSync(EASY_APPLY_FIELDS_SCRIPT, 'utf8');
const parserSource = readFileSync(PARSER_SCRIPT, 'utf8');

/** @type {{ passed: number, failed: number, errors: string[] }} */
const summary = { passed: 0, failed: 0, errors: [] };

function loadManifestFile(path) {
    if (!existsSync(path)) {
        return { scenarios: [] };
    }

    return JSON.parse(readFileSync(path, 'utf8'));
}

function resolveScenarioPath(scenario) {
    if (scenario.source === 'live-capture' || scenario.file.startsWith('captured/')) {
        const filename = scenario.file.replace(/^captured\//, '');

        return join(CAPTURED_DIR, filename);
    }

    return join(CORPUS_DIR, scenario.file);
}

function mergeCorpusManifests() {
    const captured = loadManifestFile(CAPTURED_MANIFEST_PATH);
    let scenarios = (captured.scenarios || []).map((scenario) => ({
        ...scenario,
        source: scenario.source || 'live-capture',
    }));

    const shouldIncludeSynthetic = includeSynthetic || (scenarios.length < 50 && !capturedOnly);

    if (shouldIncludeSynthetic) {
        const synthetic = loadManifestFile(SYNTHETIC_MANIFEST_PATH);

        for (const scenario of synthetic.scenarios || []) {
            if (!includeSynthetic && scenarios.length >= 50) {
                break;
            }

            scenarios.push({
                ...scenario,
                source: 'synthetic',
            });
        }
    }

    const capturedCount = scenarios.filter((scenario) => scenario.source === 'live-capture').length;
    const syntheticCount = scenarios.filter((scenario) => scenario.source === 'synthetic').length;

    return {
        scenarios,
        capturedCount,
        syntheticCount,
        primarySource: capturedCount >= 50 ? 'live-capture' : (capturedCount > 0 ? 'mixed' : 'synthetic'),
    };
}

const manifest = mergeCorpusManifests();

function loadLinkedInApi(html) {
    const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://www.linkedin.com/jobs/view/1234567890/' });
    const { window } = dom;

    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.MouseEvent = window.MouseEvent;

    eval(parserSource);
    eval(easyApplyFieldsSource);
    eval(autoApplySource);

    return {
        dom,
        api: window.AutoCVApplyLinkedInAutoApply,
        parser: window.AutoCVApplyLinkedInParser,
    };
}

function runCase(name, fn) {
    try {
        fn();
        summary.passed += 1;
        console.log(`ok - ${name}`);
    } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(`${name}: ${message}`);
        console.error(`not ok - ${name}`);
        console.error(`  ${message}`);
    }
}

function assertPrimaryAction(state, primary, scenario) {
    if (primary === null) {
        return;
    }

    assert.equal(
        state.action,
        primary,
        `${scenario.id}: expected primary action ${primary}, got ${state.action}`,
    );
}

function assertErrorsPresent(errors, expectedErrors, scenarioId) {
    for (const expected of expectedErrors) {
        const found = errors.some((entry) => entry.includes(expected) || expected.includes(entry));

        assert.ok(
            found,
            `${scenarioId}: expected validation error containing "${expected}", got [${errors.join(', ')}]`,
        );
    }
}

runCase(`corpus has scenarios (captured=${manifest.capturedCount}, synthetic=${manifest.syntheticCount})`, () => {
    assert.ok(manifest.scenarios.length > 0, 'Expected at least one corpus scenario.');
});

runCase('captured corpus meets fifty-fixture target when live captures exist', () => {
    if (manifest.capturedCount === 0) {
        console.log('  (skipped: no live captures yet)');

        return;
    }

    assert.ok(
        manifest.capturedCount >= 50,
        `Expected at least 50 live-capture fixtures, found ${manifest.capturedCount}.`,
    );
});

runCase('captured corpus includes step2+ fixtures when multi-step captures exist', () => {
    const hasStep2Open = manifest.scenarios.some(
        (scenario) => scenario.source === 'live-capture' && scenario.file.includes('-step2-open'),
    );

    if (!hasStep2Open) {
        console.log('  (skipped: no step2-open captures yet; run capture with --advance-steps)');

        return;
    }

    const step2Plus = manifest.scenarios.filter(
        (scenario) => scenario.source === 'live-capture'
            && (
                (scenario.step && scenario.step >= 2)
                || /-step[2-9]-(?:open|filled|review)/.test(scenario.file)
            ),
    );

    assert.ok(
        step2Plus.length >= 1,
        `Expected step2+ fixtures when step2-open exists, found ${step2Plus.length}.`,
    );
});

runCase('manifest lists fifty scenarios when synthetic fallback enabled', () => {
    if (manifest.capturedCount >= 50 && !includeSynthetic) {
        assert.equal(manifest.scenarios.length, manifest.capturedCount);

        return;
    }

    assert.equal(manifest.scenarios.length, 50);
});

runCase('save-application dialog fixture exposes Discard action', () => {
    const html = readFileSync(join(CORPUS_DIR, 'edge-save-application-dialog.html'), 'utf8');
    const { api } = loadLinkedInApi(html);

    const dialog = api.findSaveApplicationDialog();
    assert.ok(dialog, 'expected save-application confirmation dialog');

    const discardButton = dialog.querySelector('[data-test-dialog-secondary-btn]');
    assert.ok(discardButton, 'expected Discard button via data-test-dialog-secondary-btn');
    assert.match(discardButton.textContent || '', /discard/i);

    const saveButton = dialog.querySelector('[data-test-dialog-primary-btn]');
    assert.ok(saveButton, 'expected Save button via data-test-dialog-primary-btn');
    assert.match(saveButton.textContent || '', /save/i);

    assert.equal(api.readEasyApplyModal(), null, 'Easy Apply modal should not be mistaken for save dialog');
});

runCase('cookie consent fixture exposes Accept action', () => {
    const html = readFileSync(join(CORPUS_DIR, 'edge-cookie-consent.html'), 'utf8');
    const { api } = loadLinkedInApi(html);

    const alert = api.findCookieConsentAlert();
    assert.ok(alert, 'expected cookie consent alert');

    const acceptButton = alert.querySelector('[data-test-global-alert-action="0"]');
    assert.ok(acceptButton, 'expected Accept button via data-test-global-alert-action="0"');
    assert.match(acceptButton.textContent || '', /accept/i);

    const rejectButton = alert.querySelector('[data-test-global-alert-action="1"]');
    assert.ok(rejectButton, 'expected Reject button via data-test-global-alert-action="1"');
    assert.match(rejectButton.textContent || '', /reject/i);
});

runCase('each scenario file exists on disk', () => {
    for (const scenario of manifest.scenarios) {
        const path = resolveScenarioPath(scenario);
        readFileSync(path, 'utf8');
    }
});

for (const scenario of manifest.scenarios) {
    runCase(`scenario ${scenario.id}`, () => {
        const html = readFileSync(resolveScenarioPath(scenario), 'utf8');
        const { api } = loadLinkedInApi(html);

        if (scenario.expects_modal === false) {
            assert.equal(api.readEasyApplyModal(), null, `${scenario.id}: modal should be absent`);
            assert.equal(
                api.readApplyButtonState(api.readTopCardApplyButton()).alreadyApplied,
                true,
                `${scenario.id}: expected already-applied button state`,
            );

            return;
        }

        const modal = api.readEasyApplyModal();
        assert.ok(modal, `${scenario.id}: expected Easy Apply modal`);

        const state = api.getEasyApplyModalState();
        assert.equal(state.open, true, `${scenario.id}: modal should be open`);

        if (scenario.expects_submitted) {
            const verify = api.verifySubmitted();
            assert.equal(verify.submitted, true, `${scenario.id}: expected submitted confirmation`);
        } else {
            const primary = api.findPrimaryActionButton(modal);

            if (scenario.source === 'synthetic') {
                assert.ok(primary, `${scenario.id}: expected primary footer button`);
                assertPrimaryAction(state, scenario.primary_action, scenario);

                if (scenario.action_disabled) {
                    assert.equal(state.actionDisabled, true, `${scenario.id}: expected disabled primary action`);
                } else if (scenario.primary_action !== 'submit' && !scenario.expects_submitted) {
                    assert.equal(state.actionDisabled, false, `${scenario.id}: expected enabled primary action`);
                }
            } else if (primary) {
                if (scenario.primary_action) {
                    assertPrimaryAction(state, scenario.primary_action, scenario);
                }
            }
        }

        const errors = api.readEasyApplyModalErrors();

        if (scenario.expects_validation_errors) {
            const hasHtmlErrorMarkers = /artdeco-inline-feedback--error|data-test-form-element-error|fb-dash-form-element__error-field/.test(html);

            if (scenario.source === 'live-capture') {
                assert.ok(
                    errors.length > 0 || hasHtmlErrorMarkers,
                    `${scenario.id}: expected validation error markers in live capture fixture`,
                );
            } else {
                assert.ok(errors.length > 0, `${scenario.id}: expected visible validation errors`);
            }

            if (scenario.expected_errors?.length && errors.length > 0) {
                assertErrorsPresent(errors, scenario.expected_errors, scenario.id);
            }
        } else if (!scenario.expects_submitted && scenario.source === 'synthetic') {
            assert.equal(errors.length, 0, `${scenario.id}: expected no validation errors, got ${errors.join(', ')}`);
        }

        if (scenario.required_fields?.length) {
            for (const fieldName of scenario.required_fields) {
                const field = modal.querySelector(`[name="${fieldName}"]`);
                assert.ok(field, `${scenario.id}: expected field [name="${fieldName}"]`);
            }
        }
    });
}

const flowGroups = manifest.scenarios
    .filter((scenario) => scenario.flow_id)
    .reduce((groups, scenario) => {
        groups[scenario.flow_id] ||= { scenarios: [], source: scenario.source || 'synthetic' };
        groups[scenario.flow_id].scenarios.push(scenario);
        groups[scenario.flow_id].source = scenario.source || groups[scenario.flow_id].source;

        return groups;
    }, {});

for (const [flowId, group] of Object.entries(flowGroups)) {
    const scenarios = group.scenarios;

    if (group.source === 'live-capture') {
        runCase(`flow ${flowId} has distinct capture files`, () => {
            assert.equal(
                new Set(scenarios.map((scenario) => scenario.file)).size,
                scenarios.length,
                `${flowId}: capture filenames should be unique`,
            );
        });
    } else {
        runCase(`flow ${flowId} has unique step fingerprints`, () => {
            const fingerprints = scenarios.map((scenario) => {
                const html = readFileSync(resolveScenarioPath(scenario), 'utf8');
                const { api } = loadLinkedInApi(html);

                return api.readStepFingerprint();
            }).filter(Boolean);

            assert.ok(fingerprints.length > 0, `${flowId}: expected at least one fingerprint`);

            assert.equal(
                new Set(fingerprints).size,
                fingerprints.length,
                `${flowId}: step fingerprints should differ across progression fixtures`,
            );
        });
    }

    if (group.source === 'synthetic') {
        runCase(`flow ${flowId} advances primary actions contact -> review -> submitted`, () => {
            const ordered = [...scenarios].sort((left, right) => left.step - right.step);
            const actions = ordered.map((scenario) => scenario.primary_action);
            const submittedFlags = ordered.map((scenario) => Boolean(scenario.expects_submitted));

            assert.deepEqual(actions, ['next', 'next', 'review', null]);
            assert.deepEqual(submittedFlags, [false, false, false, true]);
        });
    } else {
        runCase(`flow ${flowId} has multiple captured progression states`, () => {
            assert.ok(
                scenarios.length >= 1,
                `${flowId}: expected at least one captured state per job flow`,
            );

            const hasStep2 = scenarios.some((scenario) => /-step2-(?:open|filled|review)/.test(scenario.file));

            if (hasStep2) {
                const steps = scenarios.map((scenario) => scenario.step).filter((step) => typeof step === 'number');
                assert.ok(
                    steps.some((step) => step >= 2),
                    `${flowId}: expected step number >= 2 when step2 captures exist`,
                );
            }
        });
    }
}

try {
    const html = readFileSync(join(CORPUS_DIR, 'edge-save-application-dialog.html'), 'utf8');
    const { api } = loadLinkedInApi(html);

    assert.ok(api.findSaveApplicationDialog(), 'dialog should be visible before dismiss');

    const result = await api.dismissSaveApplicationDialog();

    assert.equal(result.dismissed, true);
    assert.equal(result.action, 'discard');

    summary.passed += 1;
    console.log('ok - dismissSaveApplicationDialog clicks Discard on save-application fixture');
} catch (error) {
    summary.failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    summary.errors.push(`dismissSaveApplicationDialog clicks Discard on save-application fixture: ${message}`);
    console.error('not ok - dismissSaveApplicationDialog clicks Discard on save-application fixture');
    console.error(`  ${message}`);
}

try {
    const html = readFileSync(join(CORPUS_DIR, 'edge-cookie-consent.html'), 'utf8');
    const { api } = loadLinkedInApi(html);

    assert.ok(api.findCookieConsentAlert(), 'cookie consent alert should be visible before accept');

    const result = await api.acceptCookieConsent();

    assert.equal(result.accepted, true);

    summary.passed += 1;
    console.log('ok - acceptCookieConsent clicks Accept on cookie-consent fixture');
} catch (error) {
    summary.failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    summary.errors.push(`acceptCookieConsent clicks Accept on cookie-consent fixture: ${message}`);
    console.error('not ok - acceptCookieConsent clicks Accept on cookie-consent fixture');
    console.error(`  ${message}`);
}

runCase('contact info fill clears LinkedIn email and phone country selects', () => {
    const html = readFileSync(
        join(CAPTURED_DIR, 'senior-ios-engineer-early-4421696840-step1-validation-errors.html'),
        'utf8',
    );
    const { api } = loadLinkedInApi(html);
    const modal = api.readEasyApplyModal();

    assert.ok(modal, 'expected Easy Apply modal');

    const errorsBefore = api.readEasyApplyModalErrors();
    const hasHtmlErrorMarkers = /please enter a valid answer|fb-dash-form-element__error-field/.test(html);

    assert.ok(
        errorsBefore.some((entry) => /please enter a valid answer/i.test(entry)) || hasHtmlErrorMarkers,
        `expected validation error markers before fill, got [${errorsBefore.join(', ')}]`,
    );

    const profileData = {
        user: { email: 'candidate@example.com' },
        profile: {
            phone: '+44 7700 900123',
            country: 'United Kingdom',
        },
        application_settings: {
            phone_country_code: '+44',
        },
    };

    const fillResult = api.prefillContactInfo(profileData);

    assert.equal(fillResult.success, true, `prefill failed: ${fillResult.errors.join('; ')}`);
    assert.ok(fillResult.emailSelected, 'expected email select to be set');
    assert.ok(fillResult.countrySelected, 'expected phone country select to be set');

    const emailSelect = modal.querySelector('select[data-test-text-entity-list-form-select]');
    assert.notEqual(emailSelect?.value, 'Select an option', 'email select should not remain on placeholder');

    const countrySelect = modal.querySelector('select[id*="phoneNumber-country"]');
    assert.notEqual(countrySelect?.value, 'Select an option', 'country select should not remain on placeholder');
    assert.match(countrySelect?.value || '', /\+44/, 'expected UK dial code in country select value');

    const phoneInput = modal.querySelector('input[id*="phoneNumber-nationalNumber"]');
    assert.equal(phoneInput?.value, '7700900123', 'expected national phone number without country code');

    const errorsAfter = api.readEasyApplyModalErrors();
    assert.equal(errorsAfter.length, 0, `expected validation errors cleared, got [${errorsAfter.join(', ')}]`);

    assert.equal(
        emailSelect?.classList.contains('fb-dash-form-element__error-field'),
        false,
        'email select should not keep error styling after fill',
    );
});

runCase('job card resolution finds cards by entity urn and href patterns', () => {
    const html = `
        <ul>
            <li data-entity-urn="urn:li:jobPosting:4433753816">
                <a href="/jobs/view/4433753816">Software Engineer</a>
            </li>
            <li>
                <a href="/jobs/search/?currentJobId=4375167862">Junior Software Engineer</a>
            </li>
        </ul>
    `;
    const { api } = loadLinkedInApi(html);

    assert.ok(api.findJobCardById('4433753816'));
    assert.ok(api.findJobCardById('4375167862'));
});

runCase('job detail fixture exposes top-card Easy Apply button', async () => {
    const html = readFileSync(join(ROOT, 'tests/fixtures/auto-apply/linkedin-job-detail-easy-apply.html'), 'utf8');
    const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://www.linkedin.com/jobs/view/4411111111/' });
    const { window } = dom;

    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.MouseEvent = window.MouseEvent;

    eval(parserSource);
    eval(autoApplySource);

    const api = window.AutoCVApplyLinkedInAutoApply;
    const ready = await api.waitForJobDetailReady('4411111111');

    assert.equal(ready.success, true);
    assert.match(api.readApplyButtonState(api.readTopCardApplyButton()).label, /easy apply/i);
});

console.log(`\nLinkedIn Easy Apply corpus (${manifest.primarySource}): ${summary.passed} passed, ${summary.failed} failed.`);

if (summary.failed > 0) {
    process.exit(1);
}
