#!/usr/bin/env node
/**
 * LinkedIn Easy Apply Additional Questions with clipped Yes/No radios and no
 * file input - inventory + profile screener mapping + resume-gate skip.
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';
import { buildFormDomContext } from '../form-corpus/lib/snapshot-runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { shouldAttemptResumeUploadGate } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/draft-all-resume-gate.js'))
        .href
);

const RADIO_ONLY_HTML = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<style>
.fb-form-element__checkbox {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  opacity: 0;
}
</style>
</head><body>
<div class="jobs-easy-apply-modal artdeco-modal" role="dialog" data-test-modal="">
  <div class="jobs-easy-apply-content">
    <div class="artdeco-stepper__indicator">Step 3 of 4</div>
    <h2 class="jobs-easy-apply-form-section__title">Additional Questions</h2>
    <form class="jobs-easy-apply-form">
      <div class="fb-dash-form-element" data-test-form-element="">
        <fieldset data-test-form-builder-radio-button-form-component="true">
          <legend>
            <span data-test-form-builder-radio-button-form-component__title=""
              class="fb-dash-form-element__label fb-dash-form-element__label-title--is-required">
              <span>Are you legally authorized to work in United Kingdom?</span>
            </span>
          </legend>
          <div data-test-text-selectable-option="0" class="display-flex">
            <input data-test-text-selectable-option__input="Yes" id="work-auth-yes"
              class="fb-form-element__checkbox" name="work_authorization" type="radio" value="yes" aria-required="true" />
            <label for="work-auth-yes">Yes</label>
          </div>
          <div data-test-text-selectable-option="1" class="display-flex">
            <input data-test-text-selectable-option__input="No" id="work-auth-no"
              class="fb-form-element__checkbox" name="work_authorization" type="radio" value="no" aria-required="true" />
            <label for="work-auth-no">No</label>
          </div>
        </fieldset>
      </div>
      <div class="fb-dash-form-element" data-test-form-element="">
        <fieldset data-test-form-builder-radio-button-form-component="true">
          <legend>
            <span data-test-form-builder-radio-button-form-component__title=""
              class="fb-dash-form-element__label">
              <span>Are you comfortable working in a hybrid setting?</span>
            </span>
          </legend>
          <div data-test-text-selectable-option="0" class="display-flex">
            <input data-test-text-selectable-option__input="Yes" id="hybrid-yes"
              class="fb-form-element__checkbox" name="hybrid_setting" type="radio" value="yes" />
            <label for="hybrid-yes">Yes</label>
          </div>
          <div data-test-text-selectable-option="1" class="display-flex">
            <input data-test-text-selectable-option__input="No" id="hybrid-no"
              class="fb-form-element__checkbox" name="hybrid_setting" type="radio" value="no" />
            <label for="hybrid-no">No</label>
          </div>
        </fieldset>
      </div>
    </form>
  </div>
  <footer class="jobs-easy-apply-footer">
    <button type="button" class="artdeco-button artdeco-button--primary">Continue to next step</button>
  </footer>
</div>
</body></html>`;

const PROFILE = {
    country: 'United Kingdom',
    application_settings: {
        legally_authorized: 'yes',
        affirm_local_hybrid: 'yes',
        visa_sponsorship: 'no',
    },
};

function patchRadiosNoLayout(window) {
    for (const input of window.document.querySelectorAll('input[type="radio"]')) {
        Object.defineProperty(input, 'offsetParent', {
            configurable: true,
            get: () => null,
        });
        Object.defineProperty(input, 'getClientRects', {
            configurable: true,
            value: () => [],
        });
    }
}

test('clipped LinkedIn Yes/No radios inventory without file input', () => {
    const { snapshot, window } = buildFormDomContext({
        html: RADIO_ONLY_HTML,
        pageUrl: 'https://www.linkedin.com/jobs/view/4471603025/',
        pageTitle: 'Additional Questions',
    });

    patchRadiosNoLayout(window);

    const fields = window.AutoCVApplyFormHeuristics.collectAllDraftableFields(
        window.document,
        {},
        {},
    );

    assert.equal(fields.length, 2, `expected 2 radios, got ${fields.length}`);
    assert.match(
        fields[0].label,
        /legally authorized to work in united kingdom/i,
    );
    assert.equal(fields[0].field_type, 'radio');
    assert.deepEqual(
        [...(fields[0].options || [])].map(String),
        ['Yes', 'No'],
    );
    assert.match(fields[1].label, /comfortable working in a hybrid setting/i);
    assert.equal(fields[1].field_type, 'radio');

    assert.equal(
        shouldAttemptResumeUploadGate({
            elements: snapshot.elements,
            pageUrl: 'https://www.linkedin.com/jobs/view/4471603025/',
            hasResumeFileInput: false,
            hasSelectedResume: false,
            isLinkedInEasyApply: true,
        }),
        false,
        'radio-only Easy Apply step must not enter CV upload gate',
    );
});

test('UK profile answers LinkedIn work-auth and hybrid radios via screener stage', () => {
    const { window } = buildFormDomContext({
        html: RADIO_ONLY_HTML,
        pageUrl: 'https://www.linkedin.com/jobs/view/4471603025/',
    });
    patchRadiosNoLayout(window);

    const fields = window.AutoCVApplyFormHeuristics.collectAllDraftableFields(
        window.document,
        {},
        {},
    ).map((field, index) => ({
        id: index,
        ref: `f${index}`,
        label: field.label,
        field_type: field.field_type,
        options: field.options,
    }));

    const plan = buildDraftAllApplyPlan({
        fields,
        profileData: PROFILE,
        questionMemo: {},
        pageUrl: 'https://www.linkedin.com/jobs/view/4471603025/',
    });

    const answeredStages = plan.applyStages.filter((stage) =>
        ['screener', 'preference'].includes(stage.type),
    );
    const answered = answeredStages.flatMap((stage) => stage.answers || []);

    const workAuth = answered.find((row) =>
        /legally authorized/i.test(row.label || ''),
    );
    const hybrid = answered.find((row) =>
        /hybrid setting/i.test(row.label || ''),
    );

    assert.ok(workAuth, 'work authorization should be answered from profile');
    assert.match(String(workAuth.answer), /^yes$/i);
    assert.ok(hybrid, 'hybrid setting should be answered from profile');
    assert.match(String(hybrid.answer), /^yes$/i);
});

test('applyAnswerByLabel checks LinkedIn Yes radio for work authorization', async () => {
    const { window } = buildFormDomContext({
        html: RADIO_ONLY_HTML,
        pageUrl: 'https://www.linkedin.com/jobs/view/4471603025/',
    });
    patchRadiosNoLayout(window);

    const applied = await window.AutoCVApplyFormHeuristics.applyAnswerByLabel(
        window.document,
        'Are you legally authorized to work in United Kingdom?',
        'Yes',
    );

    assert.equal(applied, true);
    assert.equal(
        window.document.getElementById('work-auth-yes')?.checked,
        true,
    );
    assert.equal(
        window.document.getElementById('work-auth-no')?.checked,
        false,
    );
});
