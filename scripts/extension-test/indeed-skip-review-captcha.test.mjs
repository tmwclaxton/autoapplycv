#!/usr/bin/env node
/**
 * Overnight Auto Apply must skip Indeed review CAPTCHA instead of pausing
 * the whole session (matches Glassdoor / SimplyHired).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(
    path.join(rootDir, 'extension/src/shared/auto-apply-orchestrator.js'),
    'utf8',
);

const processIndeedStart = source.indexOf('async function processIndeedJob');
assert.ok(processIndeedStart > 0, 'processIndeedJob must exist');
const processIndeedEnd = source.indexOf('async function processTotalJobsJob', processIndeedStart);
const processIndeed = source.slice(
    processIndeedStart,
    processIndeedEnd > processIndeedStart ? processIndeedEnd : processIndeedStart + 80_000,
);

assert.match(
    processIndeed,
    /captcha on review step - skipping job/,
    'Indeed review CAPTCHA must skip the job',
);
assert.doesNotMatch(
    processIndeed,
    /solve captcha on review step in the browser, then resume in Assist/,
    'Indeed must not pause overnight for review CAPTCHA',
);
assert.match(
    processIndeed,
    /reason:\s*'captcha_required'/,
    'Indeed CAPTCHA skip must use captcha_required reason',
);

console.log('indeed-skip-review-captcha tests passed.');
