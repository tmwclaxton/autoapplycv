#!/usr/bin/env node
/**
 * Truncated profile city "Wycombe" must expand to High Wycombe for ATS city fields.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    enrichLocationCityPrefix,
    expandTruncatedUkCityName,
    resolveResidenceCityValue,
} from '../../extension/src/shared/pending-fields.js';

test('expandTruncatedUkCityName upgrades bare Wycombe for UK profiles', () => {
    assert.equal(
        expandTruncatedUkCityName('Wycombe', {
            location: 'Wycombe, England',
            country: 'United Kingdom',
            postcode: 'HP12 3AB',
        }),
        'High Wycombe',
    );
    assert.equal(expandTruncatedUkCityName('High Wycombe', {}), 'High Wycombe');
    assert.equal(expandTruncatedUkCityName('London', {}), 'London');
});

test('resolveResidenceCityValue returns High Wycombe when city is truncated', () => {
    const profileData = {
        city: 'Wycombe',
        location: 'Wycombe, England',
        country: 'United Kingdom',
        postcode: 'HP12 3AB',
    };

    assert.equal(resolveResidenceCityValue(profileData), 'High Wycombe');
});

test('enrichLocationCityPrefix rewrites Wycombe, England to High Wycombe', () => {
    assert.equal(
        enrichLocationCityPrefix('Wycombe, England', 'High Wycombe'),
        'High Wycombe, England',
    );
    assert.equal(
        enrichLocationCityPrefix('Wycombe, England', 'Wycombe'),
        'High Wycombe, England',
    );
    assert.equal(
        enrichLocationCityPrefix('Wycombe, England', ''),
        'High Wycombe, England',
    );
});
