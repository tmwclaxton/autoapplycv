#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(
    path.join(rootDir, 'extension/src/content/totaljobs-auto-apply.js'),
    'utf8',
);
const orchestratorSource = readFileSync(
    path.join(rootDir, 'extension/src/shared/auto-apply-orchestrator.js'),
    'utf8',
);

assert.match(
    source,
    /if \(!verify\.submitted\) \{\s*return \{\s*success: false,\s*action: 'blocked'/,
    'TotalJobs must block when Submit does not produce confirmation',
);
assert.match(
    source,
    /error: 'Totaljobs Submit click did not confirm an application\.'/,
    'TotalJobs must expose an explicit unconfirmed-submit error',
);
assert.match(
    source,
    /submitted: true,\s*transitioned: true/,
    'TotalJobs must only report submission after confirmation',
);
assert.match(
    orchestratorSource,
    /if \(advanceResponse\?\.submitted\) \{\s*const submitVerification = await sendTotalJobsMessage\([\s\S]*?TOTALJOBS_VERIFY_SUBMITTED/,
    'TotalJobs orchestrator must verify submitted responses before recording success',
);

console.log('totaljobs-submit-confirmation.test.mjs: ok');
