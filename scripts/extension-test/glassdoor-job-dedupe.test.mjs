#!/usr/bin/env node
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { canonicalGlassdoorJobKey } = await import(
    pathToFileURL(join(ROOT, 'extension/src/shared/glassdoor-platform.js')).href
);

test('canonicalGlassdoorJobKey prefers jobId', () => {
    assert.equal(
        canonicalGlassdoorJobKey({
            jobId: '12345',
            url: 'https://www.glassdoor.com/job-listing/example.htm?jl=999',
            title: 'Engineer',
            company: 'Acme',
        }),
        'id:12345',
    );
});

test('canonicalGlassdoorJobKey uses normalized URL path without query/hash', () => {
    assert.equal(
        canonicalGlassdoorJobKey({
            url: 'https://www.glassdoor.co.uk/job-listing/foo.htm?jl=1#section',
            title: 'Ignored',
            company: 'Ignored',
        }),
        'path:/job-listing/foo.htm',
    );
    assert.equal(
        canonicalGlassdoorJobKey({
            path: '/Job/software-engineer-JV_IC123.htm?extra=1',
        }),
        'path:/job/software-engineer-jv_ic123.htm',
    );
});

test('canonicalGlassdoorJobKey falls back to title|company', () => {
    assert.equal(
        canonicalGlassdoorJobKey({
            title: ' Staff Engineer ',
            company: ' Example Corp ',
        }),
        'meta:staff engineer|example corp',
    );
});
