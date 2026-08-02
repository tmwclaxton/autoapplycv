#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const orchestratorSource = readFileSync(
    join(ROOT, 'extension/src/shared/auto-apply-orchestrator.js'),
    'utf8',
);
const contentSource = readFileSync(
    join(ROOT, 'extension/src/content/index.js'),
    'utf8',
);

const linkedInJobBody = orchestratorSource.match(
    /async function processLinkedInJob\([\s\S]*?^}/m,
)?.[0] || '';

assert(
    linkedInJobBody.includes(': await runDraftAllForStep('),
    'LinkedIn job flow should call runDraftAllForStep',
);

assert(
    !linkedInJobBody.includes('LINKEDIN_PREFILL_CONTACT'),
    'LinkedIn orchestrator must not prefill contact outside Draft All',
);

assert(
    !linkedInJobBody.includes('LINKEDIN_PREFILL_EASY_APPLY'),
    'LinkedIn orchestrator must not prefill Easy Apply outside Draft All',
);

assert(
    !linkedInJobBody.includes('LINKEDIN_FILL_AND_ADVANCE'),
    'LinkedIn advance must navigate only (no fill-and-advance)',
);

assert(
    !/if \(isReviewStep \|\| isResumeStep\) \{[\s\S]*?\} else \{[\s\S]*?runDraftAllForStep/.test(
        linkedInJobBody,
    ),
    'Draft All should not be in an else branch that skips review/resume steps',
);

assert.match(
    linkedInJobBody,
    /if \(isReviewStep\) \{[\s\S]*?waitForReviewBeforeSubmitIfNeeded/,
    'review steps should pause before submit when configured',
);

assert.match(
    linkedInJobBody,
    /if \(!isResumeStep && !isReviewStep\) \{[\s\S]*?ensureStepFilledOrPaused/,
    'question steps should verify Draft All gaps before advancing',
);

assert.match(
    linkedInJobBody,
    /if \(pauseOutcome\.paused\) \{[\s\S]*?continue;/,
    'paused question steps should rerun after resume before advancing',
);

assert(
    !/advanceResponse\?\.action === 'submit' \|\| isReviewStep/.test(linkedInJobBody),
    'review steps with a Next button should not be treated as submit attempts',
);

assert(
    !contentSource.includes('LINKEDIN_PREFILL_CONTACT'),
    'content script must not expose LinkedIn prefill contact message',
);

assert(
    !contentSource.includes('LINKEDIN_FILL_AND_ADVANCE'),
    'content script must not expose LinkedIn fill-and-advance message',
);

assert(
    orchestratorSource.includes('LINKEDIN_ENSURE_RESUME_STEP'),
    'LinkedIn resume selection should run before Draft All on resume steps',
);

assert(
    !orchestratorSource.includes('advanceType'),
    'LinkedIn advance helper must not reference removed advanceType variable',
);

const openEasyApplyTimeoutMs = Number(
    orchestratorSource.match(
        /LINKEDIN_OPEN_EASY_APPLY:\s*([\d_]+)/,
    )?.[1]?.replaceAll('_', ''),
);

assert(
    openEasyApplyTimeoutMs > 0 && openEasyApplyTimeoutMs <= 10_000,
    'LinkedIn Easy Apply navigation must recover before a click looks hung',
);

assert.match(
    orchestratorSource,
    /hasHydratedEasyApplyJob[\s\S]*?job\?\.easyApply === true[\s\S]*?job\?\.jobId \|\| ''\) !== 'search'[\s\S]*?if \(hasHydratedEasyApplyJob\)/,
    'LinkedIn collection must wait for a real hydrated Easy Apply card',
);

console.log('auto-apply linkedin draft step tests passed');
