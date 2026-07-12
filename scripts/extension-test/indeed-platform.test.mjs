#!/usr/bin/env node
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildIndeedJobSearchUrl } from '../../extension/src/shared/indeed-platform.js';

describe('indeed-platform market override', () => {
    it('buildIndeedJobSearchUrl uses www.indeed.com for San Jose auto market', () => {
        const url = buildIndeedJobSearchUrl('Scientist', {
            filters: { location: 'San Jose CA USA' },
        });

        assert.match(url, /www\.indeed\.com/);
        assert.match(url, /l=San\+Jose/);
    });

    it('buildIndeedJobSearchUrl honors explicit US market with empty location', () => {
        const url = buildIndeedJobSearchUrl('Scientist', {
            filters: { market: 'us' },
        });

        assert.match(url, /www\.indeed\.com/);
    });

    it('buildIndeedJobSearchUrl honors explicit UK override over US-looking location', () => {
        const url = buildIndeedJobSearchUrl('software engineer', {
            filters: { location: 'San Jose CA USA', market: 'uk' },
        });

        assert.match(url, /uk\.indeed\.com/);
    });
});
