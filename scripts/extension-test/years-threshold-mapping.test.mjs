#!/usr/bin/env node
/**
 * 2.25.367 maps "Do you have 5+ years…?" Yes/No gates to years_of_experience.
 * Age gates ("over 18 years of age") share the threshold syntax and must not.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProfileMappingForLabel } from '../../extension/src/shared/pending-fields.js';

test('years-experience threshold gates map to YOE', () => {
    for (const label of [
        'Do you have 5+ years of experience with Python?',
        'Do you have at least 3 years of commercial experience?',
    ]) {
        assert.equal(
            resolveProfileMappingForLabel(label)?.path,
            'application_settings.years_of_experience',
            label,
        );
    }
});

test('age gates are not mapped to YOE', () => {
    for (const label of [
        'Are you over 18 years of age?',
        'Are you at least 18 years old?',
    ]) {
        assert.notEqual(
            resolveProfileMappingForLabel(label)?.path,
            'application_settings.years_of_experience',
            label,
        );
    }
});
