import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildDraftAllApplyPlan,
    partitionDraftAllBatchAnswers,
} from '../../extension/src/shared/draft-all/pipeline.js';
import { shouldClarifyLocationCommute } from '../../extension/src/shared/pending-fields.js';

const LOUGHBOROUGH_FIELD = {
    ref: 'f1',
    label: 'are you comfortable working onsite in loughborough 3 days per week?',
    question: 'are you comfortable working onsite in loughborough 3 days per week?',
    field_type: 'select',
    options: ['Yes', 'No'],
    required: true,
};

const UK_PROFILE = {
    location: 'High Wycombe, England, United Kingdom',
    city: 'High Wycombe',
    country: 'United Kingdom',
    application_settings: { willing_to_relocate: true },
};

test('LLM Yes on Loughborough onsite still needs location_clarify', () => {
    assert.equal(
        shouldClarifyLocationCommute(LOUGHBOROUGH_FIELD, 'Yes', UK_PROFILE),
        true,
    );

    const fieldsByRef = new Map([['f1', LOUGHBOROUGH_FIELD]]);
    const { toApply, pending } = partitionDraftAllBatchAnswers(
        [{ ref: 'f1', label: LOUGHBOROUGH_FIELD.label, answer: 'Yes', field_type: 'select' }],
        fieldsByRef,
        UK_PROFILE,
    );

    assert.equal(toApply.length, 0);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].reason, 'location_clarify');
});

test('saved memo Yes on Loughborough onsite is applied without re-pausing', () => {
    const memo = {
        'Are you comfortable working onsite in Loughborough 3 days per week?': 'Yes',
    };
    const plan = buildDraftAllApplyPlan({
        fields: [LOUGHBOROUGH_FIELD],
        profileData: UK_PROFILE,
        questionMemo: memo,
    });

    assert.equal(plan.pendingFields.length, 0);
    assert.equal(plan.applyStages.length, 1);
    assert.equal(plan.applyStages[0].type, 'memo');

    const fieldsByRef = new Map([['f1', LOUGHBOROUGH_FIELD]]);
    const memoAnswers = plan.applyStages[0].answers.map(({ ref, label, answer, field_type }) => ({
        ref,
        label,
        answer,
        field_type,
    }));
    const { toApply, pending } = partitionDraftAllBatchAnswers(
        memoAnswers,
        fieldsByRef,
        UK_PROFILE,
        { trustSavedAnswers: true },
    );

    assert.equal(pending.length, 0);
    assert.equal(toApply.length, 1);
    assert.equal(toApply[0].answer, 'Yes');
});
