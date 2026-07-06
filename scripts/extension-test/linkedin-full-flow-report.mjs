#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
    assertFullFlowReportSuccess,
    buildFullFlowReport,
    parseSessionLogToJobs,
} from '../extension-e2e/lib/linkedin-full-flow-report.mjs';

const sampleSession = {
    status: 'completed',
    roleDescription: 'software engineer',
    maxApplications: 3,
    startedAt: '2026-07-06T10:00:00.000Z',
    finishedAt: '2026-07-06T10:15:00.000Z',
    fieldsFilledCount: 12,
    stats: {
        found: 8,
        applied: 2,
        skipped: 1,
        errors: 0,
        draftAllRuns: 6,
        stepsAdvanced: 4,
    },
    queue: [
        { jobId: '1', title: 'Backend Engineer', company: 'Acme' },
        { jobId: '2', title: 'Platform Engineer', company: 'Beta' },
    ],
    log: [
        { level: 'info', message: '[fill] Backend Engineer step 1: Contact info' },
        { level: 'info', message: '[fill] Backend Engineer step 2: Resume' },
        { level: 'success', message: '[submitted] Backend Engineer at Acme.' },
        { level: 'info', message: '[fill] Platform Engineer step 1: Contact info' },
        { level: 'success', message: 'Applied to Platform Engineer at Beta.' },
    ],
};

const jobs = parseSessionLogToJobs(sampleSession.log, sampleSession.queue);
assert.equal(jobs.length, 2);
assert.equal(jobs[0].submitted, true);
assert.equal(jobs[0].steps.length, 2);
assert.equal(jobs[1].submitted, true);

const report = buildFullFlowReport(sampleSession, {
    api_connected: true,
    max_jobs: 3,
});
assert.equal(report.applied, 2);
assert.equal(report.steps_advanced_total, 4);
assert.equal(report.draft_all_runs, 6);
assert.equal(report.fields_filled_total, 12);
assert.equal(report.jobs.length, 2);

assertFullFlowReportSuccess(report);

const failingReport = buildFullFlowReport({
    ...sampleSession,
    stats: { ...sampleSession.stats, applied: 0, stepsAdvanced: 0 },
});
let threw = false;

try {
    assertFullFlowReportSuccess(failingReport);
} catch {
    threw = true;
}

assert.equal(threw, true, 'expected failing report to throw');

console.log('ok - linkedin full-flow report parser');
