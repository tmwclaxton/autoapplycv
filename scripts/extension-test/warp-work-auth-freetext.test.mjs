#!/usr/bin/env node
/**
 * Warp Greenhouse free-text "require work authorization?" for UK on US/Canada roles.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';
import {
    resolveRequireWorkAuthorizationFreeTextAnswer,
} from '../../extension/src/shared/pending-fields.js';

const UK_PROFILE = {
    country: 'United Kingdom',
    application_settings: {
        legally_authorized: 'yes',
        visa_sponsorship: 'no',
    },
};

test('UK on US/Canada Warp role answers Yes to require work authorization free-text', () => {
    const field = {
        ref: 'f10',
        label: 'do you require work authorization?',
        field_type: 'text',
        job_posting_location: 'Remote with US and Canada',
        required: true,
    };

    assert.equal(
        resolveRequireWorkAuthorizationFreeTextAnswer(field, UK_PROFILE),
        'Yes',
    );

    const plan = buildDraftAllApplyPlan({
        fields: [field],
        profileData: UK_PROFILE,
    });
    const preference = (plan.applyStages || []).find(
        (stage) => stage.type === 'preference',
    );

    assert.ok(preference);
    assert.equal(
        preference.answers.some(
            (answer) => answer.ref === 'f10' && answer.answer === 'Yes',
        ),
        true,
    );
    assert.equal(
        (plan.pendingFields || []).some((field) => field.ref === 'f10'),
        false,
    );
});

test('US profile on US/Canada role answers No', () => {
    assert.equal(
        resolveRequireWorkAuthorizationFreeTextAnswer(
            {
                label: 'do you require work authorization?',
                field_type: 'text',
                job_posting_location: 'Remote with US and Canada',
            },
            {
                country: 'United States',
                application_settings: { visa_sponsorship: 'no' },
            },
        ),
        'No',
    );
});
