#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    appendAutoApplyLog,
    createInitialSession,
    pauseAutoApplyForInput,
} from '../../extension/src/shared/auto-apply-session.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    buildAutoApplyInterventionSummary,
    buildAutoApplyPreflightLines,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-intervention.js')).href);
const {
    AUTO_APPLY_OUTCOME,
    appendAutoApplyJobOutcome,
    resolveStructuredJobProcessOutcome,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/auto-apply-outcomes.js')).href);

const preflight = buildAutoApplyPreflightLines(
    {
        profile: {
            full_name: 'Test User',
            email: 'test@example.com',
            city: 'London',
        },
    },
    {
        platform: 'linkedin',
        roleDescription: 'software engineer',
        maxApplications: 5,
        fitCheckEnabled: true,
        minFitScore: 10,
        timingLevel: 5,
    },
);

assert(preflight.some((line) => line.includes('Test User')));
assert(preflight.some((line) => line.includes('Careful timing')));
assert(preflight.some((line) => line.includes('does not prevent platform detection')));

let session = createInitialSession({
    platform: 'linkedin',
    roleDescription: 'engineer',
    maxApplications: 3,
});

const runningSummary = buildAutoApplyInterventionSummary(session);

assert.equal(runningSummary?.headline, 'Running');
assert.match(runningSummary?.nextAction || '', /Draft All fills fields/i);

session = pauseAutoApplyForInput(session, {
    job: { jobId: '1', title: 'Engineer', company: 'Acme' },
    stepFingerprint: 'captcha',
    tabId: 1,
    blockerField: null,
    clarifyingQuestion: 'Solve captcha',
    questionText: 'Solve captcha',
    resumeAt: 'captcha_review',
    captcha: true,
});

const captchaSummary = buildAutoApplyInterventionSummary(session);

assert.equal(captchaSummary?.headline, 'Paused on Engineer');
assert.match(captchaSummary?.nextAction || '', /security check/i);

const structured = resolveStructuredJobProcessOutcome({
    outcome: 'skipped',
    reason: 'empty_shell',
});

assert.equal(structured.outcome, AUTO_APPLY_OUTCOME.SKIPPED_EMPTY_SHELL);

session = appendAutoApplyJobOutcome(session, {
    jobId: '1',
    title: 'Engineer',
    company: 'Acme',
    outcome: structured.outcome,
    reason: structured.reason,
});

assert.equal(session.jobOutcomes?.length, 1);

session = appendAutoApplyLog(session, 'info', '[paused] captcha on Engineer');

console.log('auto-apply intervention tests passed');
