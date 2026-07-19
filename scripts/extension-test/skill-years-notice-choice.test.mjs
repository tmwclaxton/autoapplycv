#!/usr/bin/env node
/**
 * Skill-scoped years must not inherit total YOE; notice radios map weeks → days.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    mapNoticePeriodAnswerToChoiceOption,
    normalizeNoticePeriodAnswer,
    parseNoticePeriodToDays,
} from '../../extension/src/shared/answer-normalization.js';
import { resolveHeuristicScreenerAnswer } from '../../extension/src/shared/auto-apply-screener-answer.js';
import { buildDraftAllApplyPlan } from '../../extension/src/shared/draft-all/pipeline.js';
import {
    isGenericTotalExperienceQuestionLabel,
    isSkillSpecificYearsExperienceQuestionLabel,
    resolveServingNoticeFollowUpAnswer,
} from '../../extension/src/shared/pending-fields.js';

const PROFILE = {
    full_name: 'Toby Claxton',
    application_settings: {
        years_of_experience: 2,
        notice_period: '2 weeks',
    },
};

test('years of experience in figma is skill-specific, not total YOE', () => {
    const label = 'years of experience in figma';

    assert.equal(isSkillSpecificYearsExperienceQuestionLabel(label), true);
    assert.equal(isGenericTotalExperienceQuestionLabel(label), false);
    assert.equal(
        resolveHeuristicScreenerAnswer(
            { label, field_type: 'number' },
            PROFILE,
        ),
        null,
    );
});

test('total years of experience still uses profile YOE', () => {
    const label = 'total years of experience';

    assert.equal(isGenericTotalExperienceQuestionLabel(label), true);
    assert.equal(isSkillSpecificYearsExperienceQuestionLabel(label), false);
    assert.equal(
        resolveHeuristicScreenerAnswer(
            { label, field_type: 'number' },
            PROFILE,
        ),
        '2',
    );
});

test('2 weeks maps to closest day radio option', () => {
    assert.equal(parseNoticePeriodToDays('2 weeks'), 14);
    assert.equal(
        mapNoticePeriodAnswerToChoiceOption('2 weeks', [
            'Immediately Available',
            '30 Days',
            '45 Days',
            '60 Days',
            '90 Days',
            'Currently Serving Notice',
        ]),
        '30 Days',
    );
    assert.equal(
        normalizeNoticePeriodAnswer(
            'what is your official notice period?',
            '2 weeks',
            {
                fieldType: 'radio',
                options: [
                    'Immediately Available',
                    '30 Days',
                    '45 Days',
                    '60 Days',
                    '90 Days',
                    'Currently Serving Notice',
                ],
            },
        ),
        '30 Days',
    );
});

test('serving notice follow-up answers No, not a career essay', () => {
    const field = {
        label: 'are you currently serving the notice? if yes, how soon can you join?',
        field_type: 'text',
    };

    assert.equal(resolveServingNoticeFollowUpAnswer(field), 'No');
    assert.equal(resolveHeuristicScreenerAnswer(field, PROFILE), 'No');
});

test('Draft All plan clears skill years and maps notice radio', () => {
    const plan = buildDraftAllApplyPlan({
        fields: [
            {
                ref: 'f17',
                label: 'what is your official notice period?',
                field_type: 'radio',
                options: [
                    'Immediately Available',
                    '30 Days',
                    '45 Days',
                    '60 Days',
                    '90 Days',
                    'Currently Serving Notice',
                ],
            },
            {
                ref: 'f18',
                label: 'are you currently serving the notice? if yes, how soon can you join?',
                field_type: 'text',
            },
            {
                ref: 'f20',
                label: 'years of experience in figma',
                field_type: 'number',
            },
            {
                ref: 'f19',
                label: 'total years of experience',
                field_type: 'number',
            },
        ],
        profileData: PROFILE,
    });

    const staged = (plan.applyStages || []).flatMap((stage) => stage.answers || []);
    const byRef = Object.fromEntries(
        staged.map((answer) => [answer.ref, String(answer.answer)]),
    );

    assert.equal(byRef.f17, '30 Days');
    assert.equal(byRef.f18, 'No');
    assert.equal(byRef.f19, '2');
    assert.equal(byRef.f20, '__CLEAR__');
    assert.ok(!(plan.llmFields || []).some((field) => field.ref === 'f20'));
});
