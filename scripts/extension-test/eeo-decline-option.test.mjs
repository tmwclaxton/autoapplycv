#!/usr/bin/env node
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    partitionEeoDeclineFields,
    resolveEeoDeclineOption,
} from '../../extension/src/shared/pending-fields.js';

test('resolveEeoDeclineOption matches I don\'t wish to answer', () => {
    const field = {
        label: 'Veteran Status',
        options: [
            'I am not a protected veteran',
            'I identify as one or more of the classifications of a protected veteran',
            "I don't wish to answer",
        ],
    };

    assert.equal(resolveEeoDeclineOption(field), "I don't wish to answer");
});

test('resolveEeoDeclineOption matches Decline To Self Identify with spaces', () => {
    const field = {
        label: 'gender',
        options: ['Male', 'Female', 'Decline To Self Identify'],
    };

    assert.equal(resolveEeoDeclineOption(field), 'Decline To Self Identify');
});

test('partitionEeoDeclineFields auto-answers veteran and disability declines', () => {
    const { eeoAnswers, remainingFields } = partitionEeoDeclineFields([
        {
            ref: 'f15',
            label: 'veteran status',
            field_type: 'select',
            options: [
                'I am not a protected veteran',
                "I don't wish to answer",
            ],
        },
        {
            ref: 'f16',
            label: 'disability status',
            field_type: 'select',
            options: [
                'Yes, I have a disability, or have had one in the past',
                'I do not want to answer',
            ],
        },
        {
            ref: 'f11',
            label: 'how did you hear about us?',
            field_type: 'select',
            options: ['LinkedIn', 'Indeed'],
        },
    ]);

    assert.equal(remainingFields.length, 1);
    assert.equal(remainingFields[0].ref, 'f11');
    assert.equal(eeoAnswers.length, 2);
    assert.equal(eeoAnswers[0].answer, "I don't wish to answer");
    assert.equal(eeoAnswers[1].answer, 'I do not want to answer');
});
