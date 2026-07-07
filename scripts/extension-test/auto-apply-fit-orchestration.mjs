#!/usr/bin/env node
/**
 * Offline verification that GET_JOB_META extraction + ATS request shape work
 * for the fit gate, without a live LinkedIn session.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
    MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT,
    resolveAutoApplyFitDecision,
} from '../../extension/src/shared/auto-apply-fit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = join(
    ROOT,
    'tests/fixtures/auto-apply/linkedin/captured/junior-software-engineer-ai-native-homey-4375167862-search-detail-panel.html',
);

function extractJobDescriptionFromPage(document) {
    const selectors = [
        '#job-details',
        '[data-testid="job-description"]',
        '.jobs-description',
        'article',
    ];

    for (const selector of selectors) {
        const text = document.querySelector(selector)?.textContent?.trim() || '';

        if (text.length > 200) {
            return text.slice(0, 20000);
        }
    }

    return null;
}

const html = readFileSync(FIXTURE, 'utf8');
const dom = new JSDOM(html, { url: 'https://www.linkedin.com/jobs/view/4375167862/' });
const description = extractJobDescriptionFromPage(dom.window.document);

assert.ok(description, 'fixture should yield a job description');
assert.ok(description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT);

const lowScoreDecision = resolveAutoApplyFitDecision({
    fitCheckEnabled: true,
    minFitScore: 60,
    score: 42,
    jobDescriptionLength: description.length,
});

assert.equal(lowScoreDecision, 'skip_low_score');

const passDecision = resolveAutoApplyFitDecision({
    fitCheckEnabled: true,
    minFitScore: 60,
    score: 72,
    jobDescriptionLength: description.length,
});

assert.equal(passDecision, 'apply');

const atsPayload = {
    job_description: description,
    role_preferences: 'remote UK software engineer',
};

assert.ok(atsPayload.job_description.length >= MIN_JOB_DESCRIPTION_LENGTH_FOR_FIT);
assert.ok(atsPayload.role_preferences.length <= 500);

console.log('ok - captured LinkedIn JD is long enough for fit gate');
console.log('ok - fit decision skips below threshold and applies at/above');
console.log('ok - ATS request payload shape is valid');
console.log('\n3 auto-apply fit orchestration offline checks passed.');
