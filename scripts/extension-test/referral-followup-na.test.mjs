#!/usr/bin/env node
/**
 * Real Ashby referral follow-ups that say "if no, type N/A" should auto-fill
 * N/A, and required unfilled fields must stay in the sidebar pending list.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHeuristicScreenerAnswer } from '../../extension/src/shared/auto-apply-screener-answer.js';
import {
    buildPendingFieldsFromUnfilledSnapshot,
    resolveReferralFollowUpNaAnswer,
    shouldPromptUserForMissingDraftAnswer,
} from '../../extension/src/shared/pending-fields.js';

test('referral follow-up instructing N/A resolves to N/A', () => {
    const field = {
        ref: 'referral',
        label: 'If you answered yes to any of the questions above, tell us who referred you. If you answered no, please type "N/A"',
        field_type: 'text',
        required: true,
    };

    assert.equal(resolveReferralFollowUpNaAnswer(field), 'N/A');
    assert.equal(
        resolveHeuristicScreenerAnswer(field, {
            country: 'United Kingdom',
        }),
        'N/A',
    );
});

test('required non-profile questions stay pending when unfilled', () => {
    const field = {
        ref: 'springboot',
        label: 'On a scale of 1-10 how would you rate your working knowledge of SpringBoot?',
        question:
            'On a scale of 1-10 how would you rate your working knowledge of SpringBoot?',
        field_type: 'text',
        required: true,
    };

    assert.equal(
        shouldPromptUserForMissingDraftAnswer(field, {
            country: 'United Kingdom',
        }),
        true,
    );

    const pending = buildPendingFieldsFromUnfilledSnapshot(
        [field],
        { country: 'United Kingdom' },
        [],
    );

    assert.equal(pending.length, 1);
    assert.equal(pending[0].ref, 'springboot');
});
