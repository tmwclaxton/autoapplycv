#!/usr/bin/env node
/**
 * Live Warp Greenhouse regression: UK profile must answer No on US/Canada
 * based-in + permanent auth, pend free-text work-auth, and decline Hispanic EEO.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    partitionEeoDeclineFields,
    partitionPreferenceProfileFields,
} from '../../extension/src/shared/pending-fields.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const expected = JSON.parse(
    readFileSync(
        join(
            ROOT,
            'tests/fixtures/form-extraction/expected/live-greenhouse-warp-work-auth-20260719.json',
        ),
        'utf8',
    ),
);

const ukProfile = {
    country: 'United Kingdom',
    application_settings: {
        legally_authorized: 'yes',
        visa_sponsorship: 'no',
        willing_to_relocate: 'yes',
    },
};

function fieldsFromExpected() {
    return (expected.fields || []).map((field, index) => ({
        ref: `f${index}`,
        id: index,
        label: field.question,
        question: field.question,
        field_type: field.field_type,
        options: field.options ?? [],
        required: field.required,
        dom: field.dom || null,
        job_posting_location: 'Remote with US and Canada',
    }));
}

test('Warp UK profile preferences: based-in No, permanent auth No, free-text pending', () => {
    const fields = fieldsFromExpected();
    const basedIn = fields.find((field) =>
        /based in the u\.s\. or canada/i.test(field.label),
    );
    const permanentAuth = fields.find((field) =>
        /permanent authorization to work/i.test(field.label),
    );
    const requireAuth = fields.find((field) =>
        /require work authorization/i.test(field.label),
    );

    assert.ok(basedIn);
    assert.ok(permanentAuth);
    assert.ok(requireAuth);

    const { preferenceAnswers, pendingFields, remainingFields } =
        partitionPreferenceProfileFields(
            [basedIn, permanentAuth, requireAuth],
            ukProfile,
        );

    const byRef = Object.fromEntries(
        preferenceAnswers.map((answer) => [answer.ref, answer.answer]),
    );

    assert.equal(byRef[basedIn.ref], 'No');
    assert.equal(byRef[permanentAuth.ref], 'No');
    assert.equal(
        pendingFields.some((field) => field.ref === requireAuth.ref),
        true,
    );
    assert.equal(
        remainingFields.some((field) => field.ref === requireAuth.ref),
        false,
    );
});

test('Warp Hispanic/Latino EEO takes Decline To Self Identify', () => {
    const fields = fieldsFromExpected();
    const hispanic = fields.find((field) =>
        /hispanic\/latino/i.test(field.label),
    );

    assert.ok(hispanic);

    const { eeoAnswers, remainingFields } = partitionEeoDeclineFields([
        hispanic,
    ]);

    assert.equal(remainingFields.length, 0);
    assert.equal(eeoAnswers.length, 1);
    assert.equal(eeoAnswers[0].answer, 'Decline To Self Identify');
});
