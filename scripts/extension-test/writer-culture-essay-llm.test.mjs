#!/usr/bin/env node
/**
 * WRITER Ashby culture-values essays must LLM-draft, not land in the sidebar
 * when NanoGPT returns null. Skill ratings (SpringBoot 1-10) stay pending.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildPendingFieldsFromUnfilledSnapshot,
    isApplicationSpecificQuestion,
    isOpenEndedQuestionLabel,
    isSkillRatingQuestionLabel,
    shouldPromptUserForMissingDraftAnswer,
} from '../../extension/src/shared/pending-fields.js';

const CULTURE_LABEL =
    'Please give an example from your professional experience that aligns with one or more of our cultural values:';
const WHY_WRITER_LABEL = 'Why are you interested in joining WRITER?';
const SPRING_LABEL =
    'On a scale of 1-10 how would you rate your working knowledge of SpringBoot?';

test('WRITER culture-values essay is open-ended application-specific', () => {
    assert.equal(isOpenEndedQuestionLabel(CULTURE_LABEL), true);
    assert.equal(
        isApplicationSpecificQuestion({
            label: CULTURE_LABEL,
            field_type: 'textarea',
            required: true,
        }),
        true,
    );
    assert.equal(isSkillRatingQuestionLabel(CULTURE_LABEL), false);
});

test('WRITER culture essay does not pending when LLM returns null', () => {
    const field = {
        ref: 'culture',
        label: CULTURE_LABEL,
        question: CULTURE_LABEL,
        field_type: 'textarea',
        required: true,
    };

    assert.equal(shouldPromptUserForMissingDraftAnswer(field, {}), false);
    assert.equal(
        buildPendingFieldsFromUnfilledSnapshot([field], {}, []).length,
        0,
    );
});

test('Why interested in joining WRITER stays out of sidebar', () => {
    const field = {
        ref: 'why',
        label: WHY_WRITER_LABEL,
        field_type: 'textarea',
        required: true,
        company: 'WRITER',
    };

    assert.equal(isApplicationSpecificQuestion(field), true);
    assert.equal(shouldPromptUserForMissingDraftAnswer(field, {}), false);
});

test('SpringBoot skill rating stays pending when required and unfilled', () => {
    const field = {
        ref: 'springboot',
        label: SPRING_LABEL,
        question: SPRING_LABEL,
        field_type: 'text',
        required: true,
    };

    assert.equal(isSkillRatingQuestionLabel(SPRING_LABEL), true);
    assert.equal(isOpenEndedQuestionLabel(SPRING_LABEL), false);
    assert.equal(shouldPromptUserForMissingDraftAnswer(field, {}), true);
    assert.equal(
        buildPendingFieldsFromUnfilledSnapshot([field], {}, []).length,
        1,
    );
});
