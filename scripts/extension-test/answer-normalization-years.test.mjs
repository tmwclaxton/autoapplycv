#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { normalizeFieldAnswerForQuestion } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/answer-normalization.js')).href
);

const skillLabel = 'How many years of work experience do you have with C++?';
const totalLabel = 'How many years of experience do you have in total?';

assert.equal(
    normalizeFieldAnswerForQuestion(skillLabel, '', { profileYears: '2' }),
    '',
    'skill-specific years must not fall back to profile total years',
);

assert.equal(
    normalizeFieldAnswerForQuestion(skillLabel, '4 years', { profileYears: '2' }),
    '4',
);

assert.equal(
    normalizeFieldAnswerForQuestion(totalLabel, '', { profileYears: '2' }),
    '2',
    'generic total years may use profile years when LLM answer is empty',
);

console.log('answer-normalization-years tests passed');
