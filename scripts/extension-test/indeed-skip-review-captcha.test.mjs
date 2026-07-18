#!/usr/bin/env node
/**
 * Auto Apply must PAUSE (alert + resume) on Indeed review CAPTCHA.
 * Do not immediately skip the job so overnight runs ignore security checks.
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
    /solve captcha on review step in the browser, then resume in Assist/,
    'Indeed review CAPTCHA must pause for user help',
);
assert.match(
    processIndeed,
    /waitForIndeedCaptchaResume/,
    'Indeed review CAPTCHA must wait for resume after pause',
);
assert.doesNotMatch(
    processIndeed,
    /captcha on review step - skipping job/,
    'Indeed must not immediately skip review CAPTCHA without pausing',
);

const processGlassdoorStart = source.indexOf('async function processGlassdoorJob');
assert.ok(processGlassdoorStart > 0, 'processGlassdoorJob must exist');
const processGlassdoorEnd = source.indexOf('async function process', processGlassdoorStart + 1);
const processGlassdoor = source.slice(
    processGlassdoorStart,
    processGlassdoorEnd > processGlassdoorStart ? processGlassdoorEnd : processGlassdoorStart + 80_000,
);

assert.match(
    processGlassdoor,
    /captchaPresent[\s\S]*?waitForIndeedCaptchaResume[\s\S]*?stage:\s*'review'/,
    'Glassdoor review CAPTCHA must pause via waitForIndeedCaptchaResume',
);
assert.doesNotMatch(
    processGlassdoor,
    /captcha on review step - skipping job/,
    'Glassdoor must not immediately skip review CAPTCHA without pausing',
);

console.log('indeed-skip-review-captcha tests passed (pause-not-skip).');
