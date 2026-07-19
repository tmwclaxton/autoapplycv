#!/usr/bin/env node
/**
 * 11 bit Recruitee Warsaw hybrid Tak/Nie must decline for UK remotes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    resolveOfficeCommuteDeclineAnswer,
    resolvePreferenceProfileAnswer,
} from '../../extension/src/shared/pending-fields.js';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';

const LABEL =
    'to stanowisko wymaga pracy u nas w biurze w warszawie w modelu hybrydowym - 3 dni w biurze, 2 dni zdalnie. czy jest to dla ciebie w porządku?';

const UK_PROFILE = {
    country: 'United Kingdom',
    city: 'High Wycombe',
    location: 'High Wycombe, England',
};

test('UK profile answers Nie to Warsaw hybrid office Tak/Nie', () => {
    const field = {
        ref: 'f5',
        label: LABEL,
        field_type: 'radio',
        options: ['Tak', 'Nie'],
    };

    assert.equal(resolveOfficeCommuteDeclineAnswer(field, UK_PROFILE), 'Nie');
    assert.equal(resolvePreferenceProfileAnswer(field, UK_PROFILE), 'Nie');
});

test('Draft All applies Nie and does not leave Warsaw hybrid pending', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                ref: 'f5',
                label: LABEL,
                field_type: 'radio',
                options: ['Tak', 'Nie'],
            },
        ],
        profileData: UK_PROFILE,
    });
    const answers = (plan.applyStages || []).flatMap(
        (stage) => stage.answers || [],
    );

    assert.ok(
        answers.some(
            (answer) => answer.ref === 'f5' && answer.answer === 'Nie',
        ),
        `expected Nie, got ${JSON.stringify(answers)}`,
    );
    assert.equal(
        (plan.pendingFields || []).some((field) => field.ref === 'f5'),
        false,
    );
});
