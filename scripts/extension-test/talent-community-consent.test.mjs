#!/usr/bin/env node
/**
 * Veeam Greenhouse talent-community Yes/No must decline even when react-select
 * options are unharvested, and must not vanish from the Draft All pipeline.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isMarketingOrFutureConsentField,
    partitionMarketingConsentFields,
    resolveMarketingConsentAnswer,
} from '../../extension/src/shared/draft-all/consent-fields.js';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';

const TALENT_LABEL =
    'Do you agree to be a part of the talent community for future career opportunities at Veeam? Your information will be retained for up to 2 years.';

test('talent community label is marketing consent', () => {
    assert.equal(
        isMarketingOrFutureConsentField({ label: TALENT_LABEL }),
        true,
    );
});

test('talent community select with empty options declines No', () => {
    const field = {
        ref: 'f4',
        label: TALENT_LABEL,
        field_type: 'select',
        options: [],
        dom: { role: 'combobox', id: 'question_9220244101' },
    };

    assert.equal(resolveMarketingConsentAnswer(field), 'No');

    const { marketingConsentAnswers, remainingFields } =
        partitionMarketingConsentFields([field]);

    assert.equal(marketingConsentAnswers.length, 1);
    assert.equal(marketingConsentAnswers[0].answer, 'No');
    assert.equal(remainingFields.length, 0);
});

test('Draft All plan applies talent community No', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                ref: 'f4',
                label: TALENT_LABEL,
                field_type: 'select',
                options: [],
                dom: { role: 'combobox' },
            },
        ],
        profileData: { country: 'United Kingdom' },
    });
    const answers = (plan.applyStages || []).flatMap(
        (stage) => stage.answers || [],
    );

    assert.ok(
        answers.some((answer) => answer.ref === 'f4' && answer.answer === 'No'),
        `expected talent community No, got ${JSON.stringify(answers)}`,
    );
});
