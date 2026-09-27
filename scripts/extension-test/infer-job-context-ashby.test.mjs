#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { tryInferJobContextFromPage } = await import(
    pathToFileURL(
        join(ROOT, 'extension/src/shared/draft-all-optimizations.js'),
    ).href
);

test('infers Magentic Ashby application job for ATS/Cover tabs', () => {
    const inferred = tryInferJobContextFromPage({
        page_url:
            'https://jobs.ashbyhq.com/magentic/13f5cf7d-2da6-49d8-85a8-72f6b215b81c/application',
        page_title: 'AI Product Engineer @ Magentic',
        page_text: 'Hybrid London role building AI products.',
    });

    assert.equal(inferred?.company, 'Magentic');
    assert.equal(inferred?.source, 'ashby');
    assert.match(inferred?.title || '', /AI Product Engineer/i);
    assert.ok(
        (inferred?.job_description || '').length >= 40,
        'Ashby application pages must still seed a usable description',
    );
});

test('infers Ashby company from URL when title is sparse', () => {
    const inferred = tryInferJobContextFromPage({
        page_url: 'https://jobs.ashbyhq.com/vega/368add16/application',
        page_title: 'Application',
        page_text: '',
    });

    assert.equal(inferred?.company, 'Vega');
    assert.equal(inferred?.source, 'ashby');
    assert.ok((inferred?.job_description || '').length >= 4);
});
