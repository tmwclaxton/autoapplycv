import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    buildReedJobApplyUrl,
    buildReedJobOpenUrl,
    buildReedJobSearchUrl,
    isReedJobsSearchUrl,
    isReedLoginUrl,
    readReedJobIdFromHref,
    urlsMatchReedSearch,
} from '../../extension/src/shared/reed-platform.js';

test('buildReedJobSearchUrl includes role, location, and easy apply filter', () => {
    const url = buildReedJobSearchUrl('Software Engineer', { filters: { location: 'London' } });

    assert.equal(url, 'https://www.reed.co.uk/jobs/software-engineer-jobs-in-london?filterEasilyApply=true');
});

test('readReedJobIdFromHref parses Reed job paths', () => {
    assert.equal(
        readReedJobIdFromHref('/jobs/application-development-manager/57004124'),
        '57004124',
    );
    assert.equal(
        readReedJobIdFromHref('/jobs/apply/56997857'),
        '56997857',
    );
});

test('buildReedJobOpenUrl prefers explicit path', () => {
    assert.equal(
        buildReedJobOpenUrl('57004124', { path: '/jobs/application-development-manager/57004124' }),
        'https://www.reed.co.uk/jobs/application-development-manager/57004124',
    );
});

test('buildReedJobApplyUrl builds apply URL from id', () => {
    assert.equal(buildReedJobApplyUrl('56997857'), 'https://www.reed.co.uk/jobs/apply/56997857');
});

test('Reed screening fingerprint includes active question key', () => {
    const source = readFileSync(
        new URL('../../extension/src/content/reed-auto-apply.js', import.meta.url),
        'utf8',
    );

    assert.match(source, /function readActiveScreeningQuestionKey/);
    assert.match(
        source,
        /questionKey \? `\$\{slug\}\|\$\{label\}\|\$\{questionKey\}`/,
        'Fingerprint must include screening question id/title so Continue advances are detected',
    );
});

test('isReedLoginUrl detects Auth0 secure login and authentication paths', () => {
    assert.equal(
        isReedLoginUrl(
            'https://secure.reed.co.uk/login?state=abc&client=xyz',
        ),
        true,
    );
    assert.equal(
        isReedLoginUrl('https://www.reed.co.uk/authentication/login'),
        true,
    );
    assert.equal(
        isReedLoginUrl('https://www.reed.co.uk/jobs/laravel-developer-jobs-in-london'),
        false,
    );
    assert.equal(
        isReedLoginUrl('https://www.reed.co.uk/jobs/php-laravel-developer-remote/57099837'),
        false,
    );
});
