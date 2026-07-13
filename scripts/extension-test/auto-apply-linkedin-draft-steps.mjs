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

const linkedInJobBody = orchestratorSource.match(
    /async function processLinkedInJob\([\s\S]*?^}/m,
)?.[0] || '';

assert(
    linkedInJobBody.includes('draftResult = await runDraftAllForStep('),
    'LinkedIn job flow should call runDraftAllForStep',
);

assert(
    !/if \(isReviewStep \|\| isResumeStep\) \{[\s\S]*?\} else \{[\s\S]*?runDraftAllForStep/.test(
        linkedInJobBody,
    ),
    'Draft All should not be in an else branch that skips review/resume steps',
);

assert.match(
    linkedInJobBody,
    /if \(isReviewStep \|\| isResumeStep\) \{[\s\S]*?LINKEDIN_PREFILL_EASY_APPLY[\s\S]*?\}\s*await sleep\(randomDelay\(AUTO_APPLY_DELAY_MS\.beforeDraftAll[\s\S]*?draftResult = await runDraftAllForStep/,
    'resume/review prefill should run before Draft All',
);

assert(
    /if \(!isResumeStep\) \{[\s\S]*?ensureStepFilledOrPaused/.test(
        linkedInJobBody,
    ),
    'review steps should run ensureStepFilledOrPaused before submit',
);

assert.match(
    linkedInJobBody,
    /ensureStepFilledOrPaused\([\s\S]*?\{ useStoredPending: !isReviewStep \}/,
    'review gap detection should ignore stale stored pending fields',
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

console.log('auto-apply linkedin draft step tests passed');
