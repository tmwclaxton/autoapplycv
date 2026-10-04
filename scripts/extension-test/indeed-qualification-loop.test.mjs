#!/usr/bin/env node
/**
 * Information Tech Consultants (jk=8b89911a330b28c9) on 2.25.369: Indeed sent
 * the run back to the start after its qualification check three times
 * (questions -> intervention -> supporting-info -> resume-selection ->
 * questions ...), then the flow exited and Auto Apply reported "Could not
 * submit Indeed Apply application." The loop must be detected and skipped
 * with a clear reason instead.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    INDEED_STEP_REVISIT_LIMIT,
    isIndeedQualificationGateStep,
    recordIndeedStepVisit,
} from '../../extension/src/shared/indeed-platform.js';

function replay(steps) {
    const visits = new Map();
    let previous = null;

    for (const [index, step] of steps.entries()) {
        const visit = recordIndeedStepVisit(visits, step, previous);
        previous = step;

        if (visit.looping) {
            return { loopedAt: index, step, visits: visit.visits };
        }
    }

    return null;
}

test('the Information Tech Consultants restart loop is caught on the third questions visit', () => {
    const steps = [
        'questions-module/questions/1',
        'questions-module/intervention',
        'questions-module/supporting-info',
        'resume-selection-module/resume-selection',
        'questions-module/questions/1',
        'questions-module/intervention',
        'questions-module/supporting-info',
        '/beta/indeedapply/applybyapplyablejobid',
        'questions-module/questions/1',
        'questions-module/intervention',
    ];
    const result = replay(steps);

    assert.equal(INDEED_STEP_REVISIT_LIMIT, 3);
    assert.ok(result, 'loop should be detected');
    assert.equal(result.step, 'questions-module/questions/1');
    assert.equal(result.loopedAt, 8);
    assert.equal(result.visits, 3);
});

test('polling the same step (validation retries) is not a loop', () => {
    const steps = [
        'contact-info-module',
        'resume-selection-module/resume-selection',
        'questions-module/questions/1',
        'questions-module/questions/1',
        'questions-module/questions/1',
        'questions-module/questions/1',
        'questions-module/questions/2',
        'review-module',
    ];

    assert.equal(replay(steps), null);
});

test('one contact-info detour that replays the flow once is not a loop', () => {
    const steps = [
        'resume-selection-module/resume-selection',
        'questions-module/questions/1',
        'contact-info-module',
        'resume-selection-module/resume-selection',
        'questions-module/questions/1',
        'review-module',
    ];

    assert.equal(replay(steps), null);
});

test('qualification gate steps are recognised', () => {
    assert.equal(isIndeedQualificationGateStep('questions-module/intervention'), true);
    assert.equal(isIndeedQualificationGateStep('questions-module/supporting-info'), true);
    assert.equal(isIndeedQualificationGateStep('questions-module/questions/1'), false);
});

test('processIndeedJob skips the job on a restart loop instead of throwing', () => {
    const orchestrator = readFileSync('extension/src/shared/auto-apply-orchestrator.js', 'utf8');
    const block = orchestrator.match(
        /async function processIndeedJob\([\s\S]*?^async function processTotalJobsJob/m,
    )?.[0];

    assert.ok(block);
    assert.match(block, /recordIndeedStepVisit\(\s*indeedStepVisits,/);
    assert.match(block, /reason: sawQualificationGate\s*\?\s*'indeed_qualification_loop'/);
});

test('after clicking Submit, an Indeed "Applied" marker outside SmartApply confirms the submit', () => {
    const orchestrator = readFileSync('extension/src/shared/auto-apply-orchestrator.js', 'utf8');
    const block = orchestrator.match(
        /async function processIndeedJob\([\s\S]*?^async function processTotalJobsJob/m,
    )?.[0];

    assert.match(block, /action === 'submit'\) \{\s*submitClicked = true;/);
    assert.match(block, /submitClicked && applyState\?\.alreadyApplied/);
    assert.match(block, /Clicked Submit on Indeed Apply but no confirmation appeared/);
});
