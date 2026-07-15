#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const {
    LINKEDIN_EMPTY_SHELL_FAIL_FAST_MS,
    LINKEDIN_EMPTY_SHELL_RECOVERY_WAIT_MS,
    LINKEDIN_STEP_READY_TIMEOUT_MS,
    linkedInModalHasFillableContent,
    linkedInStepDidAdvance,
    readLinkedInStableStepKey,
} = await import(pathToFileURL(join(ROOT, 'extension/src/shared/linkedin-step-readiness.js')).href);

const linkedInContent = readFileSync(
    join(ROOT, 'extension/src/content/linkedin-auto-apply.js'),
    'utf8',
);

assert.equal(LINKEDIN_STEP_READY_TIMEOUT_MS, 20_000);
assert.equal(LINKEDIN_EMPTY_SHELL_FAIL_FAST_MS, 6_000);
assert.equal(LINKEDIN_EMPTY_SHELL_RECOVERY_WAIT_MS, 12_000);

assert(
    linkedInContent.includes('LINKEDIN_EMPTY_SHELL_FAIL_FAST_MS'),
    'linkedin-auto-apply.js should use shared empty-shell fail-fast constant',
);

assert(
    linkedInModalHasFillableContent({
        open: true,
        stepFingerprint: 'resume:1',
        fieldCount: 0,
    }),
    'resume fingerprint should count as fillable',
);

assert(
    !linkedInModalHasFillableContent({
        open: true,
        stepFingerprint: 'loader',
        fieldCount: 0,
        canContinue: true,
        hasContent: false,
    }),
    'empty loader shell should not count as fillable',
);

assert.equal(
    readLinkedInStableStepKey({
        stepLabel: 'Resume',
        stepFingerprint: 'Resume|3|Step 2 of 4|next|Next|resume:1',
    }),
    'resume:1',
);

assert.equal(
    readLinkedInStableStepKey({
        stepLabel: 'Resume',
        stepFingerprint: 'Resume|3||next|Next|resume:1',
    }),
    'resume:1',
    'progress loader text must not change stable resume key',
);

assert.equal(
    linkedInStepDidAdvance(
        {
            stepLabel: 'Resume',
            stepFingerprint: 'Resume|3||next|Next|resume:1',
        },
        {
            stepLabel: 'Resume',
            stepFingerprint: 'Resume|3|Step 2 of 4|next|Next|resume:1',
        },
    ),
    false,
    'fingerprint-only noise must not count as step advance',
);

assert.equal(
    linkedInStepDidAdvance(
        {
            stepLabel: 'Resume',
            stepFingerprint: 'Resume|3||next|Next|resume:1',
        },
        {
            stepLabel: 'Additional Questions',
            stepFingerprint: 'Additional Questions|6||next|Next|resume:',
        },
    ),
    true,
);

console.log('linkedin step readiness tests passed');
