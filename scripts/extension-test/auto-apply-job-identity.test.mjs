#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    canonicalJobFingerprint,
    sessionHasAppliedFingerprint,
} = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-job-identity.js')).href
);
const { AUTO_APPLY_OUTCOME } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-outcomes.js')).href
);

test('canonicalJobFingerprint prefers platform + jobId', () => {
    assert.equal(
        canonicalJobFingerprint('reed', {
            jobId: '99',
            url: 'https://www.reed.co.uk/jobs/example/99',
            title: 'Dev',
            company: 'Acme',
        }),
        'reed|id:99',
    );
});

test('canonicalJobFingerprint uses normalized url then title|company', () => {
    assert.equal(
        canonicalJobFingerprint('totaljobs', {
            url: 'https://www.totaljobs.com/job/example?foo=1#x',
        }),
        'totaljobs|url:/job/example',
    );
    assert.equal(
        canonicalJobFingerprint('indeed', {
            title: 'Nurse',
            company: 'NHS',
        }),
        'indeed|meta:nurse|nhs',
    );
});

test('sessionHasAppliedFingerprint matches applied and already_applied only', () => {
    const fingerprint = 'glassdoor|id:42';
    const session = {
        jobOutcomes: [
            {
                fingerprint,
                outcome: AUTO_APPLY_OUTCOME.SKIPPED_EXTERNAL,
            },
            {
                fingerprint: 'glassdoor|id:99',
                outcome: AUTO_APPLY_OUTCOME.APPLIED,
            },
        ],
    };

    assert.equal(sessionHasAppliedFingerprint(session, fingerprint), false);
    assert.equal(sessionHasAppliedFingerprint(session, 'glassdoor|id:99'), true);

    session.jobOutcomes.push({
        fingerprint,
        outcome: AUTO_APPLY_OUTCOME.SKIPPED_ALREADY_APPLIED,
    });
    assert.equal(sessionHasAppliedFingerprint(session, fingerprint), true);
});
